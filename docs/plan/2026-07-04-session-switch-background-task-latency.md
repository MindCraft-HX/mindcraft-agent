# T177 Session 切换后台任务延迟与主线程竞争专题

> 日期：2026-07-04
> Task: T177
> 相关：CodeX / ClaudeCode session switch、IPC、session registry、draft、metrics、instruction state
> 状态：Phase 0 ✅ 根因确认 → Phase 1 修复 metrics 阻塞 + 重复触发。范围收紧：只修 metrics，不碰 renderContent/虚拟列表/draft

## 1. 背景

T176 已完成大 session 渲染方向收口：

- CodeX history tool 默认折叠，大 bash output 懒挂载。
- 真实大 session 中 expanded tools 从 29-43 降到 0-3。
- `renderContent` 探针显示 markdown 渲染不是剩余卡顿主因：
  - 打字期间旧消息没有重跑 `renderContent`。
  - 冷加载 `renderContent` 总耗时约 19.5ms。
  - 单条消息最大约 5KB，没有触发普通大消息折叠的样本。

用户仍能感到：切 session / 渲染过程中输入仍有卡顿，只是比 T176 Phase 1 前缓和。

新的 perf 数据显示 1s 级耗时集中在后台任务：

| 项 | 观测值 |
|---|---:|
| `ensureChatMessagesLoaded.ipc` | ~1408ms |
| `sessionDraft.loadDraftForChat` | ~969-1912ms |
| `refreshActiveSessionInstructionState` | ~1583ms |
| `refreshMetricsForChat` | ~1093ms |

这些数值不能直接等同于“阻塞主线程”。CodeX `switchChat()` 中大部分调用是 `void` 后台化，不会同步 await。但它们可能通过以下方式影响体感：

1. IPC 本身排队或主进程慢，导致 session 内容、draft、metrics 延迟回来。
2. 多个后台 IPC 在同一时间返回，renderer 同步写入响应式状态，引发主线程竞争。
3. `ensureChatMessagesLoaded` 返回后执行 `chat.messages = ...`，触发 60 条消息挂载和布局。
4. draft / instruction / metrics 返回后更新 input/status/footer/sidebar，和用户输入事件抢主线程。

T177 的目标是把这些路径拆清楚，而不是先继续猜。

## 2. 调查目标

必须回答以下问题：

1. renderer 看到的 IPC wall time 慢，main process handler 是否也慢？
2. 如果 main 快、renderer 慢，延迟来自 IPC 队列、renderer 主线程忙，还是调用时机被排队？
3. `sessionDraft.loadDraftForChat` 为什么 T173 后仍有 1-2s？
   - 是缓存没命中？
   - 是 chatKey 不稳定？
   - 是每次切换都先 persist old draft 再 load new draft，造成写读竞争？
   - 是 main handler / session registry read 慢？
4. `refreshActiveSessionInstructionState` 为什么会到 1.5s？
   - 它理论上只读 session registry 小字段，不应慢。
5. `refreshMetricsForChat` 是否仍有重复触发？
   - `switch-chat`
   - `active-tab-state-watch`
   - `history-loaded`
   - `session-scan`
   - `done-retry`
6. `ensureChatMessagesLoaded.ipc` 慢在哪里？
   - JSONL tail read / parse / normalize？
   - main process queue？
   - renderer waiting while busy？
7. IPC 返回后的 renderer apply 阶段耗时多少？
   - `chat.messages = ...`
   - `normalizeFileChangeMessages`
   - footer token sync
   - metrics/status update
   - input draft set + textarea resize

## 3. 当前代码入口

CodeX:

- `packages/agent/src/components/codeX/index.vue`
  - `switchChat(id)`
  - `ensureChatMessagesLoaded(chat)`
  - `refreshMetricsForChat(chat, reason)`
  - `refreshActiveSessionInstructionState()`
  - `watch(() => activeTab.value?.id, ...)` 中的 `sessionDraft.loadDraftForChat(tab)`
  - `watch(() => activeTab state object, ...)` 中的 `refreshMetricsForChat(tab, 'active-tab-state-watch')`

