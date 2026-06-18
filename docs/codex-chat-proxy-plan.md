# CodeX Chat Completions 协议转换代理 — 实施计划

> 日期: 2026/06/18 | 状态: ✅ 已实现

## Context

**问题**：CodeX CLI 只支持 OpenAI Responses API 协议（`wire_api = "responses"` 是唯一有效值），无法直接对接国内 Chat Completions 协议模型（DeepSeek、Kimi、Qwen、GLM、MiniMax 等）。

**方案**：在 Electron 主进程内置一个轻量 HTTP 代理服务器，将 CodeX CLI 发出的 Responses 请求实时转换为 Chat Completions 请求，再把上游的 Chat 响应转换回 Responses 格式。原理同 CC SWITCH，但内嵌在 MindCraft 自身进程中，不依赖外部服务。

**用户需求**：支持所有 OpenAI Chat Completions 兼容接口的模型。通过 ProviderForm 新增 "API 格式" 下拉框（Chat Completions / Responses）显式标记。

**开源设计原则**：所有 config.toml 字段使用通用名称（如 `api_format` 而非专有前缀），任何第三方代理/工具均可使用，不绑定 MindCraft 生态。ProviderForm 中 MindCraft 特有的管理字段不影响 config.toml 的通用性。

---

## 架构概览

```
┌─ Electron 主进程 ─────────────────────────────────────────┐
│                                                            │
│  codexAgent.js                                             │
│  ├─ readRuntimeConfig() 新增读取 apiFormat                 │
│  ├─ apiFormat === "chat" → 启动 codexProxyServer           │
│  │   → config.toml base_url = http://127.0.0.1:{PORT}/v1  │
│  │   → config.toml wire_api = "responses"                 │
│  ├─ apiFormat === "responses" → 直接连接，无代理           │
│  └─ session 结束 → 关闭 codexProxyServer                   │
│                                                            │
│  codex/                                                    │
│  ├── proxyServer.js        ← HTTP 服务器 + 路由             │
│  ├── transformRequest.js   ← Responses → Chat 请求转换     │
│  ├── transformResponse.js  ← Chat → Responses 响应转换     │
│  ├── transformStream.js    ← Chat SSE → Responses SSE 流式 │
│  ├── reasoningMapper.js    ← 推理参数 provider 映射        │
│  └── common.js            ← reasoning 提取、think 块解析   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## 数据流

```
CodeX CLI                    local proxy                 上游 Chat API
───────                      ──────────                 ─────────────
POST /v1/responses  ────→   检测 apiFormat=chat
{instructions,               responsesToChat()          POST /chat/completions
 input[], tools,       ────→                           {messages[{role:system}],
 reasoning.effort}                                        tools[], thinking:{type}...}
                                                              │
                            chatToResponse() ←───────────────┘
                            / chatSseToResponsesSse()
{id, object:"response", ←───
 output[{reasoning},
        {message},
        {function_call}],
 usage, status}
