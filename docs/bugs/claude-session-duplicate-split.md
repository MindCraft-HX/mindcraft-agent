# Claude 会话重复分支专题

> 日期：2026-06-11（更新）
> 范围：`packages/agent/src/components/claudeCode/**` + 主进程 `claudeAgent.js`
> 状态：5 个根因已定位，全部已修复 (2026-06-11)

---

## 现象

ClaudeCode 侧边栏偶发出现两个看似相同或连续的对话：

- 用户实际只在同一个对话里继续提问。
- 侧边栏却新增一条"分支出来"的历史对话。
- 新分支里的 Claude 会提示"没有上一次对话上下文"。
- 这不是单纯的新建按钮双击，也不是 Tab 高亮渲染问题。

---

## 1. 核心概念

Claude UI 有两类身份：

- **UI 本地会话**：`chat.id` / `chat.sessionId`，例如 `chat-1`、`session-chat-1-<timestamp>`
- **Claude CLI 会话**：`cliSessionId` / `filePath`，对应 `~/.claude/projects/<cwd-hash>/<uuid>.jsonl`

> 跨架构验证（对照 `docs/agent-architecture.md`）：
> - Claude 可同时存在于独立窗口和 codeHub 嵌入面板中。两者共享**同一个主进程** `claudeAgent.js` 和其中的全局 Map（`cliSessionIds`、`agentSessions`、`sessionModels`）。
> - 后台扫描（`refreshProjectSessionsInBackground`）扫描的是文件系统 `~/.claude/projects/<hash>/` — 这是一个**共享目录**，所有窗口的 JSONL 都落在这里。
> - 因此一个窗口的扫描会看到另一个窗口创建的 JSONL 文件。这是设计如此——扫描的目的是发现项目中所有历史对话。

会话生命周期简图：

```
createChat()                      sendMessage()                  SDK query()
  │                                  │                              │
  │ session-chat-N-ts               │ thinking=true                │ 创建 uuid.jsonl
  │ _pendingSessionBinding=true     │ await claudeAgentQuery()     │ 流式消息...
  │ cliSessionId=null               │                              │
  │ filePath=''                     │                              │
  │                                  │◄── onAgentDone ─────────────┤
  │                                  │   cliSessionId=uuid         │
  │                                  │   filePath=.../uuid.jsonl   │
  │                                  │   thinking=false            │
  │                                  │                              │
  │◄── 后台扫描 (focus/init) ───── 并发 ──────────────────────────┤
  │    refreshProjectSessionsInBackground()
  │    → findPendingClaudeSessionForAdoption()
  │    → adoptScannedClaudeSession()
```

---

## 2. 已修复的问题（2026-06-10 及之前）

| # | 问题 | 修复 | 验证 |
|---|------|------|------|
| 1 | pending 判断依赖 `thinking` → 首轮结束后 `thinking=false` 但 `cliSessionId` 未到，扫描误判为已绑定 | `isPendingClaudeSessionBinding` 改为只检查 `cliSessionId`/`filePath` + `session-chat-*` + 有用户消息 | `claude-pending-session-binding.test.mjs` |
| 2 | 历史恢复后 `_pendingSessionBinding` 丢失，chat 无法被领养 | `buildPanelStatePayload` 显式保存/恢复 `_pendingSessionBinding` | 同上 |
| 3 | `claude-panel-state.json` 缺 `activeProjectId`/`activeChatId` → 加载后选择错乱 | `pickActiveSelection` 兜底逻辑 | `claude-history-persistence-sanitizer.test.mjs` |
| 4 | 同一 jsonl 绑到多个 chat 后无清理 | `dedupeProjectChats` 在保存/加载边界按 `cliSessionId`/`filePath` 去重 | 同上 |
| 5 | codeHub 顶部 tab 与实际 active project 不一致 | `resolveCodeHubSyncedTabId` + `watchEffect` 同步 | `codehub-active-tab-sync.test.mjs` |
| 6 | 扫描防重只保护了 `thinking && !cliSessionId && !filePath` | 改用 `hasUnboundClaudeSessionPendingAdoption` 统一判断 | 随 #1 一起验证 |

---

## 3. 仍存在的根因（2026-06-11 确认）

### 🔴 根因 A：`findPendingClaudeSessionForAdoption` 盲匹配

**文件**：`packages/agent/src/components/claudeCode/utils/pendingSessionBinding.mjs:24-36`

