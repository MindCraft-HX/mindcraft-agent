# Storage SQLite Foundation And CC Switch Import Plan

> Date: 2026-06-30  
> Parent roadmap: `docs/STORAGE_ARCHITECTURE_ANALYSIS.md`  
> Task IDs: T159, T162  
> Implementation owner: ClaudeCode or Codex  

## 1. Goal

Implement the first storage phase only:

1. Establish a minimal SQLite-backed MindCraft storage layer.
2. Add a global System Settings config import dialog.
3. Support importing providers from local CLI config and CC Switch SQL exports, with different entry points.
4. Keep existing provider runtime behavior compatible during the transition.

This plan intentionally does not migrate session registry, panel state, transcript history, plugins, skills, or IndexedDB cache.

Review status on 2026-06-30:

- SQLite foundation and parser work is useful, but Phase 1 is not complete until the import entry point is corrected.
- CC Switch exports can contain both CodeX and Claude providers in one `.sql`; importing it from one agent's provider panel is architecturally wrong.
- The next patch should refactor CC Switch import into System Settings and keep agent-page `Import` as local CLI import only.

## 2. Hard Boundaries

Do not change these in this phase:

- Do not migrate `session-registry/`.
- Do not migrate `claude-panel-state.json` or `codex-panel-state.json`.
- Do not write MindCraft-owned sidecars into `~/.claude`, `~/.codex`, project `.claude`, or project `.codex`.
- Do not treat `cliSessionId`, `chatKey`, and transcript `filePath` as interchangeable.
- Do not change current message/history hydration behavior.
- Do not store current-turn token metrics in any new panel/session table.

Allowed official-directory writes:

- Existing explicit provider repair/apply flows may write official schema fields to `~/.codex/config.toml` or `~/.claude/settings.json`.
- New import code may update official config only through the same explicit adapter/projection path, with backup where current code already backs up.

## 3. Existing Code Entry Points

Provider UI:

- `packages/agent/src/components/codeX/components/APISetting.vue`
- `packages/agent/src/components/claudeCode/components/APISetting.vue`

Provider IPC:

- `packages/agent/electron/codex/configIpc.js`
- Claude provider IPC lives under `packages/agent/electron/claude/**` and `packages/agent/electron/claudeAgent.js`; inspect current handler registration before editing.
- `packages/agent/preload/index.js`

Provider parsing helpers:

- `packages/agent/electron/codex/configManager.js`
- `packages/agent/src/components/codeX/utils/providerToml.mjs`

Storage/reference modules:

- `packages/agent/electron/sessionRegistry.js` is reference only; do not migrate it in this phase.
- `electron/mainModules/settingsStore.js` and `packages/agent/electron/diagnosticsFileUtils.js` show the existing settings double-write problem; do not solve this in the CC Switch import patch unless working on Phase 3.

## 4. Phase A: Dependency And DB Probe

Before wiring feature code, decide whether native SQLite is acceptable.

Preferred:

- `better-sqlite3`

Fallback:

- `sql.js`, only if native rebuild or packaging risk blocks `better-sqlite3`.

Acceptance:

- A small Node/Electron-side test can create a temporary DB, run migrations, insert/select a provider, close/reopen, and read the same row.
- If `better-sqlite3` is chosen, update package/build notes if native rebuild is required.
- If dependency cannot be added safely, stop and document the blocker. Do not hand-roll persistent SQL.

## 5. Phase B: Minimal DB Layer

Create:

```text
packages/agent/electron/db/
├── index.js
├── schema.js
├── migrations/
│   └── v1_initial.js
├── dao/
│   ├── providers.js
│   └── importRuns.js
├── import/
│   └── ccSwitch.js
└── backup.js
```

