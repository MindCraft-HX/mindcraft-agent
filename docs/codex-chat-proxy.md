# CodeX Chat Completions 协议转换代理

> 当前实现状态（2026-06-23）：Chat proxy 不再写入或 patch 用户 `~/.codex/config.toml`。旧章节中关于 “toml patched / TOML 接管” 的内容仅作为排障历史保留；实际运行通过 Codex SDK per-process `config` 向本次 CLI 子进程注入临时 provider。

## 问题背景

CodeX CLI 只支持 OpenAI Responses API 协议（`wire_api = "responses"`），无法直接对接 Chat Completions 协议的模型（DeepSeek、Kimi、Qwen、GLM、MiniMax 等）。

本代理在 MindCraft Electron 主进程内启动本地 HTTP 服务，将 CodeX CLI 发出的 Responses 请求实时转换为 Chat Completions，再将上游 Chat 响应转换回 Responses 格式。

## 架构

```
CodeX CLI ──POST /v1/responses──▶ http://127.0.0.1:{PORT}/v1
                                        │
                                   proxyServer.js
                                   ★ 路由请求
                                        │
                          ┌─────────────┼─────────────┐
                          ▼             ▼             ▼
                   transformRequest  fetch upstream  transformStream
                   ★ Responses→Chat  ★ 转发请求     ★ Chat SSE→Responses SSE
                          │                           │
                          └───────────┬───────────────┘
                                      ▼
                              返回到 CodeX CLI
```

## 文件清单（都在 `packages/agent/electron/codex/`）

| 文件 | 职责 | 来源 |
|------|------|------|
| `chatProxyManager.js` | 单例代理管理器，toml 篡改/恢复生命周期 | 自研 |
| `proxyServer.js` | HTTP 服务器，路由分发 | CC SWITCH handlers.rs |
| `transformRequest.js` | Responses → Chat 请求体转换 | CC SWITCH transform_codex_chat.rs |
| `transformStream.js` | Chat SSE → Responses SSE 流式转换（状态机） | CC SWITCH streaming_codex_chat.rs |
| `transformResponse.js` | Chat → Responses 非流式响应转换 | CC SWITCH transform_codex_chat.rs |
| `reasoningMapper.js` | 推理参数按 provider 映射 | CC SWITCH |
| `common.js` | 公共工具函数 | CC SWITCH codex_chat_common.rs |

## 详细设计

### 1. chatProxyManager.js — toml 生命周期

CodeX CLI 读取 `~/.codex/config.toml`，其中 `base_url` 的优先级高于 SDK 的 `--config openai_base_url=...` CLI 参数。因此必须篡改 toml 将 base_url 指向本地代理。

**策略**：
- **ensureProxy()**：首次调用时备份原 toml → 修改 base_url 为 `http://127.0.0.1:{PORT}/v1`
- **shutdownProxy()**：仅当 toml 仍指向 127.0.0.1 时恢复（如果用户在会话间改了配置，不覆盖）
- `process.on('exit')` 兜底恢复

### 2. proxyServer.js — HTTP 路由

监听到 CodeX 的 `/v1/responses` POST 请求后：

1. 读取请求体（Responses 格式）
2. 调用 `responsesToChatCompletions()` 转换为 Chat 格式
3. `fetch()` 转发到上游 Chat API（`{upstreamUrl}/chat/completions`）
4. 如果上游 `Content-Type` 是 `text/event-stream` → 流式 SSE 转换
5. 如果上游 `Content-Type` 不是 SSE（如 `application/json`）→ 当作非流式，读完整 JSON，用 `chatCompletionToResponse()` 转换
6. 非流请求同样走 `chatCompletionToResponse()`

### 3. transformRequest.js — 请求转换

**角色映射**（对齐 CC SWITCH `responses_role_to_chat_role()`）：

| Responses 角色 | Chat 角色 |
|---------------|----------|
| `system` / `developer` | `system` |
| `assistant` | `assistant` |
| `tool` | `tool` |
| `user` / `latest_reminder` | `user` |
| 其他 | `user`（兜底） |

