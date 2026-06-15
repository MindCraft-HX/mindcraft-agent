# MindCraft Agent 架构

> 最后更新：2026-06-15
> 当前状态：Agent 抽离 Phase A 已完成，代码事实以 `packages/agent/**` 为准；简易对话（Chat）功能已完成；CodeX sandbox 权限已重构

---

## 1. 当前结论

- Claude / Codex / codeHub / agentCommon 主体实现已经抽离到 `packages/agent/**`
- 宿主层不再保留旧的 Agent 主体实现副本
- Full 版当前通过宿主接线继续复用共享 Agent 层
- Lite 版后续应直接复用这套共享层，而不是重新复制一套 Agent 代码

当前已经验证可用的共享入口：

- Renderer 入口：`@mindcraft/agent`
- Renderer 公共渲染入口：`@mindcraft/agent/render`
- Main 入口：`packages/agent/electron/index.js`
- Preload 入口：`packages/agent/preload/index.js`

---

## 2. 目录边界

### 2.1 Agent 主体

| 领域 | 路径 |
|------|------|
| Claude UI / 状态 / 会话逻辑 | `packages/agent/src/components/claudeCode/**` |
| Codex UI / 状态 / 会话逻辑 | `packages/agent/src/components/codeX/**` |
| 统一容器 / Tab / Agent 入口偏好 | `packages/agent/src/components/codeHub/**` |
| 公共组件 / 公共工具 | `packages/agent/src/components/agentCommon/**` |
| Agent renderer stores | `packages/agent/src/stores/**` |
| Agent 主进程实现 | `packages/agent/electron/**` |
| Agent preload bridge | `packages/agent/preload/**` |

### 2.2 宿主接线层

| 领域 | 路径 |
|------|------|
| Electron 主入口 | `electron/main.js` |
| Preload 主入口 | `electron/preload.js` |
| 路由接线 | `src/router.js` |
| Vite alias 接线 | `vite.config.js` |

规则：

- 改 Agent 功能，进 `packages/agent/**`
- 改宿主入口，才碰宿主接线层文件

---

## 3. 运行时接线

### 3.1 Main

`electron/main.js` 当前通过：

```js
const { registerAgentIPCs, resetCodexSdkRuntime } = require("../packages/agent/electron");
```

完成 Agent IPC 注册。

### 3.2 Preload

`electron/preload.js` 当前通过：

```js
const { createAgentBridge } = require("../packages/agent/preload");
```

暴露 Claude / Codex 所需桥接能力。

### 3.3 Renderer

`src/router.js` 当前通过：

```js
component: async () => (await import('@mindcraft/agent')).CodeHub
```

加载统一编程 Agent 容器。

渲染侧公共代码高亮 / 本地路径识别能力通过以下入口复用：

- `src/components/mdViewer/viewers/CodeTextViewer.vue`
- `src/utils/MarkdownIt.js`

都已切换到：

```js
@mindcraft/agent/render
```

---

## 4. 路由与窗口入口

### 4.1 主路由

当前最终编程入口是：

- `#/main/codeHub`

兼容入口为：

- `#/main/claudeCode` -> `#/main/codeHub?agent=claudeCode`
- `#/main/codex` -> `#/main/codeHub?agent=codex`

### 4.2 独立窗口

| 窗口 | 当前入口 |
|------|------|
| Claude 独立窗口 | `electron/claudeWindow/index.js` -> `#/main/claudeCode` |
| Codex 独立窗口 | `electron/codexWindow/index.js` -> `#/main/codex` |

说明：

- 这套兼容入口目前是正常可用的
- 但它们仍然依赖路由层 redirect
- 后续如果改 `codeHub` 路由或 query 语义，必须回归独立窗口入口

---

## 5. 状态持久化与通知

### 5.1 面板持久化

Claude / Codex 面板状态都通过 Electron IPC 落盘，不依赖 localStorage 做关键持久化。

当前重点行为：

- project / chat 列表持久化
- 活跃 project / chat 持久化
- 任务完成红点状态持久化

### 5.2 完成通知

Claude：

- 主进程事件：`claude-agent-done`
- 渲染入口：`packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js`

Codex：

- 主进程事件：`codex-agent-done`
- 渲染入口：`packages/agent/src/components/codeX/composables/useCodexAgentStream.js`

当前通知模型不是系统通知中心，而是：

- 项目级 `hasDoneNotification`
- 前端 Tab 高亮 / 红点
- `flashTaskbar()`

---

## 6. 会话管理内部机制

> ⚠️ 本节是 Claude / Codex 会话 bug 排查的基础知识。排查前必须理解双身份模型和同步边界。
> 完整陷阱清单见 `docs/session-pitfalls.md`。

### 6.1 双身份模型

每个 UI 会话（chat）有两层身份：

