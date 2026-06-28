# Renderer Convergence Plan

> Last updated: 2026-06-27
> Scope: ClaudeCode + CodeX renderer architecture convergence after the token metrics refactor.
> Goal: stop repeated split-brain regressions caused by duplicated renderer lifecycle logic, while preserving provider-specific behavior where it actually belongs.

## 1. Why This Plan Exists

The main-process side is already substantially more converged than before:

```text
provider raw event/jsonl
  -> adapter
  -> normalizer
  -> TurnStore
  -> snapshot
```

But the renderer side is still partially split:

- ClaudeCode and CodeX maintain separate `index.vue` lifecycle code for live metrics, final metrics, tab activation, restore, and timer ownership.
- Shared token semantics already exist, but renderer consumers still differ in how they hydrate and route state.
- Two near-duplicate `StatusBarMetrics.vue` components still exist.
- The result is recurring regressions where footer/history is correct, but the bottom status bar is empty, stale, or restored from the wrong source.

This is no longer just a token-metrics problem. It is a renderer ownership problem.

## 2. Decision

We should converge renderer boundaries, but not force ClaudeCode and CodeX into one monolithic component.

Target architecture:

```text
provider-specific stream/runtime
  -> provider-specific renderer adapter
  -> shared session/metrics controller
  -> shared renderer consumers
```

What should be shared:

- session-scoped metrics ownership
- status bar hydration rules
- finalized turn attachment rules
- persisted panel-state sanitization
- live-duration timer ownership
- "first hydrate" and "switch tab" restore rules
- common status bar UI component

What should stay provider-specific:

- how live samples are produced
- how final samples are queried
- provider stream event interpretation
- provider-only UX such as slash/menu/tool details

## 3. Current Split Points

### 3.1 Metrics state source is asymmetric

Current status:

- ClaudeCode uses local mutable `metricsData` state plus imperative `Object.assign/reset`.
- CodeX derives `metricsData` from `activeTab.metrics` with a computed view.

Problem:

- The same normalized snapshot contract is consumed through two different renderer state models.
- Bugs often reproduce in only one provider because the renderer state ownership differs before rendering even starts.

### 3.2 StatusBar update lifecycle is duplicated

Both agents separately implement:

- live timer start/stop
- `refreshMetricsForChat`
- metrics merge rules
- active tab synchronization
- first hydrate after history restore
- done/final retry behavior

Problem:

- The implementation is similar enough to drift, but different enough that fixing one side does not fix the other.

### 3.3 Shared semantics, duplicated UI

Two `StatusBarMetrics.vue` components still exist with mostly duplicated structure and animation behavior.

Problem:

- Visual or state fixes must be applied twice.
- Renderer regressions can hide behind tiny template or watcher differences.

### 3.4 Session restore and live routing are not fully unified

The main-process side is mostly session-owned now, but renderer paths still sometimes depend on incidental active-tab timing.

Problem:

- "Click session once more and it appears" is a renderer ownership smell, not a provider formula problem.

## 4. Target Renderer Contract

Renderer consumers must follow one ownership rule:

> All session metrics rendering must be routed by stable session ownership first, and by active-tab visibility second.

Meaning:

- Metrics are always owned by one session record.
- The active tab chooses which owned snapshot is currently visible.
- Live/final/context samples update the session record first.
- The bottom status bar renders the active session's current snapshot view.
- Footer/TokenMetaRow renders only finalized turn snapshots attached to messages.

## 5. Proposed Shared Layers

### 5.1 Shared session metrics controller

Create a shared renderer composable under:

```text
packages/agent/src/components/agentCommon/composables/useAgentMetricsController.*
```

Responsibilities:

- own one session's renderer-facing metrics state
- accept normalized samples from provider adapters
- accept first-hydrate snapshot from query/history restore
- prevent context-only samples from overwriting finalized turn tokens
- own live-duration timer state
- expose one stable view model for StatusBar

Inputs:

- `sessionId`
- `thinking`
- `thinkingStart`
- normalized metrics samples
- final snapshot query results
- context-only refresh results

Outputs:

- `statusBarMetrics`
- `liveDurationMs`
- `applyMetricsSample(...)`
- `applyHydratedSnapshot(...)`
- `syncThinkingState(...)`
- `resetForNewTurn(...)`

### 5.2 Shared StatusBar component

Converge both current components into one shared file, for example:

```text
packages/agent/src/components/agentCommon/components/StatusBarMetrics.vue
```

Provider-specific differences should become props/helpers only:

- model label formatter
- compact tooltip text
- compact action label

Non-negotiable shared behavior:

- animated token number watchers
- duration display
- context ring behavior
- cache visibility logic
- branch/api usage rendering

### 5.3 Shared session restore guard

Restore paths should converge on one rule:

- panel state may restore UI/session fields
- final metrics hydrate must come from sanitized persisted state only if explicitly allowed
- current-turn token fields must always come from snapshot reconstruction, never raw panel restore

This likely belongs beside existing persisted-metrics helpers, not inside each renderer page.

## 6. Provider Adapter Responsibilities In Renderer

Renderer convergence does not mean stream convergence.

Each provider renderer should still own a thin adapter layer:

### ClaudeCode renderer adapter

Should only decide:

- how Claude live events become normalized metrics samples
- when transcript/query refresh is needed
- how compact state and Claude-only run state are signaled

Should not own:

- independent status bar state machine
- independent duration timer rules
- independent merge formulas for shared fields

### CodeX renderer adapter

Should only decide:

- how `token_count`, `turn.completed`, and query results become normalized samples
- done-retry scheduling policy
- CodeX-specific run/session ownership edges

Should not own:

- a separate status bar state model from ClaudeCode
- separate animation semantics

## 7. Execution Phases

### Phase 1: Converge the contract, not the UI behavior

Goal:

- introduce the shared controller without changing visible behavior intentionally

Tasks:

- define the controller interface
- move common timer and merge rules into shared code
- leave both existing pages wired to the shared controller

Acceptance:

- no UI behavior regression intended
- CodeX and ClaudeCode both consume shared controller APIs

### Phase 2: Converge the StatusBar component

Goal:

- eliminate duplicate `StatusBarMetrics.vue`

Tasks:

- create shared component
- move shared animation/watch/template logic there
- keep provider-specific display differences as props

Acceptance:

- only one status bar implementation remains
- both providers render through it

### Phase 3: Converge first-hydrate and active-tab restore

Goal:

- eliminate "second click required" and similar restore-order bugs

Tasks:

- route initial hydrate by stable session ownership
- make active-tab switch a pure visibility switch, not a hidden data fetch authority

Acceptance:

- first entry into a historical session shows latest final snapshot
- footer/status bar/context icon no longer disagree on initial render

### Phase 4: Converge renderer tests

Goal:

- test the consumer layer directly instead of only main-process semantics

Required test coverage:

- current turn reset on new send
- context-only sample cannot overwrite final tokens
- first hydrate shows latest finalized snapshot
- refresh/reopen does not revive dirty panel-state tokens
- footer and status bar consume the same finalized snapshot contract, while remaining different consumers

## 8. Non-Goals

Do not do these in this plan:

- merge ClaudeCode and CodeX full page components into one page
- remove provider-specific stream adapters
- redesign all chat/session state management at once
- change token semantics again

## 9. Why Previous Fixes Regressed

The repeated regressions were not mainly caused by wrong token formulas anymore.

More accurate diagnosis:

- we converged provider semantics faster than renderer consumers
- the same snapshot family was consumed through multiple renderer ownership paths
- tests covered normalizer/TurnStore/history better than renderer hydration and active-tab restore
- duplicated renderer implementations drifted after each fix

So the next step should not be another formula patch.

It should be renderer consumer convergence.

## 10. Recommended Next Move

Recommended order:

1. build the shared metrics controller
2. wire ClaudeCode and CodeX to that controller
3. merge the status bar component
4. add renderer contract tests

This is worth doing as a planned architecture task, not as an opportunistic patch.

## 11. Implementation Log

### 2026-06-28

Completed:

- Added `packages/agent/src/components/agentCommon/composables/useAgentMetricsController.js`.
- Wired CodeX status-bar metrics through the shared controller without changing provider-side sample semantics.
- Wired ClaudeCode status-bar merge/timer/new-turn/reset rules through the shared controller without changing Claude query timing or stream interpretation.
- Added `tests/agent-metrics-controller.test.mjs` for new-turn reset, context-only updates, and active-session view construction.
- Replaced the duplicated ClaudeCode / CodeX `StatusBarMetrics.vue` files with `packages/agent/src/components/agentCommon/components/StatusBarMetrics.vue`.
- Kept provider-specific differences as props: Claude model shortening and CodeX compact tooltip copy.
- Added a renderer convergence contract test to prevent reintroducing duplicated `StatusBarMetrics.vue` implementations.
- Narrowed CodeX active-tab metrics hydration skip logic: non-running tabs skip the active-tab query only when they already have visible status-bar snapshot data.

Explicitly not completed yet:

- First-hydrate / active-tab restore is improved for CodeX but not fully unified between ClaudeCode and CodeX.
- Footer and status-bar renderer consumers are not yet covered by direct component-level tests.

Reason for the boundary:

- `packages/agent/src/components/claudeCode/index.vue` is large and contains historical encoding-damaged comments. Broad rewrites there have a high regression risk. Continue with small, build-verified patches only.
