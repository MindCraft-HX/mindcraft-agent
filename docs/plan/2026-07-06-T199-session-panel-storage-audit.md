# T199: Session / Panel Storage Boundary Audit

> Date: 2026-07-06
> Status: completed (audit only, no code changes)
> Related: T175, T198, T165, T167

## 1. Scope and Non-Goals

**Scope:** Audit all persistence families related to sessions and panels. Document who owns what, who reads what, and what the canonical source of truth is for each data category.

**Non-Goals:**
- No storage rewrite
- No schema creation
- No panel-state deletion
- No code changes

## 2. Storage Families Inventory

### 2.1 session-registry/

**Root:** `<userData>/session-registry/`
**Schema versions:** record `SCHEMA_VERSION = 1`, index `INDEX_SCHEMA_VERSION = 2`

| File | Writers | Readers | Data Shape |
|------|---------|---------|------------|
| `index.json` | `sessionRegistry.writeIndex()` (called by `upsertSessionRecord`, `deleteSessionRecord`, `rebuildIndexFromRecords`) | `sessionRegistry.readIndex()`, `listSessionRecords()` | `{ schemaVersion, sessions: { chatKey → { agent, projectId, cwd, title, provider, ... } }, providers: { providerKey → chatKey } }` |
| `sessions/<chatKey>.json` | `sessionRegistry.upsertSessionRecord()`, `setSessionDraft()`, `setSessionInstruction()`, `setSessionTitle()`, `upsertRuntimeByProvider()`, `detachSessionProviderBinding()` | `getSessionDraft()`, `getSessionInstruction()`, `findSessionRecordByProvider()`, `restorePanelStateFromSessionRegistry()`, `codehubSessionIndex.js`, `homeMetrics.js` | `{ schemaVersion, chatKey, agent, projectId, cwd, title, titleSource, description, metadata, provider, runtime, instruction, draft, createdAt, updatedAt }` |
| `instructions/<id>.json` | `setSessionInstruction()` (writes inlined into session record; legacy instruction files are read-only fallback) | `getSessionInstruction()` (fallback read) | `{ schemaVersion, id, title, description, content, attachments, createdAt, updatedAt }` |

### 2.2 Panel State Files

| File | Primary Path | Legacy Path | Writers | Readers |
|------|-------------|-------------|---------|---------|
| `claude-panel-state.json` | `<userData>/claude-panel-state.json` | — | `writeClaudeCodePanelState()` in claudeAgent.js, `syncPanelStateSessions`, `repairSessionRegistry` | `readClaudeCodePanelState()` (with side-effects), `codehubSessionIndex.js`, `homeMetrics.js` |
| `codex-panel-state.json` | `<userData>/codex-panel-state.json` | `~/.codex/codex-panel-state.json` | `writePanelState()` in codexAgent.js, `syncPanelStateSessions`, `repairSessionRegistry` | `readPanelState()` (with side-effects), `codehubSessionIndex.js`, `homeMetrics.js` |

**Panel state data shape (both Claude and CodeX):**
```json
{
  "lastCwd": "string",
  "activeProjectId": "string|null",
  "activeChatId": "string|null",
  "projects": [{
    "id": "string", "name": "string", "cwd": "string",
    "cwdLocked": boolean, "hasDoneNotification": boolean,
    "additionalDirectories": [],
    "chats": [{
      "id": "chat-<chatKey>", "name": "string", "sessionId": "chatKey",
      "messages": [], "model": "string", "reasoningEffort": "string",
      "cliSessionId": "string", "filePath": "string",
      "createdAt": 0, "updatedAt": 0, "titleSource": "string",
      "_resumeAllowed": boolean
    }]
  }]
}
```

**Critical observation:** Panel state files have a **dual role** — they are both:
1. **Output**: UI saves layout (projects, chats, active tab)
2. **Input**: `syncPanelStateSessions()` pumps their chat metadata into the session registry on read

This means every panel state write implicitly triggers a registry upsert. `repairSessionRegistry` then writes back into panel state files (fixing stale `chatKey` references).

### 2.3 Renderer localStorage

| Key | Data | Purpose | Authority |
|-----|------|---------|-----------|
| `claudeTheme` | `{ theme: "dark"\|... }` | Pinia-persisted theme mirror | Derived (canonical: app-settings.json via T198) |
| `codexConfig` | `{ sandboxMode, defaultNetworkAccess, defaultWebSearch }` | Pinia-persisted CodeX defaults mirror | Derived (canonical: app-settings.json via T198) |
| `codehub_tab_order` | `["agentType:projectId", ...]` | UI tab ordering | UI-only (no disk authority) |
| `codehub_active_tab` | `"agentType:projectId"` | Active tab selection | UI-only |
| `codeHub_default_agent` | `"claudeCode"\|"codex"` | Default agent picker | UI-only |
| `mindcraft_agent_last_chat_session` | `chatKey` | Navigation hint | UI-only, transient |
| `mindcraft_agent_chat_target_session` | `chatKey` | One-shot navigation target | UI-only, transient |
| `mc_shortcut_overrides` | JSON override map | User shortcut customizations | UI-only |
| `mcpf_debug` / `mcpf_perf` | flags | Dev diagnostics toggles | UI-only |