| 层 | 字段 | 示例 | 持久化位置 |
|----|------|------|-----------|
| UI 本地 ID | `chat.sessionId` | `session-chat-3-1718123456789` | `*-panel-state.json` |
| CLI 会话 ID | `chat.cliSessionId` | `a1b2c3d4-...` (UUID) | 主进程内存 Map + JSONL 文件名 |
| 磁盘文件 | `chat.filePath` | `~/.claude/projects/<hash>/<uuid>.jsonl` | 文件系统 |

**关键事实**：`sessionId` 和 `cliSessionId` 之间没有持久化的映射关系。映射只存在于主进程内存的 `cliSessionIds` Map 中（`sessionId → cliSessionId`），应用重启后丢失。

### 6.2 主进程全局状态（所有窗口共享）

```
claudeAgent.js                     codexAgent.js
─────────────────                  ─────────────────
agentSessions: Map                  codexSessions: Map
  sessionId → { query, event,        sessionId → { thread, runId,
                abortController,                   doneSent, resultReceived,
                model, cwd,                        abortController, ... }
                runMode }

cliSessionIds: Map                  cliSessionIds: Map (同名不同Map)
  sessionId → UUID (for resume)      同左

sessionModels: Map                  —
  sessionId → model (上次模型)
```

**重置函数**：`resetAgentRuntime()` 清空所有 Map，影响所有窗口。Codex 对应 `resetCodexSdkRuntime()`。

### 6.3 消息的双重来源

| 来源 | 触发 | 条件 |
|------|------|------|
| 内存（流式追加） | `onAgentMessage` IPC 事件 | 会话正在运行 |
| 磁盘（JSONL 读取） | `ensureChatMessagesLoaded()` | `filePath` 已设置 + `_messagesLoaded` 为 falsy |

**保存时的消息策略**（`buildPanelStatePayload` → `mapChat`）：
```js
messages: isStreaming ? [] : c.filePath ? [] : (c.messages || [])
//        ^流式中       ^有磁盘文件    ^无磁盘文件
//        不保存        不保存(磁盘为准)  保存全部(内存为准)
```

### 6.4 会话生命周期

```
createChat()                            PENDING
  _pendingSessionBinding = true         cliSessionId = null
  cliSessionId = null                   filePath = ''
  filePath = ''
      │
      │ sendMessage() → thinking = true
      ▼
  SDK query() ──────────────────────►  RUNNING
  JSONL 创建在磁盘                      thinking = true
  流式消息追加到 messages               (messages 即时更新)
      │
      │ 正常完成 / 错误 / abort
      ▼
  onAgentDone() ─────────────────────► BOUND
  cliSessionId = UUID                  cliSessionId ✓
  filePath = .../uuid.jsonl            filePath ✓
  thinking = false                     _pendingSessionBinding = false
```

**崩溃重启后的特殊状态**：
- `thinking` 总是 `false`（不保存此字段）
- `_messagesLoaded` 总是 `undefined`（不保存此字段）
- 消息内容取决于保存时 `filePath` 是否已设置

### 6.5 关键同步点

| 操作 | 触发时机 | 同步方向 | 已知陷阱 |
|------|---------|---------|---------|
| 后台扫描 | window focus, initNonCritical, 手动刷新 | 磁盘 → 内存（发现新 JSONL / 更新元信息） | Trap 2, 3, 4 |
| 会话领养 | 扫描发现 JSONL + 存在 pending chat | 磁盘 JSONL → 内存 chat（绑定身份） | 已修复：精确匹配 `_expectedCliSessionId`（2026-06-11） |
| 消息加载 | `switchChat` + `!_messagesLoaded` | 磁盘 → 内存（替换 messages） | 已修复：移除 `messages.length === 0` 条件（2026-06-11） |
| 历史保存 | debounced 2s / immediate / onUnload | 内存 → 磁盘（panel-state.json） | Trap 4 |
| Provider 切换 | `claude-provider-activate` | 保留 cliSessionIds + 全量重注册 | 已修复：全项目遍历注册 + Map 不清理（2026-06-11） |

---

## 7. 已完成的抽离结果

- `packages/agent` 共享层已落地
- 宿主侧旧 Agent 主体目录已移除
- 公开 renderer 入口已建立：
  - `@mindcraft/agent`
  - `@mindcraft/agent/render`
- `localSearch` 已纳入共享 main 边界
- electron-builder 已包含 `packages/agent/**/*`
- 关键回归已覆盖：
  - codeHub agent route preference
  - Codex done reason
  - apply_patch / diff 恢复
  - agent shared entrypoints / imports

---

## 8. 当前剩余风险

这些不是阻塞项，但需要记住：

1. Claude / Codex 独立窗口仍依赖兼容路由跳转，不是直接进入最终页。
2. 主进程 / preload 目前仍通过仓内相对路径接入共享层，没有正式 npm 包化。
3. 个别旧注释可能仍引用抽离前路径，但代码实际入口已经对齐。
4. **🆕 会话管理存在 5 个已知陷阱 pattern，详见 `docs/session-pitfalls.md`。排查任何会话相关 bug 前必须先读该文档。**

