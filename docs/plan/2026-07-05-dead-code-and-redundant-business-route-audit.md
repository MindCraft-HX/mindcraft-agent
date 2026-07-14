# T187 Dead Code / Redundant Business Route Audit

> Date: 2026-07-05
> Status: proposed
> Scope: post-refactor dead code, orphan routes, unused host business lines, dependency cleanup
> Related: R01-R09, Batch 0-5, T174, T184, T185, T186

## 1. Why This Exists

The app has gone through several rounds of architecture refactoring:

- Agent runtime extraction
- renderer convergence
- provider storage migration
- CodeHub activation/cache governance
- main-process IPC split
- shared skills / CLI / TOML primitives

The current architecture is stronger, but repeated migrations also leave behind possible dead routes and redundant business lines. The risk is not only extra lines. Dead code can keep old preload APIs, legacy IPC channels, old windows, old dependencies, and unused business state alive. That makes future refactors harder and can hide security or persistence bugs.

This task is an audit-first cleanup. Do not delete broad directories in the first pass.

## 2. Current Read-Only Findings

This section records static evidence from 2026-07-05. Treat these as candidates, not deletion approval.

### 2.1 Likely Host Business Orphans

These directories/files look inherited from broader `mindcraft-electron` style product lines. They are not obvious parts of the current product positioning: ClaudeCode + CodeX coding agents, docs viewer, lightweight Chat, plugins.

Candidate areas:

| Area | Examples | Current Evidence | Risk |
|---|---|---|---|
| Voice / character websocket line | `src/socket/**`, `src/hook/room/**`, `src/hook/dict/**`, `src/api/mainActivity/**`, `src/api/application/**` | No obvious import from active router/main shell in quick static scan. Uses remote websocket/API product concepts such as character square, voice input, room rename. | Medium: may be unused, but could be retained for future product line. |
| Old general utility layer | `src/utils/request.js`, `src/utils/xml.js`, `src/utils/prj.js`, `src/utils/IndexedDB.js`, `src/utils/audioVisual.js`, `src/utils/filterTool.js`, `src/utils/zip.js` | Some are referenced by inactive-looking feature folders; `src/utils/MarkdownIt.js` is active through mdViewer tests and must not be grouped with these blindly. | Medium: mixed active/dead utility files. |
| UI leftovers | `src/components/Settings.vue`, `src/components/PromptTemplateDrawer.vue/index.vue`, `src/components/codemirror/index.vue`, `src/components/scrollBar.vue`, `src/views/error/index.vue` | The active app uses `SharedSettings` from `packages/agent`; quick static scan did not find active route imports for these host components. | Low/Medium: verify dynamic references before removal. |
| Asset/demo leftovers | large old assets under `src/assets/**`, iconfont demos, voice/video/sound cloning assets | Many assets likely belong to old product modules. Build may still include imported CSS/fonts from active `src/main.js`. | Medium: asset deletion needs bundle reference check. |

Recommended action: first build an import graph and bundle manifest review. Do not manually delete by filename.

### 2.2 Legacy Agent Standalone Window Routes

Current main window routes route agent aliases into CodeHub:

```text
/main/claudeCode -> /main/codeHub?agent=claudeCode
/main/codex      -> /main/codeHub?agent=codex
```

But the app still has standalone window paths:

| Item | Evidence | Question |
|---|---|---|
| `electron/claudeWindow/index.js` | `openClaudeWin()` loads `#/main/claudeCode`. |
| `electron/codexWindow/index.js` | `openCodexWin()` loads `#/main/codex`. |
| `electron/main.js` | Registers `open-claude-win` and `open-codex-win`. |
| `electron/preload.js` | Exposes `openClaudeWin()` and `openCodexWin()`. |

No active renderer call was found in quick scan. Tests still assert these compatibility routes exist.

Decision needed:

- If standalone agent windows are still a product feature, document them as supported.
- If not, mark them deprecated for one release, remove preload APIs/main handlers/window modules, then update route boundary tests and IPC baseline.

Do not remove before T185 Electron E2E boot smoke exists, because window/preload regressions are currently not covered end to end.

### 2.3 Generic Window APIs

Current preload exposes:

- `openNewWindow`
- `openSingleWindow`
- `openExternalWindow`
- `openSystemSettings`

Observed:

- `openExternalWindow` is actively used by agent settings and markdown rendering.
- `openSystemSettings` may be used by permission flows; verify before touching.
- `openNewWindow` / `openSingleWindow` are registered but no active renderer use was found in quick scan.

Risk:

- Generic new-window APIs load arbitrary URLs into Electron windows with `nodeIntegration: true` / `contextIsolation: false` in the current main process implementation. Even if unused, keeping them exposed increases surface area.

Recommended action:

1. Add a static test that fails if `openNewWindow` or `openSingleWindow` are used outside an explicit allowlist.
2. If no supported feature uses them, remove preload exposure and main handlers together.
3. If a feature still needs them, replace with a narrow `openExternalWindow` / mdViewer / plugin-view API.

### 2.5 Lightweight Chat

`/main/chat` and `packages/agent/src/views/ChatView.vue` are active in router and sidebar. This is not dead code.

But its storage and runtime line remains separate from CodeHub:

- `ChatView.vue`
- `useChatSession.js`
- `useChatStream.js`
- `chat-*` IPC channels
- Claude/CodeX simple chat handlers

Decision:

- Keep as a supported "lightweight Chat" product area.
- Do not merge it into CodeHub.
- Its storage cleanup belongs to T175, not this dead-code task.

### 2.6 Dependency Cleanup Candidates