### 2.4 Feature-Local Persistence

| Feature | Backend | Key(s) | Notes |
|---------|---------|--------|-------|
| Doc tabs (T189) | `app-settings.json` (misc via T198) | `openDocTabs` | Single authority via settings facade |
| Recent docs | `app-settings.json` (misc via T198) | `recentDocs` | Single authority via settings facade |
| Update availability | `app-settings.json` (misc via T198) | `isUpdateAvailable` | Written by autoUpdater, read by renderer |

### 2.5 Memory Caches (Non-Persistent)

| Cache | Location | Purpose |
|-------|----------|---------|
| `_draftCache` (Map) | `sessionRegistry.js:17` | Per-chatKey draft text — read-path cache, invalidated on write |
| `_instructionCache` (Map) | `sessionRegistry.js:25` | Per-chatKey instruction — read-path cache, invalidated on write |
| `claudeProjectJsonlListCache` | `claudeAgent.js:157` | Directory signature + JSONL paths |
| `claudeSessionTitleCache` | `claudeAgent.js:158` | File signature + extracted titles |
| `_claudeScanCache` | `claudeAgent.js:159` | Directory signature + raw scan summaries |
| `_draftCache` (Map, cap 200) | `useSessionDraft.js:22-34` | Renderer-side FIFO draft cache, debounced writes |

## 3. Authority Matrix

### 3.1 Identity (session id, provider, project)

| Field | Canonical Authority | Non-Authoritative Copies | Merge Rules |
|-------|-------------------|-------------------------|-------------|
| `chatKey` | `session-registry/sessions/<chatKey>.json` | `panel-state.json` (chat.id, chat.sessionId) | Registry is source of truth; panel may have stale chatKeys → repaired by `repairSessionRegistry` |
| `agent` | Registry (normalized from provider scan) | Panel state | Derived from `normalizeAgent()` |
| `projectId` | Registry (from panel state or scan) | Panel state | Copied from source; not independently authored |
| `cwd` | Registry (from panel state or scan) | Panel state + index.json | Derived |
| `provider.cliSessionId` | Registry (from provider scan, with scan > panel authority) | Panel state (chat.cliSessionId) | `mergeProviderBinding` with source-aware strategy |
| `provider.filePath` | Registry (from provider scan) | Panel state (chat.filePath) | Same as cliSessionId |
| `metadata.resumeAllowed` | Registry (`detachSessionProviderBinding` sets to false) | — | Authoritative in registry metadata |
| `metadata.detachedProviderBinding` | Registry (`detachSessionProviderBinding`) | — | Authoritative |

### 3.2 Runtime (model, thinking level, etc.)

| Field | Canonical Authority | Non-Authoritative Copies | Merge Rules |
|-------|-------------------|-------------------------|-------------|
| `runtime.model` | Registry (from provider scan or `upsertRuntimeByProvider`) | Panel state (chat.model) | Panel source is untrusted — `mergeRuntime('panel', ...)` only fills gaps; scan/direct sources have priority |
| `runtime.effort` | Registry | Panel state | Same as model |
| `runtime.modelTier` | Registry | Panel state | Same as model |
| `runtime.reasoningEffort` | Registry (CodeX) | Panel state | Same as model |

### 3.3 UI Layout (active tabs, scroll position, etc.)

| Field | Canonical Authority | Non-Authoritative Copies | Notes |
|-------|-------------------|-------------------------|-------|
| Panel projects/chats structure | `*-panel-state.json` | Registry (used to rebuild missing panel state) | Panel-state is UI authority; registry is canonical for identity/runtime fields within it |
| Active project/chat | `*-panel-state.json` | localStorage `codehub_active_tab` | Panel-state for durable restore; localStorage for fast bootstrap |
| Tab order | localStorage `codehub_tab_order` | Panel-state | UI-only, not in panel-state |
| Default agent | localStorage `codeHub_default_agent` | — | Renderer-only |
| Doc tabs | `app-settings.json` (T198 misc) | — | Single authority |

### 3.4 Drafts

| Field | Canonical Authority | Non-Authoritative Copies | Notes |
|-------|-------------------|-------------------------|-------|
| `draft.text` | `session-registry/sessions/<chatKey>.json` (`.draft` field) | Renderer `_draftCache` (Map) | Draft lives embedded in session record; no standalone storage |
| `draft.updatedAt` | Same as draft.text | — | — |
| Draft caches | Derived from registry | — | Read-path only, invalidated on write |