**其他转换**：
- `instructions` → `messages` 首条 system 消息
- `input[]` 遍历，按 type 分发：`message`/`function_call`/`function_call_output`
- 多个 system 消息合并到首位（MiniMax 要求）
- `max_output_tokens` → `max_tokens`
- `reasoning.effort` → 按 provider 推断 reasoning 参数
- 流式时注入 `stream_options.include_usage = true`

### 4. transformStream.js — 流式 SSE 状态机（核心）

**这是最复杂的模块。** 所有逻辑严格对齐 CC SWITCH `streaming_codex_chat.rs`。

#### 4.1 状态机结构

```
ChatToResponsesState
├── responseId, model, created    ← 首 chunk 元数据
├── responseStarted               ← 是否已发出 created/in_progress
├── completed                     ← 是否已发出 completed
├── nextOutputIndex               ← 自增 output 序号
├── outputItems[]                 ← 已完成的 items（用于 completed 事件）
├── reasoning { outputIndex, itemId, text, added, done }
├── text { outputIndex, itemId, text, added, done }
├── inlineThink { mode: 'detecting'|'reasoning'|'text', buffer }
├── tools: Map<chatIndex, ToolCallState>
├── latestUsage                   ← 原始 Chat usage
└── finishReason                  ← finish_reason 字符串
```

#### 4.2 SSE 事件序列

```
response.created          ← ensureResponseStarted (首个 chunk)
response.in_progress      ← ensureResponseStarted (首个 chunk)
  ├── [reasoning]
  │   response.output_item.added        (type=reasoning, summary:[])
  │   response.reasoning_summary_part.added
  │   response.reasoning_summary_text.delta   ×N  (summary_index=0)
  │   response.reasoning_summary_text.done
  │   response.reasoning_summary_part.done
  │   response.output_item.done
  ├── [text]
  │   response.output_item.added        (type=message, content:[])
  │   response.content_part.added
  │   response.output_text.delta              ×N  (content_index=0)
  │   response.output_text.done
  │   response.content_part.done
  │   response.output_item.done
  └── [tool_calls]
      response.output_item.added        (type=function_call, 含 reasoning_content)
      response.function_call_arguments.delta   ×N
      response.function_call_arguments.done
      response.output_item.done
response.completed          ← finalize()
  或
response.failed             ← 上游错误/流错误
```

#### 4.3 关键字段对应

| 事件类型 | 索引字段 | ID 字段 |
|---------|---------|--------|
| reasoning_summary_* | `summary_index` | `item_id` |
| output_text / content_part_* | `content_index` | `item_id` |
| function_call_arguments_* | 无独立索引 | `item_id` |
| output_item.added/done | `output_index` | `item.id` |

**所有 delta/done 事件必须包含 `item_id`**。

#### 4.4 内联 `<think>` 标签处理

部分模型（MiniMax 等）将思考内容嵌入 `content` 字段：
```
<think>推理过程...</think>
正文内容
```

状态机使用三态检测：
- `detecting`：缓冲直到能判断是否以 `<think>` 开头
- `reasoning`：累积到 `</think>` 后切为 text
- `text`：正常文本输出

处理完后 `<think>`/`</think>` 标签不泄漏到输出。

#### 4.5 错误处理

- 上游 SSE `event: error` 或 chunk 内嵌 `error` 字段 → `response.failed`
- 流读取异常 → `response.failed`（含 `error.type: "stream_error"`）
- 上游 HTTP 非 2xx → 通过 `chatErrorToResponseError` 归一化
- `response.failed` 后不再发送 `response.completed`

#### 4.6 Usage 处理

- `response.created` / `response.in_progress` / `response.completed` 始终包含 usage（默认 `{input_tokens:0, output_tokens:0, total_tokens:0}`）
- 上游 usage chunk 通过 `chatUsageToResponsesUsage` 映射：`prompt_tokens→input_tokens, completion_tokens→output_tokens`

### 5. transformResponse.js — 非流式转换

处理上游返回完整 JSON（非流式或非 SSE）：
- 提取 `reasoning_content` / `reasoning` / `<think>` 块 → `reasoning` output item
- 去除 think 块后的正文 → `message` output item
- tool_calls → `function_call` output items

