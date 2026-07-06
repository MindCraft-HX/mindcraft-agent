# Compatibility Register

> Created: 2026-07-06 (T188 Phase 0)
> Purpose: Track every legacy path that must NOT be cleaned as dead code. Each entry has an explicit removal gate.
> Related: T188 plan (`docs/plan/2026-07-05-legacy-compatibility-exit-plan.md`)

## How to Use

- **Before any T187 Phase 3 deletion**: check this register. If a path has an active entry here, it is gated by T188 and must not be deleted.
- **When adding a new compatibility entry**: fill all fields. If `earliest removal` is unknown, use `TBD` with a reason.
- **When removing an entry**: verify all exit conditions are satisfied, record the actual removal version, move the row to the "Resolved" table at the bottom.

## Active Entries

| id | owner | source | target | read fallback? | write proj? | introduced | earliest removal | tests | manual smoke | rollback |
|---|---|---|---|---|---|---|---|---|---|---|
| `LEGACY_PROVIDER_CODEX_PROVIDERS_JSON` | provider | `~/.codex/providers.json` | SQLite `providerStorage` | yes | ~~yes (1.1.x)~~ → **no** (T195 Ph1, v1.1.3) | T174 (v1.1.0) | v1.2.0 (TBD) | TBD | provider CRUD, import, export, activate | restore from JSON backup |
| `LEGACY_PROVIDER_CLAUDE_INTERNAL_PROVIDERS` | provider | `claude-internal` Conf → `claudeProviders` key | SQLite `providerStorage` | yes | ~~yes (1.1.x)~~ → **no** (T195 Ph1, v1.1.3) | T174 (v1.1.0) | v1.2.0 (TBD) | TBD | provider CRUD, import, export, activate | restore from JSON backup |
| `LEGACY_CODEX_RUNTIME_ELECTRON_CONF` | config | `electron-conf` (`mindcraft-codex`) | JSON/SQLite (key-by-key) | yes (locale, prefs) | yes (prefs) | pre-T174 | v1.2.0+ (key-by-key) | codexRuntimeConfig.test.js | settings save, restore, migration | restore runtime conf from backup |
| `LEGACY_CLAUDE_SETTINGS_SANITIZER` | config | dirty `~/.claude/settings.json` | sanitized `~/.claude/settings.json` | — (repair path) | yes | pre-T174 | **keep indefinitely** | TBD | settings save, repair, MCP/plugin preservation | revert settings.json from git/backup |
| `LEGACY_STANDALONE_CLAUDE_WINDOW` | window | `#/main/claudeCode` standalone window | `#/main/codeHub?agent=claudeCode` | no | no | pre-refactor | product decision | route tests | open Claude from sidebar/menu | N/A |
| `LEGACY_STANDALONE_CODEX_WINDOW` | window | `#/main/codex` standalone window | `#/main/codeHub?agent=codex` | no | no | pre-refactor | product decision | route tests | open CodeX from sidebar/menu | N/A |
| `LEGACY_AGENT_IPC_CHANNEL_NAMES` | ipc | old channel names (string literals) | `ipcChannels.js` constants | no | no | R03 | R10 or never | ipc baseline tests | preload/main IPC contract | N/A |
| `LEGACY_SESSION_META_SIDECAR_FALLBACK` | session | sidecar `session_meta.json` alongside JSONL | session registry metadata | yes (backfill) | no | pre-T174 | after full backfill completed | TBD | session restore after migration | recover from JSONL-only |

### Version Anchoring Note

"v1.2.0 (TBD)" means the version is proposed as the earliest removal candidate. **The version alone is not sufficient** — all exit conditions from the T188 plan §2 must be satisfied. Adjust version targets as the release schedule solidifies.

Entries marked "keep indefinitely" or "R10 or never" have no planned removal window. They are active compatibility paths that will remain until a separate architecture decision (e.g., R10 IPC unification) provides a migration path.

---

## electron-conf Key Classification

> Full classification of every `electron-conf` key. This determines which keys can migrate (T188 Phase 1), which stay, and which are already handled.

### Namespace: `app-config` (Conf({ configName: 'app-config' }))

| Key | Type | Current Usage | Migration Target |
|---|---|---|---|
| `locale` | persistent user preference | `load-locale` / `save-locale` IPC in `packages/agent/electron/index.js` | app userData JSON (`locale.json`) |

### Namespace: `mindcraft-codex` (Conf({ name: 'mindcraft-codex' }))

| Key | Type | Current Usage | Migration Target |
|---|---|---|---|
| `runtime` (object: `apiKey`, `baseURL`, `model`, `reasoningEffort`, `apiFormat`) | runtime-only override | `codex-get-key/set-key`, `codex-get-base-url/set-base-url`, `codex-get-model/set-model`, `codex-get/set-reasoning-effort`, `codex-get/set-api-format` in `configIpc.js`; read in `configManager.readRuntimeConfig()` with priority: provider > user runtime > TOML | SQLite `providerStorage` user-override column (TBD) |
| `sandboxMode` | persistent user preference | `codex-get/set-sandbox-mode` in `configIpc.js`; `configManager.readSandboxMode()` | app userData JSON |
| `projectSettings` | persistent user preference | `codex-get/set-project-settings` in `configIpc.js` | app userData JSON or SQLite |
| `defaultNetworkAccess` | persistent user preference | `codex-get/set-default-network-access` in `configIpc.js` | app userData JSON |
| `defaultWebSearch` | persistent user preference | `codex-get/set-default-web-search` in `configIpc.js` | app userData JSON |

### Namespace: `claude-internal` (Conf({ name: 'claude-internal' }))

| Key | Type | Current Usage | Migration Target |
|---|---|---|---|
| `claudePermissionPolicy` | persistent user preference | `confGet/Set('claudePermissionPolicy')` in `claudeAgent.js`; not in `settings.json` | app userData JSON |
| `claudeLanguage` | persistent user preference | `confGet/Set('claudeLanguage')` in `claudeAgent.js`; not in `settings.json` | app userData JSON |
| `claudeModel` | persistent user preference | `confGet/Set('claudeModel')` in `claudeAgent.js`; intentionally NOT in `settings.json` to avoid polluting tier field | app userData JSON |
| `claudeExecutablePath` | persistent user preference | `confGet/Set('claudeExecutablePath')` in `claudeAgent.js` | app userData JSON |
| `claudeProviders` | **provider projection (legacy)** | `confGet/Set('claudeProviders')` — first-use import from `settings.json`, then internal store; now also projected by T174 SQLite | SQLite (already migrated; this is backward projection) |
| `tierModels` | persistent user preference | `confGet/Set('tierModels')` and `confGet/Set('tierModels.<tier>')` — per-tier model name overrides | app userData JSON |

### Already Migrated (no longer electron-conf)

These were explicitly migrated to plain JSON files. The `electron-conf` references in these modules are documentation comments only — the code already uses `fs.readFileSync/writeFileSync`:

| Module | File | Replaced By |
|---|---|---|
| settingsStore | `electron/mainModules/settingsStore.js` | `{userData}/settings.json` |
| pluginManager | `electron/mainModules/pluginManager.js` | `{userData}/plugins.json` |
| theme | `electron/main.js` | `{userData}/theme.json` |
| generic settings | `electron/preload.js` | native JSON storage |

---

## Resolved Entries

> Entries whose compatibility window has closed and have been fully removed.
> (None yet — this register was created 2026-07-06.)

| id | resolved in | removal version | verified by |
|---|---|---|---|
| — | — | — | — |
