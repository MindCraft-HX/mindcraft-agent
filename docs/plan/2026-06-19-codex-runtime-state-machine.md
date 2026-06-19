# CodeX Runtime State Machine 重构方案

> 日期：2026-06-19
> 关联：T138 后续、`docs/bugs/codex-conversation-interruption.md`
> 状态：已修订，进入实施

## 1. 背景

T138 session identity registry 重构后，CodeX 的身份映射、title registry、真实 rollout `filePath` 已基本收敛。但人工验收 `3.4 继续旧会话不分裂` 暴露出新的结构性问题：CodeX 运行态由多个来源共同写入，事件稍微乱序就会让 UI 进入错误状态。

已观察到的现象：

- 回复实际完成后，UI 先停止“正在响应”，约 1 秒后又恢复“正在响应”。
- 左侧运行动态点曾在 CodeX 刚开始工作时消失，但主进程仍在继续运行。
- CodeX 与 ClaudeCode 行为差异明显，ClaudeCode 更稳定。

本轮已临时修复：

- `task_complete` / `turn.completed` 转发到前端，先清 UI 运行态。
- 迟到的 `metrics.thinking=true` 不再复活已完成的 turn。
- 后台 transcript scan 合并时保留 active chat 和未绑定的运行中 chat。
- `sendMessage()` 在 IPC resolve 后不再无条件写 `metrics.thinking=true`。

这些修复方向正确，但仍属于局部收敛。下一步应把 CodeX 运行态收敛成显式 state machine，减少后续补丁风险。

## 2. 当前结构问题

CodeX 的运行态目前由以下入口直接或间接写入：

| 来源 | 文件 | 当前职责 | 问题 |
|------|------|----------|------|
| 用户发送 | `codeX/index.vue::sendMessage()` | 设置 `thinking/_awaitingDone/_thinkingStart` | 直接写字段，和 done/metrics 竞争 |
| Stream item | `useCodexAgentStream.js::onAgentMessage()` | item 到达时恢复/维持 `thinking` | 只知道消息事件，不应独立决定完整生命周期 |
| Terminal event | `useCodexAgentStream.js::onAgentMessage()` | `task_complete/turn.completed` 清状态 | 正确但散落 |
| Done event | `useCodexAgentStream.js::onAgentDone()` | 绑定 `cliSessionId/filePath`、通知、清状态 | 正确但和 terminal 分工未显式建模 |
| Metrics event | `codeX/index.vue::onMetricsUpdate()` | token/duration/git + 曾同步 thinking | metrics 不应拥有运行态权威 |
| Transcript scan | `codeX/index.vue::refreshProjectSessionsInBackground()` | 从官方 JSONL 同步列表 | 曾误删未绑定运行中 chat |
| History persistence | `useCodexHistory.js` | 保存 panel state | 运行态落盘规则分散 |
| Abort | `codeX/index.vue::abortSession()` | 中断期间隐藏停止按钮并保持发送锁 | 直接写字段，未纳入统一状态机 |

核心问题不是某一行错，而是没有统一的不变量：

- 谁可以把 idle 改成 running？
- 谁可以把 running 改成 done？
- metrics 是否有权改变 running？
- scan 是否有权删除 running 中的 chat？
- bound session 的 runtime 字段是否允许落盘？

## 3. 目标不变量

### 3.1 身份不变量

- `chat.sessionId` 永远是 MindCraft chatKey。
- `chat.cliSessionId` 是 CodeX thread id。
- `chat.filePath` 是真实官方 rollout JSONL 路径。
- `sessionId !== cliSessionId`。

### 3.2 运行态不变量

- 只有 runtime state machine 能写 `tab.thinking`、`tab._awaitingDone`、`tab._thinkingStart`、`tab.currentAssistantId` 的生命周期意义。
- 内部语义状态写入 `tab._codexRuntimeState`，该字段只存在于 renderer 内存，持久化前必须清理。
- metrics 只提供观测数据：tokens、duration、context、model、git，不拥有运行态权威。
- transcript scan 只能同步 transcript metadata，不允许删除 active chat 或未绑定运行中 chat。
- 已绑定 `filePath` 的 session 不持久化运行中状态，避免重启后假运行。
- terminal event 可以先清 UI 状态；done event 负责 registry/filePath/通知/最终落盘。
- `currentAssistantId` 同时承担 assistant message 拼接游标。状态机只负责在 terminal/done/failed/abort 等生命周期边界清理它；普通 stream 拼接仍由 stream handler 管理。