## 已知问题 & 调试

### 代理不工作时的诊断步骤

1. **检查本地 proxy 是否接管**：
   日志中应有 `[codex] proxy started:`，并显示 `127.0.0.1:{PORT}` 对应的本地代理地址

2. **检查角色映射**：
   日志中 `→ REQUEST: { msgRoles }` 不应出现 `developer`，应全为 `system/user/assistant/tool`

3. **检查上游响应类型**：
   日志中 `upstream response: { contentType }` —
   - `text/event-stream` → 走流式转换
   - `application/json` 或其他 → 走非流式回落（新增）
   - 低事件数时打印 `⚠ low event count, raw response:` 显示原始数据

4. **检查事件数**：
   - `sseEventCount ≤ 3` 且无内容 → 上游返回的数据不含有效 delta
   - 正常流式应有 5+ 事件

5. **检查错误**：
   - 上游 HTTP 错误 → `[codex-proxy] upstream error: { status, body }`
   - 流错误 → `[codex-proxy] stream error: { message }`
   - SSE 错误事件 → `[codex-proxy] stream: upstream SSE error: { message }`

### 常见失败模式

| 症状 | 可能原因 | 日志特征 |
|------|---------|---------|
| `turn.failed` 重复 6 次 | SSE 格式不对 | `stream disconnected before completion` |
| 无响应内容 | 上游返回非 SSE | `chunks=1, sseEventCount=3`（只有骨架事件） |
| HTTP 400 `role有误` | 未映射 `developer` 角色 | `msgRoles` 中出现 `developer` |
| 代理未启动 | 本地 proxy 未接管 | 无 `proxy started` 日志 |

## 测试覆盖

### 单元测试（`__tests__/transform.test.js`）：29 用例

- transformStream.js：18 用例（文本流、reasoning、inline think、tool call、错误、边界）
- transformRequest.js：6 用例（角色映射、system 合并、tools、max_tokens）
- transformResponse.js：5 用例（基本转换、reasoning、tool calls、错误归一化）

### 端到端测试（`__tests__/e2e.test.js`）：5 用例

启动模拟上游，验证完整代理链路：
- SSE 流式（含 content）
- 非 SSE 回落（application/json）
- SSE reasoning
- 上游 HTTP 错误
- 非流式请求

### 运行命令

```bash
# 单元测试
node packages/agent/electron/codex/__tests__/transform.test.js

# 端到端测试
node packages/agent/electron/codex/__tests__/e2e.test.js
```


## 当前实现差距（相对可用目标）

当前目标不是完整复刻 CC SWITCH，而是让 MindCraft 内的 Codex 稳定使用 Chat Completions provider。

结合本仓库现状与 `..\reference_project\cc-switch` 的参考实现，当前 JS 代理的主要差距如下：

1. `chatProxyManager.js` 目前用全局正则替换 `config.toml` 里的 `base_url`。
   这会误伤多个 provider，且不能保证只接管 active `model_provider`。

2. `transformRequest.js` 目前对 `Responses input[]` 的处理过于扁平：
   - `function_call` 直接转单条 assistant tool_call message
   - `function_call_output` 直接转 tool message
   - `reasoning` item 基本跳过

   这在简单问答可用，但在多轮、工具调用、会话恢复时容易出现：
   - 上游 400
   - `reasoning_content is missing in assistant tool call message`
   - tool 调用顺序错乱
   - Codex `turn.failed`

3. 当前自动测试覆盖了简单文本、简单 reasoning、简单 tool call，
   但没有覆盖关键的历史恢复与工具链路场景。

## 实施建议（给 Claude Code / Codex 的执行清单）

### P0：修正 TOML 接管逻辑

目标：仅接管 active provider 的 `base_url`，不要全局替换所有 `base_url`。

建议行为：

1. 读取顶层 `model_provider = "xxx"`
2. 若存在 active provider：
   - 优先修改 `[model_providers.xxx].base_url`
   - 若该 section 不存在则创建
3. 若不存在 active provider：
   - fallback 修改顶层 `base_url`
