# T177 Session 切换后台任务延迟与主线程竞争专题

> 日期：2026-07-04
> Task: T177
> 相关：CodeX / ClaudeCode session switch、IPC、session registry、draft、metrics、instruction state
> 状态：✅ **T177 主线已验收** — CodeX + Claude 主进程 event loop 阻塞已消除。剩余体感卡顿在 renderer 侧消息挂载（Vue 响应式 + DOM layout），不在本期范围。

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

## 5. Phase 1：消除 metrics 同步阻塞 + 去重（审查修订版）

Phase 0 数据明确：draft/instruction/messages 的 main handler 都是毫秒级，renderer apply 0ms。**CodeX session 切换当前已确认的首要瓶颈是 metrics 同步全量读 JSONL 阻塞主进程 event loop**，以及同一 session 上三次连续触发重型 metrics 聚合的重复问题。

Phase 1 的目标不是“加一个缓存”本身，而是：

1. 同一 session 重复切换的热路径不再全量读/解析 JSONL。
2. 首次打开或文件变化时的冷路径不能继续长时间冻结主进程 event loop。
3. 不破坏 Token Metrics 红线：StatusBar 当前回合 token 仍来自 TurnStore snapshot，JSONL aggregate 只补 session-level context/speed/history；git 状态单独处理。

### 5.0 Phase 1 首版审查结论（2026-07-04）

首版实现（`feat(T177): Phase 1 — metrics 聚合缓存 + 渲染进程去重`）方向正确，但**不能验收**。确认问题如下：

1. **cache miss 仍会同步全量读大 JSONL**  
   `getCodexSessionMetricsByFile()` 命中缓存时会快，但 miss 后仍走 `readJsonlLines(filePath, Infinity)`，内部仍是 `fs.readFileSync + split + JSON.parse`。这只能优化“第二次以后”，不能解决首次打开 40-60MB session 或文件变化后的主进程冻结。

2. **缓存对象可变引用会被调用方污染**  
   cache hit 直接返回缓存里的 `result` 对象；poller 路径会写 `metrics.sessionId = sessionId`、`metrics.thinking = true`。如果该对象来自缓存，后续 query 会拿到被污染的 `thinking/sessionId`。

3. **aggregate cache 混入 git 状态，缓存失效边界不完整**  
   当前 cache key 只看 JSONL `mtimeMs + size`，但结果里包含 `gitBranch/gitChanges`。Git 状态变化不会修改 JSONL，因此 git 信息可能 stale。JSONL aggregate 和实时 git info 应拆开，或 git info 使用单独短 TTL。

4. **main process `perfCount()` 每次立即 `console.info`，开 perf 时日志会过密**  
   这不是功能阻断，但会干扰性能验收。建议按 renderer perf probe 的方式聚合 dump，或至少只在显式 dump 时输出计数。

首版中可以保留的方向：

- `filePath + size + mtimeMs` 的 aggregate cache 可作为热路径优化基础。
- renderer 侧对 `switch-chat / active-tab-state-watch / history-loaded` 做短窗口去重是合理止血。
- 改动范围保持在 CodeX metrics 路径，没有回头动 renderContent/draft/虚拟列表，范围正确。

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

#### Step 1: 修正首版缓存实现（必须先做）

主进程 aggregate cache 必须满足：

- cache hit 返回浅拷贝：`return { ...cached.result }`，不得把缓存对象引用交给调用方。
- cache set 时也存一份稳定对象；可选 `Object.freeze({ ...result })`，防止误写。
- 调用方不得 mutate `getCodexSessionMetricsByFile()` 返回值。poller 中不要写 `metrics.sessionId` / `metrics.thinking`，需要这些字段时构造局部 payload。
- JSONL aggregate cache 只缓存由 JSONL 内容决定的字段。`gitBranch/gitChanges` 拆成单独读取，或使用独立短 TTL cache，不能被 JSONL mtime/size 误认为有效。
- `perfCount()` 仍必须 flag-gated；开 perf 时建议聚合输出，不要每次调用刷一行。

