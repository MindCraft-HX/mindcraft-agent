# SDK 未集成功能全景分析

> 创建：2026-06-16
> Claude SDK 基线：已安装并完成兼容验证 `@anthropic-ai/claude-agent-sdk` v0.3.214
> Codex 运行时：configured external `codex` executable; validate with `--version` and `exec --help`
> 验证依据：Claude SDK 类型定义与 Codex CLI 公开帮助输出，非网络文档
> 关联：`docs/agent-architecture.md`（架构入口）。本文是 SDK 能力与取舍的专题入口；新增 SDK 用法仍需核对本地 `.d.ts`。

### 2026-07-19 compatibility note: interrupted background-task resume

SDK `0.3.214` persists background-task lifecycle state and may auto-continue an
interrupted turn before consuming the host's next streamed user message. When
the prior process exited while waiting on `TaskOutput`, the resume sequence can
append `Continue from where you left off.`, a synthetic `No response
requested.`, and a stopped task notification, then leave the actual human
message without an assistant response.

MindCraft handles this in `electron/claude/resumeRecovery.js`:

- Only a fresh Query resume is inspected; an attached live Query is untouched.
- Transcript reads are tail-first and read-only.
- Every resumed Query is pinned to the latest safe assistant checkpoint through
  SDK `resumeSessionAt`. For a linear completed transcript this is equivalent to
  normal resume; for interrupted or branched transcripts it prevents the CLI
  from selecting a stale tool branch. If no later safe assistant exists, the
  checkpoint falls back to the nearest safe point before the unresolved tool.
- Recovery keeps the same `cliSessionId`. It must not set `forkSession`, merge
  transcripts, or write repair rows into provider files.
- `background_tasks_changed` is the authoritative level signal for current
  background membership; edge notifications remain supported for older flows.

Backward compatibility was checked against the previous packaged baseline:
Agent SDK `0.2.141` bundles Claude Code CLI `2.1.141`, and both
`resumeSessionAt` plus the `task_started` / `task_notification` edge events are
already present there. The level signal is optional. Versions older than
Claude Code `2.1.141` are outside the verified runtime baseline.

This behavior was validated against the production-shaped async iterable input
path. A temporary SDK fork returned a normal assistant response and
`terminal_reason: completed`; the temporary session was deleted after the test.

## 一、Claude Code SDK — 未集成功能

### 1.1 SDK 入口函数（5/10 未用）

| API | 状态 | 用途 | 优先级 |
|-----|:---:|------|:---:|
| `startup()` | ❌ 未用 | 预热 CLI 子进程，首次查询快 ~20 倍 | M |
| `deleteSession()` | ❌ 未用 | SDK 原生删除。当前用 `fs.unlinkSync` 手写 | H |
| `listSessions({dir,limit,offset})` | ❌ 未用 | 分页列会话。当前手写 ~200 行 JSONL 扫描 | **H** |
| `getSessionInfo(sessionId)` | ❌ 未用 | 读单个会话元数据，无需全扫 JSONL | **H** |
| `getSessionMessages(sessionId)` | ❌ 未用 | 读对话全文。当前用自定义 `claude-read-session-file` IPC | **H** |
| `forkSession(sessionId)` | ❌ 未用 | 分支会话（新 UUID + 重映射消息 ID） | H |
| `getSubagentMessages()` | ❌ 未用 | 读子 agent 对话 | L |
| `listSubagents()` | ❌ 未用 | 列出会话子 agent ID | L |
| `connectRemoteControl()` | ❌ 未用 | Alpha 远程会话控制 | L |
| `createSdkMcpServer()` | ❌ 未用 | 进程内 MCP server + 自定义 tool | **H** |
| `query()` | ✅ 在用 | 启动对话 | — |
| `resume()` | ✅ 在用 | 恢复会话 | — |
| `supportedCommands()` | ✅ 在用 | 读取 slash commands | — |

**收益**：`listSessions`/`getSessionInfo`/`getSessionMessages`/`deleteSession`/`forkSession` 可消除数百行手写 JSONL 扫描/解析/操作代码。

### 1.2 Query Options（~40 total，约 28 未用）

