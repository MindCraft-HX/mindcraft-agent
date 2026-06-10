# Claude 会话重复分支专题

> 日期：2026-06-10
> 范围：`packages/agent/src/components/claudeCode/**`
> 状态：专项跟踪中

## 现象

ClaudeCode 侧边栏偶发出现两个看似相同或连续的对话：

- 用户实际只在同一个对话里继续提问。
- 侧边栏却新增一条“分支出来”的历史对话。
- 新分支里的 Claude 会提示“没有上一次对话上下文”。
- 这不是单纯的新建按钮双击，也不是 Tab 高亮渲染问题。

## 根因判断

Claude UI 有两类身份：

- UI 本地会话：`chat.id` / `chat.sessionId`，例如 `chat-1`、`session-chat-1-...`
- Claude CLI 会话：`cliSessionId` / `filePath`，对应 `~/.claude/projects/**/<uuid>.jsonl`

新建对话后，UI 会先创建一个本地 chat，并标记 `_pendingSessionBinding = true`。Claude SDK 首轮运行后才会生成 jsonl。此时必须把扫描到的 jsonl “领养”回这个 pending chat，而不是插入一条新的 chat。

此前修复有缓解但不彻底，原因是刷新防重只保护了：

```js
thinking && !cliSessionId && !filePath
```

这会漏掉两个真实场景：

1. 首轮回复已经结束，`thinking` 被置为 `false`，但 `cliSessionId/filePath` 还没可靠写回。
2. 历史恢复后 `_pendingSessionBinding` 元数据可能缺失，但本地临时 `session-chat-*` 会话里已经有用户消息，仍应等待绑定。

漏掉后，扫描器会把同一个 jsonl 当成“新增历史会话”插入，形成用户看到的重复分支。

2026-06-10 继续排查时，运行时状态还暴露了第二层污染：

- `claude-panel-state.json` 顶层缺少 `activeProjectId` / `activeChatId`。
- `mindcraft-api` 项目中同一个 `3653faec-77f9-4a7c-9a5d-ea5c42be417e.jsonl` 同时绑定到 `chat-77` 和 `chat-87`。
- codeHub 顶部统一 tab 可显示为旧项目，但 Claude 面板内部 active project 已经切到另一个项目，用户看起来像“在原窗口发消息，刷新后变成新窗口/新会话”。

这说明问题不只在首轮 pending 绑定，还包括历史状态被污染后缺少落盘/加载/刷新边界的自我修复。

## 修复原则

1. 扫描刷新不能直接把未匹配 jsonl 插入新 chat，必须先尝试领养 pending chat。
2. pending 判断不依赖 `thinking`，而依赖“还没有 `cliSessionId/filePath` 且仍是本地临时会话”。
3. 已绑定的历史会话不得重新进入 pending 池。
4. 防重逻辑应集中在 `pendingSessionBinding.mjs`，避免后续在组件里散写条件。
5. 面板持久化必须保证 active 指向真实存在的 project/chat；不能把“有项目但 active 为空”的中间态写回磁盘。
6. 同一个项目内同一 `cliSessionId` / `filePath` 只能保留一个 UI chat；加载、保存、刷新三处边界都要清理重复绑定。
7. codeHub 顶部 unified tab 要跟随嵌入 Claude 面板的 active project 收敛，避免可见 tab 与实际发送目标不一致。

## 当前代码落点

- `packages/agent/src/components/claudeCode/utils/pendingSessionBinding.mjs`
  - `isPendingClaudeSessionBinding`
  - `hasUnboundClaudeSessionPendingAdoption`
  - `findPendingClaudeSessionForAdoption`
  - `adoptScannedClaudeSession`
- `packages/agent/src/components/claudeCode/index.vue`
  - `refreshProjectSessionsInBackground`
- `packages/agent/src/components/claudeCode/utils/historyPersistenceSanitizer.mjs`
  - `sanitizeClaudeProjectsForPersistence`
  - `buildClaudePanelStatePayload`
- `packages/agent/src/components/codeHub/activeTabSync.mjs`
  - `resolveCodeHubSyncedTabId`
- `tests/claude-pending-session-binding.test.mjs`
- `tests/claude-history-persistence-sanitizer.test.mjs`
- `tests/codehub-active-tab-sync.test.mjs`

## 回归用例

必须覆盖：

- active pending chat 优先被领养。
- pending chat 在 `thinking = false` 后仍被保护。
- 恢复后的本地临时 `session-chat-*` 会话即使丢了 `_pendingSessionBinding`，只要有用户消息且未绑定，也仍可被领养。

运行：

```bash
node --test tests/claude-pending-session-binding.test.mjs
node --test tests/claude-history-persistence-sanitizer.test.mjs tests/codehub-active-tab-sync.test.mjs
```

## 后续排查点

如果仍复现，优先加日志确认：

1. `claude-agent-done` 是否带回 `cliSessionId` 和 `filePath`。
2. `refreshProjectSessionsInBackground` 扫描时 pending 池有哪些 chat。
3. 被插入的新 chat 是否原本应该由 `findPendingClaudeSessionForAdoption` 领养。
4. `claude-panel-state.json` 中是否存在未绑定但已有用户消息的 `session-chat-*` 会话。
