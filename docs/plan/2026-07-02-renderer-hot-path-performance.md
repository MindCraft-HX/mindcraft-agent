# Renderer 高频链路性能专题

> 日期：2026-07-02
> 状态：已完成
> 范围：ClaudeCode / CodeX / CodeHub renderer 高频交互路径
> 背景：输入 draft 已迁移到 `session-registry`，不再每键保存 panel state；剩余卡顿应继续沿 renderer 热路径排查，而不是回到 provider/session lifecycle 大重构。

## 0. 执行结果

本专题已按 Phase 0-5 完成：

- Phase 0：开发态性能探针落地，用于统计 renderer 热路径调用次数和耗时。
- Phase 1/2：ProjectTabs summary helper 与 provider summary 合并为单一 computed，避免 tab UI 接收完整 project/chats/messages。
- Phase 3：CodeHub `collectTabs` 改为白名单字段，禁止继续传播上游完整对象。
- Phase 4：删除 `saveAsync` 内部双重 JSON clone。
- Phase 5：textarea autosize rAF 合并为 composable，避免输入事件中同步 layout 抖动。

后续同类改动必须保持 lightweight summary 契约；不要为了“更彻底”把 CodeHub SessionIndex、provider runtime 或 unload 同步保存混进本专题。

## 1. 结论

本专题的目标不是继续扩大架构改造，而是收窄 renderer 内部的高频依赖链。经过代码和既有文档复核，当前可以确定三类结论：

1. **应执行的优化项**：ProjectTabs / CodeHub tab summary 仍携带过宽对象；ClaudeCode / CodeX 各自重复计算 tab summary；`saveHistory` async 路径存在双重 JSON clone；textarea autosize 在输入事件中同步读写 layout。
2. **应保留的防御逻辑**：`codehubHasNotification` 的 provider 直推链路是为了解决 keep-alive 失活后 CodeHub watcher 暂停导致的通知丢失；CodeHub 依赖 mounted panel 的 `projectTabData` 是已登记的 SessionIndex 架构债；`saveSync` 是退出前同步保存边界。
3. **应先加探针排序的链路**：textarea autosize、tab summary computed、saveHistory build/clone/saveAsync 都是明确高频或重对象路径，但本轮执行应先记录调用次数和耗时，用数据决定优先级，避免继续按体感补丁。

执行方式：先加开发态探针，再按 phase 单独提交。任何 phase 不得混入 provider runtime、session restore、官方 JSONL、CodeHub SessionIndex、退出前保存语义。

## 2. 硬边界

- 不改 ClaudeCode / CodeX provider runtime、abort/done、session restore、history hydrate 语义。
- 不改变官方 JSONL 读取和写入边界。
- 不引入新的存储位置。
- 不做 CodeHub SessionIndex 正式重构。本专题只做 lightweight summary 瘦身；完整 SessionIndex 路线见 `docs/plan/2026-06-26-codehub-session-index-refactor.md`。
- 不删除 `codehubHasNotification` provider 直推链路。
- 不改 `saveSync()` / unload 同步保存语义。
- 不把 mention/slash 的 debounce/TTL 作为第一轮优化对象。

## 3. 已确认优化项

### 3.1 ProjectTabs 只消费轻量字段

两个 ProjectTabs 组件只消费：

- `id`
- `cwd`
- `cwdLocked`
- `hasDoneNotification`
- `runningCount`
- `hasPendingTool`

位置：

- `packages/agent/src/components/claudeCode/components/ProjectTabs.vue`
- `packages/agent/src/components/codeX/components/ProjectTabs.vue`

provider 面板里的 `projectTabs` 当前仍使用完整 project spread：

- `packages/agent/src/components/claudeCode/index.vue`：`return { ...p, runningCount, hasPendingTool }`
- `packages/agent/src/components/codeX/index.vue`：`{ ...p, runningCount, hasPendingTool }`