| Option | 用途 | 优先级 |
|--------|------|:---:|
| `thinking`（新） | 现代 thinking 控制：`adaptive/enabled/disabled`。替代已弃用的 `maxThinkingTokens` | **H** |
| `mcpServers` | 逐会话传入 MCP server 配置（stdio/SSE/HTTP/SDK） | **H** |
| `agents` / `agent` | 定义自定义子 agent + 设主线程 agent | **H** |
| `plugins` | 加载插件目录：`[{ type: 'local', path }]` | **H** |
| `outputFormat` | 结构化 JSON 输出（JSON Schema） | M |
| `taskBudget` | API 侧 token 预算（Alpha） | M |
| `enableFileCheckpointing` | 启用 `rewindFiles()` 回退文件到任意用户消息 | M |
| `promptSuggestions` | 每轮后 AI 预测下一步提示 | M |
| `agentProgressSummaries` | 后台子 agent 定期进度摘要 | L |
| `includeHookEvents` | 输出流中 emit hook 生命周期事件 | L |
| `sandbox` | OS 级沙箱（文件系统/网络限制） | L |
| `settings` | 内联 settings 对象或 JSON 路径 | L |
| `onElicitation` | 处理 MCP server 用户输入请求 | L |
| `toolConfig` | 逐工具配置（如 `askUserQuestion.previewFormat: 'html'`） | L |
| `spawnClaudeCodeProcess` | 自定义子进程 spawn（VM/容器执行） | L |
| `sessionStore` | 外部 transcript 镜像（Alpha） | L |

### 1.3 Query 运行时控制方法（22 total，~19 未用）

#### 2026-07-02 validation: `getContextUsage()`

`Query.getContextUsage()` is present in the SDK and returns
`{ categories, totalTokens, maxTokens }` by type contract, but it is not a
drop-in replacement for token metric polling in the current app integration.

Local validation with the production-style SDK `query()` path showed:

- Calling immediately after query creation timed out after 60s.
- Calling after the first assistant message failed with
  `Query closed before response received`.
- Calling after `result` failed because the process transport was no longer
  ready for writing.

Conclusion: keep this API as a manual/diagnostic candidate only. Do not call it
from 1s polling, live usage events, or automatic StatusBar refresh until the
transport lifecycle is changed and the call is proven non-blocking.

| 方法 | 用途 | 优先级 |
|------|------|:---:|
| `setModel(model)` | 中途切换模型，无需重建 query | **H** |
| `setPermissionMode(mode)` | 中途切换权限模式 | **H** |
| `applyFlagSettings(settings)` | 运行时合并 settings | **H** |
| `getContextUsage()` | Context breakdown API exists, but automatic metric use is blocked by current transport lifecycle validation | Blocked |
| `interrupt()` | 优雅中断当前执行 | M |
| `supportedModels()` | 列出可用模型 + 能力标识（effort 支持、adaptive thinking、fast mode） | M |
| `supportedAgents()` | 列出可用子 agent | M |
| `mcpServerStatus()` | MCP server 连接状态 | M |
| `setMcpServers(servers)` | 动态增删 MCP server | M |
| `toggleMcpServer(name, enabled)` | 启/停单个 MCP server | M |
| `reconnectMcpServer(name)` | 重连断开 MCP server | M |
| `reloadPlugins()` | 重新加载插件 | L |
| `initializationResult()` | 完整 init 响应（commands/models/account/output styles） | L |
| `accountInfo()` | 认证账号信息 | L |
| `rewindFiles(msgId)` | 回退追踪文件到指定消息 | L |
| `seedReadState(path, mtime)` | 预热 readFileState 缓存 | L |
| `stopTask(taskId)` | 停止运行中的后台 task | L |
| `streamInput()` | ✅ 在用 | 流式输入 | — |
| `supportedCommands()` | ✅ 在用 | 读取 slash commands | — |
| `close()` | ✅ 在用 | 关闭会话 | — |

### 1.4 Hooks 系统（28 events，当前仅用 1）

**当前仅 `PostCompact` 在用。** 完整 28 事件体系：

