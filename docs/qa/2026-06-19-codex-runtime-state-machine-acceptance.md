# CodeX Runtime State Machine 人工验收方案

> 日期：2026-06-19
> 关联方案：`docs/plan/2026-06-19-codex-runtime-state-machine.md`
> 范围：CodeX renderer 运行态、metrics、terminal/done、abort、queue、history persistence。

## 1. 验收目标

确认 CodeX 运行态已收敛到统一 state machine 后，以下行为稳定：

- 回复完成后不会被迟到 metrics 或 stream item 重新拉回“正在响应”。
- `task_complete/turn.completed` 先停 UI waiting，但不会在 done 到达前提前发送下一轮。
- done 到达后正确绑定 `cliSessionId/filePath`，清空 runtime 字段。
- abort 期间隐藏停止按钮，同时保持发送锁，后端确认后解锁。
- 后台 scan 不删除 active draft 或未绑定运行中 chat。
- 已绑定 `filePath` 的会话不持久化假运行态，重启后不会显示 running。

## 2. 自动化验收

在仓库根目录执行：

```powershell
node tests/codex-runtime-state.test.mjs
node tests/codex-session-lifecycle.test.mjs
node tests/codex-agent-done-reason.test.mjs
node tests/task-done-history-persistence.test.mjs
node tests/codex-agent-done-payload.test.cjs
node tests/codex-git-metrics.test.cjs
node tests/codex-metrics-merge.test.mjs
node tests/codex-queued-input-flush.test.mjs
node --check packages/agent/src/components/codeX/utils/sessionLifecycle.mjs
node --check packages/agent/src/components/codeX/utils/codexRuntimeState.mjs
node --check packages/agent/src/components/codeX/composables/useCodexAgentStream.js
node --check packages/agent/src/components/codeX/composables/useCodexHistory.js
git diff --check
```

通过标准：

- 所有测试 exit code 为 0。
- `git diff --check` 无 trailing whitespace / conflict marker 报错。
- Node 对 `.vue` 文件不支持 `--check`，不纳入此项；以 dev/build 验证 Vue 编译。

## 3. 人工验收前准备

1. 启动应用：

```powershell
npm run dev
```

2. 打开 CodeX 面板，选择一个可写测试项目。
3. 准备一个已有历史 CodeX 会话，且该会话已有真实 `filePath`。
4. 打开 DevTools console，观察是否出现 `codex` runtime 相关异常。

## 4. 人工用例

### 4.1 正常完成不复活 running

步骤：

1. 新建 CodeX 会话。
2. 发送一个普通问题，例如“列出当前项目根目录文件，并简要说明”。
3. 等待回复完成。
4. 继续观察 3 秒。

通过标准：

- 回复完成后输入框恢复可发送。
- 消息区“正在响应”消失后不再恢复。
- 左侧会话 running 点消失后不再恢复。
- StatusBar 的 thinking 指示不再恢复。

### 4.2 terminal 早于 done 时不提前发送

步骤：

1. 发送一个会产生工具调用或较长输出的问题。
2. 在回复接近结束时快速按 Enter 发送下一条消息。
3. 如果 UI 显示排队/等待，等待上一轮 done 后观察下一条是否自动发送或可重新发送。

通过标准：

- 不出现 `session_already_running` / `session_close_timeout` 的错误 toast。
- 不出现用户消息消失。
- 上一轮结束前不会启动第二个重叠 run。
- done 后 UI 能恢复，不长期卡在不可发送状态。

### 4.3 继续旧会话不分裂

步骤：

1. 选择一个已有 CodeX 历史会话。
2. 发送一条继续上下文的问题。
3. 回复完成后刷新/关闭重开应用。

通过标准：

- 左侧不会新增重复会话。
- 该会话仍绑定原 `cliSessionId` / rollout JSONL。
- 新消息写入原 thread 对应 JSONL。
- 重启后不会显示假 running。

### 4.4 abort 期间保持锁，完成后解锁

步骤：

1. 发送一个较长任务。
2. 回复进行中点击停止。
3. 停止后立即尝试发送新消息。
4. 等 abort 处理完成后再发送一次。

通过标准：

- 点击停止后停止按钮立即隐藏。
- abort 完成前不会撞上旧 run 导致卡死。
- abort 完成后可正常发送新消息。
- 不出现永久“正在响应”或永久灰色输入框。

### 4.5 metrics 迟到不复活

步骤：

1. 发送一条正常问题并等完成。
2. 完成后观察 StatusBar token/duration/git 是否仍可更新。
3. 观察 3 秒。

通过标准：

- metrics 数字可更新。
- `metrics.thinking=true` 迟到时不恢复 UI running。
- `_thinkingStart` 不造成新的 live timer。

### 4.6 后台 scan 不删除运行中未绑定会话

步骤：

1. 新建 CodeX 会话并立即发送首条消息。
2. 回复进行中切换到其他项目或等待后台 refresh。
3. 回复完成后回到该项目。

通过标准：

- 首条消息所在 chat 不消失。
- 不出现一个 pending chat 和一个 scanned chat 的重复条目。
- done 后 chat 正确获得 `cliSessionId/filePath`。

### 4.7 持久化不保存 runtime

步骤：

1. 完成一轮 CodeX 回复。
2. 关闭应用，再重新打开。
3. 进入同一项目和同一会话。

通过标准：

- 该会话不显示 running 点。
- 消息可以从 JSONL 正常加载。
- 继续发送不会因为旧 `_awaitingDone` 被锁住。

## 5. 回归抽查

继续执行 T138 验收中与 CodeX 相关的项：

- `docs/qa/2026-06-18-agent-session-identity-registry-acceptance.md` 的 `3.4 继续旧会话不分裂`。
- `3.2/3.3 CodeX 重命名关闭重开 + JSONL 不污染`。
- `4.2 ClaudeCode 和 CodeX 跨 Agent 不串`。

## 6. 失败记录模板

如失败，记录：

```text
用例编号：
时间：
项目 cwd：
MindCraft chat sessionId：
CodeX cliSessionId：
rollout filePath：
现象：
DevTools console：
主进程日志：
是否可复现：
```
