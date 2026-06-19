# ClaudeCode Runtime / Metrics State Machine 重构方案

> 日期：2026-06-19
> 关联：T141、`docs/session-pitfalls.md`、`docs/bugs/claude-session-duplicate-split.md`
> 状态：规划稿，待实施

## 1. 背景

CodeX runtime state machine 重构后，人工验收确认运行态稳定性明显提升：完成后不复活 running、terminal/done 分工清晰、metrics 不再拥有运行态权威、排队输入可正常接上。

ClaudeCode 目前整体仍可用，但历史上修过多轮 session/pending/恢复问题，运行态和 metrics 仍散落在多个入口：

- `sendMessage()` 直接设置 `tab.thinking`、`metricsData.thinking`、`_thinkingStart`。
- `useClaudeAgentStream.js::onAgentMessage()` 可在 stream 消息到达时恢复 `thinking=true`。
- `useClaudeAgentStream.js::onAgentDone()` 清理 `thinking` 并绑定 `cliSessionId/filePath`。
- `abortSession()` 直接清前端 running 和 metrics timer。
- `onMetricsUpdate()` / `refreshMetricsForChat()` 同时更新展示数据和 live timer。
- `ensureChatMessagesLoaded()` 会在历史加载后强制 `chat.thinking=false`。
- history persistence 只以 `thinking` 判断 streaming message 是否落盘。

这些入口每个单独看都有理由，但组合后存在和 CodeX 之前类似的结构风险：状态权威不清晰，metrics 与 UI 生命周期交织，迟到事件/恢复事件容易覆盖真实状态。

## 2. 当前问题画像

| 来源 | 文件 | 当前行为 | 风险 |
|------|------|----------|------|
| 用户发送 | `claudeCode/index.vue::sendMessage()` | push user bubble 后设置 `tab.thinking=true`、启动 metrics | done/stream/metrics 乱序时可能覆盖清理 |
| Stream message | `useClaudeAgentStream.js::onAgentMessage()` | 工作消息到达时恢复 `tab.thinking=true` | 迟到 stream 可复活已完成 turn |
| Done event | `useClaudeAgentStream.js::onAgentDone()` | 清 `thinking`、绑定身份、通知、保存 | terminal/failed/aborted 语义未显式建模 |
| Metrics update | `claudeCode/index.vue::onMetricsUpdate()` | 合并 metrics，并根据 `data.thinking` 控制 live timer | metrics 仍隐含运行态权威 |
| Metrics refresh | `refreshMetricsForChat()` | tab 切换时取 metrics，并用 `chat.thinking` 反写 result | 展示层和运行层边界不清 |
| Abort | `abortSession()` | 立即清 UI running，调用主进程 abort | abort 请求到后端完成之间缺少显式锁状态 |
| History load | `ensureChatMessagesLoaded()` | 从磁盘加载后清 `chat.thinking=false` | 恢复路径直接改生命周期字段 |
| History save | `useClaudeHistory.js` | streaming chat 消息跳过落盘 | runtime 字段持久化规则不集中 |

## 3. 目标不变量

### 3.1 身份不变量

- `chat.sessionId` 仍是 MindCraft chatKey。
- `chat.cliSessionId` 是 Claude 官方 session UUID。
- `chat.filePath` 是真实官方 JSONL 路径。
- `sessionId !== cliSessionId`，不能回退到混用。
- 不写 MindCraft 自有数据到 `~/.claude` 或项目 `.claude`。

### 3.2 运行态不变量

- 只有 Claude runtime state machine 能写 `tab.thinking`、`tab._thinkingStart`、`tab.currentAssistantId` 的生命周期意义。
- metrics 只提供观测数据：tokens、duration、context、model、git、cost，不决定 running 生命周期。
- stream 工作消息只能在合法运行状态中维持 running，不能复活 terminal/done/failed/aborted 状态。
- done event 是最终收尾边界，负责绑定 `cliSessionId/filePath`、通知、保存。
- abort 分成 `abort_requested` 和 `aborted`：前者隐藏停止按钮并阻止误发送，后者清理运行态。
- 已绑定 `filePath` 的历史会话不持久化 running 状态，避免重启后假运行。

### 3.3 状态枚举

建议内部字段：

```text
tab._claudeRuntimeState
```

状态：

| 状态 | 语义 |
|------|------|
| `idle` | 空闲，可发送 |
| `starting` | 用户已发送，IPC query 已发出，等待 stream |
| `streaming` | 收到 assistant/tool/system 工作流事件 |
| `terminal_seen` | 若后续引入明确 terminal 事件，可先停 UI waiting |
| `done` | `claude-agent-done` 且 reason completed |
| `failed` | SDK error / unexpected end |
| `abort_requested` | 用户点击 abort，后端尚未确认 |
| `aborted` | abort 收尾 |

短期 ClaudeCode 没有 `_awaitingDone` 字段，不强行引入；如发现 abort/request 窗口需要发送锁，再评估是否新增 `_awaitingDone` 或复用 `_claudeRuntimeState` 做 `isClaudeTurnLocked()`。

