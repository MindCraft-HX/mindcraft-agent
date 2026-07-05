# T183 Cache Governance / Local Derived Data Boundary

> Date: 2026-07-05
> Status: Phase 0-3 complete (2026-07-05)
> Related: T177, T179, T181, token metrics, session registry, provider scans

## 1. Why This Exists

Recent performance fixes proved that the app does need caching in several places, but the risk is not "too little cache" or "use Redis". The real risk is unmanaged local derived data:

- A cache hit can still do expensive side effects, such as registry upsert.
- Different modules invent their own key, TTL, signature, clone, and invalidation rules.
- Some data is source-of-truth state, while some is only derived from official transcripts.
- Electron does not automatically cache `fs.readFileSync`, JSONL parsing, session registry reads/writes, IPC queueing, or Vue DOM/Layout/Paint work.

This task is a governance task. It should not start by adding more caches.

## 2. Decision

Do not build a Redis-like global cache service.

Build a small shared cache governance layer for local derived data, with explicit ownership and invalidation. Keep caches close to their owning domain, but make their contract uniform.

Good target:

```js
getOrComputeCache({
  namespace,
  key,
  signature,
  ttlMs,
  compute,
  clone,
})
```

This helper is not a data store. It only standardizes in-memory derived cache behavior and observability.

## 3. Source Of Truth Rules

| Data | Source of truth | Cache allowed? | Notes |
| --- | --- | --- | --- |
| Official Claude / CodeX transcript | official JSONL | yes, derived read-only | never write sidecar beside official files |
| Session registry record | `userData/session-registry` | read cache allowed | registry writes must invalidate relevant caches |
| Draft / instruction | session registry | read cache allowed | not panel state, not provider transcript |
| Current live turn metrics | TurnStore / provider live samples | no historical cache as source | must not use session aggregate as current turn |
| Home historical usage | provider transcript aggregate | yes | historical consumer, separate from StatusBar |
| Provider scan raw summary | official transcript metadata | yes | cache raw provider summary only |
| UI project/chat/message tree | renderer state | do not cache full tree for tabs | summary views need lightweight projection |

## 4. Cache Classes

### 4.1 File-Derived Read Cache

Examples:

- JSONL line cache.
- Metrics aggregate cache.
- History page/tail cache.
- Home usage trend cache.

Required contract:

- Key includes file path.
- Signature includes at least `mtimeMs` and `size`.
- Values returned to callers are cloned or immutable.
- No writes to source files.
- Perf meta reports `cacheHit`, `signature`, and compute cost.

### 4.2 Registry Read Cache

Examples:

- Draft read cache.
- Instruction read cache.
- Provider binding lookup cache, if added later.

Required contract:

- Key includes registry root and `chatKey` or provider key.
- All registry write/delete/detach paths invalidate affected keys.
- Cache hit path must not write registry.
- Registry remains the source of truth.

### 4.3 In-Flight Dedup

Examples:

- Session scan promises.
- Metrics refresh promises.

Required contract:

- Always cleanup in `finally`.
- Add timeout cleanup for damaged IPC/promise paths.
- Dedup key must be non-empty and domain-specific.
- Dedup must not suppress cache-first UI display.

### 4.4 Renderer Hot Cache

Examples:

- Rendered markdown.
- Syntax highlight results.
- Draft text memory cache.

Required contract:

- Size bounded.
- No disk writes.
- No current-turn metrics persistence.
- Must not store full project/chats/messages for tab summary.

## 5. What Not To Do

- Do not introduce Redis or a Redis-shaped abstraction.
- Do not move session registry to SQLite under this task.
- Do not persist derived cache beside official transcript files.
- Do not let cache hit paths perform registry upsert or panel state writes.
- Do not make one global cache Map used by every subsystem.
- Do not cache current live turn metrics for later display as if they were fresh.
- Do not change token metric semantics.

## 6. Phase Plan

### Phase 0: Inventory And Contract

Goal: document current caches and classify them.

Deliverables:

