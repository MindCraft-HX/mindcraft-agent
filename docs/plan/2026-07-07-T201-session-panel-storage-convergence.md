# T201: Session / Panel Storage Convergence

> Date: 2026-07-07
> Status: planning
> Priority: P1
> Related: T165, T167, T175, T184, T185, T188, T199

## 1. Goal

Use the T199 audit as the implementation input and finish the next storage boundary move:

- move session identity/runtime metadata into SQLite
- keep `*-panel-state.json` focused on UI layout and restore scaffolding
- stop letting panel-state and registry compete as long-term authorities
- preserve official transcript and runtime file boundaries

This task is not "put everything into the DB". It is a boundary-convergence task.

## 2. Why T201 Exists

Provider storage is already SQLite-authoritative. Simple Chat metadata is already split. App-owned settings already have a facade.

The remaining fragmentation is concentrated in one area:

- `session-registry/`
- `claude-panel-state.json`
- `codex-panel-state.json`
- renderer localStorage restore hints

Today these layers still overlap on identity and runtime facts:

- `chatKey`
- `projectId`
- `cwd`
- `cliSessionId`
- `filePath`
- `model`
- `effort` / `reasoningEffort` / `modelTier`

That overlap is the real blocker for further storage cleanup and future UI work.

## 3. Hard Boundaries

T201 must keep these boundaries intact:

- Do not write MindCraft-owned metadata into `~/.claude`, `~/.codex`, project `.claude`, or project `.codex`.
- Do not migrate official transcript JSONL into SQLite.
- Do not migrate message bodies, file blobs, or uploaded file cache into SQLite.
- Do not reopen provider authority. Providers remain owned by T174/T195 repository flow.
- Do not collapse `chatKey`, `cliSessionId`, and `filePath` into one mixed identity field.

## 4. Target End State

### 4.1 SQLite owns

- session identity:
  - `chatKey`
  - `agent`
  - `projectId`
  - `cwd`
  - `title`
  - `titleSource`
  - `description`
  - timestamps
- provider/session binding:
  - `cliSessionId`
  - `filePath`
  - detached flags
  - binding source / repair status if needed
- runtime facts:
  - `model`
  - `effort`
  - `modelTier`
  - `reasoningEffort`

### 4.2 Panel-state owns

- active project/chat
- project/chat tab structure for UI restore
- collapsed/expanded state
- panel-local layout state

Panel-state may reference session rows by `chatKey`, but should not remain the durable authority for runtime identity fields.

### 4.3 Session-registry after T201

Session-registry should stop being the primary durable authority for identity/runtime facts.

Two acceptable end states:

1. keep `session-registry/` as a compatibility cache / projection during transition
2. reduce it to a smaller helper store for non-SQLite leftovers only

T201 should choose one path explicitly and document the exit window.

## 5. Recommended Schema Slice

Suggested initial tables:

```sql
CREATE TABLE sessions (
  chat_key TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  project_id TEXT,
  cwd TEXT,
  title TEXT,
  title_source TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE session_bindings (
  chat_key TEXT PRIMARY KEY,
  cli_session_id TEXT,
  file_path TEXT,
  detached_provider_binding INTEGER NOT NULL DEFAULT 0,
  resume_allowed INTEGER NOT NULL DEFAULT 1,
  source TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(chat_key) REFERENCES sessions(chat_key) ON DELETE CASCADE
);

CREATE TABLE session_runtime (
  chat_key TEXT PRIMARY KEY,
  model TEXT,
  effort TEXT,
  model_tier TEXT,
  reasoning_effort TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(chat_key) REFERENCES sessions(chat_key) ON DELETE CASCADE
);
```

Notes:

- Keep drafts and instructions out of the first T201 slice unless they are needed to remove a concrete authority conflict.
- Draft extraction can be a follow-up once session identity/runtime flow is stable.
- If SQLite schema needs source metadata for merge rules, keep it explicit rather than encoding it in ad hoc JSON blobs.

## 6. Migration Strategy

### Phase A: Repository and schema

- add DAO + repository for `sessions`, `session_bindings`, `session_runtime`
- expose one main-process facade
- keep read/write contracts explicit and source-aware

### Phase B: One-shot backfill

- read current `session-registry/` records
- normalize and import into SQLite
- rebuild any derived SQLite indexes
- do not delete source files yet

### Phase C: Read switch

- switch read paths to:

```text
SQLite -> session-registry fallback only when DB is empty or recovery is required
```

- panel-state restore should read session identity/runtime from SQLite-backed source, not from its own duplicated fields

### Phase D: Write switch

- provider scan writes SQLite first
- panel-state sync becomes layout-only or at most reference-only
- repair flow updates SQLite authority first, then rewrites panel-state references

### Phase E: Compatibility window

- keep `session-registry/` fallback for one release window
- explicitly document exit criteria in compatibility register

## 7. Acceptance Criteria

T201 is done only when these hold:

1. restart after normal use preserves:
   - active project/chat restore
   - correct title/cwd/model/runtime
   - correct `cliSessionId` / `filePath` binding
2. provider scan cannot be overwritten by stale panel-state runtime fields
3. empty or deleted SQLite can rebuild from fallback during compatibility window
4. panel-state no longer acts as a hidden second authority for model/runtime identity
5. Electron E2E covers at least:
   - start -> restore session list
   - scan/done -> metadata update
   - restart -> same active chat restored

## 8. Non-Goals

- no provider schema rewrite
- no Simple Chat message-body rewrite
- no transcript storage rewrite
- no token metrics migration
- no large localStorage cleanup beyond restore-critical keys

## 9. Risks

1. `readPanelState()` currently has side effects and can mutate registry on read.
2. `repairSessionRegistry()` is the only sanctioned chatKey rewrite path today.
3. `writeJsonAtomic()` still lacks `fsync()`.
4. renderer restore hints in localStorage may still mask ordering bugs during migration.

T201 should reduce these risks, not route around them with more temporary writes.

## 10. Execution Order

Recommended implementation order:

1. schema + DAO + repository
2. backfill tests
3. read switch
4. write switch
5. panel-state slimming
6. Electron E2E smoke
7. compatibility register update

## 11. Handoff Notes For ClaudeCode

- Start from `docs/plan/2026-07-06-T199-session-panel-storage-audit.md`.
- Treat `session-registry` as current authority only during migration, not as the desired end state.
- Do not widen scope into drafts/messages unless a concrete authority conflict forces it.
- Any fallback must be one-way and documented:

```text
SQLite authority -> fallback read only when DB missing/empty -> backfill -> return to SQLite authority
```