---

## 9. Lite 版建议方向

Lite 版不要重新开一套 Agent 主体实现，建议直接站在当前共享层上做“裁剪型宿主”。

建议顺序：

1. 先确定 Lite 版保留哪些 Agent 能力
   - 是否保留 Claude
   - 是否保留 Codex
   - 是否保留插件 / skills / localSearch / memory / markdown viewer 联动

2. 再确定 Lite 宿主壳层
   - 精简路由
   - 精简导航
   - 精简窗口入口
   - 精简与主产品无关的应用模块

3. 最后才做共享层进一步收口
   - 只在确实出现 Full / Lite 差异点时，再抽配置或 feature flag

原则：

- 共享 Agent 层优先复用
- 差异优先放在宿主壳层
- 不要为了 Lite 版再次复制一套 Agent 代码

---

## 10. 简易对话（Chat）

路由 `#/main/chat`，不绑定项目文件夹的轻量对话。

### 10.1 组件树

```
ChatView.vue
├── SessionList.vue          — 左侧会话列表（新建/切换/删除/重命名）
├── MessageList.vue           — 消息展示容器
│   └── MessageBubble.vue     — 单条消息气泡（markdown + thinking 折叠区 + tool 卡片）
└── InputArea.vue             — 底部输入区
    ├── ImageAttachmentBar    — 图片缩略图（复用 agentCommon）
    ├── 文本输入 + 模型/档位选择
    └── 发送/停止按钮
```

### 10.2 Composables

| 文件 | 职责 |
|------|------|
| `useChatSession.js` | 会话 CRUD + 持久化（`{userData}/chat-sessions/`，JSON 文件） |
| `useChatStream.js` | 流式管理 + tool loop（最大 5 轮）+ 上下文压缩 |

### 10.3 主进程 Handler

| Handler | 通路 | API |
|---------|------|-----|
| `claude-chat` / `claude-chat-continue` | Anthropic | `POST /v1/messages`，手动 fetch + SSE 解析 |
| `codex-chat` / `codex-chat-continue` | OpenAI | `POST /v1/responses`（Responses API），手动 fetch + SSE 解析 |
| `claude-chat-abort` / `codex-chat-abort` | 通用 | AbortController Map，按 chatId 中止 |
| `chat-web-search` | 通用 | HTTP 搜索，返回 `{ results: [{ title, url, snippet }] }` |

### 10.4 Thinking / Reasoning 控制

| 通路 | 关闭 | 开启 |
|------|------|------|
| Claude | `thinking: { type: 'disabled' }` | `thinking: { type: 'enabled', budget_tokens: N }` |
| CodeX | `reasoning: { effort: 'none' }` | `reasoning: { effort: 'low'\|'medium'\|'high' }` |

前端用圆点档位选择（off / low / medium / high），`useChatStream.thinkingConf()` 在 `sendMessage()` 时实时读取 `currentSession.thinkingLevel`。

### 10.5 SSE 事件映射

**Claude 通路**（`/v1/messages` 流式）：

| SSE 事件 | IPC 事件 | 说明 |
|----------|---------|------|
| `content_block_delta` (delta.text) | `claude-stream-chunk` | 文本增量 |
| `content_block_delta` (delta.thinking) | `claude-stream-thinking` | 思考增量 |
| `content_block_start` (content_block.type=tool_use) | `claude-stream-tool-start` | 工具调用开始 |
| `content_block_delta` (delta.partial_json) | `claude-stream-tool-input` | 工具参数增量 |

**CodeX 通路**（`/v1/responses` 流式）：

| SSE 事件 | IPC 事件 | 说明 |
|----------|---------|------|
| `response.output_text.delta` | `codex-stream-chunk` | 文本增量 |
| `response.reasoning_text.delta` | `codex-stream-thinking` | 推理增量（gpt-5.x 不返回此事件） |
| `response.reasoning_summary_text.delta` | `codex-stream-thinking` | 推理摘要增量（gpt-5.4 偶尔返回） |
| `response.output_item.added` (function_call) | `codex-stream-tool-delta` | 工具调用开始 |
| `response.output_item.done` (function_call) | — | 工具参数完整（更新 toolCalls） |
| `response.completed` | — | 流完成 |

### 10.6 安全上限

所有值在主进程 `electron/` 中定义，防止第三方 provider 输出失控：

| 上限 | 值 | 位置 |
|------|:---:|------|
| `MAX_STREAM_CHUNKS` | 5,000 | `claudeAgent.js` / `codexAgent.js` |
| `MAX_STREAM_CHARS` | 100,000 | 同上 |
| `MAX_THINKING_CHARS` | 50,000 | 同上 |
| 请求超时 | 60s | `AbortSignal.timeout(60_000)` + `AbortSignal.any()` |
| 渲染端停滞超时 | 180s | `useChatStream.js` `STALL_TIMEOUT` |
| 工具循环上限 | 5 轮 | `useChatStream.js` `MAX_TOOL_ITERATIONS` |