4. `shutdownProxy()` 恢复时只在当前 TOML 仍指向 `http://127.0.0.1:{PORT}/v1` 时恢复
5. 不要用 `current.includes('127.0.0.1:')` 这类过宽判断，至少应判断 `base_url = "http://127.0.0.1:* /v1"` 形态

说明：
这一步不是为了对齐 CC SWITCH，而是避免污染用户多个 provider 配置，并确保代理真的接管到 Codex 当前活跃 provider。

### P0：补齐 `transformRequest.js` 的最小状态转换

目标：让 Codex 的 Responses 历史在 Chat Completions provider 上可继续使用。

建议最小实现：

1. 引入三个运行态：
   - `pendingToolCalls`
   - `pendingReasoning`
   - `lastAssistantIndex`

2. `function_call` item：
   - 不要立刻单独 push message
   - 先累积到 `pendingToolCalls`
   - 如 item 自带 `reasoning_content`，累积到 `pendingReasoning`

3. `function_call_output` item：
   - 先 flush pending tool calls，生成一条 assistant `tool_calls` message
   - 再生成对应 tool message

4. `reasoning` item：
   - 若当前没有 pending tool calls，优先尝试回填到上一个 assistant message
   - 否则累积到 `pendingReasoning`

5. flush pending tool calls 时：
   - 生成一条 `role: 'assistant', content: null, tool_calls: [...]` 的 message
   - 把 `pendingReasoning` 附着为 `reasoning_content`

6. 对所有带 `tool_calls` 的 assistant message：
   - 若最终仍无 `reasoning_content`，补一个保底占位，例如 `tool call`

7. `function_call_output.output`：
   - 若是对象，转成 JSON 字符串
   - 若是字符串，尽量保持原值

说明：
这一步是让工具调用、多轮续聊、恢复会话不炸的关键。不是可选优化，而是实际兼容层。

### P1：收紧代理失败行为

当前 `codexAgent.js` 在 `apiFormat === 'chat'` 且代理启动失败时会 fallback direct：

```js
console.error('[codex] proxy start failed, falling back to direct:', proxyErr)
```

对 chat-only provider，这通常只会把真正的代理错误掩盖掉。

建议：

1. `apiFormat === 'chat'` 时，代理启动失败应直接报错给前端
2. 不要 silent fallback 到 direct responses
3. 错误消息里带上：
   - upstream base URL
   - 当前 model
   - proxy 启动异常 message

### P1：补测试，不要只测简单 happy path

建议新增到 `packages/agent/electron/codex/__tests__/transform.test.js` 的用例：

1. `reasoning` item 回填到上一条 assistant message
2. `function_call` + `function_call_output` 之间正确 flush
3. 多个 `function_call` 连续出现时聚合为一条 assistant tool_calls message
4. bare tool call 自动补 `reasoning_content`
5. trailing reasoning 回填到 tool-call assistant message
6. tool output 为对象时转成 JSON 字符串
7. TOML patch 只修改 active `model_provider` 的 `base_url`
8. TOML restore 仅在当前仍为本地代理 URL 时才恢复

## 建议自动测试顺序

每次实现后至少跑：

```bash
node packages/agent/electron/codex/__tests__/transform.test.js
node packages/agent/electron/codex/__tests__/e2e.test.js
node packages/agent/electron/codexRuntimeConfig.test.js
```

如果补了 `chatProxyManager.js` 的 helper，建议加一个独立测试文件，例如：

```bash
node packages/agent/electron/codex/__tests__/chatProxyManager.test.js
```

测试重点不是覆盖率数字，而是验证以下不回归：

1. 简单文本流式仍然通过
2. 非 SSE 回落仍然通过
3. reasoning SSE 仍然通过
4. tool call 多轮历史转换通过
5. active provider TOML patch 不污染其他 provider

## 人工验收方案

建议按以下顺序人工验收，每一步都记录主进程日志中的四类关键行：

1. `[codex] proxy started:`
2. `[codex-proxy] ← ORIGINAL:`
3. `[codex-proxy] → REQUEST:`
4. `[codex-proxy] upstream response:` 或 `[codex-proxy] upstream error:`

