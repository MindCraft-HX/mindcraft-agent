# T172 Session Switch Performance — 真优化

> 日期：2026-07-02
> 状态：Phase 1 执行中
> 前置：T171（metrics 正确性收尾 + perf 量化，已合入 `959e569`）
> 范围：CodeX → ClaudeCode 两阶段

## 0. 背景

T171 完成了 metrics 正确性收尾和 perf 量化。当前瓶颈集中在切 tab / 点 session 后触发的后台任务，
尤其 metrics `session-read` 可能整文件读取 JSONL（`getCodexSessionMetricsByFile` / `getTokenMetrics` + `getSpeedMetrics`）。

T171 的 dedup + cache-first 解决了重复 IPC 和竞态，但**单次 IPC 本身的延迟没有降低**。
T172 要消除这个根本开销。

### 0.1 实测数据（2026-07-02 采样）

**CodeX 大 session full metrics 聚合耗时：**

| JSONL 大小 | tail 60 条 | full metrics cold | full metrics warm |
|---|---|---|---|
| 62 MB | 71 ms | 343 ms | 121 ms |
| 59 MB | 149 ms | 349 ms | 120 ms |
| 42 MB | 47 ms | 421 ms | 73 ms |

**Claude 大 session metrics 聚合耗时：**

| JSONL 大小 | token metrics | speed metrics | warm token |
|---|---|---|---|
| 36 MB | 625 ms | 75 ms | 419 ms |
| 34 MB | 728 ms | 89 ms | 558 ms |
| 34 MB | 776 ms | 92 ms | 628 ms |

**结论：**
- 即使用干净的测试环境单独跑 full metrics 聚合，冷读已 300-800ms，
  暖读仍 70-600ms。在 Electron dev + IPC 队列 + Vue 响应式 + console 输出的
  真实环境下，这个延迟被放大到秒级甚至数十秒。
- CodeX tail 60 条（47-149ms）远快于 full metrics，支持"切 tab 先读 tail"策略。
- Claude 读两次 JSONL（token + speed），Phase 2 合并为单次遍历可将暖读
  从 ~500ms 降到 ~300ms。
- CodeX 读历史时打印大量 `collectMessage: unhandled payload.type`，
  dev console 被大量大对象污染，也是 dev 模式卡顿的放大器。

## 1. 非目标

- 不重写 session registry
- 不改变 `chatKey` / `cliSessionId` / `filePath` 映射
- 不写 sidecar 到官方 `~/.claude` / `~/.codex` 目录。缓存如果需要，只能进 `userData/session-registry` 或已有 MindCraft 自有数据区
- 不重定义 StatusBar metrics 语义。当前回合状态栏仍然必须走 `normalizer → TurnStore → snapshot`
- 不重构 ClaudeCode / CodeX 整体组件
- 不重写 history hydrate / `loadMoreHistory` 语义

## 2. 目标

- 切 tab / 点 session 的第一帧只做轻量状态切换：选中态、缓存 metrics、scroll 恢复
- 大 JSONL metrics 聚合不阻塞 UI
- history hydrate 按需、可取消或过期丢弃
- metrics / draft / instruction 后台任务去重并避免旧结果覆盖当前 tab

## 3. 设计原则

| 原则 | 含义 |
|---|---|
| **cache first** | 切 tab 先显示 `tab.metrics` / `TurnStore` snapshot，不等待 IPC |
| **stale result guard** | 后台异步结果落回时，必须校验 `activeChatId === chat.id` 才更新 UI |
| **background refresh** | metrics 聚合用 `setTimeout(0)` 或 `requestIdleCallback` 分帧执行，不阻塞交互 |
| **per-session dedup** | 复用 T171 `createMetricsDedupTracker`，同一 session 只允许一个在飞 IPC |
| **no full-file read on interaction path** | 切 tab 同步段不做几十 MB 的 JSONL 全量读取 |

## 4. 实施计划

### Phase 1 — CodeX 先行（瓶颈最明显）

CodeX 的 `codex-metrics.session-read` sub-probe 已量化出 `getCodexSessionMetricsByFile` 是主要耗时。

#### 4.1a 标记交互热路径

在 `refreshMetricsForChat` 中区分两种调用来源：

- **interaction**：`reason === 'switch-chat'` 或 `reason === 'active-tab-state-watch'`
- **background**：`reason === 'scheduleCodexDoneMetricsRefresh'` 或 `reason === 'unknown'`

interaction 路径只做缓存优先显示 + 触发后台刷新，不等待 IPC 返回。

#### 4.1b 行为契约

| reason | 行为 |
|---|---|
| `switch-chat` | 立即显示 `tab.metrics` snapshot → 后台 IPC → 结果落回时 active guard 更新 |
| `active-tab-state-watch` | 同 `switch-chat` |
| `scheduleCodexDoneMetricsRefresh` | 等 IPC 返回后写入（已有逻辑，不变） |
| `unknown`（兼容） | 维持现有同步等待行为 |

#### 4.1c 状态栏优先显示 `tab.metrics` / TurnStore snapshot

