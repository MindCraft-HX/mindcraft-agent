# MindCraft Storage Architecture Roadmap

> Last updated: 2026-07-06  
> Scope: SQLite foundation, CC Switch import, local storage migration, and final storage boundaries.

## 1. Decision

MindCraft should introduce a SQLite-backed storage layer, but migration must be staged. The immediate goal is not to replace every JSON/localStorage/electron-conf path at once. The goal is to establish a durable storage foundation, use it for new import flows first, then migrate existing MindCraft-owned data only where the boundary is clear.

Current decision:

| Topic | Decision |
|---|---|
| SQLite foundation | Build first, with migrations, DAO boundaries, backup, and contract tests. |
| CC Switch import | Implement early as a global System Settings import, because one CC Switch SQL export can contain both Claude and CodeX providers. |
| Provider storage migration | Implemented in T174 and tightened in T195. SQLite is now the authority for CodeX / ClaudeCode provider records; legacy provider writes are stopped and read fallback remains during the compatibility window. |
| Full local storage migration | Do later, module by module, after the provider/import path is stable. |
| Official CLI directories | Do not replace. Continue using official paths only for official CLI/SDK data. |
| Existing provider-page import UI | Keep the compact `Import` button style, but scope it to local CLI config import only. CC Switch must not live in a single-agent provider panel. |

## 1.1 Current Implemented State After T174

Provider storage is no longer a future-only design. The current implementation state is:

- Live schema version is v3 (`packages/agent/electron/db/schema.js`).
- Provider repository lives at `packages/agent/electron/db/providerStorage/`.
- CodeX / ClaudeCode provider reads and writes go through the repository-backed main-process IPC path.
- DB reads are authoritative after backfill: `SQLite -> legacy fallback only when DB is empty -> backfill SQLite`.
- Writes update SQLite first.
- Provider legacy writes were stopped in T195; old provider stores remain read fallback only for rollback/recovery, not permanent authorities.
- Official runtime files remain required external contracts:
  - CodeX: `~/.codex/config.toml`.
  - ClaudeCode: `~/.claude/settings.json`.
- Official runtime files are written only through explicit activation/repair adapters and must stay official-schema compatible.
- Claude provider shape normalization is centralized in `packages/agent/electron/db/providerStorage/claudeShape.js`.
- DB v3 performs one-time cleanup for historical Claude provider config pollution, moving MindCraft-only fields such as app locale, website, note, and permission policy into metadata where appropriate.
- T174 intentionally did not migrate session registry, panel state, Simple Chat records, official transcripts, file blobs, or token metrics.

Known follow-up items:

- T164 still owns visual drag-and-drop sorting; T174 only needs repository-level ordering correctness.
- T175 still owns Simple Chat storage.
- T198 should consolidate app-owned settings storage without reopening provider authority.
- T199 should audit session/panel storage boundaries before any larger session metadata migration.
- If future code calls repository `setActiveProvider()` directly, ensure it remains consistent with the no-legacy-write model; current UI paths mostly save through `setProviders()`, but the repository API should remain hard to misuse.

## 2. Current Problems

MindCraft currently has several independent storage mechanisms:

| Mechanism | Examples | Problem |
|---|---|---|
| electron-conf | `mindcraft-codex`, `claude-internal`, app config | Multiple independent stores with no shared schema or migration. |
| Hand-written JSON | `app-settings.json`, `theme.json`, `session-registry/`, `*-panel-state.json` | Read-modify-write patterns are duplicated and not consistently atomic. |
| localStorage / Pinia persist | `codexConfig`, `claudeTheme`, locale, shortcuts, route memory | Shared origin across windows can leak window-specific state. |
| IndexedDB | uploaded file cache | Useful for browser-side blobs, but separate from app data lifecycle. |
| Official CLI files | `~/.codex/config.toml`, `~/.claude/settings.json`, transcripts | Must remain official-schema only; MindCraft-owned metadata must not be stored here. |

Known high-value fixes:

- `app-settings.json` is written by both `electron/mainModules/settingsStore.js` and `packages/agent/electron/diagnosticsFileUtils.js`.
- CodeX provider state is distributed across `electron-conf`, `~/.codex/providers.json`, `~/.codex/config.toml`, and renderer state.
- `session-registry/` and `*-panel-state.json` overlap. The former should own session identity; the latter should only own UI layout/panel state.
- Some localStorage values are global per origin, which is unsafe for multi-window or window-specific state.

