# Provider Storage Migration Plan

> Date: 2026-07-03  
> Task: T174  
> Scope: make SQLite the authority for CodeX / ClaudeCode provider configuration.  
> Executor note: ClaudeCode should start from `docs/plan/2026-07-03-provider-storage-handoff.md`, then read this file together with `docs/STORAGE_ARCHITECTURE_ANALYSIS.md`, `docs/T163-import-feature.md`, and `AGENTS.md` before implementation.

## 1. Background

The recent import/export and performance work exposed the same structural issue repeatedly: provider configuration has no single authority.

Current provider-related state is spread across:

- CodeX legacy provider list: `~/.codex/providers.json`.
- CodeX official runtime config: `~/.codex/config.toml`.
- CodeX app defaults: `electron-conf` store `mindcraft-codex`.
- Claude provider list: `claude-internal.json` through `electron-conf`.
- Claude official runtime config: `~/.claude/settings.json`.
- System import path: writes SQLite and projects back to legacy stores.
- Export path: still reads legacy stores.
- Renderer provider panels: manage list order and active index through legacy IPC.

This is manageable for small fixes, but it blocks the next round of work:

- provider drag-and-drop ordering needs a stable persistent `sort_index`;
- import/export should read the same authority instead of separate legacy stores;
- active provider state should be one per agent type and not drift between DB, provider list, and official config;
- later settings/session migrations need a clear precedent for read fallback, backfill, projection, and cleanup.

## 2. Decision

Start the local storage refactor now, but only for providers.

Do not migrate session registry, panel state, chat history, uploaded files, or token metrics in this task.

The target for T174 is:

```text
Read:  SQLite provider repository -> legacy fallback -> backfill SQLite
Write: SQLite provider repository -> legacy projection -> official config projection only when required
```

SQLite becomes authoritative for MindCraft-owned provider records. Official CLI files remain official-schema projections only.

Official runtime files are not removable:

- CodeX still needs `~/.codex/config.toml` for official CLI/runtime behavior.
- ClaudeCode still needs `~/.claude/settings.json` for official CLI/runtime behavior.
- T174 should remove these files as provider authorities, not as runtime projections.
- Legacy MindCraft-owned provider persistence should be phased out after a compatibility window, otherwise SQLite authority would be undermined by permanent multi-channel writes.

## 3. Current SQLite Capacity And Dependency Position

The current implementation uses `sql.js`, not native `sqlite3` / `better-sqlite3`.

Practical implications:

- SQLite itself can handle far more than MindCraft provider/config data.
- `sql.js` keeps the database in memory and persists by exporting the DB file, so write cost scales with DB file size.
- For provider/config/settings/import metadata, expected DB size should stay well below 10 MB and is safe.
- If the DB grows beyond roughly 50-100 MB, or if writes become frequent and latency-sensitive, reassess `better-sqlite3`.
- Do not store chat transcripts, file blobs, uploaded files, large logs, or raw JSONL history in `mindcraft.db`.

Driver decision:

- Do not switch to `better-sqlite3` inside T174 unless current packaging/build constraints have already been solved.
- Keep the DB access layer driver-agnostic. Business code should depend on repository functions, not `sql.js` APIs.
- Moving from `sql.js` to `better-sqlite3` later should be a driver/adapter replacement, not a business-data migration, because both use SQLite database files.
- If a future phase stores many chat message bodies directly in DB, reassess the driver before that phase starts.

Expected local data profile:

| Data type | Expected size | SQLite/sql.js suitability |
|---|---:|---|
| Providers | tens/hundreds of rows | Good |
| Provider metadata | small JSON blobs | Good |
| Import/export audit summaries | hundreds/thousands of rows with retention | Good |
| Settings | small key/value records | Good |
| Session identity metadata | later phase, thousands of rows possible | Likely OK if no message bodies |
| Simple Chat thread/index metadata | later phase, small/medium metadata | Good |
| Simple Chat message bodies | append-heavy and potentially unbounded | Prefer userData files while using `sql.js` |
| Provider transcripts / JSONL | large and append-heavy | Do not store in SQLite for this phase |
| Uploaded files / blobs | large binary data | Do not store in SQLite |

## 3.1 Future Simple Chat Boundary

MindCraft's lightweight Chat is MindCraft-owned data, unlike ClaudeCode / CodeX official transcripts. It may eventually move into the unified storage architecture, but it should not be included in T174.