### 验收 1：简单问答

场景：
使用一个 `apiFormat = chat` 的 provider 发起新对话。

通过标准：

1. 出现 `proxy started`
2. 请求打到本地 `127.0.0.1:{PORT}/v1`
3. 上游请求为 `/chat/completions`
4. 前端正常流式输出
5. 不出现 `turn.failed`

### 验收 2：多轮对话

场景：
第一轮问答后继续追问，要求引用上一轮内容。

通过标准：

1. 上游 `REQUEST.msgRoles` 不出现 `developer`
2. 上游不报 role 错误
3. 模型能接住上下文，回答与前文一致

### 验收 3：工具调用

场景：
触发至少一次 read/list/search 类工具调用。

通过标准：

1. 上游不报 `reasoning_content is missing in assistant tool call message`
2. 工具调用后仍能继续返回文本结果
3. 不出现连续 `turn.failed`

### 验收 4：会话继续/恢复

场景：
同一 chat 继续提问，或关闭后重新进入继续对话。

通过标准：

1. 历史工具调用不会导致上游 400
2. 代理不因历史 `Responses input[]` 而构造出非法 Chat message

### 验收 5：错误路径

场景：
故意使用错误 key 或错误 URL。

通过标准：

1. 前端能收到清晰错误
2. 日志可见 upstream error body
3. 不应悄悄 fallback 到 direct responses

## 给 Claude Code 的直接任务描述

可直接按下面任务继续：

```text
请基于 docs/codex-chat-proxy.md 的“实施建议（给 Claude Code / Codex 的执行清单）”实施两项 P0：

1. 修正 packages/agent/electron/codex/chatProxyManager.js
   - 仅 patch active model_provider 的 base_url
   - restore 时只在当前仍为本地代理 URL 时恢复

2. 修正 packages/agent/electron/codex/transformRequest.js
   - 加入 pendingToolCalls / pendingReasoning / lastAssistantIndex
   - 支持 function_call / function_call_output / reasoning 的最小状态转换
   - 对带 tool_calls 的 assistant message 保底补 reasoning_content

然后补测试并运行：
node packages/agent/electron/codex/__tests__/transform.test.js
node packages/agent/electron/codex/__tests__/e2e.test.js
```

## CC SWITCH 参考

本项目协议转换逻辑移植自 CC SWITCH（`reference_project/cc-switch/`），核心参考文件：

- `src-tauri/src/proxy/providers/streaming_codex_chat.rs` — SSE 流式状态机
- `src-tauri/src/proxy/providers/transform_codex_chat.rs` — 请求/响应转换、角色映射、usage 转换
- `src-tauri/src/proxy/providers/codex_chat_common.rs` — 公共工具函数
- `src-tauri/src/proxy/providers/handlers.rs` — HTTP 路由处理

所有 JS 实现的方法/函数都有对应的 CC SWITCH Rust 行号注释。

## 2026-06-23 带 tools 协议结论

当前目标不是实现 CC SWITCH，而是让 MindCraft 内的 Codex 在 Chat Completions provider 上可用，并且必须保留工具能力。CC SWITCH 仍有参考意义，主要用于校验三类基线：

1. Responses `tools` 到 Chat `tools` 的标准映射：`{ type: "function", function: { name, description, parameters, strict } }`。
2. Responses `tool_choice` 到 Chat `tool_choice` 的结构映射：`{ type: "function", name }` 需要转为 `{ type: "function", function: { name } }`。
3. Chat SSE 的文本、reasoning、tool_calls 回包转换为 Responses SSE 的事件序列。

但 CC SWITCH 不能直接照搬到 MindCraft/DeepSeek provider。真实上游验证发现：

- 无 tools：可以正常返回文本。
- 全量 Codex SDK tools，且将空 schema 直接透传为 `parameters: {}`：上游会报错或异常空响应。
- 只过滤空名 tool：仍然不能解决空 schema 问题。
- 过滤空名 tool，并将空 schema 规范化为合法 object schema：正常返回文本。
- 保留普通工具如 `shell_command`、`update_plan`：正常返回文本。