- Create an inventory table covering owner, key, value, invalidation, TTL/signature, and side effects.
- Mark each cache as keep, wrap, split, or remove.
- Identify any cache hit path that still writes files.

No production code changes except optional diagnostic naming cleanup.

### Phase 0 Inventory (completed 2026-07-05)

#### 0.1 Classification Summary

| Class | Count | Description |
| --- | --- | --- |
| File-Derived Read Cache | 10 | JSONL line (×3), metrics aggregate (×2), trend, project panel state, JSONL path locator, git info, usage API |
| Registry Read Cache | 3 | Draft text (electron + renderer), instruction content |
| In-Flight Dedup | 3 | Claude + CodeX aggregate promise dedup, generic IPC promise dedup |
| Renderer Hot Cache | 4 | Markdown render, syntax highlight, streaming text throttle, animated number interpolation |
| Operational State (not cache) | 3 | turnStore, session poll info, history save timer |
| N/A (no caches found) | 9 | diagnosticsFileUtils, claudeMemory, skillsCatalogCache, codexTurnState, sessionInstructionAttachments, normalizer, useSessionRefresh, useInputHistory, useAgentMetricsTimer |

#### 0.2 Detailed Inventory — Electron Main Process

| # | File | Variable | Type | Key | Value | Source of Truth | TTL / Signature | Invalidation | Clone on Return? | Side Effects on Hit | Risk | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | `homeMetrics.js` | `_lineCache` | `Map` | `filePath` (absolute) | `{ lines, mtimeMs }` | Disk `.jsonl` | `mtimeMs` compare | ✅ ENOENT evict + mtime on next read | ✅ `[...cached.lines]` shallow copy | None | **L** — ✅ fixed in b98987f | **fixed** |
| E2 | `homeMetrics.js` | `_trendCache` | `Map` | `days` (1–90) | `{ time, data[] }` | Disk aggr from multiple `.jsonl` | 30s time-based | TTL only; max 90 keys | ❌ returns ref | None | **L** — bounded keys, short TTL | **wrap**: shallow copy `.map()` |
| E3 | `homeMetrics.js` | `_recentProjectCache` | scalar + `_recentProjectCacheTime` | N/A (single entry) | `{ hasRecent, projects[] }` | `claude-panel-state.json` + `codex-panel-state.json` | 30s time-based | TTL only | ❌ returns ref | Reads panel state JSON (official dirs) on miss | **M** — single-entry global, no key isolation | **split**: key by options hash, or document single-purpose |
| E4 | `claudeMetrics.js` | `sessionJsonlCache` | `Map` | `cliSessionId` | `filePath` (string) | Disk dir scan `~/.claude/projects/` | `fs.existsSync` on each hit | Entry deleted only in `resetSession()` / `clearClaudeMetricsCaches()`. Orphan entries accumulate | ✅ immutable (string) | None | **L-M** — entries accumulate forever, no eviction on file-not-found | **wrap**: `delete(key)` when `fs.existsSync` returns false |
| E5 | `claudeMetrics.js` | `jsonlLineCache` | `Map` | `filePath` (absolute) | `{ lines, mtimeMs }` | Disk `.jsonl` | `mtimeMs` compare | Cleared fully in `clearClaudeMetricsCaches()`; no per-entry eviction | ❌ returns ref | `perfStartIpc` probe | **M** — shared ref, duplicate of `_lineCache` (E1) | **wrap**: `[...cached.lines]`, evict on mtime mismatch, consider unifying with E1 |
| E6 | `claudeMetrics.js` | `_claudeAggregateCache` | `Map` | `filePath` | `{ mtimeMs, size, cwd, result }` | Disk `.jsonl` + computed metrics | `mtimeMs + size` dual signature | On read: delete entry if stat mismatch. Cleared in `clearClaudeMetricsCaches()` | ✅ `{ ...cached.result }` shallow clone | None | **L** — well-designed, dual-signature | **keep** |
| E7 | `claudeMetrics.js` | `_pendingClaudeAggregates` | `Map` | `filePath` | `Promise` | In-flight compute | Promise lifetime | `finally` block removes entry | N/A (promise ref) | Returns `null` on dedup hit (caller cannot await in-flight) | **L** — correct cleanup pattern | **keep** (consider returning the promise instead of null) |
| E8 | `claudeMetrics.js` | `gitCache` | `Map` | `cwd` | `{ branch, changes, timestamp }` | `git` subprocess | 30s time-based | TTL only | ❌ returns ref | None | **L** — short TTL, avoids subprocess | **keep** |
| E9 | `claudeMetrics.js` | `cachedUsageData` + `usageCacheTime` + `usageFetchInProgress` + `usageBlockedUntil` | scalars | N/A | `{ sessionUsage, weeklyUsage, ... }` | Anthropic Usage API | 180s TTL + rate-limit backoff | TTL + rate-limit cooldown | ❌ returns ref (low risk — never mutated) | Skip HTTP on hit | **L-M** — good design with backoff | **keep** |
| E10 | `claudeMetrics.js` | `sessionPollInfo` | `Map` | `cliSessionId` | `{ inputTokens, outputTokens, durationMs, ... }` | Derived at poll time | None | Only deleted in `resetSession()`; no TTL, no eviction | N/A (not returned as-is) | Updates entry in-place each poll | **M** — unbounded per-session entries | **wrap**: LRU or TTL-clean entries not polled in >5min |
| E11 | `sessionRegistry.js` | `_draftCache` | `Map` | `registryRoot::chatKey` | `{ text, updatedAt }` | Session record JSON on disk | None (invalidation-on-write) | ✅ `setSessionDraft()`, `clearSessionDraft()`, `deleteSessionRecord()`, **`upsertSessionRecord()`** (defensive, b98987f) | ✅ `{ text, updatedAt }` new object | `perfStartIpc` probe | **L** — ✅ fixed in b98987f | **fixed** |
| E12 | `sessionRegistry.js` | `_instructionCache` | `Map` | `registryRoot::instruction::chatKey` | `{ enabled, instructionId, description, content, attachments }` | Session record JSON + instruction record JSON on disk | None (invalidation-on-write) | Explicit in: `upsertSessionRecord()`, `setSessionInstruction()`, `setSessionTitle()`, `deleteSessionRecord()`. All write paths covered | ✅ `{ ...cached }` spread clone | `perfStartIpc` probe | **L** — well-designed, all write paths invalidate | **keep** |
| E13 | `sessionRegistry.js` | `keyMap` (in `repairSessionRegistry`) | `Map` (local) | old `chatKey` | new `chatKey` | Computed during repair | Function-scoped | GC when function returns | N/A | Writes panel state JSON (official dirs) — but as repair, not in cache hit path | **None** — local, ephemeral | **keep** |
| E14 | `turnStore.js` | `stores` + nested `turns` | `Map` of `{ currentTurn, turns: Map }` | `chatKey` | `{ currentTurn, turns: Map<turnId, FinalSnapshot> }` | In-memory aggregated from SDK events + JSONL polls | None (operational state, not cache) | Explicit: `removeStore()`, `clearCurrentTurn()`, `clearAllStores()`. Finalized turns never evicted | ✅ spread clone on read | None | **M** — finalized turns accumulate unbounded; potential memory leak in long sessions | **wrap**: cap historical turns per chatKey (e.g., last 100) |
| E15 | `codexAgent.js:665` | `jsonlLineCache` | `Map` | `filePath` (absolute) | `{ lines, mtimeMs }` | Disk `.jsonl` | `mtimeMs` compare | Same pattern as E1/E5 — implicit on next read. Cleared in `clearCodexCaches()` (line 619) | ⚠️ `cached.lines.slice(0, maxLines)` on hit — partial clone | None (sync path). Async path (`readJsonlLinesAsync`) also uses this cache | **M** — third copy of same JSONL cache pattern (see F2). Shared ref. Catch block returns `[]` silently | **wrap**: Phase 1 unify with E1/E5 helper |
| E16 | `codexAgent.js:669` | `_metricsAggregateCache` | `Map` | `filePath` | `{ mtimeMs, size, cwd, result }` | Disk `.jsonl` + computed metrics | `mtimeMs + size` dual signature | On read: delete if stat mismatch (line 680). Parallel to E6 | ✅ returns `{ result, cwd }` new object | None | **L** — well-designed, dual-signature, proper clone | **keep** |
| E17 | `codexAgent.js:685` | `_pendingAggregates` | `Map` | `filePath` | `Promise` | In-flight compute | Promise lifetime | `finally` + `.catch()` both delete entry (lines 693, 713). Parallel to E7 | N/A (promise ref) | Returns `undefined` (void) on dedup hit. On completion, pushes metrics via IPC to renderer | **L** — correct dedup + cleanup, plus IPC push | **keep** |