### 10.7 已知限制

1. **OpenAI 通路 thinking 不可见**：`api.mindcraft.com.cn` 代理不返回 `response.reasoning_text.delta`，gpt-5.4 偶尔返回 `reasoning_summary_text.delta`，gpt-5.5 完全不返回。`reasoning.effort` 参数影响模型内部推理深度（耗时差异明显），但文本不可见。
2. **图片仅 base64**：不依赖文件系统，数据编码在消息体中。
3. **无文件解析**：PDF/Office 等文件解析不属于 Chat 第一期范围。

---

## 11. ClaudeCode SDK 接口参考

> 基于 `@anthropic-ai/claude-agent-sdk` SDK。本节是经过 SDK `.d.ts` 核对的权威参考。标注 ✅=已用、⭕=未用但可用、❌=不可用/不适合。

### 11.1 SDK 入口

```ts
// packages/agent/electron/claudeAgent.js:190
import { query, renameSession } from '@anthropic-ai/claude-agent-sdk'

// 完整导出清单（sdk.d.ts）:
export {
  query, renameSession, deleteSession, forkSession,
  listSessions, getSessionInfo, getSessionMessages,
  getSubagentMessages, importSessionToStore, listSubagents,
  createSdkMcpServer, InMemorySessionStore, connectRemoteControl,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
}
```

### 11.2 query() Options

> 所有字段来自 SDK `sdk.d.ts:1089-1668` 的 `Options` 类型。

| 字段 | 类型 | 用途 | 状态 |
|------|------|------|:--:|
| `cwd` | `string` | 工作目录 | ✅ |
| `model` | `string` | 模型 ID（如 `claude-sonnet-4-6`） | ✅ |
| `systemPrompt` | `string \| string[] \| { type:'preset', preset:'claude_code', ... }` | 系统提示词。支持数组+cache 边界标记 | ✅ |
| `permissionMode` | `'default' \| 'acceptEdits' \| 'bypassPermissions' \| 'plan' \| 'dontAsk' \| 'auto'` | 权限模式。**当前始终传 `'default'`，由 `canUseTool` 做细粒度控制** | ✅ |
| `canUseTool` | `CanUseTool` | 工具权限回调。**核心权限控制点** | ✅ |
| `abortController` | `AbortController` | 取消 query | ✅ |
| `env` | `Record<string, string \| undefined>` | 环境变量。用于 `CLAUDE_AGENT_SDK_CLIENT_APP` 标识 | ✅ |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | Hook 回调。仅用 `PostCompact` | ✅ |
| `tools` | `string[] \| { type:'preset', preset:'claude_code' }` | 可用工具白名单 | ✅ |
| `allowedTools` | `string[]` | 自动允许的工具（免审批） | ✅ |
| `disallowedTools` | `string[]` | 禁用的工具 | ⭕ |
| `additionalDirectories` | `string[]` | 额外可访问目录 | ⭕ |
| `settingSources` | `SettingSource[]` | 加载哪些 filesystem settings | ✅ |
| `includePartialMessages` | `boolean` | 流中包含 `SDKPartialAssistantMessage` | ✅ |
| `resume` | `string` | 恢复会话 UUID | ✅ |
| `continue` | `boolean` | 继续最近会话 | ⭕ |
| `forkSession` | `boolean` | 恢复时分叉到新 UUID 而非原会话 | ⭕ |
| `sessionId` | `string` | 指定 UUID（否则自动生成） | ⭕ |
| `resumeSessionAt` | `string` | 恢复到特定消息 UUID | ⭕ |
| `title` | `string` | 自定义初始标题 | ⭕ |
| `effort` | `EffortLevel` | 思考档位（low/medium/high/xhigh/max） | ✅ |
| `thinking` | `ThinkingConfig` | 新版 thinking 控制（adaptive/enabled/disabled） | ⭕ |
| `maxThinkingTokens` | `number` | **已废弃**。用 `thinking` 或 `effort` 替代 | ⭕ |
| `maxTurns` | `number` | 最大对话轮数 | ⭕ |
| `maxBudgetUsd` | `number` | 美元预算上限 | ⭕ |
| `taskBudget` | `{ total: number }` | API 侧任务预算（beta） | ⭕ |
| `enableFileCheckpointing` | `boolean` | 文件快照（支持 `rewindFiles()`） | ⭕ |
| `outputFormat` | `{ type:'json_schema', schema: ... }` | 结构化输出 | ⭕ |
| `agents` | `Record<string, AgentDefinition>` | 自定义子代理 | ⭕ |
| `agent` | `string` | 主线程 agent 名称 | ⭕ |
| `plugins` | `SdkPluginConfig[]` | 加载插件 | ⭕ |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP 服务器配置 | ⭕ |
| `sandbox` | `SandboxSettings` | OS 沙箱（需 bubblewrap 等） | ⭕ |
| `settings` | `string \| Settings` | flag settings 层（最高优先级） | ⭕ |
| `systemPrompt`（preset append） | — | 附加到默认 system prompt | ✅ |
| `betas` | `SdkBeta[]` | 1M context window beta | ⭕ |
| `persistSession` | `boolean` | 是否落盘持久化 | ✅（默认 true） |
| `includeHookEvents` | `boolean` | 流中包含 hook 生命周期事件 | ⭕ |
| `promptSuggestions` | `boolean` | 预测下一 prompt | ⭕ |
| `agentProgressSummaries` | `boolean` | 子代理进度摘要 | ⭕ |
| `onElicitation` | `OnElicitation` | MCP elicitation 处理回调 | ⭕ |
| `permissionPromptToolName` | `string` | 权限弹窗的 MCP 工具名 | ⭕ |
| `toolConfig` | `ToolConfig` | 内置工具 per-tool 配置 | ⭕ |
| `executable` | `'bun' \| 'deno' \| 'node'` | JS 运行时 | ⭕ |
| `executableArgs` | `string[]` | 运行时额外参数 | ⭕ |
| `extraArgs` | `Record<string, string \| null>` | 额外 CLI 参数 | ⭕ |
| `pathToClaudeCodeExecutable` | `string` | 自定义 claude 可执行文件路径 | ⭕ |
| `spawnClaudeCodeProcess` | `(SpawnOptions) => SpawnedProcess` | 自定义进程生成（VM/容器等） | ⭕ |
| `fallbackModel` | `string` | 主模型失败时的回退模型 | ⭕ |
| `debug` | `boolean` | 调试日志 | ⭕ |
| `debugFile` | `string` | 调试日志文件路径 | ⭕ |
| `stderr` | `(data: string) => void` | stderr 回调 | ⭕ |
| `strictMcpConfig` | `boolean` | MCP 配置严格验证 | ⭕ |
| `sessionStore` | `SessionStore` | 外部持久化适配器（alpha） | ⭕ |
| `loadTimeoutMs` | `number` | sessionStore.load() 超时 | ⭕ |