ClaudeCode:

- `packages/agent/src/components/claudeCode/index.vue`
  - 同类函数：`switchChat` / `ensureChatMessagesLoaded` / `refreshMetricsForChat` / `refreshActiveSessionInstructionState`

Shared:

- `packages/agent/src/components/agentCommon/composables/useSessionDraft.js`
- `packages/agent/src/components/agentCommon/utils/metricsDedupHelper.js`
- `packages/agent/src/components/agentCommon/utils/rendererPerfProbe.mjs`

Main process:

- `packages/agent/electron/sessionInstructionIpc.js`
  - `agent-get-session-draft`
  - `agent-set-session-draft`
  - `agent-get-session-instruction`
- `packages/agent/electron/sessionRegistry.js`
  - `getSessionDraft`
  - `setSessionDraft`
  - `getSessionInstruction`
- `packages/agent/electron/codexAgent.js`
  - CodeX session range read / metrics query handlers
- `packages/agent/electron/claudeAgent.js`
  - Claude session range read / metrics query handlers
- `packages/agent/electron/shared/mainPerfProbe.js`

## 4. Phase 0：分段探针，只观测不优化

### 4.0 Phase 0 实测数据（2026-07-04）

**测试条件**：CodeX 大 session（46-62MB JSONL），连续 4 次切换 session，`window.__MCPF_PERF__=true` 开启双端探针。

#### renderer wall vs main process handler 对齐

| IPC | Renderer wall (avg) | Main handler | 丢失在队列 |
|-----|:---:|:---:|:---:|
| `readSessionRange` | 733ms | **49ms** | **684ms** |
| `getSessionDraft` | 831ms | **1-3ms** | **828ms** |
| `getSessionInstruction` | 831ms | **1ms** | **830ms** |
| `queryMetrics` | 1738ms | **2391ms** | ~对齐 |

**三项 IPC 的 main handler 都是毫秒级，无可优化。**

#### main process 内部阶段拆解

`codex-read-session-file-range`（49ms total）：

| 阶段 | 耗时 | 
|------|:---:|
| `stat` | 0ms |
| `tailRead`（I/O + parse） | 26-44ms |
| `collect`（flush + pending） | 0-1ms |
| `process`（result build） | 0ms |

`sessionRegistry.getDraft`：0-1ms 或 cacheHit=1 命中。

`sessionRegistry.getInstruction`：1ms，无 disk cache 但极快。

#### 🔴 根因：`codex-metrics.session-read` 阻塞主进程 event loop

```
codex-metrics.session-read total=5697ms   ← 读 47MB JSONL
codex-metrics.session-read total=2384ms   ← 读 ？MB JSONL
codex-metrics.session-read total=365ms
codex-metrics.session-read total=117ms
codex-metrics.session-read total=56ms
codex-metrics.session-read total=23ms
```

`getCodexSessionMetricsByFile()` 内部 `fs.readFileSync` 同步读取完整 JSONL 文件求和 token count。文件越大越慢（5697ms），在此期间 **event loop 完全冻结**——draft、instruction、messages 三个已完成的主进程响应被阻塞在队列中无法返回 renderer。

```
时间线：
  renderer → 发送 4 个 IPC（draft / instruction / messages / metrics）
  main   → draft(1ms) → instruction(1ms) → messages(49ms) → 全部完成
  main   → metrics 开始 → fs.readFileSync(2384ms) → 🔴 event loop 冻结
                        → 前 3 个响应卡在 IPC 队列
  main   → metrics 完成 → event loop 恢复 → 4 个响应同时到达 renderer
  renderer 看到: draft=831ms, instruction=831ms, messages=733ms, metrics=2391ms
```

#### 其他发现

| 发现 | 数据 |
|------|------|
| apply 全 0ms | Vue 状态写入不是瓶颈 |
| draft cache 生效 | `cacheHit=1` 命中率良好 |
| metrics 调用频率 | `switch-chat`×4 + `active-tab-state-watch`×4 + `history-loaded`×4 → 每次切 session 3 次刷新 |
| 后台扫描 | `handleRefreshSessions` avg 1106ms, max 2213ms（也触发了 metrics） |
| CodeX readRange | 55-83ms 正常路径，2254ms 异常路径（被 metrics 排队拖慢） |
| Claude 对比 | draft 199ms / instruction 197ms / messages 1880ms — 系统性更慢，待单独诊断 |