#### 0.3 Detailed Inventory — Renderer (agentCommon)

| # | File | Variable | Type | Key | Value | Source of Truth | TTL / Signature | Invalidation | Clone on Return? | Side Effects on Hit | Risk | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | `render.js` | `hljsCache` | `Map` | `"lang:code"` or `"auto:code"` | Highlighted HTML string | `highlight.js` library | None | FIFO eviction at 2000 entries | ✅ (string) | None | **L** — bounded FIFO, pure | **keep** |
| R2 | `render.js` | `renderCache` | `Map` | full Markdown source text | Rendered HTML string | `renderContent()` | None; max 128KB per entry | FIFO eviction at 800 entries | ✅ (string) | None | **L** — dual-bound (count + size) | **keep** |
| R3 | `useSessionDraft.js` | `_draftCache` (renderer side) | `Map` | `chatKey` (sessionId) | `{ text, updatedAt }` | IPC `getSessionDraft()` → electron `_draftCache` → disk | None | ✅ `clearDraftForChat()`. **FIFO cap at 200 entries** (b98987f) | ℹ️ updates `inputText.value` (Vue reactivity) | Sets `applyingRemote = true`, updates `inputText`, cancels persist timer | **L** — ✅ fixed in b98987f | **fixed** |
| R4 | `useScheduledSessionRefresh.js` | `_cooldowns` | `Map` | `project.id` | `Date.now()` timestamp | Last refresh time | 15s staleness window | Overwrite on each successful refresh; never deleted | N/A (used as guard) | Calls `setLoading()`, `setRefreshing()`, triggers IPC refresh | **L-M** — theoretically unbounded but practically flat | **keep** (consider cleanup on project close) |
| R5 | `useStreamingText.js` | `displayText` | `ref(string)` | N/A (single per-instance) | Throttled copy of `msg.text` | `textGetter()` closure → external `msg.text` | 50ms update interval | `flush()` force-sync; `onBeforeUnmount` cleanup | N/A (local ref) | None — only updates ref | **L** — single string, component-scoped | **keep** |
| R6 | `useAgentHistory.js` | `cooldownGuard` (closure) | `let` number | N/A | `lastMs` timestamp | Current time | 500ms cooldown window | Updated on every allowed call | N/A (guard only) | `perfCount('saveHistory.cooldownSkip')` | **L** — single number | **keep** |
| R7 | `useAgentHistory.js` | `historySaveTimer` | `setTimeout` ID | N/A | Timer handle | Debounce timer | 2000ms debounce | Cleared before setting new | N/A | Triggers `persistNow()` | **L** — standard debounce | **keep** |
| R8 | `useChunkedHistoryMount.js` | `chat._chunk` | temp object property | `chat.id` (implicit) | `{ pending[], active, idleId, _doneResolve }` | Incoming `allMessages` array | Chunk lifecycle | `finishMount()` / `discardMount()` clean up | N/A | Mutates `chat.messages` via `unshift()` | **M** — orphaned `_chunk` can persist if caller never calls `discardMount` | **keep** (ensure all callers go through lifecycle) |
| R9 | `metricsDedupHelper.js` | `_inFlight` | `Map` | arbitrary string key | `Promise` | Pending IPC call | Promise lifetime | Auto-clean in `.finally()` with identity check | N/A | Caller uses `has(key)` to skip; no writes | **L** — well-designed, auto-clean | **keep** |
| R10 | `useAnimatedNumber.js` | `target` / `rate` / `lastTime` | local `let` vars | N/A | Numbers | Caller `update(newTarget)` | Animation lifecycle | `reset()` / value-drop detection | N/A | `requestAnimationFrame` loop | **L** — component-scoped | **keep** |
| R11 | `useAgentMetricsController.js` | `metricsData` | `ref({...})` | N/A | 21-field metrics snapshot | `tab.metrics` | Session lifetime | `resetActiveMetrics()` on switch | ✅ computed from tab | Vue bindings read passively | **L** — bounded fields, explicit reset | **keep** |