```js
export function findPendingClaudeSessionForAdoption(chats = [], { activeChatId = '' } = {}) {
  const pendingChats = chats.filter(isPendingClaudeSessionBinding)
  if (!pendingChats.length) return null
  const activePending = activeChatId ? pendingChats.find(c => c.id === activeChatId) : null
  if (activePending) return activePending
  // ⚠️ 问题：返回"最近创建的 pending chat"——不检查它是否对应当前扫描到的 JSONL
  return pendingChats.sort((a, b) =>
    toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt)
  )[0] || null
}
```

**问题本质**：函数做的是"找个 pending chat 来领养"，而不是"找到这个 JSONL 对应的那个 pending chat"。

**触发条件**（同时满足）：
1. 同一项目中有 **≥2 个** pending chat（都处于 `_pendingSessionBinding=true`）
2. 这些 pending chat 的 **创建顺序** 与对应 JSONL 文件的 **更新时间顺序** 不一致

**典型路径**：
1. 用户创建 chat-A（发长消息）→ SDK 开始创建 uuid-a.jsonl（较慢）
2. 用户快速创建 chat-B（发短消息）→ SDK 创建 uuid-b.jsonl（较快）
3. chat-B 的 JSONL 比 chat-A 的更早写入磁盘 → `updatedAt` 更大
4. 用户切窗口 → 切回 → 后台 `focus` 扫描触发
5. `scanCliSessionsForProject` 按 `updatedAt` DESC 排序 → `[uuid-b, uuid-a]`
6. 对 `uuid-b`：`findPendingClaudeSessionForAdoption` → 返回 **chat-A**（最近创建）
   → `adoptScannedClaudeSession(chat-A, uuid-b)` → chat-A 错误绑到 uuid-b
7. 对 `uuid-a`：`findPendingClaudeSessionForAdoption` → 返回 **chat-B**（仅剩 pending）
   → `adoptScannedClaudeSession(chat-B, uuid-a)` → chat-B 错误绑到 uuid-a
8. 两个 chat 的 CLI 会话身份**互换**

**后续命运**：
- 如果两个 `onAgentDone` 在 `saveHistory()` 触发前都到达 → 正确覆盖回来 → 无持久化损伤
- 如果只有一个 `onAgentDone` 在保存前到达 → **错误的绑定关系落盘** → 下次加载时 `dedupeProjectChats` 介入 → scoring 偏向 `sessionId===cliSessionId` 的 chat → 另一个 chat 被删除 → 用户丢失对话

> **根本原因**：渲染进程在 `onAgentDone` 之前不知道 `cliSessionId`。主进程在流式首条消息就拿到了 `cliSessionId`（第 2158 行 `cliSessionIds.set(sessionId, msg.session_id)`），但从未主动推送给渲染进程。扫描只能用"最近创建的 pending chat"做启发式匹配。

### 🔴 根因 B：Provider 切换清空所有 `cliSessionIds` 映射

**文件**：
- 主进程：`packages/agent/electron/claudeAgent.js:1809-1821` (`resetAgentRuntime`)
- 渲染进程：`packages/agent/src/components/claudeCode/index.vue:2258-2266` (`handleProviderActivated`)

```js
// 主进程 — 被 claude-provider-activate 触发
function resetAgentRuntime(_reason) {
  for (const [sid, session] of agentSessions.entries()) {
    try { session.abortController?.abort?.() } catch (_) {}
    agentSessions.delete(sid)
  }
  cliSessionIds.clear()      // ⚠️ 清空全部映射
  sessionModels.clear()
  compactSummaries.clear()
  // ...
}

// 渲染进程 — 响应 provider 激活
function handleProviderActivated() {
  const tab = activeTab.value
  // ⚠️ 只重新注册了当前活跃 tab！
  if (tab.cliSessionId) {
    window.electronAPI.claudeRegisterCliSessions?.({ [tab.sessionId]: tab.cliSessionId })
  }
  // 所有其他 chat（侧栏中其他项目、其他窗口的所有 chat）→ cliSessionId 映射永久丢失
}
```

**问题本质**：`resetAgentRuntime` 是全局操作 → 清除所有窗口所有 chat 的 resume 能力 → 渲染进程只恢复一个 tab。

**触发条件**：
- 用户切换 API Provider 或修改 API Key（触发 `claude-provider-activate`）
- 且当前有 ≥2 个 chat 已绑定 cliSessionId（侧栏有历史会话）