### 3.3 状态枚举

建议内部用语义状态，不一定持久化到 panel state：

| 状态 | 语义 |
|------|------|
| `idle` | 空闲，可发送 |
| `starting` | 用户已发送，IPC query 已发出，尚未确认 stream 开始 |
| `streaming` | 收到 stream item / metrics true，正在运行 |
| `terminal_seen` | 收到 `task_complete/turn.completed`，UI 可停止 waiting，但 done 可能尚未到达 |
| `done` | 收到 `codex-agent-done` 且 reason completed |
| `failed` | stream failed / timeout / unexpected end |
| `aborted` | 用户 abort |
| `queued` | 当前 turn 未结束，用户输入排队 |

外部 UI 仍可继续使用 `thinking/_awaitingDone`，但应由状态机派生：

```text
thinking = state in starting/streaming
_awaitingDone = state in starting/streaming/terminal_seen/queued
```

关键例外：

- `terminal_seen` 下 `thinking=false`、`_awaitingDone=true`。此时 UI 不显示“正在响应”，但发送仍被锁住，直到 done/failed/abort 收尾。
- `terminal_seen/done/failed/aborted/idle` 下迟到的 `metrics.thinking=true` 不能把 `thinking` 复活。
- `queued` 用于“当前 turn 尚未真正可发送，但已有用户输入等待重试/flush”。进入 `queued` 时可以保持 `_awaitingDone=true`，但不能由 metrics 决定是否退出。

是否最终保留 `_awaitingDone` 需实施时评估；短期可保留字段，先统一写入口。

## 4. 建议实现

### Phase 1：抽 `codexRuntimeState.mjs`

实现入口：

```text
packages/agent/src/components/codeX/utils/codexRuntimeState.mjs
```

当前仓库已有 `packages/agent/src/components/codeX/utils/sessionLifecycle.mjs`，其中已有 `isCodexTurnLocked()`、`shouldHydrateHistoryFromDisk()`、`shouldSyncThinkingFromMetrics()`、`mergeScannedChatsPreservingRuntime()` 等局部规则。实施时不得保留两套并行生命周期规则：

- `sessionLifecycle.mjs` 扩展为实际状态机实现文件，保持旧导出兼容既有测试。
- `codexRuntimeState.mjs` 作为统一命名入口 re-export，后续新代码优先从该文件导入。

提供纯函数：

| 函数 | 用途 |
|------|------|
| `markCodexTurnStarting(tab, now)` | 用户发送前设置运行态 |
| `markCodexTurnAccepted(tab, metricsDefaults)` | IPC accepted 后初始化 metrics，但不覆盖已结束状态 |
| `markCodexStreamActivity(tab, msg)` | stream item 到达时维持运行态 |
| `markCodexTerminalSeen(tab)` | `task_complete/turn.completed` 清 UI thinking，保留必要 awaiting |
| `markCodexDone(tab, payload)` | done 收尾，清 runtime，写 `cliSessionId/filePath` |
| `markCodexFailed(tab, error)` | failed/error 收尾 |
| `markCodexAbortRequested(tab)` | 用户点击 abort 后隐藏停止按钮，但保持发送锁 |
| `markCodexAborted(tab)` | abort 收尾 |
| `markCodexQueued(tab, opts)` | queueable reject / 用户排队输入时进入 queued |
| `applyCodexMetrics(tab, data)` | 合并 metrics，但不让迟到 `thinking:true` 复活已结束 turn |
| `mergeScannedCodexChats(existing, scanned, ctx)` | scan 合并，保留 active / runtime chat |
| `buildPersistableCodexChat(chat)` | panel state 持久化前清理 runtime |

要求：

- 纯函数优先，便于测试。
- 不在函数里直接调用 IPC / toast / scroll / saveHistory。
- UI 副作用由调用方保留，但状态字段只通过这些函数变更。

### Phase 2：替换写入口

替换以下直接字段写入：

- `codeX/index.vue::sendMessage()`
- `codeX/index.vue::abortSession()`
- `codeX/index.vue::onMetricsUpdate()`
- `codeX/index.vue::refreshProjectSessionsInBackground()`
- `useCodexAgentStream.js::onAgentMessage()`
- `useCodexAgentStream.js::onAgentDone()`
- `useCodexHistory.js::buildPanelState()`

保留现有行为，先不改 UI 文案和通知策略。