Minimum schema:

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

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
```

DAO requirements:

- Store JSON as strings at the DB boundary; parse/stringify only in DAO.
- Validate `agent_type` as `claude` or `codex`.
- Make active-provider updates transactional so only one provider per agent is active.
- Expose pure-ish functions that accept explicit `db` or `userDataDir` where possible, so tests do not depend on the real app profile.

Suggested API:

```js
openMindCraftDb({ userDataDir })
runMigrations(db)
listProviders(db, agentType)
upsertProviders(db, providers, { source })
setActiveProvider(db, agentType, providerId)
recordImportRun(db, run)
```

Acceptance:

- Migration is idempotent.
- Empty DB initializes without touching legacy storage.
- Provider CRUD tests run in a temp directory.

## 6. Phase C: CC Switch SQL Parser

Implement parser in:

```text
packages/agent/electron/db/import/ccSwitch.js
```

Important: do not parse using a single naive regex for `VALUES(...)` fixed columns.

Parser requirements:

- Accept `INSERT INTO providers VALUES (...)` only as legacy fallback.
- Prefer explicit-column format:

```sql
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('...', 'codex', 'DeepSeek', '{"api_key":"..."}', '{}', 1);
```

- Handle quoted identifiers with or without double quotes.
- Handle SQLite string escaping: `''`.
- Handle `NULL`, integers, and strings.
- Split SQL values while respecting string literals and parentheses.
- Extract `settings_config` JSON.
- Preserve unknown fields into `metadata_json`.
- Return normalized records, not direct DB writes.

Normalized provider shape:

```js
{
  agentType: 'codex',
  name: 'DeepSeek',
  config: {
    key: 'sk-...',
    url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    reasoningEffort: '',
    apiFormat: 'chat'
  },
  metadata: {
    source: 'cc-switch',
    ccSwitch: { id, appType, rawMeta, rawSettings }
  },
  isActive: true
}
```

Tests should cover:

- Explicit column order different from expected order.
- Escaped single quote inside JSON or name.
- `NULL` values.
- Multiple providers.
- Unsupported `app_type` skipped.
- Missing/invalid `settings_config` skipped with warning, not crash.
- Duplicate provider names get stable unique IDs or are marked for UI conflict resolution.

## 7. Phase D: Import IPC

Add IPC that supports preview before commit.

Required channel split:

```text
config-import-pick-cc-switch-file
config-import-preview-cc-switch
config-import-commit-cc-switch
```

Agent-scoped channels may remain for local CLI import only:

```text
codex-config-import-local-preview
codex-config-import-local-commit
claude-config-import-local-preview
claude-config-import-local-commit
```

If retaining existing channel names for compatibility, ensure `cc-switch` is no longer accepted by `codex-config-import-*` or `claude-config-import-*`.

Preview payload:

```js
{
  source: 'cc-switch',
  filePath: string
}
```

Preview result:

```js
{
  ok: true,
  source: 'cc-switch',
  summary: { codex: 2, claude: 1, skipped: 3 },
  providers: [
    {
      tempId,
      agentType,
      name,
      model,
      url,
      apiFormat,
      isActive,
      conflict,
      defaultAction,
      supportedFieldsOnly: true
    }
  ],
  skippedRows: [
    { reason, appType, name }
  ],
  warnings: []
}
```

Commit payload:

```js
{
  source: 'cc-switch',
  applyActiveFromCcSwitch: false,
  providers: [
    { tempId, action: 'add' | 'overwrite' | 'rename' | 'skip', targetProviderId?: string, finalName?: string }
  ]
}
```

Commit result:

```js
{
  ok: true,
  imported: 3,
  skipped: 1,
  backupPath: '',
  warnings: []
}
```

Transition requirement:

- After DB commit, update the existing provider storage path used by current UI/runtime, or reload through DAO fallback if that has already been wired.
- Do not break existing `codexGetProviders`, `codexSetProviders`, `claudeGetProviders`, or `claudeSetProviders`.
- Project CodeX providers only to CodeX storage and Claude providers only to ClaudeCode storage.
- Do not project unknown CC Switch fields into runtime provider configs. Keep them only in SQLite metadata.
- `overwrite` must remove/replace the target provider in the legacy projected list. Do not rely only on `decision.targetProviderId` if the backend resolves the target by name.
- Active provider normalization must be per `agentType`, not per mixed import batch.
- Persist `sql.js` DB after commit and validate packaged Electron can locate `sql-wasm.wasm`.

## 8. Phase E: Import Dialog UI

Move CC Switch import out of the CodeX and ClaudeCode provider settings panels.

Required UI behavior:

- System Settings tab:
  - Add a compact `Import Config` / `导入配置` entry.
  - Open a modal/dialog, not a dropdown.
  - First supported source: CC Switch `.sql`.
  - The dialog should briefly describe that CC Switch SQL can include both CodeX and ClaudeCode providers and will be split automatically.
- CodeX provider settings:
  - Keep the existing compact `Import` / `导入` button style.
  - On click, show a confirmation modal that says it will import local CodeX CLI config.
  - Do not mention CC Switch in this local import confirmation.
- ClaudeCode provider settings:
  - Keep the existing compact `Import` / `导入` button style.
  - On click, show a confirmation modal that says it will import local ClaudeCode CLI config.
  - Do not mention CC Switch in this local import confirmation.
- Remove the old "Import from MindCraft" behavior from normal UI.

CC Switch preview:

- Group rows by `CodeX`, `ClaudeCode`, and `Skipped`.
- Show only supported runtime fields in the main row: name, URL, model, apiFormat/reasoning effort, active marker if present.
- Show skipped/unsupported rows separately with reason. Do not import unsupported `app_type` or unknown config domains.
- Per row actions:
  - `add`
  - `overwrite`
  - `rename`
  - `skip`
- Defaults:
  - no conflict -> `add`
  - same name + same normalized config -> `skip`
  - same name + different normalized config -> `skip`
- Optional checkbox:
  - `Use CC Switch active provider after import`
  - Default off.
  - If on, apply active selection separately for CodeX and ClaudeCode.

Provider ordering:

- Add drag-and-drop sorting for provider lists, or create the storage/API support if the UI patch is too large.
- Sorting is needed once users import five or six providers.
- Persist order in MindCraft-owned storage and project to legacy provider list order during transition.

Visual constraints:

- Keep the current settings panel style.
- Do not add marketing/explanatory text inside the app.
- Use compact controls; provider settings is an operational surface.

## 9. Localization

Add or update locale keys for:

- `settings.importConfig`
- `settings.import`
- `settings.importLocalCodexConfig`
- `settings.importLocalClaudeConfig`
- `settings.importCcSwitchConfig`
- `settings.importPreview`
- `settings.importCommit`
- `settings.importSkippedConflicts`
- `settings.importRename`
- `settings.importUseCcSwitchActive`
- `settings.providerSort`

Use existing locale file patterns. Do not hardcode Chinese-only text in the Vue components if the component already uses i18n.

## 10. Tests

Minimum automated tests:

- DB migration idempotency.
- Provider DAO CRUD and active-provider uniqueness.
- CC Switch SQL parser:
  - explicit columns
  - reordered columns
  - escaped strings
  - invalid JSON warning
  - unsupported app type skip
- Import preview produces safe normalized records.
- Import commit does not touch session registry or panel-state files.
- Mixed CC Switch SQL containing both CodeX and Claude providers imports both from the global channel.
- CodeX projection never receives Claude providers.
- Claude projection never receives CodeX providers.
- Overwrite-by-name removes/replaces the old legacy projected provider instead of appending a duplicate.
- Active provider import is normalized per agent type.
- Unknown CC Switch fields stay in SQLite metadata and are not projected into runtime config.

Useful command targets:

```text
npm test
npm run test:contract
```

If adding a new test file outside current `npm test` list, also update `package.json` test script or add it to the contract runner if appropriate.

## 11. Manual Acceptance

CodeX:

1. Open CodeX settings.
2. Click compact `Import`.
3. Confirm the local CodeX CLI import modal.
4. Import local CLI config and confirm provider list updates as before.
5. Confirm no CC Switch option appears in this local import flow.

Claude:

1. Open ClaudeCode settings.
2. Click compact `Import`.
3. Confirm the local ClaudeCode CLI import modal.
4. Import local CLI config.
5. Confirm no CC Switch option appears in this local import flow.

System Settings:

1. Open the System Settings tab.
2. Click `Import Config`.
3. Import a CC Switch SQL sample containing both CodeX and Claude providers.
4. Confirm preview groups both agent types.
5. Confirm unsupported rows are shown as skipped and are not imported.
6. Import with default actions and confirm non-conflicting providers appear in the right provider lists.
7. Repeat with same SQL and confirm conflicts default to skip.
8. Choose overwrite for a same-name provider and confirm no duplicate remains.
9. If active import checkbox is off, confirm current active providers do not change.
10. If active import checkbox is on, confirm CodeX and ClaudeCode active providers are applied independently.

Regression:

- Existing provider add/edit/copy/delete/activate still works.
- Existing repair config buttons still work.
- Existing history restore and active sessions are unaffected.

## 12. Stop Conditions

Stop and report before continuing if:

- SQLite dependency cannot be installed or packaged cleanly.
- Existing provider IPC behavior would require broad rewrites in both ClaudeCode and CodeX settings.
- Import implementation starts requiring session registry or panel-state migration.
- Official CLI config writes would require storing MindCraft-owned metadata in official directories.