**典型路径**：
1. 用户有 2 个项目，每个 3 个 chat，都正常绑定了 `cliSessionId`
2. 用户切换 API Provider
3. 主进程 `resetAgentRuntime` → 全部 6 个 chat 的 `cliSessionId` 映射被清除
4. 渲染进程只重新注册了**当前活跃的 1 个** chat
5. 用户切换到另一个 chat → 发送消息
6. `previousCliSessionId = cliSessionIds.get(sessionId)` → `undefined`
7. → `resumedSessionId = undefined` → SDK **创建新会话而非恢复** → 第二个 JSONL 产生 → 重复！

**额外损失**：`compactSummaries` 也被清空 → 下一个需要 compact 的会话失去压缩上下文 → 可能超出 token 限制。

### 🟡 根因 C：SDK 错误早于 `session_id` 到达 → 僵尸 pending + 重试重复

**文件**：`packages/agent/electron/claudeAgent.js:2158-2162, 2283-2294`

```js
// 流式循环
for await (const msg of q) {
  if (msg?.session_id) {
    if (!cliSessionIds.has(sessionId)) cliSessionIds.set(sessionId, msg.session_id)
  } else if (msg?.uuid && !cliSessionIds.has(sessionId)) {
    cliSessionIds.set(sessionId, msg.uuid)
  }
  // ⚠️ 如果流式在此处报错，cliSessionIds 可能尚未设置
}

// finally 块
if (!resultReceived && s) {
  const fallbackCliSessionId = cliSessionIds.get(sessionId) || ''  // ⚠️ 空字符串
  safeSend(sender, 'claude-agent-done', { sessionId, cliSessionId: '' })
}
```

**问题本质**：SDK query 可能在首条流消息（包含 `session_id`）之前就报错。此时 JSONL **已创建**在磁盘上（SDK 在 query 启动时创建文件），但 `cliSessionIds` 从未设置 → `onAgentDone` 携带空 `cliSessionId`。

**触发条件**：
- SDK query 因 API Key 无效 / 网络错误 / 超时等原因在交付首条流消息前报错
- 用户在错误后**快速重试**（不等后台扫描介入）

**典型路径**：
1. 新 chat → SDK query 启动 → UUID JSONL 创建在磁盘 → query 立即失败（API key invalid）
2. `cliSessionIds` 未设置 → `onAgentDone(cliSessionId='')` → 渲染进程 `tab.cliSessionId` 保持 `null`
3. `tab.thinking = false`，但 `tab._pendingSessionBinding` 仍为 `true`（`onAgentDone` 不清除它）
4. 用户看到错误 → **立即重试**（点击发送按钮）
5. `sendMessage` 走非 thinking 路径 → **新的** `claudeAgentQuery` → SDK 创建**第二个** JSONL
6. 第一个 JSONL（错误那次）在磁盘上，第二个 JSONL 也在磁盘上 → 扫描器看到两个 → 重复

**如果用户不立即重试**（等 2 秒让后台扫描介入）：
- 扫描发现 JSONL → `findPendingClaudeSessionForAdoption` 正确领养 → 修复完成 ✅
- 这说明 root cause C 的严重性取决于用户是否快速重试，以及扫描是否在此之前触发

### 🟡 根因 D：`hasPendingNewChat` 预计算导致多余的 skip

**文件**：`packages/agent/src/components/claudeCode/index.vue:1597`

```js
const hasPendingNewChat = hasUnboundClaudeSessionPendingAdoption(p.chats || [])
for (const s of scanned) {
  // ...
  if (!cached) {
    if (pendingChat) {
      adoptScannedClaudeSession(pendingChat, s, name)  // 领养后 pending 减少
      continue
    }
    if (hasPendingNewChat) continue  // ⚠️ 预计算的布尔值，领养后已过时
    newCount++
    // ... 创建新 chat
  }
}
```

**问题本质**：`hasPendingNewChat` 在循环前计算一次。循环内每次领养都会减少 pending 数量，但 `hasPendingNewChat` 不会更新。当 pending 全部被领养完后，剩余未匹配的 JSONL 会被错误跳过——这些 JSONL 本应作为正常历史会话插入侧栏。

**实际影响**：这些被跳过的会话只是延迟到下一次扫描才出现，通常不致命。但在多 pending + 多旧 JSONL 的场景下可能造成用户感知的"会话丢失"。

