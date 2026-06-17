# CodeX 对话卡住/中断 专题分析

> 最后更新：2026-06-12（修复完成）
>
> 关联文档：mindcraft-electron `docs/bugs/codex-conversation-interruption.md`（历史修复记录）
>
> 修复 PLAN：`C:\Users\hanso\.claude\plans\typed-gathering-perlis.md`

## 结论先行

经逐项对比 mindcraft-electron 历史文档中列出的所有缺口 + 6 项修复已于 2026-06-12 落地。修复覆盖了 P0/P1/P2 全部 6 个缺口，核心思路是**闭合前后端状态同步的反馈缺口**：不新增状态标志，只在现有机制上闭合"上锁路径必须有保证的解锁事件"这一不变量。

## 历史修复背景

mindcraft-electron 经历过两轮修复：

1. **第一轮（前端伪中断）**：历史回填覆盖流式状态 → 已加 `isCodexTurnLocked` / `shouldHydrateHistoryFromDisk` 守卫
2. **第二轮（主进程多 run 竞态）**：引入 `runId` / `canStartCodexSessionRun` / `deleteCodexSessionRunIfCurrent` 机制

mindcraft-agent 目前继承了第二轮的全部修复，并额外补上了文档中标注为"未覆盖"的 catch 块 run ownership 守卫。

## 逐项对比：文档缺口 vs 当前代码

| # | 文档声称的缺口 | mindcraft-agent 现状 | 判定 |
|:--|------|------|:--:|
| R1 路径 A | catch 块无 run ownership 守卫，abort/error 消息可误杀新 turn | 每个 `safeSend`/`sendMetrics` 前均通过 `shouldEmitCodexSessionTerminalSignals` 检查 `runId` 匹配 | ✅ 已修复 |
| R1 路径 B | rollout 文件被两个二进制争抢 | `canStartCodexSessionRun` 用 `streamClosed` 判据，新 query 在旧流未真正关闭前等待 3.25s | ✅ 已缓解 |
| R2.1 | slash 命令 handler 对活跃会话调 `thread.run('/')` | 已增加 `findCodexSessionForSlashCommands` 活跃检测；`thread.run('/')` fallback 已删除 | ✅ 已修复 |
| R2.2 | 静默结束 reason 误报 `'completed'` | `finalizeCodexSessionDoneState` 翻转为 `'failed'` + 可见错误消息 + 专属日志行 | ✅ 已修复 |
| R2.3 | flush 覆盖用户草稿 | — | ⬜ 未处理（UX 改进，非 bug） |
| R2.4 | 30s slowNotice 无 subtype，前端不渲染 | 确认：bootWatch 发的消息只有 `type:'system'`，无 `subtype` 字段 | 🔴 仍存在 |
| R3.2 | 碰撞时等待后应该"abort 强开"而非放弃 | 当前代码等待 3.25s 后若仍未就绪则 `return 0`（放弃），而非强制重启 | 🟡 策略差异 |

## 当前剩余的代码级缺口

### 🔴 G1：`codexAgentQuery` 返回值被前端忽略

**位置**：`packages/agent/src/components/codeX/index.vue:1888`

```js
await window.electronAPI.codexAgentQuery?.(payload)
// ↑ 不检查返回值！return 0 或 Promise reject 都会导致 tab 锁定
```

**后端返回 0 的触发条件**（`codexAgent.js:1586-1588`, `1599-1601`）：

1. **非终止态重复**：`streamClosed=false` 且 `doneSent=false` 且 `resultReceived=false` → 立即 `return 0`
2. **终止态等待超时**：等待 2500ms + abort + 等待 750ms 后 `streamClosed` 仍为 `false` → `return 0`

**后端 Promise reject 的触发条件**（`codexAgent.js:1566-1579`）：

- `readRuntimeConfig()` 抛出异常
- `path.resolve(cwd)` 抛出异常
- 任何 `return new Promise(...)` 之前的同步代码抛出

**症状**：前端已设 `tab.thinking=true`、`tab._awaitingDone=true`、已 push user 消息到 `tab.messages`。后端不处理请求 → 无 `onAgentDone` → tab 永久锁定。只能手动 abort 或刷新页面。

**影响**：这是 **"卡住没反应了"** 的直接根因。用户点击发送后，消息显示在对话中，但输入框变灰/显示"排队下一条消息..."，loading 动画一直转，永远不会结束。

---

### 🔴 G2：`thread.error` 事件不触发终止态