## 3. Storage Boundary

SQLite should become the authority for MindCraft-owned app data. It should not become a copy of all official provider data.

| Data | Authority | Notes |
|---|---|---|
| Provider list, selected provider, import metadata | SQLite | Project only to official config files when required; do not restore legacy provider writes. |
| App settings, diagnostics toggles, locale, theme | Single settings facade first; SQLite optional later | Device-local settings do not need forced DB migration if a single owner/facade is enough. |
| Lightweight Chat threads and indexes | SQLite in a later phase | Message bodies should stay in userData files while using `sql.js`, unless a later native driver decision changes this. |
| Lightweight Chat message bodies and attachments | userData files in a later phase | Prefer `{userData}/simple-chat/threads/<threadId>/messages.jsonl` plus attachment files; DB stores identity/index/summary only. |
| Session identity: `chatKey`, `cliSessionId`, `filePath`, title, cwd, runtime model | SQLite | Does not replace official transcript JSONL. |
| Panel layout, expanded/collapsed UI, drafts | Panel state or later SQLite UI table | Must not own provider session identity. |
| Claude/Codex transcripts | Official CLI directories | Read for history and mapping; do not add MindCraft sidecars. |
| Official CLI config | `~/.claude`, `~/.codex` | Write only official schema fields through explicit adapter code. |
| Uploaded file cache | IndexedDB or later dedicated blob/cache storage | Not part of the first SQLite migration. |

## 4. Phased Plan

### Phase 0: SQLite Foundation

Build the infrastructure without moving existing behavior yet.

Target files:

```text
packages/agent/electron/db/
├── index.js
├── schema.js
├── migrations/
│   └── v1_initial.js
├── dao/
│   ├── providers.js
│   └── settings.js
├── import/
│   └── ccSwitch.js
└── backup.js
```

Requirements:

- Database path: `{userData}/mindcraft.db`.
- Use `PRAGMA user_version` or a migrations table.
- Every write path must run inside a transaction where more than one table/file projection is affected.
- Add backup helpers before any destructive import or migration.
- Add contract tests for migration idempotency and schema version.
- Do not migrate panel/session data in this phase.

Dependency note:

- Current dependency: `sql.js`, because it avoids Electron native rebuild risk.
- Long-term candidate: `better-sqlite3`, if DB size or write frequency outgrows `sql.js`.
- Business code must use repository/facade APIs rather than depending on `sql.js` directly, so a future driver switch is an adapter replacement instead of a business migration.

### Phase 1: Global Config Import + CC Switch Provider Import

Replace the current agent-bound CC Switch import with a global System Settings import entry. Provider-page import buttons remain compact and local-only.

UI:

- System Settings should include a compact `Import Config` / `导入配置` action.
- The System Settings import dialog initially focuses on CC Switch SQL import.
- ClaudeCode and CodeX provider pages keep the existing compact `Import` / `导入` button style.
- Provider-page `Import` opens a confirmation dialog and imports local CLI config only:
  - CodeX: local `~/.codex/config.toml`.
  - ClaudeCode: local `~/.claude/settings.json`.
- Do not mention CC Switch from the provider-page local import confirmation. CC Switch is a system-level import path.
- The old "Import from MindCraft" entry should be removed from normal UI.

Flow:

```text
System Settings -> Import Config
  -> choose CC Switch .sql
  -> parse source once
  -> show preview
  -> group preview by agent_type: CodeX / ClaudeCode / skipped
  -> choose add/overwrite/rename/skip strategy
  -> backup current provider state
  -> write SQLite provider DAO per agent_type
  -> project only supported fields to existing provider storage during transition
  -> reload provider lists
```

CC Switch import must not assume fixed column order. Current CC Switch exports use explicit column names in `INSERT INTO "providers" (...) VALUES (...)` form, and the source schema may evolve. The importer should:

- Validate the CC Switch export header where present.
- Parse `INSERT` statements with explicit columns.
- Support SQLite string escaping (`''`), `NULL`, numbers, and JSON strings.
- Extract `settings_config` JSON.
- Accept both older and newer field names: `api_key`, `api_base`, `base_url`, `model`, `reasoning_effort`, `api_format`, `provider_name`, `name`.
- Filter to supported `app_type` values: `claude`, `codex`, and aliases if confirmed.
- Preserve unknown source data only in SQLite metadata for audit. Do not project unknown CC Switch fields into current CodeX/Claude runtime config.
- Never let a Claude provider enter the CodeX legacy provider list, or a CodeX provider enter the ClaudeCode legacy provider list.

Conflict and safety rules:

- New name: default action is `add`.
- Same name and same normalized config: default action is `skip`.
- Same name but different normalized config: default action is `skip`; user may choose `overwrite`, `rename`, or `skip`.
- `overwrite` must resolve a concrete existing provider identity and remove/replace the old projected legacy entry. Name-only matching is acceptable for legacy stores only if duplicate names are handled explicitly.
- `rename` should use a deterministic suffix such as `Name (CC Switch)` and avoid duplicate final names.
- Imported `is_current` must be handled per agent type. One active CodeX provider and one active ClaudeCode provider are allowed.
- Do not change current active provider by default. If adding this behavior, gate it behind an explicit checkbox in the preview dialog.
- Take a DB/provider-state backup before commit. On projection failure, report failure and do not leave a partially projected provider list.

Provider ordering:

- Provider records need a stable ordering field before or during provider storage migration.
- Add drag-and-drop sorting to provider lists once imported provider count commonly exceeds five or six.
- Reorder should persist in MindCraft-owned storage and then project to the current legacy list order during the transition.

### Phase 2: Provider Storage Migration

Make SQLite the authority for MindCraft provider records.

Execution entry: `docs/plan/2026-07-03-provider-storage-migration.md`.

Status: implemented in T174. Keep this section as the boundary contract and regression checklist.

During the transition, keep compatibility projections:

| Target | Purpose |
|---|---|
| SQLite `providers` table | Authoritative MindCraft provider records. |
| Existing `codexGetProviders` / `claudeGetProviders` IPC | Reads through DAO, fallback to legacy files if DB is empty. |
| `~/.codex/config.toml` / `~/.claude/settings.json` | Written only through explicit repair/activate adapters. |
| Legacy JSON/electron-conf | Read fallback only, then backfill SQLite. |

Current provider write strategy:

```text
Read: SQLite -> legacy fallback -> backfill SQLite
Write: SQLite -> required official config projection
Legacy provider writes: stopped in T195
```

This phase should not change session restoration logic.

Phase 2 implementation boundaries:

- Add a provider repository/facade in the main process; renderer and feature modules should not call provider DAO directly.
- Add a v2 migration for provider ordering and projection bookkeeping, including `sort_index`.
- `codex-get-providers` / `claude-get-providers` should read through the repository and backfill SQLite from legacy stores only when DB is empty for that agent type.
- `codex-set-providers` / `claude-set-providers`, system import, export, activation, and future reorder should write through the repository.
- Keep legacy read fallback during the compatibility window so rollback or DB recovery can still rebuild provider rows.
- Do not migrate session registry, panel state, transcripts, uploaded file cache, or token metrics in this phase.
- Fix hidden-key export redaction before or during this phase; redaction must cover both top-level provider keys and nested config/env keys.

### Phase 3: Settings Migration

Unify app settings after provider migration is stable.

Targets:

- `app-settings.json`
- diagnostics toggles
- theme
- locale
- CodeX defaults such as sandbox/network/search

First fix should be a single settings facade even if SQLite is not fully active yet. This removes the current double-write risk without forcing every device-local preference into the DB.

Execution entry: `docs/plan/2026-07-06-storage-phase-2-chat-settings-session.md` (T198 section).

### Phase 4: Session And Panel Metadata Migration

This is the riskiest phase and must come after provider/settings are stable.

Rules:

- SQLite may own session metadata and identity mapping.
- Official transcript JSONL remains the message/history authority.
- Panel state must stop owning current-turn metrics and provider identity facts.
- `chatKey`, `cliSessionId`, and `filePath` must remain separate fields.
- Any migration needs restore tests for crash recovery, stale panel-state sync, and provider scan adoption.

Execution entry: `docs/plan/2026-07-06-storage-phase-2-chat-settings-session.md` (T199 section).

Candidate tables:

```text
projects
sessions
session_bindings
session_instructions
panel_layout
```

### Phase 5: Final Storage Contract

After the migrations above, update:

- `docs/agent-architecture.md`
- `docs/session-pitfalls.md`
- `docs/token-metrics-contract.md` if panel-state rules change
- contract tests for storage boundaries

The final rule should be simple:

```text
MindCraft-owned data -> mindcraft.db or explicitly documented device-local storage
Official provider data -> official CLI/SDK directories only
Transient UI state -> renderer memory; localStorage only for low-risk local preferences
```

Compatibility note:

- Official runtime files such as `~/.codex/config.toml` and `~/.claude/settings.json` remain required projections.
- MindCraft-owned legacy provider stores should not remain permanent authorities. After the compatibility window, SQLite should be the only local authority for provider records, with official runtime files generated/applied from that authority.

## 5. Current Provider Schema

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mindcraft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  projection_status TEXT NOT NULL DEFAULT 'pending',
  last_projected_at INTEGER
);

CREATE INDEX idx_providers_agent_active
  ON providers(agent_type, is_active);

CREATE INDEX idx_providers_agent_sort
  ON providers(agent_type, sort_index, updated_at);

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
```

There is no live Simple Chat schema in T174. Session and settings tables should be designed later, after provider/settings migration proves stable.

## 6. SQLite Size And Maintenance Policy

Current DB implementation uses `sql.js`, which keeps the DB in memory and persists by exporting the whole DB file. This is acceptable for provider/config/settings data, but it should not be used as a dumping ground for large append-heavy data.

Practical guidance:

| DB size / usage | Position |
|---|---|
| Under 10 MB, mostly provider/config/settings rows | Safe for current `sql.js` implementation. |
| 10-50 MB, moderate writes | Still likely fine, but watch export/persist latency. |
| 50-100 MB or frequent writes | Reassess native `better-sqlite3` or split storage. |
| Chat transcripts, JSONL history, file blobs, large logs | Do not store in `mindcraft.db` in this roadmap. |
| Lightweight Chat message bodies while on `sql.js` | Prefer userData files; keep DB to thread/index/summary metadata. |

Maintenance rules:

- Every table needs a documented owner, read path, write path, and retention policy.
- Every JSON column needs a documented shape. Unknown imported source fields may be retained only in metadata/audit, not projected into runtime config.
- Add migrations forward-only. Do not rewrite historical migrations after release.
- Keep `import_runs` and DB backups bounded by retention, for example latest 200 import runs or 90 days, and latest 20 backup files per label family.
- Do not use SQLite to persist current-turn token metrics, raw provider transcripts, uploaded files, or renderer-only transient state.
- Do not put append-heavy Simple Chat message bodies into SQLite while the app uses `sql.js`; store DB-owned thread/index metadata separately from file-owned message content.
- Legacy files must have a compatibility window and cleanup plan; do not keep permanent dual-write unless explicitly documented.

## 7. Task Mapping

| Task | Scope |
|---|---|
| T159 | Storage architecture roadmap: SQLite foundation, local storage migration, final boundary contract. |
| T162 | Import dialog and CC Switch provider import, implemented on top of the new provider/import storage path. |
| T174 | Completed provider storage migration: SQLite authority, legacy fallback/backfill/projection, ordering, provider repository, and DB v3 cleanup for historical Claude provider pollution. |
| T175 | Future lightweight Chat storage migration: SQLite thread/index metadata plus userData message files; not part of T174. |
| T198 | App settings storage facade: consolidate app-owned settings out of scattered JSON + `electron-conf` entry points; provider authority is out of scope. |
| T199 | Session/panel storage boundary audit: classify current authorities before any session metadata migration. |

## 8. Open Questions

- Confirm when to reassess `sql.js` vs `better-sqlite3`. Current provider/config scope does not require native SQLite.
- Define the exact legacy provider read-fallback removal window after T195 ships in 1.2.x.
- Decide whether repository-level `setActiveProvider()` should itself mark projection pending, even if current UI paths mostly go through full provider saves.
- Implement T164 visual drag-and-drop sorting on top of existing repository order support.
- Execute T175 Simple Chat metadata/file split without reopening provider storage.
- Decide how far T198 should migrate device-local settings into SQLite versus a single JSON-backed facade.