### 🔴 根因 E：中断恢复后部分消息阻止磁盘重载 → 渲染卡死

**文件**：`packages/agent/src/components/claudeCode/index.vue`

- `refreshProjectSessionsInBackground:1617` — adoption 后 `continue` 跳过所有消息清理逻辑
- `refreshProjectSessionsInBackground:1678-1690` — `else` 分支（fileSize 未变）无任何消息清理
- `switchChat:1796` — 仅在 `chat.messages.length === 0` 时从磁盘加载

**问题本质**：`adoptScannedClaudeSession` 设置 `cliSessionId`/`filePath` 后立即 `continue`，跳过后续的消息清理逻辑。而 `switchChat` 仅在消息为空时才加载磁盘内容。中断恢复后的 chat 有部分消息 → 永不被替换。

**触发条件**（全部满足）：
1. 对话正进行中（SDK 流式输出，或等待工具权限）
2. 用户关闭应用 / 应用崩溃（`onAgentDone` 未触发）
3. `filePath` 尚未设置（pending chat）→ 消息被完整保存（因为 `c.filePath` 为空，不走 `messages: []` 逻辑）
4. 重新启动 → 历史恢复 → 后台扫描领养 → 领养路径 `continue` 跳过清理

**精确路径**：

```
中断前状态（内存）:
  chat._pendingSessionBinding = true
  chat.cliSessionId = null
  chat.filePath = ''
  chat.messages = [..., { role:'tool', status:'pending', requestId:'...' }]
  chat.thinking = true

↓ flushHistoryOnUnload → buildPanelStatePayload()
  → c.filePath = '' → falsy → messages = 完整保存（含 pending 工具消息）
  → _pendingSessionBinding = true 保存

↓ 应用重启 → loadHistory()
  → makeRestoredChat: thinking=false, _messagesLoaded=undefined
  → chat.messages = [部分消息 + pending 工具]

↓ 后台扫描 → scanCliSessionsForProject()
  → 发现 JSONL（SDK 在崩溃前已创建）
  → cached = null（cacheByPath 和 cacheBySid 都未命中）
  → pendingChat = findPendingClaudeSessionForAdoption(...) → 返回本 chat
  → adoptScannedClaudeSession(pendingChat, s, name)
      → cliSessionId = s.id  ✅
      → filePath = s.filePath ✅
      → _pendingSessionBinding = false  ✅
      → continue  ← ⚠️ 跳过消息清理！跳过了 1667-1690 全部逻辑！

↓ switchChat 或下次点击
  → chat.filePath 已设置
  → chat.messages.length > 0（部分消息仍在）→ 条件不满足
  → ensureChatMessagesLoaded 不触发！
  → 部分消息（含 pending 工具）永久残留在内存中
  → UI 渲染 pending 工具 → 无 IPC handler 可解析 → 卡死
```

**为什么 `shouldReloadClaudeChatFromDisk` 的设计是合理的**：该函数在正常运行时防止磁盘重载覆盖正在等待权限的 pending 工具消息——这是正确的，因为权限对话框需要用户响应。但崩溃重启后，权限 IPC handler 已不存在，pending 工具变成僵尸。函数无法区分"运行时保护"和"恢复后清理"两个场景。

**为什么 `switchChat` 的 `messages.length === 0` 条件不够**：它假设"有消息 = 消息有效"。中断恢复场景下，消息来自 `flushHistoryOnUnload` 的保存而非磁盘 JSONL，可能包含不完整/失效的内容。"是否已从磁盘加载"应由 `_messagesLoaded` 标记，而非消息数量。

**为什么 `else` 分支（fileSize 未变）无清理是危险的**：若崩溃时 SDK 已写完部分内容但 `fileSize` 在下次扫描时未继续增长，chat 进入 `else` 分支——无任何消息清理。`_pendingSessionBinding` 被清除（line 1684），但消息永不更新。

**死锁总结**：

```
shouldReloadClaudeChatFromDisk      → 保护 pending 工具不被覆盖（正常运行时 ✓）
                                    → 阻止中断恢复后的清理（崩溃后 ✗）

adoptScannedClaudeSession + continue → 跳过消息清理（崩溃后领养 ✗）

switchChat messages.length === 0    → 阻止冗余磁盘读（正常运行时 ✓）
                                    → 阻止恢复后的磁盘加载（崩溃后 ✗）

else 分支（fileSize 不变）           → 无清理逻辑（崩溃后 ✗）
```