#### 0.4 Cache Hit Path Side Effect Audit

> Per §5 requirement: "Do not let cache hit paths perform registry upsert or panel state writes."

| Cache | Registry Write on Hit? | Panel State Write on Hit? | Official Dir Write on Hit? | Heavy IPC / Scan on Hit? | Verdict |
| --- | --- | --- | --- | --- | --- |
| `_draftCache` (E11) | ❌ No — read-only get | ❌ No | ❌ No | ❌ No (`perfStartIpc` probe only) | ✅ Clean |
| `_instructionCache` (E12) | ❌ No — read-only get | ❌ No | ❌ No | ❌ No (`perfStartIpc` probe only) | ✅ Clean |
| `_lineCache` (E1) | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Clean |
| `jsonlLineCache` (E5) | ❌ No | ❌ No | ❌ No | ⚠️ `perfStartIpc` probe | ✅ Probe only, no data I/O |
| `_claudeAggregateCache` (E6) | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Clean |
| `_recentProjectCache` (E3) | ❌ No | ❌ No | ⚠️ Reads panel state JSON on miss (not hit path) | ❌ No | ✅ Hit path is clean; miss reads official dirs (documented) |
| `_draftCache` (R3, renderer) | ❌ No | ❌ No | ❌ No | ⚠️ Calls IPC `getSessionDraft()` on miss only | ✅ Hit path is clean |
| `_cooldowns` (R4) | ❌ No | ❌ No | ❌ No | ⚠️ Triggers IPC refresh on miss only | ✅ Hit path skips refresh entirely |
| `stores` (E14, turnStore) | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Not a cache, but read path is clean |
| `jsonlLineCache` (E15, codexAgent) | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Clean |
| `_metricsAggregateCache` (E16, codexAgent) | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Clean |
| `_pendingAggregates` (E17, codexAgent) | ❌ No | ❌ No | ❌ No | ⚠️ Pushes metrics via IPC on completion (not on cache hit) | ✅ Hit path skips entirely; IPC push is fire-and-forget from `finally` |