这会把完整 `p.chats` 和每个 chat 的 `messages` 一起作为 tab props 传播出去。ProjectTabs 不读取这些字段，因此这是确定的过度关联。

既有背景：`docs/perf-audit-report.md` 中 P1-2 曾做过保守优化，降低遍历方式和分配，但当时保留 `...p` 以减少回归面。现在应进入下一步：建立 lightweight summary 契约，禁止 tab UI 接收完整 project。

### 3.2 CodeHub collectTabs 继续传播上游对象

`packages/agent/src/components/codeHub/index.vue` 的 `collectTabs()` 当前使用：

```js
return data.map(p => ({
  ...p,
  projectId: p.id,
  id: `${agentType}:${p.id}`,
  agentType,
  iconClass: meta.iconClass,
  iconStyle: meta.iconStyle,
}))
```

即使 provider 层后续变轻，如果 CodeHub 层继续 spread，上游新增字段仍会继续进入 `unifiedTabs`。这里应改成白名单拷贝，形成第二道边界。

### 3.3 projectTabs 与 projectTabData 重复计算

ClaudeCode / CodeX 内部各有两套 tab summary：

- `projectTabs`：供本面板 ProjectTabs 使用。
- `defineExpose({ projectTabData: computed(...) })`：供 CodeHub 使用。

两者都计算 `runningCount` 和 `hasPendingTool`，且 `hasPendingTool` 会扫描 chats/messages。应在每个 provider panel 内合并为单一 `projectTabSummaries` computed，同时供本面板、CodeHub expose、notification watcher 使用。

### 3.4 saveHistory async 路径双重 clone

`useAgentHistory.persistNow()` 已经执行：

```js
const clean = JSON.parse(JSON.stringify(payload))
adapter.saveAsync(clean)
```

`historyProviderAdapter.mjs` 的 Claude / CodeX `saveAsync(payload)` 内又各自执行：

```js
const clean = JSON.parse(JSON.stringify(payload))
```

代码搜索确认：provider adapter 的 `saveAsync()` 只由 `useAgentHistory.persistNow()` 调用。因此删除 adapter 内部 async clone 不会改变当前外部调用边界。

保留项：`useAgentHistory` 和 `historyProviderAdapter` 里都有 500ms cooldown。上层 cooldown 是已登记的流式保存合并机制；adapter cooldown 可作为 adapter 自身的防御边界保留，不在本专题第一轮删除。

### 3.5 textarea autosize 是输入事件内同步 layout

CodeX `onInputChange()`：

```js
inputEl.value.style.height = 'auto'
inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 160) + 'px'
```

ClaudeCode 通过 `useSlashCommands.onInput()` 做同类操作。

这是每次 input 事件中同步写 style、读 `scrollHeight`、再写 style。它是确定的 renderer 热路径。优化方向不是删除 autosize，而是抽共享 rAF scheduler，把同一帧内的多次 resize 合并，并保留 paste、mention apply、send clear 后的显式 resize 能力。

## 4. 已确认必须保留的防御逻辑

### 4.1 codehubHasNotification provider 直推

当前通知写入有三层：

- provider panel 根据 project summary watcher 写入。
- stream `onBackgroundTaskDone()` 任务完成时直接置 `true`。
- CodeHub 根据 `unifiedTabs` watcher 写入。

这不是无依据重复。`docs/bugs/ask-dialog-deactivate-failure.md` 已记录根因：CodeHub 被 keep-alive 失活后，`computed` 和 `watch` 会暂停，通知链路 `onAgentDone -> hasDoneNotification -> codeHub.unifiedTabs -> codeHub watcher -> sidebar` 在 CodeHub watcher 处断裂。

因此：

- `onBackgroundTaskDone()` 直推 `codehubHasNotification.value = true` 必须保留。
- CodeHub watcher 继续负责 CodeHub 激活后的同步和清除。
- provider panel watcher 也先保留；它与 provider 自身 project summary 同生命周期，能覆盖 provider mounted 但 CodeHub inactive 的场景。
- 本专题只允许让 provider watcher 消费新的 lightweight `projectTabSummaries`，不得删除该通知链路。