| Hook 事件 | 可阻塞？ | 典型用途 | 优先级 |
|-----------|:---:|------|:---:|
| `PreToolUse` | ✅ | 门控 tool 调用、修改入参、自动 approve/deny | **H** |
| `PermissionRequest` | ✅ | 编程式权限处理 | **H** |
| `UserPromptSubmit` | ✅ | 门控/增强用户 prompt | **H** |
| `SessionStart` | ❌ | 注入启动上下文、设置 session title | **H** |
| `PostToolUse` | ✅ | 后处理 tool 结果 | M |
| `PostToolUseFailure` | ❌ | 遥测失败 tool | M |
| `Notification` | ❌ | 观察系统通知 | M |
| `UserPromptExpansion` | ❌ | 观察 slash command / MCP prompt 展开 | L |
| `SessionEnd` | ❌ | 清理、通知外部系统 | M |
| `Stop` | ✅ | 门控 end-of-turn | M |
| `StopFailure` | ❌ | 观察失败 stop | L |
| `SubagentStart` | ❌ | 注入子 agent 上下文 | L |
| `SubagentStop` | ✅ | 门控子 agent 完成 | L |
| `PreCompact` | ❌ | 压缩前通知 | L |
| `PostCompact` | ❌ | **✅ 当前唯一使用的 hook** | — |
| `PermissionDenied` | ❌ | 权限拒绝后跟进 | L |
| `Setup` | ❌ | Init/维护 hook | L |
| `TeammateIdle` | ❌ | 观察 teammate 空闲 | L |
| `TaskCreated` | ✅ | 门控 task 创建 | L |
| `TaskCompleted` | ✅ | 门控 task 完成 | L |
| `Elicitation` | ✅ | 自动响应 MCP 用户输入请求 | L |
| `ElicitationResult` | ✅ | 覆写 elicitation 响应 | L |
| `ConfigChange` | ✅ | 门控配置变更 | L |
| `WorktreeCreate` | ❌ | 观察 git worktree 创建 | L |
| `WorktreeRemove` | ❌ | 观察 git worktree 删除 | L |
| `InstructionsLoaded` | ❌ | 观察指令/memory 文件加载 | L |
| `CwdChanged` | ❌ | 观察工作目录变更 | L |
| `FileChanged` | ❌ | 观察文件变更 | L |

### 1.5 MCP 集成（零接入）

SDK 的 MCP 能力完全未使用：

| 能力 | SDK 支持 |
|------|------|
| Server 传输 | stdio、SSE、HTTP、进程内 SDK server |
| 动态管理 | `setMcpServers()`、`toggleMcpServer()`、`reconnectMcpServer()` |
| Elicitation | `onElicitation` 回调 + `Elicitation`/`ElicitationResult` hooks |
| Server 状态 | `mcpServerStatus()` 返回逐 server 连接状态 + tool 列表 |
| 逐 tool 策略 | `McpServerToolPolicy`：`always_allow/always_ask/always_deny` |
| 进程内 server | `createSdkMcpServer()` + `tool()` helper |
| 安全控制 | `allowedMcpServers`、`deniedMcpServers`、`allowManagedMcpServersOnly` |

**优先级：H** — MCP 是 Claude Code SDK 的核心差异化能力，当前完全未接入。

### 1.6 插件/Marketplace 系统（零接入）

| 能力 | SDK 支持 |
|------|------|
| `plugins` option | 加载插件目录：`[{ type: 'local', path }]` |
| `reloadPlugins()` | 运行时重新加载 |
| Plugin config | `pluginConfigs`：逐插件 MCP server 配置 + options |
| Marketplace | 7 种 source 类型：url/github/git/npm/file/directory/settings |
| 安全控制 | `strictKnownMarketplaces`、`blockedMarketplaces`、`strictPluginOnlyCustomization` |
| 启用插件 | `enabledPlugins` setting（`plugin-id@marketplace-id` 格式） |

**注**：开发模式可选地扫描项目根 `dev-plugins/`；该目录不随公开仓库提供示例插件，SDK 插件与 marketplace 仍是默认集成路径。

**优先级：L-M** — SDK 插件比自定义系统更丰富，但当前自定义系统可用。

### 1.7 Permissions/PermissionMode（部分接入）

