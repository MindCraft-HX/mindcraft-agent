# CodeX 竞态修复计划

> 日期：2026-06-15 | 最后更新：2026-06-16
>
> 状态：**已修复。根因是 `codex-agent-query` Promise 正常完成时 resolve 了 `exitCode`（0），被前端误判为旧版静默拒绝。**
>
> 范围：仅 CodeX 会话生命周期与排队输入；不改 ClaudeCode 工具栏，不改宿主权限。
>
> 历史入口：
> - `docs/session-pitfalls.md`
> - `docs/bugs/codex-conversation-interruption.md`
> - `docs/bugs/codex-stuck-interruption.md`

## 背景

这次不是宿主 `danger-full-access` / `read-only` 问题。仓库里也没有控制外层 Codex 宿主权限的代码。

当前真正的问题是：CodeX 为了防止重复发送、提前中断、新会话乱起，已经加了锁；但这个锁只解决了”胡乱并发”一类问题，没有把”turn 完成”和”session 真正关闭”区分开。结果是：

1. `codex-agent-done` 一到，前端立即 flush `_queuedInput`
2. 这时后端旧 run 往往还没真正 `streamClosed`
3. 新请求撞上 `session_already_running` / `session_close_timeout`
4. 前端只好弹 busy 文案，用户感知为”老是提示稍后重试”

## 实施记录

### 2026-06-14：B029 首次修复（`56f9488`）

在 `triggerDone()` 中设置 `streamClosed = true` + `resolveCompletion()`，确保 `codex-agent-done` 发送前 session 已标记为可接新请求。

### 2026-06-15：B029 意外丢失（`5f7416d`）

版本升级（v1.0.9）时提取 `markCodexSessionDoneSent()` 辅助函数，只保留了 `doneSent = true`，遗漏了 `streamClosed = true` + `resolveCompletion()`。

### 2026-06-16：B029 恢复 + T107 回退（`551ca6b`）

- `codexAgent.js` `triggerDone()`：恢复内联 `streamClosed = true` + `resolveCompletion()`（替换 `markCodexSessionDoneSent()` 调用）
- `codeX/index.vue`：回退方案 A 的 `flushQueuedInput()` 函数（~70 行），恢复原始 `sendMessage()` 调用
- 核心逻辑：后端在发送 done 之前先标记自己可以接受新请求

### 2026-06-16：诊断日志埋点（`bbd465b`）

在 `codeX/index.vue` `sendMessage()` 的 busy toast 前加 `console.error`：
- 字段：`sessionId`, `isQueuedFlush`, `queryResult`, `tabThinking`, `tabAwaitingDone`, `tabQueuedInput`, `stack`
- 目的：用户实测一轮即可捕获调用栈和 IPC 返回值，定位意外触发路径

### 2026-06-16：根因确认与修复（`716eecf`、`9432b44`、`daa1bde`）

**根因**：`codex-agent-query` handler 在正常完成时执行了 `resolve(exitCode)`。`exitCode` 正常为 `0`，前端 `sendMessage` 中的判断：

```js
accepted = queryResult !== 0 && (!queryResult || queryResult.accepted !== false)
```

把 `0` 当成"旧版静默拒绝" → `accepted = false` → 进入 toast 分支，并且把刚 push 的用户消息 splice 掉，导致气泡消失。

**修复 1：统一返回值格式**（`716eecf`）
- `codexAgent.js`：`resolve(exitCode)` → `resolve({ accepted: true, exitCode })`
- 与早期拒绝路径 `{ accepted: false, reason: '...' }` 统一为对象格式

**修复 2：abort 即时反馈**（`9432b44`）
- `abortSession()` 中 `tab.thinking = false` 提前到 `await codexAgentAbort` 之前
- `_awaitingDone = true` 在 await 期间阻止下一条消息，避免 `session_already_running` 碰撞

**修复 3：保留用户消息**（`daa1bde`）
- 非 queueable 拒绝路径不再 splice 删除用户消息
- 仅清理 `thinking` / `_awaitingDone`，保留消息作为防御性保护

## 关联症状：用户气泡消失

用户反馈在出现 busy toast 时，发送的用户气泡也会消失。根因同上：
- `queryResult === 0` 被误判为拒绝
- 进入 toast 分支前执行了 `tab.messages.splice(idx, 1)` 回滚
- 该回滚逻辑在 `daa1bde` 中移除

### 2026-06-16：thinking 卡住不消失（`f57545e`）

**根因**：`resolve({ accepted: true })` 修复了 toast 误报，但暴露了隐藏竞态：

```
后端: triggerDone() → safeSend('codex-agent-done')   ← IPC 消息 A
       finally → resolve({ accepted: true })           ← IPC 消息 B

前端: codex-agent-done → onAgentDone → tab.thinking = false  ← 先到
       sendMessage 恢复 → tab.thinking = true                ← 后到，覆盖！
```

`resolve()` 在 `finally` 中，晚于 `triggerDone()` 发送 done 事件。前端先收到 done → 清 thinking，再收到 Promise 响应 → 设回 true → 永不消失。

之前 `resolve(0)` 被误判拒绝，绕过了 `thinking = true` 赋值，两个 bug 互相抵消。

**修复**：`tab.thinking = true` 前移到 `await codexAgentQuery` 之前（乐观设置）。拒绝路径清除乐观值再按类型决定是否重设。成功路径不再后置设置，`onAgentDone` 的清除不会被覆盖。

## 当前状态

- B029 竞态：`triggerDone` 中 `streamClosed = true` 已恢复（`551ca6b`）
- busy toast 误报：`resolve({ accepted: true })` 已修复（`716eecf`）
- 用户气泡消失：回滚删除逻辑已移除（`daa1bde`）
- abort 按钮无反馈：`thinking=false` 已提前（`9432b44`）
- **thinking 卡住不消失：乐观 thinking 前置到 await 之前（`f57545e`）**

等待用户实测验证。
