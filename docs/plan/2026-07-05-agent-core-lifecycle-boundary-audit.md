# T186 Agent Core Lifecycle Boundary Audit

> Date: 2026-07-05
> Status: proposed
> Scope: ClaudeCode / CodeX core lifecycle boundaries, not line-count refactor
> Related: T165, T179, T181, T183, T184, R09

## 1. Why This Exists

The project has successfully extracted many leaf modules:

- config
- environment
- skills / marketplace
- CLI executor
- TOML IPC
- tab/history composables
- token metrics
- cache primitives

The remaining risk is not simply that `claudeAgent.js` and `codexAgent.js` are large. The risk is that core lifecycle responsibilities are still tightly adjacent:

```text
run ownership
  -> queue / pending input
  -> abort / interrupt
  -> stream event mapping
  -> done/finalization
  -> session registry binding
  -> metrics flush
  -> notification/event bridge
```

These areas should not be split just to reduce line count. But they do need a boundary audit so future work knows which seams are stable and which are intentionally fused.

## 2. Decision

Do a boundary audit before any new agent-core extraction.

The output should be a map and a small set of guardrails, not a rewrite.

If the audit finds a safe extraction, it must meet all of these:

- no change to stream/abort/done ordering
- no new event names or IPC channels unless registered
- no loss of provider-specific behavior
- contract tests or characterization tests exist before extraction
- rollback can revert a small module, not a cross-file lifecycle rewrite

## 3. Work Graph To Produce

For each provider, document the lifecycle graph:

```text
send request
  -> create / resume provider session
  -> register runtime/run ownership
  -> stream event loop
  -> assistant/tool/progress mapping
  -> metrics sample handling
  -> done/result/failure/abort
  -> session registry update
  -> renderer event bridge
  -> notification/final UI state
```

For every edge, record:

- owner file/function
- source of truth
- cancellation/abort behavior
- dedup key or run id
- required ordering
- current tests
- known regressions

## 4. Stable Boundaries

These boundaries are already safe and should be preserved:

| Boundary | Rule |
|---|---|
| Token metrics | provider raw -> normalizer -> TurnStore -> snapshot |
| Session identity | `chatKey`, `cliSessionId`, `filePath` remain separate |
| Provider storage | SQLite provider repository owns provider records; official files are projections |
| Cache primitives | file-derived caches and metrics dedup use T183 rules |
| Renderer activation | P0/P1/P2/P3 work graph from T179/T181 |
| CodeHub tab existence | T184 SessionIndex owns lightweight tab presence, provider panels patch runtime only |

## 5. Boundaries Not Yet Safe To Split

Do not extract these until the audit proves ordering and tests are strong enough:

- stream loop
- abort/interrupt/done finalization
- queued input / pending input delivery
- provider session map mutation
- run ownership cleanup
- final metrics flush
- notification terminal event emission

These are state-machine edges. Moving them without a graph usually creates duplicate sessions, missed done, stuck running state, or broken resume.

## 6. Phase 0: Inventory

No production code changes.

Deliverables:

- list of lifecycle functions in `claudeAgent.js`
- list of lifecycle functions in `codexAgent.js`
- event/channel table for stream/progress/done/abort/failure
- state maps and their mutation points
- tests covering each lifecycle phase
- missing test list

## 7. Phase 1: Characterization Tests

Add tests before extraction for any risky edge:

- abort while stream active
- provider returns result without expected live samples
- done after scan race
- resume after restart
- duplicate done event
- pending input while running
- tool/progress event with no final assistant text

Prefer small provider-agnostic fixtures where possible, but do not erase provider differences.

## 8. Phase 2: Optional Thin Extracts

Only after Phase 0/1:

Allowed candidates:

- pure event normalization helpers
- run-state read-only selectors
- small finalization payload builders
- shared error classification

Forbidden candidates:

- a single generic Claude/CodeX stream runner
- a single generic abort/done state machine
- moving provider session maps into renderer state
- moving official transcript side effects into shared UI helpers

## 9. Acceptance

- A future developer can tell which lifecycle edges are intentionally fused.
- Any extraction candidate has tests before code moves.
- No new module owns both provider-specific SDK behavior and renderer UI state.
- The audit reduces accidental edits in `claudeAgent.js` / `codexAgent.js` without pretending they can be trivially split.

## 10. Registration

Register as T186 in `docs/TODO.md`.