| SDK 能力 | 接入状态 |
|------|:---:|
| `permissionMode: 'plan'` | 当前用 `canUseTool` 拒绝所有来模拟 |
| `permissionMode: 'acceptEdits'` | 当前用 `canUseTool` 实现 |
| `permissionMode: 'auto'` | 未接入（模型分类器决定 approve/deny） |
| `permissionMode: 'dontAsk'` | 未接入 |
| `permissionPromptToolName` | 未接入（路由权限提示到自定义 MCP tool） |
| `PermissionRequest` hook | 未接入 |

---

## 二、Codex External CLI — Runtime Contract

MindCraft no longer imports the Codex SDK. `CodexCliTransport` starts the
configured external executable with `codex exec --json`, owns the child process,
and normalizes stdout JSONL into the renderer event contract.

Required capabilities are `--json` and `exec resume`; optional capabilities are
probed for images, additional directories, and non-Git workspaces. npm is only
an installer/update channel, not a runtime dependency.

The production integration decision and upgrade gates are recorded in
`docs/provider-runtime-dependency-policy.md`. In particular, the current Codex
SDK wraps the same exec JSONL process and is not a reason to replace the direct
external CLI transport.

### 2.1 Event Types Not Fully Handled

| Event 类型 | 当前处理 |
|------|------|
| `todo_list` items | 可能未渲染到 UI |
| `web_search` items | 可能未渲染到 UI |
| `mcp_tool_call` items | 未处理（除非配置了 MCP） |

### 2.2 Codex CLI Newer Features

| 功能 | 版本 | 描述 |
|------|:---:|------|
| `excludeTurns` 参数 | 近期 | resume/fork 分页能力；需先确认 CLI 公开参数 |
| Unix socket 传输 | 近期 | app-server 集成；当前仍为 experimental，不作为 runtime 依赖 |
| Permission profiles | 近期 | 跨 session 权限 profile 持久化 |
| Reasoning token 报告 | 近期 | `codex exec --json` 报告 reasoning-token 用量 |

---

## 三、推荐优先级路线图

### Tier 1：消除手写代码（HIGH impact）

| 项目 | 收益 |
|------|------|
| `listSessions()` / `getSessionInfo()` / `getSessionMessages()` | ~200 行 JSONL 扫描消除 |
| `deleteSession()` / `forkSession()` | 替换 `fs.unlinkSync`，增加 fork 能力 |
| `getContextUsage()` | Blocked for automatic metrics; manual/diagnostic candidate only |
| `setModel()` / `setPermissionMode()` | 中途切换无需重建 query |

### Tier 2：新增核心能力（HIGH-MEDIUM impact）

| 项目 | 收益 |
|------|------|
| **MCP 集成** (`mcpServers`, `setMcpServers`, `createSdkMcpServer`) | 连接 GitHub/Slack/Jira/DB/自定义 tool |
| **Hooks 系统** (`PreToolUse`, `SessionStart`, `UserPromptSubmit`) | 编程式 tool 门控、session 初始化、prompt 预处理 |
| **Agent 定义** (`agents` option) | 自定义子 agent（tool 限制、system prompt、model override） |
| `outputFormat` | 结构化 JSON 响应 |
| `thinking` 新 API | 迁移 `effort` → 现代 `ThinkingConfig` |

### Tier 3：打磨与高级功能（LOWER priority）

| 项目 | 收益 |
|------|------|
| `promptSuggestions` | AI 预测下一条 prompt |
| `enableFileCheckpointing` + `rewindFiles()` | 回退文件到任意消息 |
| `includePartialMessages` | 流式部分消息 delta |
| CodeX `outputSchema` | Codex 结构化输出 |
| 插件/Marketplace 系统 | SDK 插件生态 |
| V2 alpha APIs | 多轮会话管理 |

---

## 四、补充说明

1. **本文是 SDK 能力专题入口**。`agent-architecture.md` 只保留高层架构和路由，不再承载逐字段 SDK 表。
2. **所有信息基于 SDK 源码类型定义验证**（`sdk.d.ts` 和 `dist/index.d.ts`），未依赖第三方文档。
3. **优先级标注**：H=消除手写代码或新增核心能力；M=显著改善体验或简化架构；L=锦上添花。
