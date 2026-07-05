# T188 Legacy Compatibility Exit Plan

> Date: 2026-07-05
> Status: proposed
> Scope: legacy provider projection, compatibility fallback, old channel/window/API exits
> Related: T174, T175, T185, T187, R10

## 1. Why This Exists

After the storage and architecture refactors, several old routes still exist intentionally:

- legacy provider projection
- fallback reads from old provider stores
- old IPC channel names
- old standalone agent window routes
- old config import/repair entry points
- old session sidecar fallback reads

Some of these are real compatibility requirements. Others may be forgotten business routes. They must not be cleaned with ordinary dead-code deletion, because deleting them too early can break rollback, migration, or existing user data.

This task defines an exit process.

## 2. Current Compatibility Families

### 2.1 Provider Storage Projection

Current authority:

- SQLite provider repository is the authority after T174.
- Official runtime files remain projections:
  - CodeX `~/.codex/config.toml`
  - ClaudeCode `~/.claude/settings.json`
- Legacy MindCraft-owned provider stores still exist as rollback projections:
  - CodeX `~/.codex/providers.json`
  - Claude internal provider storage / `electron-conf` shape

Decision:

- Keep projection during the 1.1.x compatibility window.
- Do not delete legacy provider projection in T187.
- Define the first version where rollback to pre-T174 is no longer supported.

Exit condition:

- At least one released build has shipped with SQLite provider authority.
- Manual smoke confirms provider add/edit/delete/activate/import/export.
- T185 Electron settings/provider smoke exists or an equivalent manual release checklist is recorded.
- Recovery documentation exists for users with corrupted SQLite provider rows.

### 2.2 `electron-conf` Runtime Values

Current state:

- Some app settings migrated to JSON files.
- Locale still uses `new Conf({ configName: 'app-config' })`.
- Claude internal config still uses `electron-conf` with JSON fallback.
- CodeX runtime preferences still use `mindcraft-codex` in config IPC/config manager.

This is not all dead code.

Exit direction:

- Do not remove `electron-conf` globally.
- First classify every key:
  - persistent user preference
  - provider projection
  - runtime-only override
  - legacy fallback only
- Move only clearly app-owned preferences to app `userData` JSON or SQLite when there is a migration and rollback story.

### 2.3 Official Config Repair / Import Paths

Keep:

- Claude settings repair path, because it sanitizes `settings.json` and preserves MCP/plugins/custom fields.
- CodeX TOML repair path, because it preserves plugin/marketplace sections.
- Local CLI config import, because it is now the official replacement for older page-specific import flows.

Risk:

- Any path that reads a merged UI view and writes it back to official config can reintroduce settings pollution.

Guard:

- Writes to `~/.claude/settings.json` must continue through sanitizer.
- Writes to `~/.codex/config.toml` must preserve unrelated TOML sections.

### 2.4 Old IPC Channel Names

Current state:

- `packages/agent/shared/ipcChannels.js` registers known channels.
- Tests catch unregistered new channels.
- Existing channel names remain mixed (`claude-*`, `codex-*`, `agent-*`, host channels).

Decision:

- Do not rename old channels until T185 Electron E2E has at least boot + preload/main contract smoke.
- R10 IPC unification remains a separate future route.
- T188 may only mark old channels as compatibility channels and document their owner.

### 2.5 Standalone Agent Windows

Current state:

- `open-claude-win` and `open-codex-win` still exist.
- Current router aliases redirect to CodeHub.
- No active call site was found in quick static scan, but tests still assert route compatibility.

Exit options:

| Option | When to choose |
|---|---|
| Keep supported | If users still need separate agent windows. Add docs and smoke coverage. |
| Deprecate | If no UI exposes it but old plugin/shortcut paths may call it. Keep one release with warning. |
| Remove | If no product path and no plugin API depends on it. Remove preload/main/window modules together. |

Do not decide inside T187 cleanup without product confirmation.

## 3. Compatibility Register

Create a small register before removing any legacy path:

| Field | Meaning |
|---|---|
| `id` | stable compatibility id |
| `owner` | module or feature owner |
| `source` | old data/API/channel |
| `target` | new authority |
| `read fallback` | whether old source is still read |
| `write projection` | whether old source is still written |
| `introduced` | migration version |
| `earliest removal` | first version where removal is allowed |
| `tests` | guard tests |
| `manual smoke` | required manual checks |
| `rollback` | user recovery path |

Suggested first register entries:

```text
LEGACY_PROVIDER_CODEX_PROVIDERS_JSON
LEGACY_PROVIDER_CLAUDE_INTERNAL_PROVIDERS
LEGACY_CODEX_RUNTIME_ELECTRON_CONF
LEGACY_CLAUDE_SETTINGS_SANITIZER
LEGACY_STANDALONE_CLAUDE_WINDOW
LEGACY_STANDALONE_CODEX_WINDOW
LEGACY_AGENT_IPC_CHANNEL_NAMES
LEGACY_SESSION_META_SIDECAR_FALLBACK
```

## 4. Execution Plan

### Phase 0: Inventory

No code deletion.

Deliver:

- compatibility register
- list of current read fallback paths
- list of current write projection paths
- list of fallback-only tests
- release/version recommendation for removal

### Phase 1: Convert Write Projection to Read-Only Fallback

For provider legacy stores after the compatibility window:

1. SQLite remains authority.
2. Official runtime config projection remains.
3. Legacy MindCraft-owned provider store writes stop.
4. Legacy store reads remain one more version as fallback/backfill.

This reduces drift before deletion.

### Phase 2: Remove Fallback Reads

Only after Phase 1 has shipped:

- remove fallback reads
- remove old migration branches
- remove tests that only protect fallback reads
- keep tests proving new authority still works

### Phase 3: Remove Old APIs / Channels

Only after T185:

- deprecated standalone windows
- generic unsafe window APIs
- legacy IPC names only if R10 is approved

## 5. Acceptance

- Every removed legacy path has an `earliest removal` version.
- Rollback story is explicit.
- Provider import/export and activation still work.
- Official config files are not polluted.
- `npm run test:contract`, `npm test`, and build pass.
- Manual smoke includes settings save/repair/import/export.

## 6. Registration

Register as T188 in `docs/TODO.md`.