Candidate dependencies should be checked with a dependency graph before removal. Static string checks found:

| Dependency | Evidence |
|---|---|
| `vue-codemirror` | Only obvious use is `src/components/codemirror/index.vue`, which itself looks orphaned. |
| `idb` | Used by `src/utils/IndexedDB.js`, likely tied to old host business line. |
| `js-md5` | Used by `src/utils/encrypt.js`, likely tied to old API auth path. |
| `markmap-*`, `mermaid`, markdown mermaid plugin | Markdown rendering/docs may still depend on these; do not remove without mdViewer tests and manual doc smoke. |
| `adm-zip`, `node-stream-zip` | No quick active reference found, but check transitive build/import code before removal. |
| `compressing` | Active: plugin install and unzip IPC. Do not remove. |
| `axios` | Active: plugin marketplace, image fetch, Claude web search, host request layer. Do not remove. |

Recommended action: use `depcheck` or a local import graph script as evidence, then remove one dependency family per commit.

## 3. Non-Deletion List

These may look redundant but should not be deleted under T187:

| Area | Reason |
|---|---|
| T184 SessionIndex files | Actively being implemented separately. |
| T185/T186 docs | Newly registered architecture follow-ups. |
| `src/utils/MarkdownIt.js` | Active mdViewer renderer and tests depend on it. |
| lightweight Chat | Active route and product scope. |
| legacy provider projection | Belongs to T188 compatibility exit window. |
| stream/abort/done/session map logic | Belongs to T186 lifecycle audit, not dead-code cleanup. |

## 4. Execution Plan

### Phase 0: Inventory, No Deletion

Tooling: Use `madge` (https://github.com/pahen/madge) or `dependency-cruiser` (https://github.com/sverweij/dependency-cruiser) to generate the import graph. Plain `rg`/grep cannot reliably catch dynamic `import()`, `require()`, Vue async-component lazy imports, or Vite alias resolution.

Deliverables:

- import graph report for `src/**`, `electron/**`, `packages/agent/**` (madge or dependency-cruiser output)
- renderer route usage table
- preload API usage table
- IPC channel usage table
- dependency usage table
- asset usage table for large directories
- **cross-reference report**: for each T187 candidate directory, check whether it imports from T188-protected paths (provider legacy stores, `electron-conf`, old IPC channels). If yes, flag as T188-dependent and exclude from Phase 2.

Acceptance:

- every delete candidate has evidence from at least two sources:
  - import graph
  - route/sidebar check
  - IPC/preload usage check
  - tests
  - manual smoke

### Phase 1: Add Guard Tests

Before deletion:

- Add static test for exposed preload APIs that have no renderer call sites.
- Add route test documenting supported routes:
  - `/main/home`
  - `/main/codeHub`
  - `/main/chat`
  - `/main/mdViewer`
  - `/main/pluginMarket`
  - `/main/plugin/:pluginId`
- Add a host orphan import test or script snapshot for known old business directories.

### Phase 2: Narrow Preload/Main Surface (Elevated — Security)

**Priority elevated from original draft.** `openNewWindow` / `openSingleWindow` expose `nodeIntegration: true` / `contextIsolation: false` windows even if no active renderer calls them. This is a security surface issue that should not wait for full Phase 3 orphan cleanup.

Candidates:

- `openNewWindow`
- `openSingleWindow`
- standalone `openClaudeWin` / `openCodexWin`, if product-deprecated

Rules:

- remove preload exposure and main handler in the same commit
- update IPC baseline
- update route/window tests
- verify with Electron smoke once T185 exists

### Phase 3: Remove Low-Risk Orphans

Only after Phase 0/1 and the T187/T188 cross-reference report confirms no T188 dependency:

- unreferenced old host components
- unreferenced old API/socket hooks
- unreferenced old utilities
- unreferenced dependencies tied only to removed files
- stale tests that assert removed compatibility paths

Each removal commit should include:

- file list
- why it is safe
- test command
- rollback note

### Phase 4: Dependency and Asset Cleanup

Remove dependency families only after source deletion:

- `vue-codemirror` if `src/components/codemirror` is removed
- `idb` if IndexedDB wrapper is removed
- `js-md5` if old request/auth utilities are removed
- unused zip libraries only after plugin/import/build paths are checked

Run:

```text
npm run test:contract
npm test
npm run build
```

## 5. Suggested First Commands

```text
rg -n "openNewWindow|openSingleWindow|openClaudeWin|openCodexWin" src packages electron tests
rg -n "from ['\"]@/socket|from ['\"]@/api|from ['\"]@/hook" src packages tests
rg -n "vue-codemirror|idb|js-md5|adm-zip|node-stream-zip|markmap|mermaid" src electron packages tests package.json
```

For dynamic imports and `require()` calls that plain `rg` may miss:

```text
rg -n "import\s*\(|require\s*\(" src electron packages --type js
rg -n "component\s*:\s*\(\)|component\s*:\s*function" src --type js
```

For a stronger inventory, use `madge` or `dependency-cruiser` instead of manual grep. Dynamic imports, `require()` calls, Vue async-component lazy imports, and Vite alias resolution must be included.

## 6. Acceptance

- Dead-code cleanup does not change supported product behavior.
- No T184 SessionIndex implementation files are touched.
- No T188 legacy compatibility path is removed by accident.
- Removed preload/main APIs have no active renderer call sites.
- Bundle builds without newly unused dependency warnings.
- Manual smoke still covers CodeHub, docs, lightweight Chat, plugins, settings.

## 7. Registration

Register as T187 in `docs/TODO.md`.