Recommended future T175 boundary:

```text
SQLite:
  chat_threads
  chat_message_index or last-message summaries
  provider/model/config metadata

userData/simple-chat:
  per-thread messages.jsonl
  attachments/
  large raw response payloads if needed
```

Suggested layout:

```text
{userData}/simple-chat/
  threads/
    <threadId>/
      messages.jsonl
      attachments/
```

Rationale:

- SQLite remains small and fast for thread lists, ordering, metadata, and future search indexes.
- Message bodies are append-heavy and may grow without a clear upper bound.
- Attachments and large payloads should never bloat `mindcraft.db`.
- The boundary is still explicit: DB owns thread identity/index; files own large message content.
- A later native SQLite driver can reopen the option of storing message bodies in SQL if product requirements justify it.

T174 must not create Simple Chat tables unless the implementation also includes a tested T175 migration. Avoid unused schema.

T175 table design may be sketched in documentation, but T174 should not add chat tables or columns to the live DB schema. Avoid premature schema that later becomes unused debt.

## 4. Maintenance Principle

The DB must not become an append-only dumping ground.

Rules:

- Every table needs a clear owner, read path, write path, and retention policy.
- Every JSON column must have a documented shape. Unknown imported source fields may be preserved only in metadata/audit, not projected into runtime config.
- Do not add a table just to avoid deleting legacy files. A migration must define the legacy fallback window and cleanup path.
- Add migrations forward-only. Do not rewrite historical migrations after release.
- Add indexes only for proven query paths.
- Keep backups/import runs bounded by retention policy; do not keep unlimited backup files.
- Do not store derived runtime metrics or large provider transcripts in provider/config tables.
- Prefer facades/repositories over direct DAO use from unrelated modules.

Recommended retention for this task:

- `import_runs`: keep latest 200 rows or latest 90 days, whichever is larger.
- DB backups under userData: keep latest 20 backup files per label family, unless user explicitly exports a backup elsewhere.
- Legacy provider files: keep during compatibility window; after a release or two, convert to read-only fallback, then remove writes.

## 5. Scope

### In Scope

- Add a provider repository/facade in main process.
- Add a v2 migration for provider ordering and projection bookkeeping.
- Backfill CodeX and Claude providers from legacy stores when DB is empty.
- Switch provider list IPCs to read/write through the repository.
- Keep legacy projection so older code paths and official config adapters keep working during transition.
- Switch system import/export to read/write through the repository.
- Add provider reorder persistence for T164 if UI implementation is included in the same work; otherwise leave repository API ready.
- Add contract tests for migration, fallback, backfill, write projection, active provider uniqueness, and ordering.

### Out Of Scope

- Session registry migration.
- Panel state migration.
- Chat transcript storage.
- Uploaded file cache migration.
- Token metrics storage changes.
- Full settings migration.
- Native SQLite dependency replacement.

## 6. Proposed Schema v2

Current `providers` table has no stable sort order and no projection bookkeeping.

Add a v2 migration:

```sql
ALTER TABLE providers ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE providers ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE providers ADD COLUMN last_projected_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_providers_agent_sort
  ON providers(agent_type, sort_index, updated_at);
```

Notes:

- `sort_index` is the provider list order shown in UI.
- `projection_status` is a small enum-like string: `unknown`, `ok`, `failed`, `not_required`.
- `last_projected_at` records successful legacy/official projection time.
- Do not add hard unique name constraints yet. Name conflicts are product-level decisions and import already supports skip/overwrite/rename.
- Active uniqueness should be enforced by repository transactions and covered by tests.

If implementation prefers a separate projection table later, keep v2 minimal and document the reason.

## 7. Provider Repository API

Create a main-process repository layer, for example:

```text
packages/agent/electron/providerStorage/
  index.js
  codexProjection.js
  claudeProjection.js
  legacyBackfill.js
```

Suggested API:

```js
async function listProviders(agentType)
async function getProvider(agentType, providerId)
async function saveProviders(agentType, { providers, activeId, source })
async function setActiveProvider(agentType, providerId)
async function reorderProviders(agentType, orderedIds)
async function backfillProvidersFromLegacy(agentType)
async function projectProvidersToLegacy(agentType)
```

Rules:

- Renderer and feature modules should not call provider DAO directly.
- Import/export should consume this repository, not legacy store adapters.
- Legacy fallback must be one-way: legacy -> SQLite backfill. After DB has records for an agent type, normal reads use DB.
- Writes must update SQLite first. If legacy projection fails, report failure and leave enough DB state to retry projection.
- Do not write MindCraft-owned metadata into `~/.claude` or `~/.codex` unless the field is official CLI schema.

## 8. Migration Flow

### Phase A: DB and DAO readiness

1. Add v2 migration and schema tests.
2. Update provider DAO ordering to use `sort_index ASC, updated_at DESC`.
3. Add DAO helpers for reorder and active-provider transaction.
4. Add bounded cleanup helpers for import runs/backups if not already present.

### Phase B: Repository and backfill

1. Build repository over DB + legacy adapters.
2. On first read per agent type:
   - if DB has providers, return DB providers;
   - if DB is empty, read legacy provider list;
   - insert legacy providers into DB with stable IDs where possible;
   - preserve current active provider;
   - persist DB and return DB-normalized records.
3. Add tests for empty DB backfill from CodeX and Claude legacy shapes.

Execution strategy:

- Prefer a vertical slice after DAO readiness.
- Build and test the CodeX slice first: repository, IPC, import/export, persistence reopen.
- Copy the pattern to Claude after the CodeX slice is stable.
- Preserve renderer payload shapes during the migration.

### Phase C: IPC switch

1. `codex-get-providers` and `claude-get-providers` read through repository.
2. `codex-set-providers` and `claude-set-providers` write through repository.
3. Existing renderer provider panels should not need a large rewrite.
4. Keep old data projection so old fallback files remain usable during transition.

### Phase D: Import/export switch

1. System import commits through repository, not direct DAO + ad hoc legacy projection.
2. Export reads from repository.
3. Hidden-key export tests must cover keys stored in both `provider.key` and provider config/env shapes.

### Phase E: Ordering

1. Implement `reorderProviders(agentType, orderedIds)` in repository.
2. Persist `sort_index`.
3. Project ordered list to legacy provider list during compatibility window.
4. UI drag-and-drop can be handled by T164 or included after repository tests pass.

T174 does not require visual drag-and-drop. It requires repository-level ordering to be correct and tested.

### Phase F: Projection retry and cleanup

1. On DB write, attempt legacy/official projection.
2. If projection succeeds, mark `projection_status = 'ok'`.
3. If projection fails, keep the DB write, mark `projection_status = 'failed'`, return a warning/error, and make retry possible on next read or explicit repair/apply.
4. Add cleanup helpers for `import_runs` and DB backups. Automatic scheduling may be deferred, but helper behavior should be tested.
5. Document the legacy provider-file compatibility window. Legacy projection is temporary rollback support, not a permanent authority.

## 9. Compatibility And Rollback

During the transition, keep legacy projection.

This means:

- A newer version writes SQLite and projects to legacy provider files.
- An older version can still read projected legacy provider files.
- If DB opening fails, repository may fall back to legacy read-only behavior and should report a warning.
- Do not delete legacy provider files in T174.

Once a release has proven stable, a later task can stop legacy writes and keep only read fallback for one more compatibility window.

## 10. Tests Required

Minimum automated coverage:

- v2 migration is idempotent and preserves v1 data.
- `sort_index` order is stable.
- active provider uniqueness is preserved per agent type.
- repository reads DB before legacy.
- repository backfills from CodeX legacy provider list.
- repository backfills from Claude legacy provider list.
- write path updates DB and projects to legacy.
- projection failure is reported and retryable.
- `sql.js` persistence survives reopen after a provider write.
- import commits through repository without losing conflict decisions.
- export reads DB-backed providers.
- hidden-key export redacts keys from both top-level provider fields and nested config/env fields.

Run at minimum:

```text
npm test
npm run test:undef
node --test packages/agent/electron/db/export/export.test.js
```

If T164 UI drag sorting is included, add focused renderer/component tests or a small E2E smoke checklist.

## 11. Acceptance Criteria

- CodeX and Claude provider lists are loaded from SQLite after first backfill.
- Existing user providers remain visible and active provider selection is preserved.
- Adding/editing/deleting/reordering providers survives app restart.
- CC Switch import and provider SQL export operate on the same repository-backed provider source.
- Legacy files are still projected so rollback to an older version is not immediately broken.
- No session registry, panel state, transcript, or metrics behavior changes are included.
- DB maintenance policy is documented and tests cover cleanup helpers if implemented.
