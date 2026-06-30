# Claude Task Panel 更新/完成丢失排查

> 创建：2026-06-30
> 状态：待专项 Agent 复现与修复
> 范围：ClaudeCode 任务面板（`ClaudeTaskBar` / `useClaudeTaskState` / `useClaudeAgentStream`）

## 1. 现象

用户反馈 ClaudeCode 的任务面板在“注册任务”后，后续更新和完成状态没有稳定出现：

- 能看到任务被创建或面板出现。
- 后续执行进度、完成、失败等状态不更新。
- 可能是概率触发，目前还不确认是否每次都坏。
- 观感像回到了早期问题：任务创建后无法收口。

这不是当前架构重构主线问题，应作为独立 bug 处理。

## 2. 当前已知结论

### 已确认不是主要问题

`ClaudeTaskBar` 原模板有一个独立展示问题：有 `planItems` 时，`executionItems` 因为 `v-else-if` 被隐藏。已在提交 `af84417` 修复：

```text
af84417 fix: show claude task execution alongside plan
```

修复后计划任务和临时执行任务可以同时显示。这个问题会让面板“看起来少东西”，但不能解释“后续 update/completed 事件完全没有进入”的情况。

### 仍待排查的问题

核心链路可能在以下两类中断：

1. 主进程 / SDK 没有把后续 task update/completed 事件转发到 renderer。
2. renderer 收到了 update/completed，但 `useClaudeTaskState.mjs` 没能绑定到已有 task。

## 3. 涉及文件

### Renderer 展示

```text
packages/agent/src/components/claudeCode/components/taskBar/ClaudeTaskBar.vue
```

职责：

- 显示当前计划任务：`planItems`
- 显示临时执行任务：`executionItems`
- 展示状态：`idle` / `running` / `done`

### Renderer 状态机

```text
packages/agent/src/components/claudeCode/composables/useClaudeTaskState.mjs
```

关键函数：

- `beginTaskBatch()`
- `registerTaskStarted()`
- `registerTaskUpdated()`
- `applyPlanToolUse()`
- `applyPlanToolResult()`
- `getTaskDebugSnapshot()`

历史坑：

- Claude task id 可能是会话内全局递增，不一定从 1 开始。
- `TaskCreate` 的 `tool_use_id` 与后续 `TaskUpdate` 的 task id 不一定一致。
- 后续 update 可能只带 status，不带 description。
- 需要保持已知 description，不应被空 update 覆盖。

### Renderer stream 接入

```text
packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js
```

关键路径：

- assistant `tool_use` 中的 `TaskCreate` / `TaskUpdate`
- user `tool_result`
- direct `tool_result`
- system `task_started`
- system `task_updated`

当前文件里仍有临时诊断日志：

```text
[task-diag] event
[task-diag] tool_use applied
[task-diag] task_started applied
[task-diag] task_updated applied
```

这些日志对复现很有用，专项修复前建议先保留。

### 主进程转发

需要专项 Agent 自行追踪：

```text
packages/agent/electron/claudeAgent.js
packages/agent/electron/claude/*
packages/agent/shared/ipcChannels.js
electron/preload.js
```

重点查：

- Claude SDK 是否真的产生 task update/completed 类事件。
- 主进程是否过滤了某些 `system` subtype。
- `task_started` / `task_updated` 的字段名是否一致：`task_id`、`tool_use_id`、`patch`、`description`。
- IPC channel registry / preload 暴露是否遗漏。

## 4. 当前测试状态

已跑过以下局部测试：

```bash
node --test tests/claude-taskbar-template.test.cjs tests/claude-task-state.test.mjs tests/claude-task-events.test.mjs tests/claude-history-restore-import.test.cjs
```

结果：

```text
18/18 pass
```

更大的 task stream 测试：

```bash
node --test tests/claude-task-state.test.mjs tests/claude-task-events.test.mjs tests/claude-task-stream-sync.test.mjs tests/claude-history-restore-import.test.cjs tests/claude-taskbar-template.test.cjs
```

结果：

- task 状态相关测试通过。
- `tests/claude-task-stream-sync.test.mjs` 有 1 个失败，但失败点是 turn token 断言多了 `costUsd: 0`，不是 Task Panel 更新链路。

## 5. 复现时需要收集的信息

复现时优先收集 DevTools console 中的 `[task-diag]` 日志。

### 情况 A：只有 started，没有 updated

如果只有：

```text
[task-diag] task_started applied
```

但没有：

```text
[task-diag] task_updated applied
```

优先查主进程 / SDK / IPC 转发链路。

重点问题：

- SDK 是否产生 update/completed 事件？
- 主进程是否收到但没有 emit？
- renderer 是否收到但 subtype 被提前 return？

### 情况 B：有 updated，但 snapshot 不变

如果有：

```text
[task-diag] task_updated applied
```

但 `snapshot` 里的 `runtimeSteps` 或 `todos` 没变化，优先查 `useClaudeTaskState.mjs`。

重点问题：

- `task_id` 是否为空或字段名不匹配。
- `patch.status` 是否是新枚举值，`normalizeStatus()` 不认识。
- update 是否只带 `tool_use_id`，没有 `task_id`。
- `TaskCreate` pending id 是否没能绑定到真实 task id。

### 情况 C：tool result 完成，但 TaskBar 不完成

如果消息里的工具调用已经显示完成，但 TaskBar 仍停留在 running：

- 查 `syncPlanTaskStateFromToolResult()` 是否找到对应 tool message。
- 查 `findToolMessage(tab, toolUseId)` 是否因为 `toolUseId` 不一致返回 null。
- 查 `applyPlanToolResult()` 是否解析不到 `toolUseResult.statusChange.to`。

## 6. 建议的专项排查顺序

1. 用真实 ClaudeCode 任务复现一次，保存 `[task-diag]` 日志。
2. 按日志判断是“事件没进 renderer”还是“renderer 绑定失败”。
3. 若事件没进 renderer，先在主进程 task event 接入点补临时日志，不要先改状态机。
4. 若事件进了 renderer，给 `useClaudeTaskState.mjs` 补 characterization test，再修绑定逻辑。
5. 修复后至少跑：

```bash
node --test tests/claude-task-state.test.mjs tests/claude-task-events.test.mjs tests/claude-taskbar-template.test.cjs
```

如涉及 stream 事件同步，再跑：

```bash
node --test tests/claude-task-stream-sync.test.mjs
```

注意该文件目前可能因 turn token `costUsd: 0` 断言失败。不要把 token 断言失败误判为 Task Panel 修复失败。

## 7. 不建议顺手做的事

- 不要借这个问题继续拆 `claudeAgent.js`。
- 不要重命名 IPC channel。
- 不要把 Claude Task 和 CodeX todo/task 做大一统抽象。
- 不要删除 `[task-diag]` 日志，除非已经有更好的专项诊断入口。
- 不要把 `runtimeSteps` 和 `todos` 再合成一个列表；当前分离是为了区分计划任务和临时执行任务。

## 8. 交接结论

当前最可能的问题不是架构重构本身，而是 Claude task event 链路仍存在概率性断点。下一位 Agent 应先基于真实复现日志判断断点位置，再小步补测试和修复。

如果复现日志显示 `task_updated` 根本没有进入 renderer，则优先查主进程事件转发。

如果 `task_updated` 已进入 renderer，则优先查 `useClaudeTaskState.mjs` 的 id / status / toolUseId 绑定逻辑。