替换完成后，用 `rg "tab\\.(thinking|_awaitingDone|_thinkingStart|currentAssistantId)\\s*=" packages/agent/src/components/codeX` 做入口审计。允许保留的写入必须满足以下条件之一：

- 位于 runtime state machine 工具文件。
- `currentAssistantId` 的普通 stream 拼接游标写入。
- 新建/恢复 chat 时初始化静态默认值。

### Phase 3：补主流程测试

新增或扩展：

```text
tests/codex-runtime-state.test.mjs
tests/codex-session-lifecycle.test.mjs
tests/task-done-history-persistence.test.mjs
tests/codex-agent-done-reason.test.mjs
```

必须覆盖：

1. `starting -> terminal_seen -> done` 后，迟到 `metrics.thinking=true` 不能复活。
2. `_awaitingDone=true` 时，`metrics.thinking=false` 不能提前解锁。
3. stream item 到达时，只能在 `starting/queued` 等合法状态维持 running。
4. scan 合并保留 active draft 和 unbound running chat。
5. bound session 持久化时 `_awaitingDone=false`、`_thinkingStart=null`。
6. done payload 设置真实 `filePath` 后，runtime 清空。
7. `abort requested -> aborted` 期间保持 `_awaitingDone=true`，避免后端尚未完成时新消息撞上旧 run。
8. `terminal_seen` 保持 `_awaitingDone=true` 时，迟到 `metrics.thinking=true` 不能复活 `thinking`。

### Phase 4：清理冗余字段和注释

在测试稳定后再考虑：

- 是否保留 `_awaitingDone` 字段。
- 是否把 `metrics.thinking` 完全改成派生值。
- 是否统一 `thinking` 和 `_thinkingStart` 的保存/恢复注释。
- 删除已经无效的局部防护注释，避免误导。

## 5. 非目标

本次重构不处理：

- 不重构 CodeX SDK 主进程 run ownership。
- 不改 session registry provider index。
- 不改 title/instruction/delete 语义。
- 不替换官方 transcript 扫描方案。
- 不写 `~/.codex` 任何 MindCraft 自有数据。

如果发现主进程 `runId/doneSent/streamClosed` 仍有竞态，应另开 bug，不夹在本次 renderer runtime state machine 重构里。

## 6. 风险与回滚

主要风险：

- 状态机过度集中后，如果调用点漏改，会出现新旧逻辑并存。
- `_awaitingDone` 当前承担“阻止提前发送/保护磁盘加载”的双重含义，不能一次性删除。
- `terminal_seen` 和 `done` 分工必须保留，否则后台通知可能丢失或重复。

控制方式：

- Phase 1 只加纯函数和测试，不改行为。
- Phase 2 小步替换，每替换一个入口跑相关测试。
- 不同时改 ClaudeCode。
- 每阶段提交，便于回滚。

## 7. 验收计划

重构完成后，先跑自动化：

```powershell
node tests/codex-runtime-state.test.mjs
node tests/codex-session-lifecycle.test.mjs
node tests/codex-agent-done-reason.test.mjs
node tests/task-done-history-persistence.test.mjs
node tests/codex-agent-done-payload.test.cjs
node tests/codex-git-metrics.test.cjs
node --check packages/agent/src/components/codeX/utils/codexRuntimeState.mjs
git diff --check
```

再回到 T138 人工验收文档继续：

- `docs/qa/2026-06-18-agent-session-identity-registry-acceptance.md`

优先继续顺序：

1. 复测 `3.4 继续旧会话不分裂`。
2. 抽查 `3.2/3.3 CodeX 重命名关闭重开 + JSONL 不污染`。
3. 验 `4.1 自动修复备份/报告/去重`。
4. 验 `4.2 ClaudeCode 和 CodeX 跨 Agent 不串`。
5. 验 `5.1/5.2 删除单次危险确认和永久删除`。

## 8. 当前上下文快照

截至 2026-06-19：

- CodeX `codex-session-chat-34-1781838152636` / thread `019eddd4-922c-70a2-b0d5-7446c28a1718` 曾用于 3.4 继续旧会话验证。
- 真实 filePath 形如：
  `C:/Users/hanso/.codex/sessions/2026/06/19/rollout-2026-06-19T11-02-36-019eddd4-922c-70a2-b0d5-7446c28a1718.jsonl`
- 人工复测确认：迟到 metrics 修复后，回复正常结束，不再恢复“正在响应”。
