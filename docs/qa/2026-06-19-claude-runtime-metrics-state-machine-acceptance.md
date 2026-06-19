# ClaudeCode Runtime / Metrics State Machine 人工验收

> 日期：2026-06-19
> 关联：T141、`docs/plan/2026-06-19-claude-runtime-metrics-state-machine.md`
> 范围：ClaudeCode renderer 运行态与 metrics 权威收敛

## 1. 验收背景

本轮重构只处理 ClaudeCode 前端运行态和 metrics 时机债务：

- `thinking/_thinkingStart/currentAssistantId` 的生命周期写入口收敛到 `claudeRuntimeState.mjs`。
- metrics 只作为展示数据，不再拥有运行态权威，不能把已结束会话重新拉成 running。
- done/abort/idle 之后的迟到 stream 或 metrics 事件会被 runtime state 拦住。
- history 保存会剥离 `_claudeRuntimeState`、`thinking`、`_thinkingStart`、`currentAssistantId`，避免重启后假运行。

非本轮范围：

- 不改 ClaudeCode pending adoption / session registry / 主进程 session ownership。
- 不改 ClaudeCode 运行中再次发送的既有语义：仍走 Claude SDK `streamInput` / interrupt 路径，不做 CodeX queue UI。
- 不处理 CodeX queued input 可视化；该事项已记录为 T140。

## 2. 自动化验证基线

开发完成后应至少通过：

```powershell
node tests/claude-runtime-state.test.mjs
node tests/claude-task-stream-sync.test.mjs
node tests/claude-history-persistence-sanitizer.test.mjs
node tests/task-done-history-persistence.test.mjs
node --check packages/agent/src/components/claudeCode/utils/claudeRuntimeState.mjs
node --check packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js
node --check packages/agent/src/components/claudeCode/composables/useClaudeHistory.js
git diff --check
npm run build
```

## 3. 人工验收用例

### A. 正常完成后不复活 running

1. 打开 ClaudeCode 项目，选择一个已有可写项目目录。
2. 新建会话，发送一个短任务，例如“输出 3 行当前项目结构摘要”。
3. 等 ClaudeCode 完整结束。
4. 观察发送按钮、停止按钮、状态栏计时。
5. 等 5-10 秒，切换到其他会话再切回来。

期望：

- 回复结束后停止按钮消失，发送按钮可用。
- 状态栏 live duration 不继续跳。
- 切换回来不会重新显示 running。
- 不新增“已中断”或重复系统提示。

### B. metrics 迟到不重启计时器

1. 完成 A 用例后保持当前会话不动。
2. 快速切换项目内其他 ClaudeCode 会话，再切回刚完成的会话。
3. 观察状态栏 metrics 刷新。

期望：

- token、cost、context、model 可以刷新。
- `thinking` 不被 metrics 重新置为 true。
- live timer 不重新开始。

### C. 运行中 stream 状态仍正常

1. 发送一个需要持续输出的任务，例如“分 10 段解释当前项目的 agent 架构，每段 2 行”。
2. 输出过程中观察 UI。

期望：

- 输出开始后显示运行中状态。
- 停止按钮可见。
- assistant 文本持续追加到同一轮或合理消息结构中。
- 状态栏计时正常增长。

### D. 运行中再次发送保持 ClaudeCode 原语义

1. 在 C 用例仍在输出时，输入第二条消息，例如“改成更短，直接给结论”。
2. 按 Enter 或点击发送。

期望：

- 不报错。
- 用户 bubble 立即出现，符合 ClaudeCode 现有 interrupt/streamInput 体验。
- 当前生成被中断或转入处理新输入，最终 UI 能回到可发送状态。
- 本轮不要求 CodeX 式 pending queue UI。

### E. Abort 解锁且不假 running

1. 发送一个较长任务。
2. 输出过程中点击停止按钮。
3. 观察 UI 并等待 5 秒。
4. 再发送一条普通短消息。

期望：

- 点击停止后停止按钮消失，输入可继续。
- 出现一条用户中断系统提示。
- 迟到 stream 不会把会话重新拉成 running。
- 后续新消息可以正常发送并收到回复。

### F. `/clear` 后迟到事件不污染新会话

1. 在一个刚结束或刚中断的会话中输入 `/clear`。
2. 确认消息列表清空。
3. 立即发送一条新消息。

期望：

- `/clear` 后不会出现旧会话迟到内容。
- 新消息按新会话正常开始。
- 新会话可绑定新的 Claude `cliSessionId/filePath`。

### G. 重启后历史不假运行

1. 完成一个 ClaudeCode 会话。
2. 关闭应用并重新打开。
3. 进入同一项目和同一会话。

期望：

- 历史内容正常显示。
- 不显示 running、停止按钮或继续计时。
- 已绑定历史会话的消息仍从 JSONL 正常加载。

### H. pending/adoption 回归烟测

1. 新建 ClaudeCode 会话并发送第一条消息。
2. 等会话完成。
3. 关闭项目 Tab，再重新打开同一目录。
4. 检查侧边栏是否只有合理的一条对应会话，标题和内容是否对应。

期望：

- 不产生重复会话。
- 不把新会话内容领养到错误历史会话。
- 自定义标题、模型/effort、session instruction 状态不因本次 runtime 重构丢失。

## 4. 通过标准

- A、B、E、G 必须通过；这些是本轮重构的核心目标。
- C、D 不能退化；尤其运行中再次发送不能因为 `isClaudeTurnLocked()` 改动而失效。
- H 不能出现明显 regression；如发现 pending/adoption 新问题，单独回到会话身份链路排查，不混入本轮 metrics 重构。