### 11.3 Query 控制方法

> `Query` 接口（`sdk.d.ts:1872-2075`），从 `query()` 返回的 async generator 上调用。

| 方法 | 用途 | 状态 |
|------|------|:--:|
| `streamInput(stream)` | 多轮对话输入 | ✅ |
| `supportedCommands()` | 获取可用 slash commands | ✅ |
| `close()` | 终止进程并清理资源 | ✅ |
| `interrupt()` | 中断当前执行 | ⭕ |
| `setPermissionMode(mode)` | **运行时**切换权限模式 | ⭕ |
| `setModel(model)` | **运行时**切换模型 | ⭕ |
| `setMaxThinkingTokens(n)` | **运行时**设最大 thinking tokens（已废弃） | ⭕ |
| `applyFlagSettings(settings)` | **运行时**合并 flag settings | ⭕ |
| `initializationResult()` | 获取初始化响应 | ⭕ |
| `supportedModels()` | 可用模型列表 | ⭕ |
| `supportedAgents()` | 可用子代理列表 | ⭕ |
| `mcpServerStatus()` | MCP 服务器连接状态 | ⭕ |
| `getContextUsage()` | 上下文窗口用量明细 | ⭕ |
| `readFile(path)` | 远程读取文件内容 | ⭕ |
| `reloadPlugins()` | 重新加载插件 | ⭕ |
| `accountInfo()` | 账户信息 | ⭕ |
| `rewindFiles(msgId)` | 回滚文件到指定消息 | ⭕ |
| `seedReadState(path, mtime)` | 预热读文件状态缓存 | ⭕ |
| `reconnectMcpServer(name)` | 重连 MCP 服务器 | ⭕ |
| `toggleMcpServer(name, enabled)` | 开关 MCP 服务器 | ⭕ |
| `setMcpServers(servers)` | **动态**设置 MCP 服务器 | ⭕ |
| `stopTask(taskId)` | 停止子任务 | ⭕ |

### 11.4 Hook 事件（28 个）

> 定义在 `sdk.d.ts:687` 的 `HOOK_EVENTS` 常量。