### 4.2 CodeHub mounted panel 依赖另案处理

`codeHub/index.vue` 注释已经写明：统一 Tab 目前依赖各 Agent panel 暴露的 `projectTabData`；未挂载的 panel 不会执行 `loadHistory`；在 CodeHub 级 session index 独立出来前，启动时必须挂载所有已注册 Agent。

这属于正式 SessionIndex 方案范围。`docs/plan/2026-06-26-codehub-session-index-refactor.md` 已定义后续目标：

- 移除 CodeHub 对 `panel.projectTabData` 的初始 Tab 存在性依赖。
- 保留 provider `projectTabData`，但只作为 runtime patch 输入。
- 处理冷启动、删除、tab order、通知红点等风险。

本专题只做 `projectTabData` 的字段瘦身和重复计算收敛，不改变 CodeHub mount/hydrate 架构。

### 4.3 unload 保存语义不进入本专题

`docs/perf-audit-report.md` 已把 `sendSync -> 异步 invoke` 归为高风险区，原因是 `beforeunload` 中异步写入如果没有退出前等待语义，就存在数据丢失窗口。

因此 Phase 4 只删除 async `saveAsync()` 内部重复 clone，不改 `saveSync()`，不改 unload 保存路径，不改主进程同步 IPC。

### 4.4 mention / slash 暂不作为优化对象

`@` mention 和 `/` slash 已有 debounce / TTL。当前专题没有证据显示它们是本轮剩余卡顿主因。它们只纳入验收回归，不进入第一轮实现。

## 5. 执行顺序

### Phase 0：开发态性能探针

先加可关闭探针，用数据排序后续 phase：

- `projectTabs` / `projectTabData` / 合并后的 `projectTabSummaries`：执行次数、项目数、chat 数、扫描消息数、耗时。
- `CodeHub collectTabs`：执行次数、tab 数、耗时、是否收到非白名单字段。
- `onInputChange` / `useSlashCommands.onInput`：事件次数和总耗时。
- textarea autosize：resize 次数、同一帧合并前后次数、耗时。
- `saveHistory`：build payload、top-level clone、adapter `saveAsync` 调用、adapter cooldown skip 次数。

要求：

- 只在 `import.meta.env.DEV` 或显式 debug flag 下启用。
- 不输出消息内容、路径隐私、API key。
- 输出按聚合计数和耗时摘要，不刷屏。
- 探针提交可以单独 revert。

### Phase 1：建立 shared project tab summary helper

新增共享 helper：

```text
packages/agent/src/components/agentCommon/utils/projectTabSummary.mjs
```

职责：

- `getRunningCount(chats)`
- `hasPendingToolInChats(chats, isPendingTool)`
- `buildProjectTabSummary(project, helpers)`

输出只包含 lightweight 字段：

```js
{
  id,
  name,
  cwd,
  cwdLocked,
  runningCount,
  hasPendingTool,
  hasDoneNotification,
  createdAt,
}
```

禁止 `...project`。尤其禁止把 `chats/messages` 传给 ProjectTabs / CodeHub unifiedTabs。

ClaudeCode 和 CodeX 各自保留 provider 差异的 `isPendingTool` 判断；summary 构造只放一份。

### Phase 2：合并 provider 内部 tab summary

在每个 provider panel 内只保留一个 computed：

```js
const projectTabSummaries = computed(...)
```

用途：

- 传给本面板 `ProjectTabs`。
- 暴露给 CodeHub `projectTabData`。
- provider 内部 notification watcher 消费它。

这样同一轮响应式更新只扫描一次 project/chats/messages。保留 notification watcher，只替换它的数据源。

### Phase 3：CodeHub collectTabs 白名单化