---

## 4. 已验证无问题的部分

| 怀疑项 | 验证结论 |
|--------|---------|
| `onAgentDone` 无条件覆盖 scan 绑定 | 在单 pending 场景正确（相同值）。多 pending swap 场景下 `onAgentDone` 反而能**纠正** scan 的错误绑定。结合 2 秒 debounce save，问题不大。 |
| `codeHub` 顶部 tab 与实际发送目标不一致 | 当前 `resolveCodeHubSyncedTabId` + `watchEffect` 已处理。 |
| `dedupeProjectChats` scoring 不公 | 设计合理：`sessionId===cliSessionId` 的 chat（扫描器创建的）获得 10^15 分加成，因为它是从磁盘 JSONL 直接来的，信息更完整。 |
| 多窗口 `sessionId` 碰撞 | `sessionId` 包含 `Date.now()` 时间戳，碰撞概率极低。但 `cliSessionIds` Map 共享是设计如此，用于跨窗口 resume。 |
| `agent-structure.md` 架构正确性 | 已验证。`claudeAgent.js` 的全局 Map 确实是所有窗口共享的，独立窗口和 codeHub 嵌入窗口走同一套 IPC handler。 |

---

## 5. 修复原则（更新）

1. ✅ 扫描刷新不能直接把未匹配 jsonl 插入新 chat，必须先尝试领养 pending chat。
2. ✅ pending 判断不依赖 `thinking`，而依赖"还没有 `cliSessionId/filePath` 且仍是本地临时会话"。
3. ✅ 已绑定的历史会话不得重新进入 pending 池。
4. ✅ 防重逻辑应集中在 `pendingSessionBinding.mjs`，避免后续在组件里散写条件。
5. ✅ 面板持久化必须保证 active 指向真实存在的 project/chat。
6. ✅ 同一个项目内同一 `cliSessionId` / `filePath` 只能保留一个 UI chat。
7. ✅ codeHub 顶部 unified tab 要跟随嵌入面板的 active project 收敛。
8. **🆕 扫描器领养 pending chat 时必须有文件级匹配依据，不能仅用"最近创建"启发式。**
9. **🆕 `resetAgentRuntime` 不得清除 `cliSessionIds` Map，或必须在渲染侧做全量恢复。**
10. **🆕 主进程在首个 stream message 拿到 `cliSessionId` 时，应立即通过 IPC 通知渲染进程。**
11. **🆕 SDK 错误路径下，`finally` 块应能从已创建的 JSONL 文件名反推 `cliSessionId`。**
12. **🆕 `adoptScannedClaudeSession` 领养后必须重置 `_messagesLoaded = false`；`switchChat` 应以 `_messagesLoaded` 而非 `messages.length` 作为是否需要重新加载的依据。**
13. **🆕 扫描的 `else` 分支（fileSize 未变）必须在中断恢复后也能触发消息清理。**

---

## 6. 当前代码落点（更新）

### Renderer 侧
- `packages/agent/src/components/claudeCode/utils/pendingSessionBinding.mjs`
  - `isPendingClaudeSessionBinding`
  - `hasUnboundClaudeSessionPendingAdoption`
  - `findPendingClaudeSessionForAdoption` ← **根因 A 所在**
  - `adoptScannedClaudeSession`
- `packages/agent/src/components/claudeCode/index.vue`
  - `refreshProjectSessionsInBackground` ← **根因 A, D, E 所在**（扫描流程，adoption 后 continue 跳过清理，else 分支无清理）
  - `switchChat` ← **根因 E 所在**（`messages.length === 0` 条件过严）
  - `handleProviderActivated` ← **根因 B 所在**
  - `createChat`
  - `sendMessage`
- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js`
  - `onAgentDone` ← 覆盖逻辑需改为 merge 语义
- `packages/agent/src/components/claudeCode/utils/historyPersistenceSanitizer.mjs`
  - `sanitizeClaudeProjectsForPersistence`
  - `buildClaudePanelStatePayload`
  - `dedupeProjectChats`
- `packages/agent/src/components/claudeCode/composables/useClaudeHistory.js`
  - `buildPanelStatePayload`（包含 `_pendingSessionBinding` 序列化）
- `packages/agent/src/components/codeHub/activeTabSync.mjs`
  - `resolveCodeHubSyncedTabId`

### Main 进程侧
- `packages/agent/electron/claudeAgent.js`
  - `resetAgentRuntime` ← **根因 B 所在**（清除 cliSessionIds）
  - `claude-agent-query` handler：runQuery 中的 cliSessionId 注册 ← **根因 C 所在**
  - `claude-agent-done` 事件发射（`buildClaudeAgentDonePayload`）
  - `claudeRegisterCliSessions` IPC handler

### 测试
- `tests/claude-pending-session-binding.test.mjs`
- `tests/claude-history-persistence-sanitizer.test.mjs`
- `tests/codehub-active-tab-sync.test.mjs`

---

## 7. 回归用例（更新）

已有覆盖（6 个场景）：
- active pending chat 优先被领养
- pending chat 在 `thinking = false` 后仍被保护
- 恢复后的本地临时 `session-chat-*` 会话即使丢了 `_pendingSessionBinding`，只要有用户消息且未绑定，也仍可被领养
- 同一 cliSessionId 的去重
- active chat 被去重删掉后的 fallback
- 污染状态加载后的清理

**🆕 需要新增的回归用例：**

1. **中断恢复后消息从磁盘重新加载**：模拟 pending chat 含部分消息（模拟 pending 工具）→ 扫描领养 → 验证 `_messagesLoaded` 被重置 → `switchChat` 触发磁盘加载 → 部分消息被 JSONL 内容替换。
2. **多 pending 领养匹配**：2 个 pending chat + 2 个 scan 文件，验证领养到正确的 JSONL（不互换）。
3. **Provider 切换后非活跃 tab 仍能 resume**：切换 provider 后，切换到另一个有历史记录的 chat，发消息 → 验证仍是 resume 而非新会话。
4. **SDK 错误后 pending chat 不被抛弃**：模拟 SDK 在首条消息前报错 → 验证扫描能正确领养孤儿 JSONL。
5. **Provider 切换后 compact summary 保留**：切换 provider 后，验证需要 compact 的会话仍有上下文摘要。

运行：
```bash
node --test tests/claude-pending-session-binding.test.mjs
node --test tests/claude-history-persistence-sanitizer.test.mjs tests/codehub-active-tab-sync.test.mjs
```

---

## 8. 修复路线图

| 优先级 | 根因 | 修复方向 | 影响文件 |
|--------|------|---------|---------|
| **P0** | E: 中断恢复 → 部分消息阻止磁盘重载 → 渲染卡死 | `adoptScannedClaudeSession` 后重置 `_messagesLoaded = false`；`switchChat` 改为检查 `!_messagesLoaded` 而非 `messages.length === 0`；扫描 `else` 分支加消息清理 | `pendingSessionBinding.mjs`, `index.vue` |
| **P0** | B: Provider 切换清空映射 | `resetAgentRuntime` 不调 `cliSessionIds.clear()`；`handleProviderActivated` 遍历全量 chat 注册 | `claudeAgent.js`, `index.vue` |
| **P0** | A: 多 pending 盲匹配 | 主进程在首个 stream message 拿到 `cliSessionId` 时立即 IPC 通知渲染进程 → 设 `_expectedCliSessionId` → 扫描按此匹配 | `claudeAgent.js`, `useClaudeAgentStream.js`, `pendingSessionBinding.mjs`, `index.vue` |
| **P1** | C: 错误路径孤儿 JSONL | `finally` 块根据 sessionId 反向扫描 JSONL 目录取得 `cliSessionId`；或 SDK initial metadata 提前暴露 | `claudeAgent.js` |
| **P2** | D: hasPendingNewChat 过时 | 在循环内每次领养后重新调用 `hasUnboundClaudeSessionPendingAdoption` | `index.vue` |

---

## 9. 已修复（2026-06-11）

### P0-E: 中断恢复死锁 ✅

**问题**：5 个设计正确的机制组合成死锁，崩溃/关闭后重启无法恢复渲染。

**修复（4 处）**：

| # | 文件 | 位置 | 改动 |
|---|------|------|------|
| 1 | `pendingSessionBinding.mjs` | `adoptScannedClaudeSession()` | 领养后设置 `_messagesLoaded = false` |
| 2 | `index.vue` | `switchChat()` L1796 | 移除 `messages.length === 0` 条件，仅检查 `!_messagesLoaded` |
| 3 | `index.vue` | 扫描领养路径 (adopt + continue 之间) | 领养后若为活跃 chat，清空 `messages` |
| 4 | `index.vue` | 扫描后 reload 代码 L1693-1704 | 移除 `messages.length === 0` 条件 |

### P0-B: Provider 切换 cliSessionIds 清空 ✅

**问题**：`resetAgentRuntime()` 清空所有 `cliSessionIds`，renderer 仅恢复活跃 tab，其他 chat 丢失 resume 能力。

**修复（2 处）**：

| # | 文件 | 位置 | 改动 |
|---|------|------|------|
| 1 | `claudeAgent.js` | `resetAgentRuntime()` | 移除 `cliSessionIds.clear()`（UUID 不依赖 SDK 实例） |
| 2 | `index.vue` | `handleProviderActivated()` | 遍历所有 project 的所有 chat 重新注册，而非仅活跃 tab |

### P0-A: 多 pending 盲匹配 ✅

**问题**：多个新对话同时 pending 时，`findPendingClaudeSessionForAdoption` 盲选最近创建的，JSONL 可能错误领养。

**修复（4 处）**：

| # | 文件 | 位置 | 改动 |
|---|------|------|------|
| 1 | `claudeAgent.js` | stream loop L2158-2163 | 首次检测到 `cliSessionId` 时，IPC 通知渲染进程 `claude-agent-early-cli-session` |
| 2 | `preload/index.js` | bridge | 新增 `onClaudeAgentEarlyCliSession` 监听方法 |
| 3 | `useClaudeAgentStream.js` | `onEarlyCliSession()` | 收到早期通知后设置 `_expectedCliSessionId` |
| 4 | `pendingSessionBinding.mjs` | `findPendingClaudeSessionForAdoption()` | 优先按 `_expectedCliSessionId === scannedSessionId` 精确匹配 |

**数据流**：
```
主进程 stream 首条消息
  │ cliSessionId = msg.session_id
  │ safeSend('claude-agent-early-cli-session', { sessionId, cliSessionId })
  ▼