| Hook | 触发时机 | 状态 |
|------|---------|:--:|
| `PreToolUse` | 工具调用**前**，可拒绝/修改输入 | ⭕ |
| `PostToolUse` | 工具执行**后**，可注入上下文 | ⭕ |
| `PostToolUseFailure` | 工具执行**失败** | ⭕ |
| `Notification` | 系统通知 | ⭕ |
| `UserPromptSubmit` | 用户提交 prompt 时 | ⭕ |
| `UserPromptExpansion` | 扩展用户 prompt | ⭕ |
| `SessionStart` | 会话启动时 | ⭕ |
| `SessionEnd` | 会话结束时 | ⭕ |
| `Stop` | 被停止时 | ⭕ |
| `StopFailure` | 停止失败时 | ⭕ |
| `SubagentStart` | 子代理启动 | ⭕ |
| `SubagentStop` | 子代理停止 | ⭕ |
| `PreCompact` | 上下文压缩**前** | ⭕ |
| `PostCompact` | 上下文压缩**后** | ✅ |
| `PermissionRequest` | SDK 内部权限检查 | ⭕ |
| `PermissionDenied` | 权限被拒绝 | ⭕ |
| `Setup` | 初始化/维护 | ⭕ |
| `TeammateIdle` | 队友空闲 | ⭕ |
| `TaskCreated` | 任务创建 | ⭕ |
| `TaskCompleted` | 任务完成 | ⭕ |
| `Elicitation` | MCP 请求用户输入 | ⭕ |
| `ElicitationResult` | 用户响应 elicitation 后 | ⭕ |
| `ConfigChange` | 配置变更 | ⭕ |
| `WorktreeCreate` | git worktree 创建 | ⭕(T092) |
| `WorktreeRemove` | git worktree 删除 | ⭕(T092) |
| `InstructionsLoaded` | 指令文件加载 | ⭕ |
| `CwdChanged` | 工作目录变更 | ⭕ |
| `FileChanged` | 文件变更 | ⭕ |

### 11.5 会话管理函数

| 函数 | 用途 | 状态 |
|------|------|:--:|
| `listSessions({ dir, limit, offset, includeWorktrees })` | 列出会话（支持分页、worktree） | ⭕(T093) |
| `getSessionInfo(sessionId, { dir })` | 读单个会话元数据 | ⭕(T093) |
| `getSessionMessages(sessionId, { dir, limit, offset })` | 读会话消息历史 | ⭕(T093) |
| `getSubagentMessages(sessionId, agentId)` | 读子代理消息 | ⭕ |
| `renameSession(sessionId, title, { dir })` | 重命名会话 | ✅ |
| `deleteSession(sessionId, { dir })` | 删除会话 | ⭕(T093) |
| `forkSession(sessionId, { dir, upToMessageId, title })` | 分叉会话到新 UUID | ⭕(T090) |
| `listSubagents(sessionId, { dir })` | 列出子代理 ID | ⭕ |
| `importSessionToStore(sessionId, store)` | 导入本地会话到 SessionStore（alpha） | ⭕ |

> **当前实现**：MindCraft 自己扫描 `~/.claude/projects/<hash>/` 目录、手动解析 JSONL、`fs.unlinkSync` 删除。详见 TODO.md T093。

### 11.6 权限模型（ClaudeCode）

```
SDK 层: permissionMode  →  CLI 内置的权限行为（我们始终传 'default'）
        canUseTool     →  MindCraft 自定义权限回调（核心控制点）

UI 层:  runMode        →  UI 选择器: ask_before_edits | edit_automatically | plan_mode
                        存储在 tab.runMode 和 agentSession.runMode
```

**runMode → 实际行为映射**（`claudeAgent.js:2214-2527`）：

| UI runMode | SDK permissionMode | canUseTool 行为 |
|------------|:---:|------|
| `ask_before_edits` | `default` | 所有工具弹确认（Bash/Write/Edit 等危险操作） |
| `edit_automatically` | `default` | Bash/Write/Edit 自动允许（在 cwd/additionalDirectories 内） |
| `plan_mode` | `default` | 所有工具拒绝 → 只输出计划不执行 |

> ⚠️ **注意**：这是 MindCraft 自己的抽象层。SDK 原生有 `permissionMode: 'plan'` 可以直接实现 plan 模式，但我们在 `canUseTool` 里做了全拒绝。SDK 原生还有 `permissionMode: 'acceptEdits'` 可以替代我们的 `edit_automatically` + canUseTool。

**ClaudeCode SDK PermissionMode 完整可选值**（来自 `sdk.d.ts:1697`）：
```
'default'             — 标准行为，危险操作弹确认
'acceptEdits'         — 自动接受文件编辑
'bypassPermissions'   — 绕过所有权限检查（需 allowDangerouslySkipPermissions）
'plan'                — 只规划不执行
'dontAsk'             — 不弹确认，未预批准就拒绝
'auto'                — 用模型分类器决定
```

---

## 12. CodeX SDK 接口参考

> 基于 `@openai/codex-sdk` SDK。本节是经过 SDK `index.d.ts` 核对的权威参考。

### 12.1 SDK 入口

```ts
// packages/agent/electron/codexAgent.js:254
const { Codex } = await import('@openai/codex-sdk')
```

```ts
// SDK 导出清单（index.d.ts:276）:
export { Codex, Thread }
// + 类型: SandboxMode, ApprovalMode, ModelReasoningEffort,
//   ThreadOptions, ThreadEvent, ThreadItem, etc.
```