**Conclusion: No cache hit path performs registry writes, panel state writes, official directory writes, or re-triggers heavy IPC/scan.** All cache hit paths are read-only and side-effect-free (aside from perf probes).

#### 0.5 Critical Findings

> ✅ F1, F3, F4 fixed in `b98987f` (Phase 0 revision). F2 deferred to Phase 1. F5 is a design note.

| ID | Severity | File | Description | Status |
| --- | --- | --- | --- | --- |
| **F1** | ~~Medium~~ | `sessionRegistry.js:631` | `upsertSessionRecord()` 未清理 `_draftCache`（仅清理了 `_instructionCache`）。已加防御性 `_draftCache.delete()`，含 orphan keys。 | ✅ fixed b98987f |
| **F2** | **Medium** | `claudeMetrics.js` + `homeMetrics.js` + `codexAgent.js` | `jsonlLineCache` / `_lineCache` / `jsonlLineCache` 三个模块重复缓存同一批 `.jsonl` 文件。Phase 1 shared helper 的输入。 | ⏳ Phase 1 |
| **F3** | ~~Medium~~ | `homeMetrics.js` (`_lineCache`) | 文件删除后 catch 返回过期数据。已修复：ENOENT 时 evict + return `[]`，命中时返回 `[...cached.lines]`。 | ✅ fixed b98987f |
| **F4** | ~~Medium~~ | `useSessionDraft.js` (`_draftCache` renderer) | Map 无界增长。已修复：FIFO cap 200 条，`_draftCacheSet()` helper。 | ✅ fixed b98987f |
| **F5** | **Low** | `claudeMetrics.js` (`_pendingClaudeAggregates`) | Dedup 命中返回 `null` 而非 pending promise。设计取舍 — fire-and-forget 后台预热器。 | ⚠️ design note |