因此实现策略是“保留 tools，但清洗不兼容工具”，不是禁用 tools。

### 当前实现点

文件：`packages/agent/electron/codex/transformRequest.js`

- `responsesToChatCompletions()` 不再按 provider 全量禁用 tools。
- `sanitizeResponsesToolForChat()` 会过滤：
  - 转换后 function name 为空的 tool。
  - 对空 schema 做规范化，例如 `{}` → `{ type: "object", properties: {}, additionalProperties: false }`。
- 可用工具仍会转发，例如 `shell_command`、`update_plan`。
- 如果 tools 全部被过滤，则不发送 `tools`、`tool_choice`、`parallel_tool_calls`。
- 如果 `tool_choice` 指向已经被过滤的工具，则降级为 `auto`，避免请求引用不存在的工具。

文件：`packages/agent/electron/codex/proxyServer.js`

- `REQUEST FULL` 诊断日志新增 `toolCount` / `toolNames`。
- 日志只打印工具名称和数量，不打印 API key。

### 已验证测试

自动测试：

```bash
node packages/agent/electron/codex/__tests__/transform.test.js
node packages/agent/electron/codex/__tests__/e2e.test.js
```

当前结果：

- `transform.test.js`: 39/39 passed
- `e2e.test.js`: 6/6 passed

真实上游探针：

- upstream: `https://api.mindcraft.com.cn/v1`
- model: `deepseek-v4-pro`
- request: Responses 流式请求，带 `shell_command`、`update_plan`、`multi_agent_v1`、空名 tool
- proxy 转发给上游的工具：`shell_command`、`update_plan`、`multi_agent_v1`
- upstream response: HTTP 200 `text/event-stream`
- Responses SSE: 有 `response.output_text.delta` 和 `response.completed`

### 人工验收重点

Electron 主进程代码改动不会被 Vite HMR 热更新。用户使用 `npm run dev` 时，改完 `packages/agent/electron/...` 后必须重启 dev Electron 窗口/进程。

验收时看主进程日志：

1. `[codex] proxy started:` 显示本地 proxy 端口和 upstream。
2. `[codex-proxy] -> REQUEST FULL:` 或对应编码日志中：
   - `keys` 包含 `tools`。
   - `toolNames` 包含普通工具，如 `shell_command`。
   - `toolNames` 包含 `multi_agent_v1` 时也应能正常返回，不应再因空 schema 触发异常。
   - `toolNames` 不包含空字符串。
3. 上游不再出现只有一个空 `delta.content` 的低事件数响应。
4. Codex 能正常输出文本；触发工具调用后仍能继续回文本结果。

若仍失败，优先检查：

1. 是否重启了 Electron 主进程。
2. 是否实际走到了本地 proxy，而不是直接打上游 `/v1/responses`。
3. `REQUEST FULL.tools[*].function.parameters` 是否已把空 schema 规范化为合法 object schema。
4. provider 是否对其他具体 tool schema 也有兼容问题，再按同样方式做最小修正，不要全量关闭 tools。

## 2026-06-23 Checkpoint 验收结论

用户已在 `npm run dev` 环境下人工验证：Codex Chat Completions 代理可正常调用工具，普通工具链已恢复可用。本 checkpoint 可以作为后续优化前的稳定基线。

当前提交包含以下能力：

1. Chat provider 接管：`apiFormat = chat` 时启动本地 proxy，并通过 Codex SDK per-process `config` 临时声明 `mindcraft_chat_proxy` provider。
2. Responses → Chat 转换：支持 system/developer 合并、文本 content 折叠、function_call/function_call_output/reasoning 历史转换。
3. Chat → Responses SSE 转换：支持文本、reasoning、tool_calls、非 `[DONE]` 自然结束、usage、错误归一化。
4. 工具保留策略：过滤空名 tool，并把空 schema 规范化后保留普通 Codex tools，包括 `multi_agent_v1`。
5. 诊断能力：日志可看到 `toolCount` / `toolNames`，用于确认 tools 未被整体关闭。

### `multi_agent_v1` 结论

`multi_agent_v1` 是 Codex 的子代理 / sub-agent deferred tool，不是普通业务工具。真实捕获到的 Codex SDK 请求中，它的定义为：

