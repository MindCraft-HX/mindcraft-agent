# Storage Phase 2: Chat, Settings, Session Boundaries

> Date: 2026-07-06
> Status: historical planning document
> Related: T174, T175, T188, T195, T198, T199, T201

> Note:
> - This document captured the pre-implementation split for T175 / T198 / T199.
> - T175, T198, and T199 are now completed.
> - Current state is tracked in `docs/STORAGE_ARCHITECTURE_ANALYSIS.md`.
> - The next implementation task is `docs/plan/2026-07-07-T201-session-panel-storage-convergence.md`.

## 1. Current Assessment

Provider storage is no longer the right place to keep restructuring.

What is already settled:

- T174 made SQLite the authority for CodeX / ClaudeCode provider records.
- T195 stopped legacy provider write projection. Old provider stores are now read fallback only.
- Official runtime files remain explicit projections only:
  - CodeX: `~/.codex/config.toml`
  - ClaudeCode: `~/.claude/settings.json`

What is still fragmented:

- Simple Chat persists whole sessions under `{userData}/chat-sessions/`:
  - index: `index.json`
  - session body: `<id>.json`
  - current shape stores metadata and message bodies together
  - current entrypoints: `packages/agent/src/composables/useChatSession.js`, `packages/agent/electron/claude/chatPersistenceIpc.js`
- App-owned settings are split across several storage owners:
  - `{userData}/app-settings.json`
  - `{userData}/theme.json`
  - `Conf({ configName: 'app-config' })` for locale
  - `Conf({ name: 'mindcraft-codex' })` for CodeX defaults/runtime prefs
  - `Conf({ name: 'claude-internal' })` for Claude app-owned prefs and legacy fallback
- Session and panel metadata still use multiple authorities:
  - `session-registry/`
  - `*-panel-state.json`
  - renderer memory/localStorage
  - feature-specific local persistence such as doc tabs

Decision:

- Do not reopen T174.
- Split the remaining storage work into three topics with explicit boundaries:
  - T175: Simple Chat storage
  - T198: settings storage facade
  - T199: session/panel storage boundary audit

## 2. Execution Order

Recommended order:

1. T175 first
2. T198 second
3. T199 last

Reasoning:

- Simple Chat is self-contained and has a clean file/data boundary.
- Settings are app-owned and mostly device-local; they need a single owner, not another scattered migration.
- Session/panel metadata is the highest-risk area because it touches restore, scan, runtime identity, and UI persistence together.

## 3. T175: Simple Chat Storage Boundary

### Current State

Current persistence is file-based and stores the whole session object in one JSON file:

- list/index: `{userData}/chat-sessions/index.json`
- per session: `{userData}/chat-sessions/<id>.json`

Current session shape mixes:

- metadata: `id`, `title`, `createdAt`, `updatedAt`, `provider`, `model`, `thinkingLevel`, `webSearchEnabled`
- content: `messages`
- derived/app state: `contextSummary`

This is workable at small scale, but it couples list operations, rename/save churn, and message-body writes into the same persistence path.

### Target Boundary

Use the existing `mindcraft.db` for metadata only.

SQLite should own:

- thread/session id
- title
- createdAt / updatedAt
- provider
- model
- thinkingLevel
- webSearchEnabled
- contextSummary
- lightweight counts/summaries if needed for Home or session list

Files should own:

- message bodies
- future attachments or file references

Suggested file layout:

```text
{userData}/simple-chat/
  threads/
    <threadId>/
      messages.jsonl
```

Suggested DB table family:

```text
chat_threads
```

Do not add message-body SQL tables in this phase.

### Migration Rules

- Read old `{userData}/chat-sessions/*.json` only for migration/backfill.
- On successful migration, new writes go to DB metadata + `messages.jsonl`.
- Keep a one-version fallback reader for old chat JSON files.
- Do not mix Simple Chat migration with provider storage code paths.

### Acceptance

- Home recent chats still work.
- Chat list / rename / delete still work.
- Restart preserves chat list and content.
- Large message histories no longer require whole-session JSON rewrite on every save.

## 4. T198: Settings Storage Facade

### Goal

Create one clear owner for app-owned settings without forcing every preference into SQLite.

This is a facade task first, not a DB-maximalism task.

### Scope

Bring these app-owned settings behind one main-process settings facade:

- diagnostics toggle
- locale
- theme
- CodeX defaults:
  - `sandboxMode`
  - `defaultNetworkAccess`
  - `defaultWebSearch`
- Claude app-owned preferences:
  - `claudePermissionPolicy`
  - `claudeLanguage`
  - `claudeModel`
  - `claudeExecutablePath`
  - `tierModels`

### Non-Goals

- Do not change provider authority.
- Do not move official config fields into app settings.
- Do not migrate CodeX/Claude runtime keys that are really provider duplicates until ownership is re-audited.
- Do not mix session/panel persistence into this task.

### Output

- one facade module for app-owned settings
- one owner matrix for every migrated key
- adapter layer for current IPCs so renderer payloads stay stable
- removal or deprecation path for scattered `electron-conf` writes that become redundant

### Acceptance

- locale/theme/diagnostics/default settings still work after restart
- no setting is written from two different code paths
- provider-related keys are not reintroduced into app-owned settings by accident

## 5. T199: Session / Panel Storage Boundary Audit

### Goal

Do not start another large migration blind. First document who owns what.

### Scope

Audit these persistence families:

- `session-registry/`
- `*-panel-state.json`
- doc tab persistence
- renderer memory/localStorage persistence that affects restore
- any feature-local session metadata writes

### Deliverables

- authority matrix:
  - identity
  - runtime
  - UI layout
  - drafts
  - restore-only caches
- do-not-touch list for restore-critical paths
- candidate migration list for a future session metadata phase

### Non-Goals

- no storage rewrite in this task
- no schema creation
- no panel-state deletion

## 6. Registration

- T175 stays the Simple Chat storage task and should now be treated as the next storage implementation task.
- Register T198 for settings storage facade.
- Register T199 for session/panel storage boundary audit.