#### 0.6 Cross-Cutting Issues

1. **No unified `clearAllCaches()` mechanism.** Each module manages its own caches independently. `clearClaudeMetricsCaches()` only clears claudeMetrics caches. SessionRegistry caches are handled separately. `homeMetrics` has no clear function at all (only TTL-based eviction for some caches).

2. **No `WeakMap` usage anywhere.** All caches use `Map` with strong references. Entries live until explicitly deleted or process exit. For file-backed caches this is acceptable if eviction is correct; for poll state (`sessionPollInfo`, finalized turns in `turnStore`) it's a memory leak vector.

3. **Inconsistent clone discipline.** 5 of 17 caches return internal references without cloning (E2, E3, E5, E8, E9). 7 properly clone via spread/new object (E1, E4, E6, E11, E12, E14, E16). 1 does partial clone via `.slice()` (E15). 4 are N/A (promise refs or local scope).

4. **`mtimeMs` vs `mtimeMs + size` signature.** Only `_claudeAggregateCache` uses the dual-signature pattern. The other mtime-based caches are vulnerable to fast rewrites or truncations that preserve mtime.

5. **No centralized eviction policy.** No LRU, no size caps (except render.js caches), no weak-ref, no TTL-based cleanup sweep. Cache entries are only evicted on explicit delete or (for TTL caches) on the next read after expiry.

#### 0.7 Action Summary

| Action | Count | Items |
| --- | --- | --- |
| **migrated** (Phase 1) | 5 | E1, E5, E6, E15, E16 — migrated to `createFileDerivedCache` |
| **migrated** (Phase 3) | 2 | E7, E17 — migrated to `trackDedup` (timeout cleanup) |
| **keep** | 14 | E8, E9, E12, E13 (4 electron) + R1, R2, R4, R5, R6, R7, R8, R9, R10, R11 (10 renderer) |
| **wrap** | 3 | E2, E4, E10 — still need clone or eviction (deferred) |
| **split** | 1 | E3 (key by options hash or document single-purpose) |
| **fixed** (Phase 0) | 2 | E11 (defensive _draftCache delete), R3 (FIFO cap 200) |
| **fixed** (Phase 2) | 2 | E11, E12 — repairSessionRegistry clears stale cache after chatKey rename |
| **remove** | 0 | No caches should be removed at this stage |

### Phase 1: Shared Helper For File-Derived Caches ✅ (completed 2026-07-05)

Goal: standardize repeated `Map + mtimeMs + size + clone` patterns.

**Implemented:** `packages/agent/electron/shared/localDerivedCache.js` — `createFileDerivedCache({ signature, clone })` factory.

**API:** returns `{ get, set, has, delete, clear }`. `get()` auto-stats the file, checks signature, evicts on ENOENT/signature mismatch, applies clone on hit. `set()` captures stat signature internally. Each call returns an independent instance (no global singleton).

**Migrated caches (5/5):**

| Step | Cache | File | Pattern | Status |
| --- | --- | --- | --- | --- |
| E1 | `_lineCache` | `homeMetrics.js` | mtimeMs | ✅ migrated |
| E6 | `_claudeAggregateCache` | `claudeMetrics.js` | mtimeMs+size | ✅ migrated |
| E5 | `jsonlLineCache` | `claudeMetrics.js` | mtimeMs | ✅ migrated (gained clone + ENOENT) |
| E16 | `_metricsAggregateCache` | `codexAgent.js` | mtimeMs+size | ✅ migrated (gained clone on GET) |
| E15 | `jsonlLineCache` | `codexAgent.js` | mtimeMs | ✅ migrated (2 callers, gained clone + ENOENT) |