```json
{
  "type": "function",
  "function": {
    "name": "multi_agent_v1",
    "description": "Tools for spawning and managing sub-agents.",
    "parameters": {}
  }
}
```

进一步实测确认：问题核心不是 `multi_agent_v1` 名称，而是空 schema。MindCraft/DeepSeek Chat provider 对 `parameters: {}` 会拒绝或异常返回；将其规范化为合法空 object schema 后，`multi_agent_v1` 与强制 `tool_choice` 都能被上游正常接收。

当前策略已经升级为：保留 `multi_agent_v1`，并在转换层统一规范化空 schema。当前已验证“协议可透传并被上游接受”；尚未完整验证的是“Codex 子代理调用能否在真实任务中正确执行、回收结果和恢复历史”。

CodeX 前端现也已补齐最小识别：`multi_agent_v1` 会按“子代理”工具类型展示，而不再退化成普通 generic tool 卡片。后续人工验收时除了看日志，还应确认 UI 中出现子代理卡片及其摘要字段。

### 后续架构规划

短期保持当前架构，不在 checkpoint 前继续大改：

1. 保持 Electron 本地 proxy 作为 Codex SDK/CLI 与 Chat provider 之间的协议适配层。
2. 不写用户 `~/.codex/config.toml`；仅通过本次 Codex CLI 子进程的 `--config` 覆盖 `model_provider` / `model_providers.*.base_url`。
3. 保持 provider-specific sanitizer，按真实失败矩阵最小过滤，不全量关闭 tools。

中期优化建议：

1. 将诊断日志加开关，例如 `CODEX_CHAT_PROXY_DEBUG`，生产默认只打印摘要和错误。
2. 将 tool sanitizer 独立成 `toolSanitizer.js`，按 provider 维护策略和测试矩阵。
3. 增加 `multi_agent_v1` 专项实验测试，验证真实子代理任务链路，而不是仅验证上游接收。
4. 增加真实 provider smoke test 脚本，但只从环境变量读取 API key，禁止写入仓库或日志。

### CC SWITCH 适配边界

CC SWITCH 的方式适合做协议转换基线，但不适合在 MindCraft 中直接照搬全部运行模型：

1. CC SWITCH 主要面向 CLI 代理接管；MindCraft 是 Electron 内集成 Codex SDK，SDK 背后仍启动 CLI，但可以通过 SDK `config` 向单次 CLI 子进程传递临时 provider 覆盖。
2. CC SWITCH 的标准 tool 映射没有覆盖 MindCraft/DeepSeek provider 对空 schema、deferred tool 的兼容差异。
3. MindCraft 还需要处理 UI 会话生命周期、历史恢复、主进程重启、日志诊断和 userData 边界，这些不属于 CC SWITCH 的核心职责。

结论：继续参考 CC SWITCH 的字段映射和 SSE 状态机，不照搬其 provider 假设；MindCraft 需要保留独立的 SDK 子进程配置覆盖和 provider 兼容层。

## 2026-06-23 无 TOML 写入改造

进一步验证后确认：Codex SDK 的 `config` 参数会传递为本次 Codex CLI 子进程的 `--config` 覆盖项。只要同时覆盖：

```js
{
  model_provider: 'mindcraft_chat_proxy',
  wire_api: 'responses',
  model_providers: {
    mindcraft_chat_proxy: {
      name: 'MindCraft Chat Proxy',
      base_url: 'http://127.0.0.1:{PORT}/v1',
      wire_api: 'responses'
    }
  }
}
```

Codex CLI 就会在本次进程内走本地 proxy，不需要修改用户 `~/.codex/config.toml`。真实 SDK 探针已验证：

- proxy 收到 Codex SDK 发出的 `/v1/responses` 请求。
- 上游实际请求为 `/chat/completions`。
- 工具列表仍保留普通 tools。
- `~/.codex/config.toml` 前后 SHA-256 不变。

因此 `chatProxyManager.js` 只负责本地 proxy 生命周期和构造 per-process Codex config，不再备份、patch 或 restore 用户 TOML。
