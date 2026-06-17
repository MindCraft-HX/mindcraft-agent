# Claude 孤儿 tool_use 会话恢复计划

> 日期：2026-06-15
> 范围：ClaudeCode 会话中断、JSONL 恢复、done 语义
> 关联：`docs/session-pitfalls.md` Trap 3/4/5，`docs/bugs/claude-session-duplicate-split.md` 根因 E

## 目标

修复 Claude 会话在工具调用进行中断流后无法继续的问题：坏会话不应要求用户新建 session；应用应能在原会话内识别半成品工具轮次，把 UI 恢复为可继续输入的稳定状态，并避免后续把异常 turn 当作正常完成。

## 已确认事实

- 坏会话文件：`C:\Users\hanso\.claude\projects\D---------MindCraft-RD-----mindcraft-drf\bbc2738e-ccc9-4cc7-be36-98ae0f98d55d.jsonl`
- JSONL 可正常逐行解析，文件未损坏。
- 最后一条有效内容是 assistant 发起 `tool_use`，工具为 Bash，命令为：
  `pytest test/integration/ --run-integration -v --tb=short`
- 文件末尾没有对应 `tool_result`，也没有最终 `result`。
- `claude-panel-state.json` 中该会话仍绑定到 `chat-23`：
  - cwd: `D:\公司资料\智匠MindCraft\RD开发资料\mindcraft-drf`
  - cliSessionId: `bbc2738e-ccc9-4cc7-be36-98ae0f98d55d`
  - filePath: 上述 JSONL
- 当前实现容易把“流断在工具执行中”当作 `completed`，导致 UI 里留下 pending/running 工具卡片，并阻止后续磁盘重载或恢复。

## 根因判断

这不是单纯模型渠道问题，也不是 JSONL 文件坏了；是一次 Claude SDK/CLI turn 在工具调用阶段被中断后，MindCraft 的恢复语义不完整。

关键缺口：

1. 历史加载只把 JSONL 规范化成 UI 消息，没有在加载结束时识别“存在未闭合 tool_use”。
2. `shouldReloadClaudeChatFromDisk()` 只按内存 pending 工具保护运行时会话，不能区分“正在运行的 pending”和“重启/重载后的僵尸 pending”。
3. `claudeAgent.js` 的 `finally` 在 `resultReceived=false` 且 `exitCode=0` 时仍可能发 `reason: 'completed'`。
4. `onAgentDone()` 收到 `completed` 就清理 thinking 并触发完成通知，缺少 `interrupted` / `incomplete` 这类明确语义。

## 非目标

- 不修复 Claude CLI 或 SDK 本身。
- 不把新建 session 作为默认解决方案。
- 不改 CodeX 的 run ownership 逻辑，本次只借鉴其 terminal 状态语义。
- 不对 `docs/` 做 git add/commit。
- 不重构整个 Claude history 读取为 SDK `getSessionMessages()`；这是 T093 的长期方向。

## 设计方案

采用“三层防线”：

1. **磁盘会话诊断层**：新增可测试的 JSONL 会话完整性分析函数，判断是否存在 dangling `tool_use`、是否缺少最终 `result`、最后有效事件类型是什么。
2. **历史恢复层**：`normalizeSessionEventsToUiMessages()` / `normalizeFlatSessionMessagesToUiMessages()` 在尾部发现 dangling tool 时，把最后的工具卡片标为 `interrupted` 或 `failed`，并插入一条系统提示；不能继续显示为 pending/running。
3. **运行时 done 层**：主进程在流结束但未收到 `result` 时，不再默认 `completed`；根据 session 文件分析和 runtime 状态发 `interrupted` / `failed` / `aborted`，前端只对真正 `completed` 发完成通知。

## 文件结构

### 新增

- `packages/agent/src/components/claudeCode/utils/sessionIntegrity.mjs`
  - 纯函数模块。
  - 输入 JSONL 已解析 entries 或 UI messages。
  - 输出 `{ hasDanglingToolUse, danglingToolUseIds, lastToolUse, hasResult, lastEventType, recommendedDoneReason }`。
  - renderer 可复用，测试可直接 import。

- `tests/claude-session-integrity.test.mjs`
  - 覆盖坏会话形态：assistant `tool_use` 后无 `tool_result` / `result`。
  - 覆盖正常形态：`tool_use` 后有 `tool_result` 且有 `result`。
  - 覆盖无工具普通完成。

### 修改