```

## 实施顺序

按依赖关系从小到大：

1. **providerToml.mjs** — 读写新字段（无依赖，其他模块依赖它）
2. **ProviderForm.vue** — UI 添加 API 格式下拉（依赖 Step 1 的字段定义）
3. **codex/proxyServer.js + 5 个子模块** — 代理核心（独立模块）
4. **codexAgent.js** — 集成代理生命周期（依赖 Step 1,3）
5. **i18n keys** — 翻译文本
6. **构建验证**

## 新增文件清单

| 文件 | 用途 | 预估行数 |
|------|------|---------|
| `packages/agent/electron/codex/proxyServer.js` | HTTP 代理服务器 | ~150 |
| `packages/agent/electron/codex/transformRequest.js` | 请求转换 | ~200 |
| `packages/agent/electron/codex/transformResponse.js` | 响应转换 | ~150 |
| `packages/agent/electron/codex/transformStream.js` | 流式 SSE 转换 | ~300 |
| `packages/agent/electron/codex/reasoningMapper.js` | 推理参数映射 | ~100 |
| `packages/agent/electron/codex/common.js` | 公共工具 | ~80 |
| **合计** | | **~980** |

## 修改文件清单

| 文件 | 改动 | 预估行数 |
|------|------|---------|
| `ProviderForm.vue` | 新增 API 格式下拉 + v-model + emit | ~20 |
| `providerToml.mjs` | 读写 `wire_api` / `api_format` | ~15 |
| `codexAgent.js` | 读取 apiFormat + 代理生命周期 + 清理 | ~40 |
| `zh-CN.json` + `en.json` | 新增 4 个 i18n key | ~4 |
| **合计** | | **~80** |

## 协议转换参考

移植自 CC SWITCH (`reference_project/cc-switch/src-tauri/src/proxy/providers/`)：

| CC SWITCH 源码 | MindCraft 对应模块 |
|---|---|
| `transform_codex_chat.rs` (~1000行) | `transformRequest.js` + `transformResponse.js` |
| `streaming_codex_chat.rs` (~500行) | `transformStream.js` |
| `codex_chat_common.rs` (~100行) | `common.js` |
| `codex.rs` reasoning 部分 | `reasoningMapper.js` |
| `handlers.rs` responses handler | `proxyServer.js` |

## 验证方案

### 单元测试
- 请求转换：`{instructions, input[], tools, reasoning}` → `{messages, tools, stream_options}`
- 响应转换：Chat 响应 → Responses 响应（reasoning_content 拆分、tool_calls 映射）
- 流式转换：Chat SSE chunk → Responses SSE 事件序列
- 错误归一化：MiniMax `base_resp` → Responses `error`
- 推理映射：各 provider 的 thinking/effort 格式

### 集成测试
- `npm run electron:build` 无报错
- Chat 格式 provider 正常调用（通过代理）
- 流式输出事件顺序正确
- 会话结束后代理端口释放
- Responses 格式 provider 不受影响

## 风险

| 风险 | 对策 |
|------|------|
| CodeX SDK 行为变化 | 写死 `wire_api = "responses"` |
| 国内模型 SSE 差异 | 先支持 DeepSeek，再逐个适配 |
| 代理端口冲突 | `server.listen(0)` 自动分配 |
| 内存占用 | 用 Stream pipeline |
| 端口泄漏 | finally + abort handler 双重清理 |

---

## 实施完成

> 日期: 2026/06/18 | 所有步骤已完成

### 实施结果

| 步骤 | 内容 | 状态 |
|------|------|------|
| Step 1 | ProviderForm.vue — API 格式下拉 | ✅ |
| Step 2 | providerToml.mjs — wire_api + api_format | ✅ |
| Step 3 | codexAgent.js — apiFormat 读写 + 代理生命周期 | ✅ |
| Step 4 | proxyServer.js — HTTP 代理服务器 (175行) | ✅ |
| Step 5 | transformRequest.js — 请求转换 (210行) | ✅ |
| Step 6 | transformResponse.js — 响应转换 (130行) | ✅ |
| Step 7 | transformStream.js — 流式 SSE 转换 (385行) | ✅ |
| Step 8 | reasoningMapper.js — 推理参数映射 (130行) | ✅ |
| Step 9 | common.js — 公共工具 (110行) | ✅ |
| Step 10-11 | IPC handlers + i18n keys (zh-CN + en) | ✅ |
| Step 12 | 构建验证 + 12 项单元测试 | ✅ |

### 审计修复 (2026/06/18)

审计中发现并修复以下问题：

1. **transformResponse.js**: 移除未使用的 `buildResponseFunctionCallItem` import（死代码）
2. **proxyServer.js**: URL 路由改为按 pathname 匹配（`req.url` 可能含查询参数）
3. **APISetting.vue**: `extractTomlFields` 补齐 `result.api_format = draft.apiFormat` 读取

### 人工验收方案

详见 [`docs/codex-chat-proxy-acceptance-test.md`](./codex-chat-proxy-acceptance-test.md)，覆盖 6 大类 26 项检查点：
- UI 验收（下拉框、持久化、国际化）
- config.toml 验证（`wire_api` + `api_format`）
- 代理生命周期（启动/释放/中止/非侵入）
- 协议转换（流式、推理、工具调用、模型列表）
- 错误路径（无效 Key、连接失败、上游错误）
- 跨 Provider 兼容（DeepSeek / Kimi / Qwen / GLM / MiniMax）