#### 结论

**CodeX session 切换当前已确认的首要瓶颈：`codex-metrics.session-read` 的 `fs.readFileSync`。**

messages / draft / instruction 的 main handler 都是毫秒级，apply 阶段 0ms。修复 metrics 的文件读取方式（异步化或走缓存）即可消除串扰，让前三项 IPC 的实际 wall time 降到 1-49ms。

本阶段只加显式 perf flag 下的探针，不改变行为。禁止直接改缓存策略或调度策略。

### 4.1 renderer IPC wrapper 分段

对以下调用记录：

- call start time
- promise resolved time
- returned payload size summary（只记录数量/长度，不记录内容）
- apply start/end time
- current active chat 是否仍匹配请求 chat

CodeX labels 建议：

- `codex.ipc.readSessionRange.wall`
- `codex.ipc.readSessionRange.apply`
- `codex.ipc.getSessionDraft.wall`
- `codex.ipc.getSessionDraft.apply`
- `codex.ipc.getSessionInstruction.wall`
- `codex.ipc.getSessionInstruction.apply`
- `codex.ipc.queryMetrics.wall`
- `codex.ipc.queryMetrics.apply`

Claude labels 同理加 `claude.*`。

注意：不要打印消息正文、draft 正文、instruction 正文、路径敏感内容、API key。meta 只允许数字：

- `messages`
- `tools`
- `chars`
- `hasMore`
- `cacheHit`
- `sameChat`
- `activeMatch`
- `reasonCode`

### 4.2 main process handler 分段

主进程已有 `perfStartIpc`。需要确认以下 handler 是否有 main-side 输出：

- `agent-get-session-draft`
- `agent-set-session-draft`
- `agent-get-session-instruction`
- `codex-read-session-file-range`
- `codex-agent-query-metrics`
- Claude 对应 session range / metrics handler

如果 handler 内部还有明显阶段，继续拆：

`codex-read-session-file-range`:

- file stat / signature
- tail read
- JSON parse
- message normalize
- return payload build

`agent-get-session-draft` / `agent-get-session-instruction`:

- index read
- record read
- legacy fallback read

metrics:

- file read
- aggregate
- normalize

### 4.3 dump 对齐方式

需要同时看 renderer 和 main process 的 `[perf]` 输出。

判断规则：

| 现象 | 结论 |
|---|---|
| renderer wall 1500ms，main handler 20ms | IPC 往返/renderer event loop/队列竞争，不是 main handler 计算慢 |
| renderer wall 1500ms，main handler 1450ms | main process handler 本身慢 |
| main handler 快，但 apply 慢 | renderer 状态写入 / Vue 更新 / DOM 挂载慢 |
| wall 快但用户仍卡 | 继续查 Layout/Paint/DOM，而不是 IPC |

## 5. Phase 1：消除 metrics 同步阻塞 + 去重

Phase 0 数据明确：draft/instruction/messages 的 main handler 都是毫秒级，renderer apply 0ms。**唯一需要修复的是 metrics 同步全量读 JSONL 阻塞主进程 event loop**，以及同一 session 上三次连续触发重型 metrics 聚合的重复问题。

### 5.1 根因剖析

`getCodexSessionMetricsByFile()` 调用链：

```
getCodexSessionMetricsByFile(filePath, turnOffsets?)
  → readJsonlLines(filePath, Infinity)
    → fs.readFileSync(filePath, 'utf8')    ← 🔴 同步读完整文件
    → .split('\n')                         ← 🔴 同步解析全部行
    → forEach line → JSON.parse → 累加 tokens
```

函数已经是 `async`，但第一个 `await` 前已完成了同步读 + 解析 —— `async` 包装无效。

触发路径（每次切 session ~3 次全量聚合）：