- `packages/agent/src/components/claudeCode/index.vue`
  - 引入 `sessionIntegrity.mjs`。
  - 在两个 normalize 函数结束前标记 dangling tool。
  - `ensureChatMessagesLoaded()` 加载后写入 `chat._sessionIntegrity`，必要时清掉失效 pending 状态。
  - `loadMoreHistory()` 只负责历史分页，不重复插入恢复提示，避免多页重复。

- `packages/agent/src/components/claudeCode/utils/sessionRefreshGuard.mjs`
  - 区分运行中 pending 和恢复后 stale pending。
  - 如果 chat 已有 `filePath`、`thinking=false` 且 `_sessionIntegrity.hasDanglingToolUse=true`，允许从磁盘重载。

- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js`
  - `onAgentDone()` 支持 `reason: 'interrupted' | 'incomplete'`。
  - 对非 completed 的 done 不播放完成提示音、不做后台任务完成提醒。
  - 将仍为 running/pending 的普通工具卡片收口为 `interrupted`，避免 UI 卡住。

- `packages/agent/electron/claudeAgent.js`
  - 新增可测试辅助函数，例如 `finalizeClaudeDoneReason({ resultReceived, exitCode, explicitErrorReason, sessionFileIntegrity })`。
  - `finally` 中 `!resultReceived` 时不再用 `exitCode === 0 ? 'completed' : 'failed'`，而是优先判断 `aborted/failed/interrupted`。
  - 尽量利用已知 `cliSessionId` / `cwd` 读取 JSONL 尾部做轻量完整性分析；读失败时保守返回 `interrupted` 而不是 `completed`。

- `tests/claude-agent-done-payload.test.cjs`
  - 增加 `resultReceived=false + exitCode=0 + danglingToolUse=true => interrupted`。
  - 增加 `resultReceived=true => completed`。
  - 保留现有 aborted/failed 解析测试。

## 实施步骤

### Task 1：固定坏会话形态的测试

1. 新建 `tests/claude-session-integrity.test.mjs`。
2. 构造最小 JSONL entries：
   - user 消息
   - assistant 消息，content 里含 `{ type: 'tool_use', id: 'toolu_1', name: 'Bash' }`
   - 无 user `tool_result`
   - 无 `result`
3. 断言分析结果：
   - `hasDanglingToolUse === true`
   - `danglingToolUseIds === ['toolu_1']`
   - `recommendedDoneReason === 'interrupted'`
4. 运行：
   `node --test tests/claude-session-integrity.test.mjs`
5. 预期先失败：模块不存在。

### Task 2：实现 sessionIntegrity 纯函数

1. 新增 `sessionIntegrity.mjs`。
2. 处理两类输入：
   - Claude JSONL raw entry：`entry.type === 'assistant'` + `entry.message.content[]`
   - flat message：`role === 'assistant'` + `content[]`
3. 维护 `openToolUseIds` Set：
   - assistant `tool_use` 加入。
   - user/tool `tool_result` 删除。
   - `entry.type === 'result'` 标记 `hasResult=true`。
4. 返回分析结构。
5. 运行 Task 1 测试，预期通过。

### Task 3：历史 normalize 收口 dangling tool

1. 在 `index.vue` 引入 `analyzeClaudeSessionIntegrity` 和 `markDanglingClaudeToolsInterrupted`。
2. 在两个 normalize 函数构建 `out` 后调用标记函数。
3. 对匹配的 tool UI message：
   - `status = 'interrupted'`
   - `isError = true`
   - `text` 补短提示：`工具调用在上次会话中断时未返回结果。`
4. 在尾部插入一条 system message：
   `上次回复在工具执行阶段中断，已将未完成工具标记为中断。可以在当前会话继续发送。`
5. 加测试或静态导出困难时，先把标记函数放在 `sessionIntegrity.mjs` 中用纯数据测试。
6. 运行：
   `node --test tests/claude-session-integrity.test.mjs`

### Task 4：ensureChatMessagesLoaded 写入恢复状态

1. `ensureChatMessagesLoaded()` 读取 rawData 后调用完整性分析。
2. 设置：
   - `chat._sessionIntegrity = integrity`
   - `chat._hasDanglingToolRecovery = integrity.hasDanglingToolUse`
3. 如果存在 dangling tool：
   - `chat.thinking = false`
   - `chat._pendingSessionBinding = false`
   - `chat._messagesLoaded = true`
4. 确认 `switchChat()` 已使用 `_messagesLoaded`，不再被 `messages.length` 阻挡。

### Task 5：刷新保护区分 stale pending

1. 修改 `sessionRefreshGuard.mjs`。
2. 新增 `isStaleRecoveredPendingTool(chat, message)` 或等价逻辑：
   - `chat.filePath` 存在
   - `chat.thinking !== true`
   - `chat._sessionIntegrity?.hasDanglingToolUse === true`
3. `shouldReloadClaudeChatFromDisk(chat)` 遇到这类 stale pending 返回 `true`，运行时 pending 仍返回 `false`。
4. 新增/扩展测试文件（如 `tests/claude-session-refresh-guard.test.mjs`，若已有则追加）：
   - 运行中 pending permission 不重载。
   - 恢复后 dangling tool 允许重载。

### Task 6：主进程 done reason 收紧

1. 在 `claudeAgent.js` 读取完整函数范围后修改，避免 TDZ 回归。
2. 新增 `finalizeClaudeDoneReason()` 并导出到 `__test__`。
3. 规则：
   - explicit abort/error 优先。
   - `resultReceived === true` => `completed`。
   - `resultReceived === false && integrity.hasDanglingToolUse` => `interrupted`。
   - `resultReceived === false && exitCode !== 0` => `failed`。
   - `resultReceived === false && exitCode === 0` => `interrupted`。
4. `finally` 中构造 donePayload 时使用该函数。
5. 运行：
   `node tests/claude-agent-done-payload.test.cjs`

### Task 7：前端 done 处理非 completed

1. 修改 `onAgentDone()`：
   - `reason === 'completed'` 才触发 `onTaskDone()` 和后台完成提醒。
   - `reason === 'interrupted' || reason === 'incomplete' || reason === 'failed'` 时，收口未完成 tool 状态。
2. 对 pending permission / AskUserQuestion 这类需要用户响应的卡片，若已经 done 非 completed，标为 interrupted，不保留可点击审批状态。
3. 保存 history，保证重启后不会再显示为运行中。

### Task 8：坏会话手动验证

1. 启动 dev：
   `npm run dev`
2. 打开项目 `mindcraft-drf`。
3. 打开自定义命名为“claudecode工具栏消失”的 Claude 会话。
4. 期望：
   - 会话仍是原 `chat-23` / 原 cliSessionId。
   - 最后 Bash 工具不再 pending/running。
   - 页面不阻塞输入。
   - 用户可以继续发消息。
5. 新发一条轻量消息验证 resume：
   `继续上一轮，请先确认当前会话状态，不要重复跑集成测试。`

### Task 9：回归验证

运行以下命令：

```powershell
node --test tests/claude-session-integrity.test.mjs
node tests/claude-agent-done-payload.test.cjs
node --test tests/claude-history-persistence-sanitizer.test.mjs
node --test tests/claude-pending-session-binding.test.mjs
npm run build
```

如果 `claude-pending-session-binding.test.mjs` 在当前仓库不存在，先用 `rg --files tests | rg claude-pending` 确认文件名，再运行对应测试。

## 验收标准

- 坏会话无需新建 session 即可打开和继续输入。
- JSONL 末尾 dangling `tool_use` 会显示为中断/失败态，不再显示 pending/running。
- 没有 `result` 的 turn 不再触发 completed 提示音和后台完成通知。
- 正常完成的会话行为不变。
- 运行中等待权限的工具不会被磁盘刷新误覆盖。
- Provider 切换、pending 领养、历史去重相关测试仍通过。

## 风险与缓解

- **风险：把正常等待用户审批的工具误判为中断。**
  缓解：只有在 `thinking=false`、`filePath` 已绑定、且来自磁盘恢复的场景标记 stale；运行时 pending 仍受保护。

- **风险：分页加载时重复插入中断提示。**
  缓解：只在 page 0 / `ensureChatMessagesLoaded()` 入口做恢复提示，`loadMoreHistory()` 不插提示。

- **风险：Claude JSONL 格式变化。**
  缓解：分析函数只依赖稳定字段 `assistant.content[].tool_use`、`tool_result`、`result`；未知 entry 忽略。

- **风险：主进程读取 JSONL 尾部失败。**
  缓解：读失败时不宣称 completed，保守发 `interrupted`。

## 后续增强

- 增加一个“修复当前会话”按钮，手动重新从磁盘加载并清理 dangling 工具。
- 在会话列表里给 interrupted 会话加轻量状态标记。
- T093 迁移到 SDK 原生会话管理后，把完整性分析移到 SDK message 层。
