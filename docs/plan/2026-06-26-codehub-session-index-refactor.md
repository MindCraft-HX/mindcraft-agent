# CodeHub Session Index Refactor Plan

> Date: 2026-06-26
> Status: Proposal
> Related fix: `6731bb5 fix: restore codehub cold-start agent tabs`

## 1. Problem

CodeHub unified tabs currently read tab metadata from mounted provider panels:

```text
CodeHub unifiedTabs
  -> mounted ClaudeCode panel projectTabData
  -> mounted CodeX panel projectTabData
```

This couples two different responsibilities:

- session/tab index restoration
- heavy provider panel rendering and runtime initialization

The 2026-06-25 startup optimization changed CodeHub to mount only the requested agent. That improved initial work, but broke the hidden contract above: an unmounted CodeX panel never runs `loadHistory()`, so CodeX projects are absent from `unifiedTabs` on cold start. Selecting CodeX mounts the panel and makes history appear, proving the data was not lost.

Short-term fix restores eager mounting of all registered agents. That is stable, but it keeps the architectural coupling.

## 2. Target Architecture

Introduce a CodeHub-level `SessionIndex` that is independent from provider panel mounting.

```text
Main process / preload
  -> load agent panel states / session registry summaries
  -> return lightweight project tab summaries

CodeHub SessionIndex
  -> owns unified project tab list
  -> owns active unified tab id
  -> owns tab order reconciliation
  -> tracks notification/running summaries

Provider panels
  -> mount on demand
  -> hydrate their own full project/chat state
  -> publish summary updates back to SessionIndex
```

The important direction is: CodeHub owns navigation index; provider panels own detailed session UI and streaming runtime.

## 3. Design Principles

- `SessionIndex` is read-mostly and lightweight. It must not parse full JSONL messages during CodeHub startup.
- Provider panel mount state must not determine whether a project tab exists.
- Session identity remains `chatKey -> providerSessionId -> filePath`; this refactor must not change registry schema.
- Official provider directories remain read-only for MindCraft metadata. No new sidecars under `~/.claude` or `~/.codex`.
- Provider panels remain the source of truth for active runtime details such as streaming messages, pending tools, queued input, and per-chat UI internals.
- CodeHub may show stale-but-safe summaries during startup, then refresh them when provider panels publish updates.

## 4. Proposed Data Model

```js
{
  agentType: 'claudeCode' | 'codex',
  projectId: 'proj-1',
  tabId: 'codex:proj-1',
  name: 'mindcraft-agent',
  cwd: 'D:/...',
  cwdLocked: true,
  hasDoneNotification: false,
  runningCount: 0,
  hasPendingTool: false,
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  source: 'panel-state' | 'session-registry' | 'runtime',
}
```

Rules:

- `tabId = agentType + ':' + projectId` remains stable for CodeHub tab order.
- `projectId` is still provider-panel-local for now. Do not attempt to merge Claude and CodeX projects by cwd in this refactor.
- `source='runtime'` updates can override summary fields but must not delete projects that still exist in panel-state or registry unless a delete event is explicit.

## 5. Implementation Phases

### Phase 0: Keep Current Stabilization

Keep eager mounting from `6731bb5` until the index is implemented and validated. Do not reintroduce lazy mounting before the index has tests.

### Phase 1: Main/Preload Summary Loader

Add a lightweight IPC, for example:

```text
agent-load-codehub-session-index
```

It should return summaries for all registered agents by reading existing MindCraft-owned state:

- `{userData}/claude-panel-state.json`
- `{userData}/codex-panel-state.json`
- `{userData}/session-registry/`

It must call existing registry restoration helpers where needed, but it must not trigger provider scans that parse full official transcripts.

### Phase 2: CodeHub `useSessionIndex`

Create a renderer composable:

```text
packages/agent/src/components/codeHub/useSessionIndex.mjs
```

Responsibilities:

- load initial summaries
- expose ordered `unifiedTabs`
- preserve `codehub_tab_order`
- preserve `codehub_active_tab`
- reconcile explicit deletes
- accept runtime summary patches from mounted panels

At this point panels can still be eagerly mounted. The goal is to prove the index matches current UI behavior.

### Phase 3: Provider Summary Publisher

Each provider panel exposes or emits summary updates:

```js
{
  agentType,
  projects: projectTabData,
}
```