**位置**：`codexAgent.js:1907` vs `2009-2015`

```js
// 设 resultReceived 的三类事件 (L1907)：
if (ev.type === 'turn.completed' || ev.type === 'turn.failed' || ev.type === 'task_complete') {
    resultReceived = true
}

// thread.error 事件处理 (L2009)——不设 resultReceived！
if (ev.type === 'thread.error' || ev.type === 'turn.failed') {
    safeSend(sender, 'codex-agent-message', {
        msg: { type: 'system', subtype: 'error', ... }
    })
}
```

**后果链**：
1. SDK 发送 `thread.error` → 后端转发 error 消息给前端 → 前端清 `tab.thinking`/`tab._awaitingDone`
2. 但后端 `resultReceived` 仍为 `false` → 会话处于**非终止态**
3. 用户看到错误后立即重试 → 新 query 到达后端 → `existing = codexSessions.get(sessionId)` 仍存在 → `canStartCodexSessionRun` → `false`（streamClosed=false）
4. `isCodexSessionRunTerminal` → `false`（doneSent=false, resultReceived=false）
5. `return 0` → **Tab 永久锁定**（同 G1）

**与 `turn.failed` 的关键区别**：`turn.failed` 事件同时设置了 `resultReceived=true`（因为 L1907 的条件包含 `turn.failed`），所以它走终止态等待路径（3.25s）而非静默丢弃。`thread.error` 缺少这一步。

**影响**：这是 **"刚开始几轮容易毫无反应中断"** 的直接根因。早期轮次的 SDK 初始化或模型连接问题更可能导致 `thread.error`，触发此路径后用户重试就卡死。

---

### 🟡 G3：30s slowNotice 无 subtype → 用户看不到

**位置**：`codexAgent.js:1636-1644`

```js
safeSend(sender, 'codex-agent-message', {
    sessionId,
    msg: { type: 'system', message: { content: [{ type: 'text', text: 'Codex 响应较慢，请稍候…' }] } },
    // ↑ 缺少 subtype 字段！
})
```

前端 `useCodexAgentStream.js` 的 `onAgentMessage` 中，`system` 类型消息按 `subtype` 路由（`debug`/`abort`/`error`/`compact_started`/`compact_summary`/`compact_boundary`）。没有 subtype 的消息落入默认分支——**仅打印日志，不渲染**。用户永远看不到这条提示。

**影响**：首次查询或慢响应时，用户在 30s 内看不到任何反馈，体验为"毫无反应"。

---

### 🟡 G4：`abortSession` 先清前端状态再等后端 → 竞态窗口

**位置**：`codeX/index.vue` 的 `abortSession()`

```js
async function abortSession(tab) {
    tab.thinking = false          // ← 立即清状态
    tab._awaitingDone = false     // ← 立即清状态
    // ...
    await window.electronAPI.codexAgentAbort?.(tab.sessionId)  // ← 异步等待
}
```

在 `tab.thinking=false` 与 `codex-agent-abort` 完成后端清理之间，存在一个**约 50-200ms 的窗口**。在此期间用户若再次发送消息：
- 前端 `isCodexTurnLocked` → `false`（thinking 和 _awaitingDone 已清）
- 后端旧 session 仍在地图中（streamClosed 可能仍为 false）
- 若赶上 `return 0` → Tab 锁定（同 G1）

**影响**：快速点击 abort → 立即重发的用户操作序列可触发。

---

## 非代码级观察（待复现验证）

### O1：collision 策略偏保守

当旧 run 处于终止态（`doneSent=true` 或 `resultReceived=true`）但 `streamClosed` 未就绪时，当前策略是等待 2500ms + abort + 再等 750ms = 3.25s。超时后**放弃**（`return 0`）而非强制重启。

mindcraft-electron 文档 R3.2 的建议是"超时后 abort 强开"。当前策略更安全（不争抢 rollout 文件），但代价是超时后用户操作被静默丢弃。两者都不完美——更好的方案可能是超时后发一条明确的错误消息让用户手动重试，而非静默丢弃。

### O2：Late events 重设 `tab.thinking`

`triggerDone()` 发送 `codex-agent-done` 后，drain 窗口（最多 1s）内仍可能有 `item.updated` 事件到达前端。`onAgentMessage` 中若 `msg.type === 'item.updated'` 且 `tab.thinking === false`，会自动重设为 `true`。此后无第二次 done 来清除——tab 看起来永久"思考中"。实际发生率较低（需在 drain 后、done 前到达的 item），但一旦发生就没有自动恢复机制。