**对比 ClaudeCode SDK**：CodeX SDK API 面明显更小——没有独立的会话管理函数（`listSessions`/`getSessionInfo`/`deleteSession` 等），没有 `Query` 控制方法接口，没有 hook 系统。会话持久化由 CLI（`~/.codex/sessions/`）自动处理。

### 12.2 Codex 类

```ts
class Codex {
  constructor(options?: CodexOptions)  // baseUrl, apiKey, config, env, codexPathOverride
  startThread(options?: ThreadOptions): Thread   // 新会话
  resumeThread(id: string, options?: ThreadOptions): Thread  // 恢复会话
}
```

**状态**：`startThread()` ✅（每个 turn 新建 thread），`resumeThread()` ✅（恢复历史 thread）。

### 12.3 Thread 类

```ts
class Thread {
  get id(): string | null           // thread_id，第一次 turn 开始后填充
  run(input, turnOptions?): Promise<Turn>            // 非流式
  runStreamed(input, turnOptions?): Promise<StreamedTurn>  // 流式 ✅ 我们用的
}
```

### 12.4 ThreadOptions

> 来自 `index.d.ts:239-250`。传递给 `startThread()` / `resumeThread()`。

| 字段 | 类型 | 用途 | 状态 |
|------|------|------|:--:|
| `sandboxMode` | `'read-only' \| 'workspace-write' \| 'danger-full-access'` | OS 级文件沙箱。`workspace-write` 因审批通道缺失**已从 UI 移除** | ⚠️ |
| `approvalPolicy` | `'never' \| 'on-request' \| 'on-failure' \| 'untrusted'` | 工具级审批策略。**固定 `'never'`** | ✅ |
| `model` | `string` | 模型 ID | ✅ |
| `workingDirectory` | `string` | 工作目录（对应 CLI `--cwd`） | ✅ |
| `modelReasoningEffort` | `'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` | 推理深度 | ✅ |
| `networkAccessEnabled` | `boolean` | 网络访问开关 | ✅ |
| `webSearchMode` | `'disabled' \| 'cached' \| 'live'` | 网络搜索模式 | ✅ |
| `webSearchEnabled` | `boolean` | 网络搜索开关 | ⭕ |
| `skipGitRepoCheck` | `boolean` | 跳过 git 仓库检测 | ⭕ |
| `additionalDirectories` | `string[]` | 额外可访问目录 | ✅ |

### 12.5 Thread 事件模型

> `runStreamed()` 返回的 `AsyncGenerator<ThreadEvent>`，我们通过 `for await` 消费。

```
thread.started   → 新 thread 创建，返回 thread_id
turn.started     → 新一轮开始
  item.started   → 新 item（agent_message / command_execution / file_change / mcp_tool_call / web_search / todo_list / reasoning / error）
  item.updated   → item 进度更新
  item.completed → item 完成
turn.completed   → 本轮结束，含 Usage
turn.failed      → 本轮失败，含 error
error            → 流级致命错误
```

**ThreadItem 类型**：
| 类型 | 说明 |
|------|------|
| `agent_message` | Agent 文本响应 |
| `reasoning` | 推理摘要（`reasoning_summary_text.delta`） |
| `command_execution` | 命令执行（Bash） |
| `file_change` | 文件变更（Write/Edit） |
| `mcp_tool_call` | MCP 工具调用 |
| `web_search` | 网络搜索 |
| `todo_list` | 待办列表 |
| `error` | 非致命错误 |

### 12.6 权限模型（CodeX）

```
双维度正交设计：

sandboxMode (OS 级文件隔离)     approvalPolicy (工具级审批)
───────────────────────────     ──────────────────────────
read-only                       never        ← 固定，因 stdin 模式无法交互审批
workspace-write                 on-request   ← 需交互式 stdin/stdout，不可用
danger-full-access              on-failure   ← 同上
                                untrusted    ← 同上
```

> ⚠️ **关键事实**：CodeX 的 `exec --experimental-json` 模式在输入发送后立即关闭 stdin，无法处理审批交互。因此 `approvalPolicy` 被固定为 `'never'`。
>
> ⚠️ **实测结论（2026-06-15）**：`workspace-write` + `never` 组合实测与 `read-only` 行为一致（无法写入）。因为 CodeX CLI 对写操作内部仍走审批判断，`never` 使审批被直接拒绝，不会自动放行。`danger-full-access` + `never` 则可正常写入。
>
> **当前有效权限模型**：
> - `read-only` + `never` → 只读
> - `danger-full-access` + `never` → 全部可写（默认）
>
> 要恢复 `workspace-write` 的中间档能力，需要架构升级：支持 CodeX CLI 审批事件的双向通信（如改用 app-server 协议或实现审批回调）。

**sandboxMode 行为**：

| 值 | 行为 |
|----|------|
| `read-only` | 文件系统只读，Bash 可执行但不可写 |
| `workspace-write` | 可读写工作目录（cwd + additionalDirectories）内的文件 |
| `danger-full-access` | 全盘读写（cwd 外也可写） |

### 12.7 ModelReasoningEffort 完整值