| reason | 来源 | 频率 |
|--------|------|:---:|
| `switch-chat` | `switchChat()` 显式调用 | 每次 |
| `active-tab-state-watch` | `watch activeTab state` deep | 每次 |
| `history-loaded` | `ensureChatMessagesLoaded` 完成后 | 每次 |
| poller | `startSessionMetricsPoller()` 每秒轮询 `refreshMetricsForCurrentChat()` | 持续 |

### 5.2 修复方案

#### Step 1: 给 session metrics aggregate 加缓存（主进程）

`codexAgent.js` 新增：

```js
const _metricsAggregateCache = new Map() // key: filePath, value: { mtimeMs, size, result, ts }

function getCachedSessionMetrics(filePath) {
  const cached = _metricsAggregateCache.get(filePath)
  if (!cached) return null
  try {
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
      return cached.result
    }
  } catch (_) { /* file deleted */ }
  _metricsAggregateCache.delete(filePath)
  return null
}
```

`getCodexSessionMetricsByFile()` 逻辑变为：

```
1. 先查 _metricsAggregateCache
2. 命中 (mtimeMs + size 均未变) → 直接返回缓存 ← 最热路径
3. 未命中 → fs.readFileSync → 聚合 → 写入缓存 → 返回
```

⚠️ **不要试图把 `fs.readFileSync` 改成 `fs.promises.readFile` 来"异步化"** —— 大文件读仍然会阻塞 event loop，只是阻塞点从 sync call 移到了 libuv thread pool + JSON.parse。正确的做法是 **先走缓存**，让 99% 的调用命中缓存（文件未变），只有文件真的变了才触发全量读。

#### Step 2: 渲染进程去重（renderer）

`refreshMetricsForChat` 已有 `_pendingMetrics` dedup（by sessionId）。但三个 reason 在同一个 session 上仍会发三次 IPC（dedup 只去并发重复，不去时序重复）。

方案：

- `switchChat()` 中调用 `refreshMetricsForChat(chat, 'switch-chat')` 后，给该 sessionId 打一个短期标记 `_metricsJustSent`（300ms TTL）。
- `active-tab-state-watch` 和 `history-loaded` 触发时检查标记，命中则跳过。
- 标记过期后仍允许刷新（后续变化需要反映）。

```js
const _metricsJustSent = new Map() // sessionId → timestamp

function refreshMetricsForChat(chat, reason) {
  if (reason !== 'switch-chat') {
    const sent = _metricsJustSent.get(chat.sessionId)
    if (sent && Date.now() - sent < 300) return // 300ms 内跳过
  }
  _metricsJustSent.set(chat.sessionId, Date.now())
  // ... 原有 IPC 逻辑 ...
}
```

#### Step 3: 处理 poller（主进程缓存已覆盖）

`startSessionMetricsPoller()` 每秒调用 `refreshMetricsForCurrentChat()` → `getCodexSessionMetricsByFile()`。

Step 1 的缓存生效后，poller 每秒调用走的是 `_metricsAggregateCache` 命中（文件未变 → mtimeMs+size unchanged → 直接返回缓存），不会每秒阻塞主进程。

不需要改 poller 的调用频率或禁用逻辑，缓存已消除阻塞。

### 5.3 Token Metrics 红线

- **StatusBar 当前回合 token**：必须来自 `TurnStore` snapshot → `normalizer`。不经过 `getCodexSessionMetricsByFile()`。
- **JSONL aggregate 只补 context/git/speed/history**：这些数据走 `_metricsAggregateCache` 是安全的 —— 文件没变，聚合结果不会变。
- **不拿历史 aggregate 冒充当前回合**：缓存 key 绑定 filePath+mtimeMs+size，文件变了必然重新聚合。

### 5.4 ClaudeCode 侧

Claude 的 `getClaudeSessionMetrics()` 类似结构（`fs.readFileSync` 读 JSONL），同样受益于缓存方案。但 Claude 侧 Phase 0 数据显示 draft 199ms / instruction 197ms / messages 1880ms 系统性更慢，可能还有独立瓶颈，Phase 1 先在 CodeX 侧闭环，Claude 侧复用时追加探针诊断。