## 4. 实施方案

### Phase 1：抽纯函数

新增：

```text
packages/agent/src/components/claudeCode/utils/claudeRuntimeState.mjs
```

提供：

| 函数 | 用途 |
|------|------|
| `markClaudeTurnStarting(tab, now)` | 用户发送后进入 starting |
| `markClaudeStreamActivity(tab, msg)` | 合法状态下维持 streaming |
| `markClaudeDone(tab, payload)` | done 收尾，绑定 `cliSessionId/filePath` |
| `markClaudeFailed(tab, error)` | failed 收尾 |
| `markClaudeAbortRequested(tab)` | abort 请求态 |
| `markClaudeAborted(tab)` | abort 完成态 |
| `applyClaudeMetrics(tab, data)` | 合并/派生 metrics thinking，但不改运行态 |
| `buildPersistableClaudeChat(chat)` | history 保存前清 runtime |
| `isClaudeTurnLocked(tab)` | 统一判断是否可发送 |

要求：

- 工具函数不调用 IPC、toast、scroll、saveHistory。
- `currentAssistantId` 普通 stream 拼接游标可留在 stream handler；状态机只在边界清理。
- Phase 1 先补测试，不改行为。

### Phase 2：替换运行态入口

替换以下直接写入：

- `claudeCode/index.vue::sendMessage()`
- `claudeCode/index.vue::abortSession()`
- `claudeCode/index.vue::onMetricsUpdate()`
- `claudeCode/index.vue::refreshMetricsForChat()`
- `claudeCode/index.vue::ensureChatMessagesLoaded()`
- `useClaudeAgentStream.js::onAgentMessage()`
- `useClaudeAgentStream.js::onAgentDone()`
- `useClaudeHistory.js::buildPanelStatePayload()`

替换后用审计命令确认：

```powershell
rg "\.(thinking|_thinkingStart|currentAssistantId)\s*=" packages/agent/src/components/claudeCode -S
```

允许保留：

- runtime state machine 工具文件内写入。
- 新建/恢复 chat 时初始化默认值。
- `currentAssistantId` 的普通 stream 拼接游标写入。

### Phase 3：metrics 收敛

目标：

- `metricsData.thinking` 从 `tab.thinking` 派生或由状态机同步，不再直接信任 metrics event 的 `thinking` 改 UI。
- live timer 只由 runtime start time 驱动。
- tab 切换时 `refreshMetricsForChat()` 只刷新 token/git/model/context，不重启/停止运行态。
- final metrics 可以更新 usage/duration，但不能复活 running。

### Phase 4：人工验收

新增：

```text
docs/qa/2026-06-19-claude-runtime-metrics-state-machine-acceptance.md
```

验收重点：

1. 正常回复完成后 running 不复活。
2. 迟到 metrics 不重启 live timer。
3. tab 切换时 metrics 正确刷新，不影响当前运行态。
4. abort 后 UI 解锁，不出现假 running。
5. 重启后已绑定历史会话不显示 running。
6. pending/adoption/session identity 回归不退化。

## 5. 非目标

- 不重写 Claude 主进程 `agentSessions/cliSessionIds` ownership。
- 不改 pending adoption 的身份模型。
- 不改 Session Registry schema。
- 不做 ClaudeCode 多条排队输入功能。
- 不改变现有 UI 文案，除非验收发现明显误导。

## 6. 自动化测试计划

新增或扩展：

```text
tests/claude-runtime-state.test.mjs
tests/claude-task-stream-sync.test.mjs
tests/claude-history-persistence-sanitizer.test.mjs
tests/claude-session-integrity.test.mjs
tests/task-done-history-persistence.test.mjs
```

必须覆盖：

- `starting -> streaming -> done` 清理 runtime。
- `done` 后迟到 stream activity 不复活 `thinking`。
- `done` 后迟到 metrics thinking 不复活 live timer。
- abort requested 期间保持锁，aborted 后解锁。
- bound `filePath` 持久化时不保存 running。
- history restore 后不会因旧 runtime 字段假运行。

## 7. 风险

- ClaudeCode 的 session/pending 逻辑比 CodeX 更老，直接搬 CodeX 结构可能破坏 adoption。
- metrics 目前在主进程和 renderer 都有 live/final 两条路径，必须先保留展示数据，再收敛运行态权威。
- `onAgentDone` 不是 crash 场景保证事件，history restore 必须仍能从磁盘恢复。
- 不要在同一轮改多窗口/provider reset 主进程逻辑，避免扩大回归面。

## 8. 推荐开发顺序

1. Phase 1：加 `claudeRuntimeState.mjs` + 单元测试。
2. Phase 2a：替换 `sendMessage/onAgentDone/onAgentMessage` 三个核心入口。
3. Phase 2b：替换 `abortSession/ensureChatMessagesLoaded/useClaudeHistory`。
4. Phase 3：收敛 `onMetricsUpdate/refreshMetricsForChat`。
5. Phase 4：写人工验收并跑 ClaudeCode 手工回归。

每一步完成后跑对应测试，不和 CodeX 再改动混在一起。