```ts
type ModelReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
```

> ✅ 与我们的实现一致（CodeX 无需修改）。

---

## 13. ClaudeCode vs CodeX SDK 关键差异

| 维度 | ClaudeCode SDK | CodeX SDK |
|------|:---:|:---:|
| SDK 包 | `@anthropic-ai/claude-agent-sdk` | `@openai/codex-sdk` |
| 入口模式 | `query()` 返回 `Query` async generator | `new Codex().startThread()` 返回 `Thread` |
| 多轮对话 | `streamInput()` 控制方法 | `Thread.runStreamed()` 每次调用独立 |
| 会话持久化 | `~/.claude/projects/<hash>/<uuid>.jsonl` | `~/.codex/sessions/`（内部管理） |
| 会话管理 API | `listSessions/getSessionInfo/deleteSession/forkSession` 等 8 个函数 | 无独立 API，依赖 CLI 内部管理 |
| 运行时控制 | `Query` 上有 22 个控制方法 | `Thread` 仅 `run/runStreamed` |
| Hook 系统 | 28 种 hook 事件 | 无 |
| 权限模型 | 单维：`permissionMode` + `canUseTool` 回调 | 双维：`sandboxMode`(OS) + `approvalPolicy`(工具) |
| MCP 管理 | `setMcpServers/toggleMcpServer/reconnectMcpServer` | 无编程接口（配置文件驱动） |
| 模型切换 | `setModel()` 运行时切 | `startThread({ model })` 每次创建时指定 |
| effort 控制 | `effort` Option: `low/medium/high/xhigh/max` | `modelReasoningEffort` Option: `minimal/low/medium/high/xhigh` |

---

## 14. 纠正的历史错误结论

下面是之前结论中经 SDK 核对后确认正确/需要修正的点：

### 14.1 已纠正

| 旧结论 | 纠正 | 状态 |
|--------|------|:--:|
| CodeX 权限用 `read_only/ask/allow_all` 三态 | SDK 原生是 `read-only/workspace-write/danger-full-access`，`approvalPolicy` 是独立维度 | ✅ 已修复（T108-T111） |
| ClaudeCode effortLevel 白名单仅 `low/medium/high/max` | SDK 原生还有 `xhigh`（Opus 4.7） | ✅ 已修复（T105） |
| CodeX approvalPolicy 映射层可被误解为"两层权限" | 实际是二维正交：sandboxMode + approvalPolicy，但因为 stdin 模式限制 approvalPolicy 固定为 'never'。**实测 `workspace-write` + `never` = 只读，已置灰该选项** | ✅ 已更新（T108-T111 + 方案B） |

### 14.2 无需纠正（经核对正确）

- CodeX `startThread()` + `resumeThread()` 每次 turn 创建新 CLI 进程 → sandboxMode 可以在 turn 间切换 ✅
- CodeX `approvalPolicy: 'never'` 是合理的，因为 exec 模式不支持交互审批 ✅
- ClaudeCode `permissionMode: 'default'` + `canUseTool` 自定义权限是正确的模式 ✅
- Chat 功能绕过 SDK 直接用 REST API 是正确的设计（不绑定项目文件夹） ✅
- 双身份模型（`sessionId` / `cliSessionId`）描述准确 ✅

### 14.3 值得关注的未实现能力

以下 SDK 原生能力可以显著简化当前的自定义实现（详见 TODO.md T089-T101）：

| SDK 能力 | 当前自己做的 | 简化效果 |
|---------|-----------|---------|
| `listSessions({ dir })` | `scanCliSessionsForProject()` 手动扫描目录 | 消除 ~200 行 JSONL 扫描代码 |
| `getSessionInfo(sessionId)` | `extractClaudeSessionTitle()` 手动解析 JSONL 头 | 消除标题提取逻辑 |
| `getSessionMessages(sessionId)` | `claude-read-session-file` IPC 手动读文件 | 消除整个文件读取 IPC |
| `deleteSession(sessionId)` | `fs.unlinkSync(filePath)` | 消除手动文件删除 |
| `forkSession(sessionId)` | 无（用户手动复制 JSONL） | 新功能！支持会话分叉 |
| `setModel(model)` | 无（重建 query） | 运行时切模型 |
| `setPermissionMode(mode)` | 无 | 运行时切权限 |
| `getContextUsage()` | 无（手动估算） | 精确上下文用量 |

---

## 15. 更新记录

| 日期 | 变更 |
|------|------|
| 2026-06-15 | **新增 §11-14**：ClaudeCode SDK 接口参考、CodeX SDK 接口参考、跨 SDK 差异对比、错误结论纠正。经 `@anthropic-ai/claude-agent-sdk/sdk.d.ts` 和 `@openai/codex-sdk/dist/index.d.ts` 完整核对 |
| 2026-06-13 | 初版 + Chat 功能文档（§10） |
| 2026-06-11 | 新增会话管理内部机制（§6）
