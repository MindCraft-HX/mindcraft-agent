# T174 Provider Storage Migration Handoff

> Date: 2026-07-03  
> Owner for implementation: ClaudeCode  
> Review target: make provider storage SQLite-authoritative without migrating session/panel/chat records.

> 2026-07-05 status: T174 implementation is complete. Keep this document as the original execution plan and acceptance checklist. Current state is summarized in `docs/STORAGE_ARCHITECTURE_ANALYSIS.md#11-current-implemented-state-after-t174`.

## 0. Completion Notes

Implemented state:

- SQLite provider storage is authoritative for CodeX and ClaudeCode provider records.
- Provider repository is implemented in `packages/agent/electron/db/providerStorage/`.
- DB schema is at v3. v2 added provider order/projection bookkeeping; v3 performs one-time Claude provider config cleanup.
- `codex-get-providers`, `codex-set-providers`, `claude-get-providers`, and `claude-set-providers` use repository-backed storage.
- System import/export uses repository-backed provider data.
- Legacy provider projection remains for rollback compatibility.
- Official runtime files remain explicit projections only: `~/.codex/config.toml` and `~/.claude/settings.json`.

Remaining follow-up:

- Define and execute the legacy projection removal window after the 1.1.x compatibility period.
- Implement T164 visual drag-and-drop sorting on top of existing repository ordering.
- Keep T175 Simple Chat storage separate; do not add chat message bodies to `mindcraft.db` while using `sql.js`.
- Harden direct repository `setActiveProvider()` semantics if future callers bypass full provider saves.

## 1. Read First

ClaudeCode should read these before coding:

1. `AGENTS.md`
2. `docs/STORAGE_ARCHITECTURE_ANALYSIS.md`
3. `docs/plan/2026-07-03-provider-storage-migration.md`
4. `docs/T163-import-feature.md`
5. `docs/session-pitfalls.md` only for storage boundary rules; do not migrate session data in T174.

## 2. Goal

Make SQLite the authority for CodeX and ClaudeCode provider configuration.

Provider reads and writes should go through a main-process repository:

```text
Read:  SQLite -> legacy fallback -> backfill SQLite
Write: SQLite -> legacy projection -> official config projection only when required
```

Keep rollback compatibility by continuing to project provider lists to legacy stores during the transition.

Important distinction:

- `~/.codex/config.toml` and `~/.claude/settings.json` are official runtime files. They cannot be eliminated. MindCraft may write only official-schema fields through explicit projection/activation adapters.
- Legacy MindCraft-owned provider persistence should be eliminated after the compatibility window. Examples: `~/.codex/providers.json` as a MindCraft provider list, `claude-internal.json` provider list, and provider-related `electron-conf` state.
- The end state is not "write the same provider facts everywhere"; the end state is SQLite authority plus required official runtime projections.

## 3. Non-Goals

Do not include these in T174:

- Simple Chat storage migration.
- Session registry migration.
- Panel state migration.
- ClaudeCode / CodeX official transcript migration.
- Uploaded file cache migration.
- Token metrics storage changes.
- Native `better-sqlite3` dependency switch.
- Deleting legacy provider files.

Simple Chat is tracked separately as T175. Its intended boundary is SQLite thread/index metadata plus userData message files.

## 4. Current Important Files

SQLite foundation:

- `packages/agent/electron/db/index.js`
- `packages/agent/electron/db/schema.js`
- `packages/agent/electron/db/migrations/v1_initial.js`
- `packages/agent/electron/db/dao/providers.js`
- `packages/agent/electron/db/dao/importRuns.js`
- `packages/agent/electron/db/db.test.js`

Import/export:

- `packages/agent/electron/db/import/index.js`
- `packages/agent/electron/db/import/systemImportIpc.js`
- `packages/agent/electron/db/export/providerSql.js`
- `packages/agent/electron/db/export/systemExportIpc.js`
- `packages/agent/electron/db/export/export.test.js`

Legacy provider storage:

- `packages/agent/electron/codexAgent.js`
- `packages/agent/electron/claudeAgent.js`
- `packages/agent/electron/codex/configIpc.js`
- `packages/agent/src/components/codeX/components/APISetting.vue`
- `packages/agent/src/components/claudeCode/components/APISetting.vue`

IPC registration:

- `packages/agent/electron/index.js`
- `packages/agent/preload/index.js`

## 5. Implementation Order

Implementation strategy:

- Prefer a vertical slice after DAO readiness. Do not build every layer for both agents before integration.
- Suggested first slice: CodeX, because its provider shape is simpler.
- CodeX slice should prove `repository -> IPC -> import/export -> persistence restart` before copying the pattern to Claude.
- Keep renderer payload shapes stable during the slice.

### Step 1: Fix Export Redaction First

Before provider migration, fix hidden-key export redaction:

- `includeSecrets: false` must redact keys from:
  - top-level provider key fields;
  - Claude `config.env.ANTHROPIC_AUTH_TOKEN`;
  - Claude `config.env.ANTHROPIC_API_KEY`;
  - CodeX auth/config shapes if present.
- Add tests to `packages/agent/electron/db/export/export.test.js`.

This is a safety bug and should not be hidden by the storage migration.

### Step 2: Add DB v2 Migration

Add a v2 migration and tests.

Minimum schema additions:

```sql
ALTER TABLE providers ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE providers ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE providers ADD COLUMN last_projected_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_providers_agent_sort
  ON providers(agent_type, sort_index, updated_at);
```

Keep migrations forward-only. Do not edit v1 after release.

### Step 3: Extend Provider DAO

Required behavior:

- `listProviders(agentType)` returns `sort_index ASC, updated_at DESC`.
- Upsert preserves or assigns `sort_index`.
- Add reorder helper, preferably transactional.
- Active provider remains unique per agent type.
- Tests cover v1 data after v2 migration.

### Step 4: Create Provider Repository

Create a main-process repository layer. Suggested location:

```text
packages/agent/electron/providerStorage/
  index.js
  codexProjection.js
  claudeProjection.js
  legacyBackfill.js
```

Repository should own:

- reading DB first;
- backfilling from legacy when DB is empty for an agent type;
- writing DB first;
- projecting to legacy provider lists;
- projecting official config only through existing official-schema adapters;
- reporting projection failure so it can be retried.

Projection retry policy:

- Use `projection_status` as the source of truth: `ok`, `failed`, `not_required`, or `unknown`.
- On write, update SQLite first, then attempt projection.
- If projection fails, keep the DB write, mark projection `failed`, return a warning/error to the caller, and do not silently hide the drift.
- On the next read or explicit provider repair/apply action, retry failed projections.
- Renderer-facing IPC should be able to surface a warning without leaking keys.

Business code should not call provider DAO directly.

### Step 5: Switch Provider IPC

Switch existing provider IPCs to repository-backed behavior while preserving renderer payload shapes:

- `codex-get-providers`
- `codex-set-providers`
- `claude-get-providers`
- `claude-set-providers`

Avoid large renderer rewrites. Existing provider panels should continue to receive their expected data shape.

### Step 6: Switch Import And Export

System import/export should use the same repository source.

Important:

- Import conflict decisions must not be lost.
- Import should not let CodeX providers enter Claude storage or vice versa.
- Export should read DB-backed providers after backfill.
- Existing neutral export wording should remain neutral; UI should not be branded as CC Switch export.

### Step 7: Ordering API

Implement repository support for ordering:

```js
reorderProviders(agentType, orderedIds)
```

Persist order in SQLite `sort_index` and project the ordered provider list to legacy storage.

UI drag-and-drop can be implemented in T164 or immediately after T174. Do not block T174 on UI if repository ordering is ready and tested.

T174 ordering acceptance is repository-level only:

- `reorderProviders()` persists `sort_index`.
- subsequent `listProviders()` returns the persisted order.
- legacy projection receives providers in the same order.
- visual drag-and-drop remains T164 unless explicitly added later.

## 6. Data Boundary Rules

MindCraft-owned provider records:

- SQLite authoritative.
- Legacy projection for compatibility window.

Official CLI config:

- `~/.codex/config.toml`
- `~/.claude/settings.json`
- Write only official schema fields through explicit adapter code.

Forbidden in T174:

- writing MindCraft metadata to official provider directories;
- storing chat transcripts or message bodies in `mindcraft.db`;
- storing file blobs in `mindcraft.db`;
- persisting current-turn token metrics in DB;
- using localStorage as a provider authority.

## 7. Maintenance Requirements

Do not make the DB append-only forever.

Implement or document:

- import run retention;
- backup retention;
- legacy projection compatibility window;
- projection retry/repair path;
- DB driver isolation so `sql.js` can later be replaced by `better-sqlite3`.

Minimum implementation expectation:

- Add cleanup helpers for import runs and DB backups, even if automatic scheduling is deferred.
- Cover cleanup helpers with focused tests.
- Register any deferred automatic cleanup scheduling as a follow-up TODO if not implemented in T174.

Recommended retention:

- `import_runs`: latest 200 rows or latest 90 days, whichever is larger.
- DB backups: latest 20 files per backup label family.

## 8. Tests

Minimum tests:

```text
npm test
npm run test:undef
node --test packages/agent/electron/db/export/export.test.js
```

Add focused tests for:

- v2 migration idempotency;
- v1 data preserved after v2;
- provider order by `sort_index`;
- active uniqueness per agent type;
- DB-first read;
- legacy fallback and backfill for CodeX;
- legacy fallback and backfill for Claude;
- write DB then legacy projection;
- projection failure reported and retryable;
- sql.js persistence across restart: write provider data, persist DB, reopen DB, verify data remains;
- import through repository;
- export from repository;
- hidden-key export redaction from nested config/env fields.

Electron E2E smoke is strongly recommended if the harness is ready:

- add provider -> restart -> provider still exists;
- switch active provider -> restart -> active selection remains.

If E2E harness is not ready, document the manual smoke steps and keep repository/main-process tests mandatory.

## 9. Acceptance Checklist

- Existing CodeX providers appear after first launch with the new storage path.
- Existing Claude providers appear after first launch with the new storage path.
- Active provider selection is preserved.
- Adding/editing/deleting providers persists after restart.
- Provider order persists after repository reorder.
- CC Switch import and provider SQL export use the same repository-backed provider source.
- Legacy provider files are still projected for rollback.
- No session/panel/Simple Chat migration is included.
- No unused Simple Chat schema is created.
- Legacy provider stores are projected only for rollback compatibility and have a documented removal path.
- Tests above pass.

## 10. Known Risk Points

- `sql.js` requires explicit persistence. Ensure writes call the DB persistence path.
- Legacy CodeX provider shape and Claude provider shape are not identical; preserve renderer-compatible payloads.
- Some provider key values may exist in nested config/env fields. Never log keys, prefixes, or lengths.
- Projection failure can create DB/legacy drift. Return a warning/error and make retry possible.
- Do not create unused Simple Chat tables in T174.
- Do not attempt to remove official CodeX/Claude runtime files. Only remove MindCraft-owned legacy provider authority after the compatibility window.
