# MindCraft Storage Architecture Roadmap

> Last updated: 2026-06-30  
> Scope: SQLite foundation, CC Switch import, local storage migration, and final storage boundaries.

## 1. Decision

MindCraft should introduce a SQLite-backed storage layer, but migration must be staged. The immediate goal is not to replace every JSON/localStorage/electron-conf path at once. The goal is to establish a durable storage foundation, use it for new import flows first, then migrate existing MindCraft-owned data only where the boundary is clear.

Current decision:

| Topic | Decision |
|---|---|
| SQLite foundation | Build first, with migrations, DAO boundaries, backup, and contract tests. |
| CC Switch import | Implement early as a global System Settings import, because one CC Switch SQL export can contain both Claude and CodeX providers. |
| Full local storage migration | Do later, module by module, after the provider/import path is stable. |
| Official CLI directories | Do not replace. Continue using official paths only for official CLI/SDK data. |
| Existing provider-page import UI | Keep the compact `Import` button style, but scope it to local CLI config import only. CC Switch must not live in a single-agent provider panel. |

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
| Provider list, selected provider, import metadata | SQLite | Then project to official config files when required. |
| App settings, diagnostics toggles, locale, theme | SQLite or a single settings facade backed by SQLite | Device-local settings can stay separate if intentionally local. |
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

- Preferred dependency: `better-sqlite3`, if Electron native rebuild is acceptable.
- Fallback candidate: `sql.js`, only if native dependency risk blocks packaging.

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

During the transition, keep compatibility projections:

| Target | Purpose |
|---|---|
| SQLite `providers` table | Authoritative MindCraft provider records. |
| Existing `codexGetProviders` / `claudeGetProviders` IPC | Reads through DAO, fallback to legacy files if DB is empty. |
| `~/.codex/config.toml` / `~/.claude/settings.json` | Written only through explicit repair/activate adapters. |
| Legacy JSON/electron-conf | Read fallback only, then backfill SQLite. |

Write strategy:

```text
Read: SQLite -> legacy fallback -> backfill SQLite
Write: SQLite -> required official config projection
Legacy direct writes: removed after compatibility window
```

This phase should not change session restoration logic.

### Phase 3: Settings Migration

Unify app settings after provider migration is stable.

Targets:

- `app-settings.json`
- diagnostics toggles
- theme
- locale
- CodeX defaults such as sandbox/network/search

First fix should be a single settings facade even if SQLite is not fully active yet. This removes the current double-write risk.

### Phase 4: Session And Panel Metadata Migration

This is the riskiest phase and must come after provider/settings are stable.

Rules:

- SQLite may own session metadata and identity mapping.
- Official transcript JSONL remains the message/history authority.
- Panel state must stop owning current-turn metrics and provider identity facts.
- `chatKey`, `cliSessionId`, and `filePath` must remain separate fields.
- Any migration needs restore tests for crash recovery, stale panel-state sync, and provider scan adoption.

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

## 5. Initial Schema Sketch

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
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_providers_agent_active
  ON providers(agent_type, is_active);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
```

Session tables should be designed later, after provider/settings migration proves stable.

## 6. Task Mapping

| Task | Scope |
|---|---|
| T159 | Storage architecture roadmap: SQLite foundation, local storage migration, final boundary contract. |
| T162 | Import dialog and CC Switch provider import, implemented on top of the new provider/import storage path. |

## 7. Open Questions

- Confirm final SQLite dependency: `better-sqlite3` vs `sql.js`, based on packaging/rebuild risk.
- Confirm whether import should initially support both Claude and CodeX or only CodeX.
- Decide whether provider activation should immediately project to official config, or only when user presses repair/apply.
- Define backup retention policy for `mindcraft.db` and import runs.