CodeHub applies these as runtime patches into `SessionIndex`.

Delete semantics must be explicit:

- Closing a project tab emits `project.deleted`.
- Empty runtime `projectTabData` must not mean "delete all known projects" during startup.

### Phase 4: Re-enable Lazy Panel Mounting

Only after Phases 1-3 pass tests, change CodeHub startup to:

```text
mount requested/active provider panel only
load SessionIndex for all provider tabs
mount another provider only when activating its tab or opening settings requiring it
```

Expected behavior:

- Cold start shows ClaudeCode and CodeX tabs immediately from index.
- Activating a CodeX tab mounts CodeX panel and hydrates full chat state.
- If CodeX hydration discovers newer summaries, it patches the index without dropping other tabs.

### Phase 5: Remove Old Coupling

After one release cycle:

- remove CodeHub's direct dependency on `panel.projectTabData` for initial tab existence
- keep provider `projectTabData` only as runtime patch input
- update architecture docs and session pitfalls

## 6. Risk Matrix

| Risk | Severity | Likelihood | Cause | Mitigation |
|---|---:|---:|---|---|
| Cold-start tabs disappear again | P0 | Medium | Empty runtime panel update overwrites index | Treat empty startup updates as non-destructive unless explicit delete |
| Deleted project reappears | P1 | Medium | Index reads stale panel-state/registry after delete | Delete must update panel-state and registry tombstone/delete path before index reload |
| Active tab points to unmounted provider and cannot switch project | P1 | Medium | CodeHub activates index tab before panel ref exists | Mount provider, await `ready`, then call `switchProject`; show loading overlay meanwhile |
| Running/pending indicators stale | P2 | High | Index startup cannot know live runtime before panel/main events arrive | Accept stale zero on startup; patch from `agent:event` and mounted panels |
| Notification red dot lost | P1 | Medium | `hasDoneNotification` split between panel-state and runtime | Persist project-level notification in panel-state; index reads it; runtime patches it |
| Tab order corruption | P2 | Medium | Index includes tabs before panels mount, old order prunes unknown ids | Reconcile order against index-visible tabs, not mounted-panel tabs |
| Cross-agent project merge confusion | P2 | Low | Same cwd has Claude and CodeX projects | Do not merge by cwd in this refactor; keep `agentType:projectId` identity |
| Extra startup IPC slows app | P2 | Medium | Summary loader does heavy registry repair or transcript scan | Strictly avoid full JSONL scan; cap loader to panel-state/registry summaries |
| Registry migration bugs resurface | P0 | Low-Medium | Loader mutates registry during read | Phase 1 loader should be read-only except existing safe panel-state backfill path; add dry-run tests |
| Independent windows diverge | P1 | Medium | CodeHub index and standalone agent windows mutate state separately | Continue persisting through existing panel-state/registry APIs; index reloads on focus or explicit events |

## 7. Required Tests

Minimum automated tests before Phase 4:

- CodeHub index loads ClaudeCode and CodeX projects without mounting provider panels.
- Saved `codehub_active_tab=codex:proj-x` restores a CodeX tab from index.
- Empty provider runtime update during initial mount does not delete index tabs.
- Explicit project delete removes the tab and keeps it removed after reload.
- Tab order reconciliation preserves hidden provider tabs.
- Notification state loaded from panel-state appears in index before provider panel mount.
- Runtime patch from CodeX panel updates `runningCount` without replacing ClaudeCode tabs.

Manual dev checks:

- Cold start with both ClaudeCode and CodeX history.
- Cold start with saved active CodeX tab.
- Cold start with no CodeX history.
- Close a CodeX project, restart, confirm it does not reappear.
- Start CodeX task, switch to ClaudeCode, confirm running indicator and completion notification still update.

## 8. Rollback Plan

Keep `6731bb5` eager mounting behavior as the safe fallback until Phase 4 is stable.

Rollback switch:

```js
const mountedMap = reactive(createMountedMap(agentKeys.value))
```

If Phase 4 causes any tab-loss regression, revert only the lazy mounting change and keep `SessionIndex` as a passive diagnostic/index layer until fixed.

## 9. Decision

Do not start with lazy mounting again. Start by introducing `SessionIndex` while keeping eager mounting. Once the index matches current behavior, then re-enable lazy mounting. This avoids repeating the same failure mode where a performance optimization silently changes state restoration semantics.
