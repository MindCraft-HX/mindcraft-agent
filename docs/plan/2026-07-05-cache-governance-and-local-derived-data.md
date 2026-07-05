# T183 Cache Governance / Local Derived Data Boundary

> Date: 2026-07-05
> Status: registered, not implemented
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

### Phase 1: Shared Helper For File-Derived Caches

Goal: standardize repeated `Map + mtimeMs + size + clone` patterns.

Candidate owners:

- `packages/agent/electron/shared/localDerivedCache.js`

First migration candidates:

- `homeMetrics` line/trend cache.
- Claude / CodeX metrics aggregate cache wrappers, only if migration is low-risk.

Acceptance:

- Existing tests still pass.
- No behavior change.
- Perf probes still report cache hit/miss.

### Phase 2: Registry Read Cache Contract

Goal: make registry read caches explicit and side-effect free.

Scope:

- Draft read cache.
- Instruction read cache.
- Provider scan merge path, only for read-only merge.

Acceptance:

- Registry write/delete/detach invalidates relevant keys.
- Cache hit path performs zero registry writes.
- Existing session registry integration tests pass.

### Phase 3: In-Flight Dedup Contract

Goal: prevent promise dedup from becoming invisible stale UI.

Scope:

- Metrics refresh dedup.
- Session scan dedup.

Acceptance:

- Dedup has timeout cleanup.
- Interaction paths still show cache-first state.
- Repeated tab/session switching does not produce stale blank status.

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