### 3.5 Instructions

| Field | Canonical Authority | Non-Authoritative Copies | Notes |
|-------|-------------------|-------------------------|-------|
| Instruction content/attachments | `session-registry/sessions/<chatKey>.json` (`.instruction` field) | Legacy `instructions/<id>.json` (read-only fallback) | Instruction data partially duplicated; legacy directory is fallback only |
| Instruction cache | Derived from registry | — | Read-path only |

## 4. Data Flow

```
Provider Scan (Claude CLI / CodeX SDK)
  │
  ▼
sessionRegistry.ensureRegistryFromProviderScan()
  │
  ├─► session-registry/sessions/<chatKey>.json  (canonical)
  │     │
  │     ▼
  │   session-registry/index.json  (derived index)
  │
  ▼
syncPanelStateSessions()  ◄──►  *-panel-state.json
  │                                │
  │  (extract identity/runtime    │  (UI layout authority;
  │   FROM registry, not TO it)   │   repairSessionRegistry
  │                                │   fixes stale chatKeys)
  ▼                                ▼
Renderer (Pinia / localStorage)   codehubSessionIndex.js
  │                                │
  ▼                                ▼
localStorage (UI prefs cache)     Tab summaries (derived)
```

**Key flow rules:**
- Provider scan → registry (canonical write path)
- Panel state syncs FROM registry (identity/runtime extracted from registry)
- Panel state IS the UI layout authority (tab order, active project/chat)
- On empty panel-state restore, registry rebuilds panel projects/chats
- `repairSessionRegistry` is the ONLY function authorized to rename chatKeys and rewrite panel-state references
- Draft writes: renderer UI → preload IPC → `setSessionDraft()` → registry record (embedded, not standalone)

## 5. Boundary List (Do-Not-Touch)

Critical paths that must not be broken by any future storage migration:

1. **`upsertSessionRecord()`** — Central write entry point. All session metadata writes must continue to flow through here.
2. **`syncPanelStateSessions()`** — Bridges panel-state → registry. Uses `providerBindingSource: 'panel'` to limit write authority (panel cannot overwrite scan-derived data).
3. **`restorePanelStateFromSessionRegistry()`** — Rebuilds panel-state from registry when panel-state is empty or missing chats.
4. **`repairSessionRegistry()`** — Only function authorized to rename chatKeys and rewrite panel-state chatKey references. Must remain the single repair authority.
5. **Draft cache** (`_draftCache` / `_instructionCache`) — Must stay consistent with disk state. Invalidation on write is critical.
6. **`mergeProviderBinding()`** — Source-aware merge that prevents lower-authority sources from overwriting higher-authority data.

## 6. Known Risks and Gaps

1. **No fsync on writes** — `writeJsonAtomic()` in sessionRegistry does not call `fsync()`. Data loss possible on hard crash.
2. **Drafts embedded in session records** — Draft writes and session metadata updates compete for the same file. A draft save triggers a full session record rewrite.
3. **Panel-state files grow unbounded** — `projects[].chats[]` arrays accumulate indefinitely as sessions are added. No pruning mechanism.
4. **Dual codex-panel-state locations** — Primary at `<userData>/codex-panel-state.json`, legacy at `~/.codex/codex-panel-state.json`. Both must be considered for any migration.
5. **localStorage is origin-scoped** — Unsafe for multi-window configurations. Tab order/active tab lost if localStorage is cleared.
6. **Instruction data duplication** — Partially duplicated between `session.instruction` (inline in session record) and `instructions/<id>.json` (legacy directory). Legacy read path still active as fallback.
7. **Panel state read has side effects** — `readClaudeCodePanelState()` and `readPanelState()` call `syncPanelStateSessions()` and `repairSessionRegistry()` as side effects. This means "reading" panel state can mutate registry and panel-state on disk.

## 7. Recommended Future Phases

These are NOT in scope for T199. Listed for planning purposes only.

| Phase | Description | Risk Level |
|-------|-------------|------------|
| A | Extract drafts from session records into standalone storage (e.g., `session-registry/drafts/<chatKey>.json` or SQLite drafts table) | Low |
| B | Remove legacy `instructions/<id>.json` directory; consolidate entirely into session records | Low |
| C | Move session identity metadata (chatKey, cliSessionId, filePath, title, cwd, runtime) into SQLite for indexed queries | Medium |
| D | Shrink `*-panel-state.json` to pure UI layout — session identity fields become foreign references to registry/SQLite | High |
| E | Add `fsync` to `writeJsonAtomic` for crash safety | Low |
| F | Add panel-state pruning (cap chats per project, archive old sessions) | Medium |