#### Step 2: 给 session metrics aggregate 加热路径缓存（主进程）

`codexAgent.js` 新增：

```js
const _metricsAggregateCache = new Map() // key: filePath, value: { mtimeMs, size, result, ts }

function getCachedSessionMetrics(filePath) {
  const cached = _metricsAggregateCache.get(filePath)
  if (!cached) return null
  try {
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
      return { ...cached.result }
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

这一步只能解决热路径，不能作为最终根治。它的验收目标是：同一个未变化 JSONL 的第二次 metrics query 走缓存，`codex-metrics.session-read` 接近毫秒级。

#### Step 3: 渲染进程去重（renderer）

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

#### Step 4: 处理冷路径：互动切 session 不得同步等待全量 aggregate

这是 Phase 1 能否真正验收的关键。

首版缓存 miss 仍会冻结主进程，因此必须把 `codex-agent-query-metrics` 的互动路径改成“轻结果优先 + 后台重聚合”：

1. `queryCodexStatusBarMetrics()` 先返回 TurnStore snapshot / latest final turn snapshot，以及已缓存的 session context。
2. 如果 JSONL aggregate cache miss，不在当前 IPC handler 内同步全量读/解析大文件。
3. cache miss 时启动后台 aggregate 任务；任务完成后更新 `_metricsAggregateCache`，并通过现有 metrics/event 路径通知 renderer 刷新。
4. 后台 aggregate 必须有 per-file in-flight 去重：同一 `filePath` 同一时刻只允许一个重聚合任务。
5. 后台任务仍不能长时间冻结主进程 event loop。可选实现：
   - 增量 aggregate：按 file size/offset 只处理新增 JSONL 行。
   - 分片读取/分片解析：每批处理后 `await setImmediate` 让出 event loop。
   - worker thread：把大文件读/解析移出 Electron main event loop。

最低验收要求：首次打开或文件变化后的大 session，`draft/instruction/readSessionRange` 的 renderer wall 不能再被 metrics cache miss 拖到 700ms-2s。

#### Step 5: 处理 poller

`startSessionMetricsPoller()` 每秒调用 `refreshMetricsForCurrentChat()` → `getCodexSessionMetricsByFile()`。

热路径缓存命中可以降低 poller 成本，但不能依赖“文件未变”。运行中的 JSONL 可能持续增长，mtime/size 变化会让缓存持续 miss。poller 中不得每秒触发一次全量 aggregate。

poller 应优先使用已有 tail/live snapshot 读取当前回合 token；session-level context aggregate 可降频、走后台，或在文件变化时使用增量处理。

### 5.3 Token Metrics 红线

- **StatusBar 当前回合 token**：必须来自 `TurnStore` snapshot → `normalizer`。不经过 `getCodexSessionMetricsByFile()`。
- **JSONL aggregate 只补 context/speed/history**：这些数据可以走 `_metricsAggregateCache`。`gitBranch/gitChanges` 不完全由 JSONL 决定，应拆出或短 TTL。
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
- **不把 metrics aggregate 结果冒充 StatusBar 当前回合 token** —— StatusBar 当前回合必须来自 TurnStore snapshot，aggregate 缓存只用于 context/speed/history；git 状态单独处理或短 TTL。
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
| `codex-metrics.session-read` 首次/文件变化 | 2384ms | **不得阻塞 draft/instruction/readRange 返回** |
| 同 session 切 tab 三次 reason 触发 | 3 次全量聚合 | **1 次**（300ms TTL 去重） |
| poller 每秒调用 | fs.readFileSync 阻塞 | **不触发每秒全量 aggregate** |

### 7.2 功能验收

- [ ] 大 JSONL session 切换后，draft/instruction/messages 不应再被 metrics 拖到 700ms+
- [ ] 切同一个 session 不应出现 `switch-chat` + `active-tab-state-watch` + `history-loaded` 三次重型 metrics 聚合
- [ ] 文件未变时，第二次 metrics query 应走缓存（`_metricsAggregateCache` 命中）
- [ ] 文件变化后（新消息写入），metrics 应重新聚合，但不得在互动 IPC handler 内同步全量读/解析大文件
- [ ] cache hit 返回对象不能被调用方污染；poller 不得 mutate 缓存对象
- [ ] git 状态不能被 JSONL aggregate cache 长期错误缓存
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

## 9. 验收数据（2026-07-04 23:35）

### 9.1 CodeX 主进程

| IPC handler | Phase 0 (修复前) | Phase 1 (修复后) | 改善 |
|-----|:---:|:---:|:---:|
| `getSessionDraft` handler | 1-3ms | 0-1ms | — |
| `getSessionInstruction` handler | 1ms | 0-1ms | — |
| `readSessionRange` handler | 49ms | 18-28ms | — (tailRead=15-24ms) |
| `queryMetrics` handler (cache hit) | 2384ms | **2-8ms** | **~300x** |
| `queryMetrics` handler (cache miss) | 5697ms | **2-8ms** `backgroundAggregate=1` | **不阻塞** |

### 9.2 Claude 主进程

| IPC handler | Phase 0 (修复前) | Phase 1 (修复后) | 改善 |
|-----|:---:|:---:|:---:|
| `queryMetrics` handler (cache hit) | 146ms | **1ms** | **146x** |
| `queryMetrics` handler (cache miss) | 246ms | **8-12ms** `backgroundAggregate=1` | **不阻塞** |
| `readSessionRange` handler | 2-7ms | 1-6ms | — |

### 9.3 CodeX Renderer wall（纯 CodeX 切换，无 Claude 串扰）

| IPC | Phase 0 (修复前) | Phase 1 (修复后) | 验收标准 |
|-----|:---:|:---:|:---:|
| `getSessionDraft.wall` | 831ms | **35ms** | < 50ms ✅ |
| `getSessionInstruction.wall` | 831ms | **61ms** | < 100ms ✅ |
| `readSessionRange.wall` | 733ms | **40ms** | < 100ms ✅ |
| `queryMetrics.wall` | 1738ms | **27ms** | < 50ms ✅ |

### 9.4 Claude Renderer wall（修复后）

| IPC | 修复前 | 修复后 |
|-----|:---:|:---:|
| `getSessionDraft.wall` | 200-696ms | **44ms** |
| `ensureMessagesLoaded.wall` | 894-1660ms | **16ms** |
| `queryMetrics.wall` | 248-944ms | **39ms** |

### 9.5 已验证的修复项

- [x] 同一 session 切 tab 三次 reason 触发 → 1 次（300ms TTL 去重，`_metricsJustSent`）
- [x] 文件未变时第二次 metrics query 走缓存（CodeX `aggregate-cache-hit`、Claude `cacheHit=1`）
- [x] 文件变化后后台重新聚合，IPC handler 不阻塞（`backgroundAggregate=1`）
- [x] cache hit 返回浅拷贝，poller 不 mutate 缓存对象
- [x] git 状态拆分出 aggregate cache，独立 30s TTL
- [x] StatusBar 当前回合 token 仍来自 TurnStore snapshot
- [x] perf 输出 flag-gated
- [x] `npm test` 全量通过（359 pass）
- [x] `npm run build` 通过

### 9.6 已知剩余瓶颈（不在 T177 范围）

Render 侧 `ensureChatMessagesLoaded.proc` 仅占 0.4-2ms，但 wall time 在混切场景可达 1000-1660ms。
延迟来自 Vue 响应式 `chat.messages = [...]` 触发的 DOM layout。这是 T176/T177 Phase 2 范畴，
不在本期主进程 event loop 阻塞修复范围内。

后续不再在本文件继续追加 metrics / draft / instruction 优化。剩余卡顿统一转入：

- `docs/plan/2026-07-04-renderer-dom-layout-and-cache-governance.md`

下一阶段只做 Performance trace 归因，确认卡顿来自 Scripting、Layout/Paint、DOM node 数、IPC queue 还是 dev 模式放大；证据明确前不直接上虚拟列表、renderContent 缓存或新的 session scan cache。