---

## 修复建议优先级（全部已完成 ✅）

> 修复日期：2026-06-12

| 优先级 | 编号 | 修复内容 | 文件 | 改动量 | 状态 |
|:--:|------|------|------|:--:|:--:|
| 🔴 P0 | G2 | `thread.error` 也设 `resultReceived=true`（与 `turn.failed` 对齐） | `codexAgent.js:2009` | +3 行 | ✅ |
| 🔴 P0 | G1 | 前端检查 `codexAgentQuery` 返回值；若拒绝或异常，回滚 tab 状态并提示用户 | `index.vue:sendMessage` | ~28 行 | ✅ |
| 🟠 P1 | G3 | slowNotice 增加 `subtype: 'slow_notice'`，前端增加对应渲染分支 | `codexAgent.js:1640` + `useCodexAgentStream.js` | +8 行 | ✅ |
| 🟠 P1 | G4 | `abortSession` 中先 `await codex-agent-abort` 完成，再清前端状态 | `index.vue:abortSession` | ~6 行 | ✅ |
| 🟡 P2 | O1 | 碰撞放弃时返回 `{ accepted: false, reason }` 而非 `return 0` 静默 | `codexAgent.js:1588,1601` | 改 2 行 | ✅ |
| 🟡 P2 | O2 | 前端 `onAgentMessage` 中 `_awaitingDone` 已清则不重设 `tab.thinking` | `useCodexAgentStream.js:572` | 改 1 行 | ✅ |

### G1 实现细节

**核心变更**：将 `tab.thinking` 的设置从 IPC 调用前改到 IPC 确认后。

```
时序变更:
  修改前: push消息 → thinking=true → _awaitingDone=true → IPC(忽略返回值)
  修改后: push消息 → _awaitingDone=true(飞行锁) → IPC → 检查返回值
            ├─ 拒绝: pop消息 + 清状态 + toast "正在处理上一轮请求"
            └─ 接受: thinking=true + _thinkingStart + metrics + timer
```

关键设计决策：不引入新状态标志。复用 `_awaitingDone` 做 IPC 飞行锁——`isCodexTurnLocked` 检查 `thinking || _awaitingDone`，在 IPC 飞行期间仍然生效。

---

## 与 mindcraft-electron 文档的差异说明

文档 `codex-conversation-interruption.md` 中标注为"未覆盖"的以下条目，经逐行验证，已在 mindcraft-agent 中修复：

| 文档条目 | mindcraft-agent 现状 |
|------|------|
| R1 路径 A：catch 块无 run ownership 守卫 | `shouldEmitCodexSessionTerminalSignals(codexSessions, sessionId, runId)` 覆盖全部 send |
| R2.1：slash 命令 `thread.run('/')` | 已删除；增加 `findCodexSessionForSlashCommands` 活跃检测 |
| R2.2：静默结束 reason `'completed'` | `finalizeCodexSessionDoneState` 翻转为 `'failed'` + 用户可见错误 |

这些差异是因为 mindcraft-agent 在文档撰写后继续迭代，补上了这些缺口。

---

## 验证方案

### G1/G2 验证（核心）

1. 启动 CodeX 对话，正常发送一条消息
2. 在回答进行中时，手动触发 abort（点击中断按钮）
3. 立即（<200ms）再次发送新消息
4. 修复前：Tab 锁定，loading 转圈不停 → 需手动刷新
5. 修复后：新消息正常发送并收到回复

### G3 验证

1. 关闭网络或使用慢速 API endpoint
2. 发送 CodeX 查询
3. 修复前：30s 内无任何 UI 反馈
4. 修复后：30s 时显示 "CodeX 响应较慢，请稍候…"

### G4 验证

1. 发送消息 → 等待开始回复 → 点击 abort
2. 在 abort 完成前立即输入并发送新消息
3. 修复前：可能卡住
4. 修复后：新消息正常处理

---

## 备注

- mindcraft-electron 也有独立的 `codexAgent.js`，位于 `packages/agent/electron/codexAgent.js`。如果 mindcraft-agent 的修复生效，应同步到 mindcraft-electron（除 G1 外，G1 的后端 `return 0` 在两者中都存在）。
- G1 是**架构级问题**：前端对后端返回值的零检查。这不是 CodeX 特有的——应作为整体 IPC 契约的一部分统一审计。
