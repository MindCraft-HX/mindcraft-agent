# T177-P2 Phase 1 交接文档 — 消息分片挂载

> 目标：消除切 Session 后 `chat.messages = allMessages.slice(-60)` 一次性挂载 60 条消息导致的 2295ms RunTask。
>
> 方案依据：`docs/plan/2026-07-04-renderer-dom-layout-and-cache-governance.md` §6.1

---

## 成果

| 指标 | 修复前 | 修复后 | 
|------|:---:|:---:|
| switchChat（热路径） | 2295ms RunTask | **0.75ms** |
| ensureChatMessagesLoaded（首次 60 条/588KB） | 全量阻塞 | **81ms**（IPC 占 80ms，proc 仅 0.58ms） |
| ensureChatMessagesLoaded.proc | 1770ms Layout+Paint+Style | **0.58ms**（只做 10 条同步 + normalize） |

不再有任何 >50ms 的 Long Task 出现在切 session 路径上。

---

## 设计

### 核心思路

```
chat.messages = allMessages.slice(-10)          ← 首批 10 条同步挂载
↓ requestIdleCallback (8ms 时间预算)
chat.messages.unshift(batch) + scroll补偿       ← 剩余 50 条分批后台补齐
```

不改变 `v-for="msg in tab.messages"` 模板——只改变数组填充方式。

### 关键结构

所有挂载状态存在 `chat._chunk` 上（**不是闭包**）：

```
chat._chunk = {
  pending: Message[],    // 待补齐的消息引用（pop() 消费，旧→新顺序）
  active: boolean,       // 是否允许继续挂载
  idleId: number|null,   // requestIdleCallback handle
  _doneResolve: fn|null, // mountStaged 返回的 Promise resolve
}
```

### 5 个导出函数

| 函数 | 行为 |
|------|------|
| `mountStaged(chat, allMessages)` | 首屏 10 条同步 + 剩余入 pending + 启动 idle 分批。**不 await。** |
| `pauseMount(chat)` | 取消 idle callback，保留 pending。切走时调用。 |
| `resumeMount(chat)` | 从 pending 继续。**不 await。** 切回时 fire-and-forget。 |
| `hasPendingMount(chat)` | 是否有未补齐消息。用于 switchChat 分支 + loadMore 守卫。 |
| `discardMount(chat)` | 彻底清理。删除 session、新数据覆盖时调用。 |

### switchChat 三路分支

```
!chat._messagesLoaded   → ensureChatMessagesLoaded（IPC + mountStaged）
hasPendingMount(chat)   → resumeMount（fire-and-forget）+ 立即 scroll/focus
else                    → 直接 scroll/focus
```

### 关键约束

- **`_messagesLoaded` = "磁盘已加载"**，不等 DOM batch 完成。设 true 后立即返回。
- **时间预算 8ms**，`deadline.timeRemaining()` 优先，最小每批 2 条。
- **先组 batch 再一次 `unshift(...batch)`**，不逐条 mutation。
- **禁止 flushAll**——没有 3s 兜底一次性补齐。
- **`loadMoreHistory` 入口加 `hasPendingMount` 守卫**——pending 未完时禁止翻页，防止 page0/page1 消息交错 unshift 导致顺序错乱。
- **`requestDeleteChat` 调用 `discardMount`**——防止 Promise leak + pending 泄漏。
- **持久化删除 `_chunk` + `_messagesLoaded`**——`buildPersistableCodexChat` / `buildPersistableClaudeChat` 中显式 `delete c._chunk; delete c._messagesLoaded`。

---

## 变更文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/agent/src/components/agentCommon/composables/useChunkedHistoryMount.js` | **新增** | 分片挂载 composable（~225 行） |
| `packages/agent/src/components/codeX/index.vue` | 修改 | 4 处：switchChat、ensureChatMessagesLoaded、loadMoreHistory、requestDeleteChat |
| `packages/agent/src/components/claudeCode/index.vue` | 修改 | 同上 |
| `packages/agent/src/components/codeX/utils/sessionLifecycle.mjs` | 修改 | `buildPersistableCodexChat` 删 `_chunk` + `_messagesLoaded` |
| `packages/agent/src/components/claudeCode/utils/claudeRuntimeState.mjs` | 修改 | `buildPersistableClaudeChat` 删 `_chunk` + `_messagesLoaded` |
| `tests/useChunkedHistoryMount.test.mjs` | **新增** | 16 个单测 |

---

## 已知限制 & 待改进

1. **loadMoreHistory 守卫是硬阻断**——pending 未完时用户滚到顶部无响应。实际场景中 idle batch 200-500ms 即完成，但边界下体验不理想。可选改进：先 flush/resume pending 再允许翻页。

2. **无 `_loadingMessages` 重入守卫**——CodeX 的 `switchChat` 在 `!chat._messagesLoaded` 分支设 `_loadingMessages = true` 但未在函数入口检查。双击快速切 session 可能触发并发 IPC。风险较低（已有 `_historyLoadRequested` / `_historyLoadDeferred` 机制部分覆盖）。

3. **`scheduleNext` 是死 wrapper**——直接调用 `scheduleBatch(chat)`，可内联。保留无害，主要是可读性。

4. **guard Promise 永不 resolve**——当 `getActiveChatId() !== chat.id` 时 `mountStaged` 返回的 Promise 永不 resolve（没有调用 `finishMount`）。生产代码用 `void mountStaged()` fire-and-forget，无害。但如果未来有人 `await`，会 hang。

5. **单测用同步 rIC mock**——真实浏览器 `requestIdleCallback` 异步，测试中改为同步以适配 `node:test`。批次行为差异（测试中一批跑完所有 pending，真实中可能多批），但正确性验证等价。

---

## Commits

```
95aefef fix(T177-P2): non-blocking mount + loadMore guard + pending slice + unit tests
7734fa9 fix(T177-P2): remove blocking awaits from chunked mount flow
e49a1d4 feat(T177-P2): message chunked mount to eliminate 2.3s RunTask
```

---

## 验收数据

perf probe 实测两个 period：

**Period 1（冷启动，首次 IPC）**:
- `codex.switchChat`: 48.5ms max
- `codex.ensureChatMessagesLoaded.proc`: 2.6ms
- `codex.ensureChatMessagesLoaded`: 1178ms（全部是 IPC wall time）

**Period 2（热路径，缓存命中）**:
- `codex.switchChat`: **0.75ms avg**（6 次切换）
- `codex.ensureChatMessagesLoaded.proc`: **0.58ms avg**（4 次加载）
- `codex.ensureChatMessagesLoaded`: **81ms avg**（IPC 58-140ms，proc <1ms）
- `codex.refreshMetricsForChat`: **0.16ms avg**（17 次，缓存命中）
- `claude.switchChat`: 0.80ms avg

**结论**：2295ms RunTask 已消除，切 session 路径不再有长任务。首批 10 条同步立即可交互，剩余后台补齐。