### 5.5 不做

T177 Phase 1 **不再回头做**：

- renderContent computed 缓存（T176 已闭环）
- 虚拟列表
- draft 方案调整（main handler 1ms，draft cache 命中良好，无可优化）
- instruction 方案调整（main handler 1ms，apply 0ms）
- readSessionRange 进一步优化（main handler 49ms for 60 messages，已很快）

## 6. 明确不做

T177 不做：

- 不继续 T176 的 renderContent computed 缓存。
- 不做普通大消息折叠，除非新数据推翻 T176 Phase 2a-0。
- 不做虚拟列表。
- 不拆输入框组件。
- 不改 provider storage / T174。
- 不改 simple chat storage / T175。
- 不写官方 `~/.claude` / `~/.codex` 旁的 sidecar。
- 不把 draft 恢复到 panel state。
- 不默认打开 debug console 噪音。
- **不把 `fs.readFileSync` 简单包装成 `fs.promises.readFile` 来"异步化"** —— 大文件读 + JSON.parse 仍然阻塞 event loop，只是阻塞点变了。正确做法是缓存优先，文件未变时不读盘。
- **不把 metrics aggregate 结果冒充 StatusBar 当前回合 token** —— StatusBar 当前回合必须来自 TurnStore snapshot，aggregate 缓存只用于 context/git/speed/history。
- **ClaudeCode 侧不在此 Phase 内修** —— Claude 的 draft 199ms / instruction 197ms / messages 1880ms 系统性更慢，可能有独立根因（与 CodeX 不同）。Phase 1 仅在 CodeX 侧闭环，Claude 侧单独诊断。

## 7. 验收标准

### 7.1 性能指标

在同一个大 CodeX JSONL session（≥40MB）上执行：

| 指标 | 当前 (Phase 0) | 目标 (Phase 1) |
|------|:---:|:---:|
| `getSessionDraft` renderer wall | 831ms | **< 50ms**（接近 main handler 1-3ms） |
| `getSessionInstruction` renderer wall | 831ms | **< 50ms**（接近 main handler 1ms） |
| `readSessionRange` renderer wall | 733ms | **< 100ms**（接近 main handler 49ms） |
| `codex-metrics.session-read` 同文件第二次 | 2384ms | **< 5ms**（缓存命中） |
| `codex-metrics.session-read` 首次/文件变化 | 2384ms | **不变**（仍需读盘，但不阻塞其他 IPC） |
| 同 session 切 tab 三次 reason 触发 | 3 次全量聚合 | **1 次**（300ms TTL 去重） |
| poller 每秒调用 | fs.readFileSync 阻塞 | **缓存命中，无阻塞** |

### 7.2 功能验收

- [ ] 大 JSONL session 切换后，draft/instruction/messages 不应再被 metrics 拖到 700ms+
- [ ] 切同一个 session 不应出现 `switch-chat` + `active-tab-state-watch` + `history-loaded` 三次重型 metrics 聚合
- [ ] 文件未变时，第二次 metrics query 应走缓存（`_metricsAggregateCache` 命中）
- [ ] 文件变化后（新消息写入），metrics 应重新聚合（缓存失效 → 全量读 → 新结果 → 写入缓存）
- [ ] StatusBar 当前回合 token 仍来自 TurnStore snapshot，不经过 aggregate 缓存
- [ ] perf/debug 输出仍 flag-gated（`window.__MCPF_PERF__` / `localStorage mcpf_perf`），不默认污染 dev console
- [ ] `npm test` 全量通过
- [ ] `npm run build` 通过

## 8. 交付要求

Phase 0 交付：

- 文档更新：把采集到的 renderer/main 对齐数据写回本文件。
- 只允许新增显式 flag 下的 perf 探针。
- 不改变行为。

Phase 1 交付：

- 只修 Phase 0 证明确认的瓶颈。
- 每个修复必须有测试或可复现实测数据。
- code review 必须列出：
  - 是否影响 session registry 边界。
  - 是否影响 Token Metrics 红线。
  - 是否影响官方 JSONL 只读边界。
  - 是否会引入默认 dev console 噪音。