`collectTabs(panel, agentType, meta)` 只拷贝白名单字段，不再 `...p`：

```js
{
  id: `${agentType}:${p.id}`,
  projectId: p.id,
  agentType,
  name,
  cwd,
  cwdLocked,
  runningCount,
  hasPendingTool,
  hasDoneNotification,
  createdAt,
  iconClass,
  iconStyle,
}
```

顺手清理当前 `projectId` 赋值位置，保持字段来源清楚。

### Phase 4：删除 saveHistory async 双重 clone

保留 `useAgentHistory.persistNow()` 的 clone。删除 `historyProviderAdapter.mjs` 两个 `saveAsync()` 内部重复 clone。

不改项：

- 不改 `saveSync()`。
- 不改 unload 路径。
- 不删 adapter 层 cooldown。

必须跑：

- `node --test tests/useClaudeHistory.characterization.test.mjs tests/useCodexHistory.characterization.test.mjs`
- `node --test tests/historyHelpers.characterization.test.mjs`
- `node --test tests/task-done-history-persistence.test.mjs`

### Phase 5：textarea autosize rAF 合并

抽共享 composable：

```text
packages/agent/src/components/agentCommon/composables/useTextareaAutosize.js
```

目标：

- 同一帧内多次输入只 resize 一次。
- 避免在每个 handler 中散落 `style.height = 'auto'` + `scrollHeight`。
- `applyMention` / paste / send clear 后仍能显式 schedule resize。

初版只替换最热 input handler：

- CodeX `onInputChange`
- ClaudeCode `useSlashCommands.onInput`

其他 `nextTick` 高度重置场景先不强行合并，避免引入光标/IME 回归。

## 6. 验收

自动测试：

- `node tests/claude-runtime-state.test.mjs`
- `node tests/codex-runtime-state.test.mjs`
- `node --test packages/agent/electron/sessionRegistry.test.js`
- `node --test tests/useClaudeHistory.characterization.test.mjs tests/useCodexHistory.characterization.test.mjs`
- `node --test tests/historyHelpers.characterization.test.mjs tests/task-done-history-persistence.test.mjs`
- `npm run build`

人工验收：

1. ClaudeCode / CodeX 快速输入 100 字，输入框无明显卡顿，textarea 高度变化正常。
2. 输入 `@abc`，mention debounce、目录 drill-down、选择插入正常。
3. 输入 `/`，slash popup 正常，Claude 模型/effort 状态仍显示。
4. 中文 IME 组合输入、粘贴多行、发送后清空输入框都正常。
5. 运行中 project tab running/pending/done 指示正常。
6. CodeHub 顶部统一 tab 的 running/pending/done 指示与 provider panel 一致。
7. 切到首页/文档后让后台任务完成，侧边栏项目图标仍有通知；回到项目后通知可清除。
8. 发送、rename、切换项目后刷新，panel state 仍能恢复项目和 active tab。

## 7. 回滚点

每个 phase 单独提交：

1. 探针提交可直接 revert。
2. summary helper / provider 合并导致 ProjectTabs 或 CodeHub 指示异常，只 revert Phase 1-2。
3. CodeHub 白名单导致统一 tab 字段缺失，只 revert Phase 3。
4. saveHistory clone 去重导致保存异常，只 revert Phase 4。
5. textarea autosize 导致 IME、光标、粘贴、高度异常，只 revert Phase 5。

不要把所有 phase 合在一个提交里。

## 8. 给执行者的注意事项

- 先读完整相关函数再改 `index.vue`，不要只按 grep 局部替换。
- 不要改 provider lifecycle。
- 不要把 CodeHub SessionIndex 正式方案混入本专题。
- 不要删除 `codehubHasNotification` provider watcher 或 `onBackgroundTaskDone()` 直推。
- 不要修改官方 JSONL，也不要新增官方目录 sidecar。
- 如果某个 phase 连续两次引入回归，停止补丁，回到探针数据重新排序。