渲染进程 onEarlyCliSession()
  │ tab._expectedCliSessionId = cliSessionId
  ▼
后台扫描 refreshProjectSessionsInBackground()
  │ scannedSessionId = s.id (JSONL UUID)
  │ findPendingClaudeSessionForAdoption(..., { scannedSessionId })
  │   → chat._expectedCliSessionId === scannedSessionId  ✓ 精确命中
```

### P1-C: 错误路径孤儿 JSONL ✅

**问题**：SDK 在流式首条消息之前报错 → `cliSessionIds` 未注册 → `onAgentDone` 携带空 `cliSessionId` → chat 滞留 pending 状态。

**修复（1 处）**：

| # | 文件 | 位置 | 改动 |
|---|------|------|------|
| 1 | `claudeAgent.js` | `finally` 块 L2288-2316 | 当 `fallbackCliSessionId` 为空时，反向扫描项目目录，按修改时间（60s 窗口）找到本次查询创建的 `.jsonl`，补注册 `cliSessionId` |

**数据流**：
```
SDK 报错 (exitCode=-1, resultReceived=false)
  │ cliSessionIds.get(sessionId) → undefined
  │ fallback scan:
  │   getClaudeProjectsRootDir(cwd)
  │   → filter *.jsonl by mtime < 60s
  │   → sort by mtime desc → pick latest
  │   → cliSessionIds.set(sessionId, candidate.id)
  │   → buildClaudeAgentDonePayload(cliSessionId=candidate.id)
  ▼
onAgentDone({ cliSessionId: uuid, filePath: .../uuid.jsonl })
  → chat 正常完成绑定，不会滞留 pending
```

### P2-D: hasPendingNewChat 过时 ✅

**问题**：`hasPendingNewChat` 在扫描循环外预计算为 `const`，循环内领养 pending chat 后未重新计算 → 后续合法的新 JSONL 被 `if (hasPendingNewChat) continue` 误跳。

**修复（2 处）**：

| # | 文件 | 位置 | 改动 |
|---|------|------|------|
| 1 | `index.vue` | L1597 | `const` → `let`，注释说明循环内会更新 |
| 2 | `index.vue` | adoption `continue` 之前 | 领养成功后重新计算 `hasPendingNewChat = hasUnboundClaudeSessionPendingAdoption(...)`