当前已有 `hasAgentStatusBarSnapshot(chat.metrics || {})` 判断。对 interaction reason：
- 如果有 snapshot → `onMetricsUpdate({ ...chat.metrics })`，然后后台刷新
- 如果没有 snapshot → 显示默认空状态，后台刷新

不再在 interaction 路径上 `await ipcPromise`。

#### 4.1d 后台刷新 + stale guard

```js
// interaction 路径
if (hasSnapshot) {
  onMetricsUpdate({ ...chat.metrics, sessionId: chat.sessionId, thinking: false })
}
// 后台异步刷新，不阻塞返回
scheduleBackgroundMetricsRefresh(chat)
```

`scheduleBackgroundMetricsRefresh` 复用 `_codexMetricsTracker` 去重，
IPC 结果通过 `onMetricsUpdate` 回写（已有 `applyMetricsToTab` + `syncActiveMetricsFromTab`）。

已存在 T171 的做法：CodeX `onMetricsUpdate` 通过 `find` 找到对应 tab
并调用 `applyMetricsToTab`。需要在 `applyMetricsToTab` 或 `onMetricsUpdate`
确认 **写回的是当前 active tab** 才更新 StatusBar。

#### 4.1e 大 session 只读 tail / page

`readSessionFileRange(filePath, page, pageSize)` 已有分页读取能力。
切 session 后只读最近一页（page=0, pageSize=60），更早历史通过 `loadMoreHistory` 按需加载。
此项不做改动，仅确认现有语义符合预期。

#### 4.1f dev 日志降噪：CodeX unhandled payload 输出

CodeX 读历史消息时，`collectMessage` 对不认识的 `payload.type` 输出
`console.warn/error`，内容可能是大对象（整个 message payload）。
dev 模式下大量这类输出严重拖慢 console 渲染，也是卡顿放大器。

- 将 `collectMessage` 中的 `console.warn` / `console.error` 改为 `debugLog`
- 不改变处理逻辑，不扩大改动范围
- 降低 dev console 压力，间接改善 dev 模式切换体感

### Phase 2 — ClaudeCode 对齐

ClaudeCode 的瓶颈类似：`getTokenMetrics` + `getSpeedMetrics` 各自全量解析 JSONL。

#### 4.2a 单次遍历聚合

将 `getTokenMetrics` + `getSpeedMetrics` 合并为一次文件读取 + 一次遍历，
而不是两次独立调用各自全量解析。

```js
function getSessionMetrics(jsonlPath) {
  const lines = readJsonlLines(jsonlPath)
  let tokenMetrics = { ... }
  let speedMetrics = { ... }
  for (const line of lines) {
    // 一次遍历，同时收集 token 和 speed
  }
  return { tokenMetrics, speedMetrics }
}
```

#### 4.2b 后台化

同 CodeX Phase 1b：`switch-chat` 和 `active-tab-state-watch` reason
不再 `await ipcPromise`，改为 `scheduleBackgroundMetricsRefresh(chat)`。

其他逻辑（cache-first、stale guard、per-session dedup）T171 已完成，不变。

## 5. 验收

- [ ] 快速切换 10 次 tab，UI 不冻结（renderer 同步段 < 16ms）
- [ ] 大 session（>1000 条 message 的 JSONL）点击后立即显示已有内容或 loading，不等待 metrics full aggregate
- [ ] DevTools perf 中 `switchChat` 同步段仍为 ms 级
- [ ] `codex-metrics.session-read` 即使慢（如 >1s），也不阻塞切换第一帧
- [ ] StatusBar 不串 session、不残留旧 session 指标
- [ ] scroll 恢复正常
- [ ] `npm test` 通过（309 pass）
- [ ] `npm run build` 通过

## 6. 文件变更清单（预估）

### Phase 1 — CodeX

| 文件 | 改动 |
|---|---|
| `packages/agent/src/components/codeX/index.vue` | `refreshMetricsForChat` 按 reason 分流：interaction 异步化，不 await IPC |
| `packages/agent/electron/codexAgent.js` | `collectMessage` 的 `console.warn` → `if (CODEX_DEBUG)` + 去掉 `row` 参数，减少 dev console 大对象污染 |

### Phase 2 — ClaudeCode

| 文件 | 改动 |
|---|---|
| `packages/agent/electron/claudeAgent.js` | 合并 `getTokenMetrics` + `getSpeedMetrics` 为单次遍历 |
| `packages/agent/electron/claudeMetrics.js` | 新增 `getSessionMetrics(jsonlPath)` 统一聚合函数 |
| `packages/agent/src/components/claudeCode/index.vue` | `refreshMetricsForChat` 按 reason 分流（同 CodeX 模式） |

## 7. 风险与回滚

- **后台 IPC 完成时 tab 已切换**：已有 T171 active guard（`activeChatId.value === chat.id`），风险可控
- **大 JSONL 后台聚合吃 CPU**：聚合本身是 O(n) 遍历，单次最多几秒，不阻塞 UI；可考虑后续用 Worker
- **回滚**：每个 phase 独立可 revert，先 CodeX 合入验证后再做 ClaudeCode