**Test coverage:** `localDerivedCache.test.js` — 18 cases covering Pattern A/B, clone variants, ENOENT, edge cases. All existing tests pass (home-metrics, claude-context-usage, codex-git-metrics, codex-turn-tokens, codex-history-load-performance, sessionRegistry*, panel-composable-chain, undef).

**Not migrated (deferred to Phase 2/3):** TTL-based caches (E2, E3, E8, E9), registry read caches (E11, E12, R3), in-flight dedup (E7, E17), renderer caches (R1–R11).
- Perf probes still report cache hit/miss.

### Phase 2: Registry Read Cache Contract ✅ (completed 2026-07-05)

Goal: make registry read caches explicit and side-effect free.

Scope:

- Draft read cache.
- Instruction read cache.
- Provider scan merge path, only for read-only merge.

**Completed:**

- `repairSessionRegistry` now calls `_draftCache.clear()` + `_instructionCache.clear()` after chatKey rename operations. Stale cache entries for old chatKeys are harmless but wasteful — clearing them prevents lookups from holding stale data.
- All write paths (setSessionDraft, clearSessionDraft, deleteSessionRecord, upsertSessionRecord, etc.) already invalidate relevant keys (fixed in Phase 0).

Acceptance:

- ✅ Registry write/delete/detach invalidates relevant keys.
- ✅ Cache hit path performs zero registry writes.
- ✅ Existing session registry integration tests pass (43/43).

### Phase 3: In-Flight Dedup Contract ✅ (completed 2026-07-05)

Goal: prevent promise dedup from becoming invisible stale UI.

**Completed:**

- Added `trackDedup(map, key, promise, timeoutMs=60000)` to `localDerivedCache.js`. Races the promise against a timeout; the dedup slot is released on whichever settles first. If the timeout fires first, the underlying promise keeps running — only the slot is freed.
- **E7** (`claudeMetrics.js` `_pendingClaudeAggregates`): migrated to `trackDedup`. Also fixed F5: on dedup hit, now returns the in-flight promise instead of `null`, so callers can await the already-running aggregate.
- **E17** (`codexAgent.js` `_pendingAggregates`): migrated to `trackDedup`. Manual `set/delete/finally/catch` replaced with single `trackDedup` call. Timeout prevents a hung aggregate from permanently blocking the dedup slot.

Scope:

- Metrics refresh dedup (E7, E17).
- Session scan dedup (R9 — deferred, low priority).

Acceptance:

- ✅ Dedup has timeout cleanup (60s default).
- ✅ Interaction paths still show cache-first state.
- ✅ Existing tests pass (claude-context-usage, codex-git-metrics, codex-turn-tokens, codex-history-load-performance).

## 7. Acceptance Criteria

- Every cache has a named owner, key, value, invalidation rule, and source of truth.
- No cache hit path writes official files or registry files except documented repair paths.
- Home/StatusBar/TokenMetaRow metric consumers remain separated by contract.
- Session registry remains authoritative for MindCraft session metadata.
- No new global cache singleton is introduced.
- At least one representative cache is migrated to the shared helper with tests.

## 8. Handoff For ClaudeCode

Task: T183 Cache Governance / Local Derived Data Boundary.

Start with Phase 0 only.

Steps:

1. Inventory existing caches in `packages/agent/electron/**` and `packages/agent/src/components/agentCommon/**`.
2. Classify each cache as file-derived, registry read, in-flight dedup, renderer hot cache, or source-of-truth state.
3. Update this document with the inventory table.
4. Do not write production cache helper code in Phase 0 unless the inventory exposes a trivial naming-only cleanup.

Forbidden:

- Do not introduce a global cache service.
- Do not move registry to SQLite.
- Do not alter token metric formulas.
- Do not write anything into official `~/.claude` or `~/.codex` directories.
- Do not refactor ClaudeCode / CodeX lifecycle while doing cache inventory.
