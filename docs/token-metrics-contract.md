# Token Metrics Contract

> Last updated: 2026-06-27
> Purpose: replace ad-hoc token metric fixes with a strict data contract for ClaudeCode and CodeX.

## 1. Decision

Token metrics must be contract-driven. UI code must not interpret provider raw usage directly.

Canonical pipeline:

```text
provider raw event/jsonl
  -> provider adapter
  -> normalized MetricSample
  -> TurnStore
  -> snapshot
  -> UI consumers
```

Allowed responsibilities:

| Layer | Responsibility | Forbidden |
| --- | --- | --- |
| Provider adapter | Understand ClaudeCode/CodeX raw fields | Emit ambiguous totals as current-turn tokens |
| Normalizer | Convert to UI `in/out/cache/context` semantics | Know UI component state |
| TurnStore | Own current/final/session-context boundaries | Let final/live/session values overwrite each other accidentally |
| UI | Render snapshots only | Re-parse provider usage or derive token formulas |

## 2. Public UI Semantics

| UI field | Meaning |
| --- | --- |
| `in` | Current turn billable input side: regular input + cache creation; excludes cache read |
| `out` | Current turn assistant output tokens |
| `cache` | Current turn cache read tokens |
| `context` | Current session context occupancy; independent from `in/out/cache` |
| `duration` | Current/final turn elapsed time |

Consumer boundaries:

| Consumer | Reads | Must not read |
| --- | --- | --- |
| StatusBarMetrics | Current turn live/final snapshot + session context | Session cumulative totals as current turn; transcript/session aggregate token totals |
| TokenMetaRow | Final turn snapshot | Live samples after finalization |
| Compact icon | Session context snapshot | Current turn `in/out/cache` |
| History/Home aggregate | Historical final snapshots / provider aggregate | Current live StatusBar state |
| Panel state | Session UI state such as model/context/git/draft | Persisted current-turn `in/out/cache/duration/cost` |

Clarification:
- `StatusBarMetrics` and `TokenMetaRow` are not the same UI, and they must not be forced to show the same thing at the same time.
- They do share the same normalized snapshot contract and turn ownership rules.
- The difference is consumer scope:
  - `TokenMetaRow` renders one finalized snapshot for one completed assistant turn.
  - `StatusBarMetrics` renders the active session's current live snapshot while running, and the latest finalized snapshot for that same session when idle.
- "Shared source" means shared normalized snapshot family, not shared renderer state and not identical display semantics.

## 3. Provider Source Semantics

### ClaudeCode

| Source | Semantics | StatusBar use |
| --- | --- | --- |
| SDK `assistant.message.usage` | Real live request usage if SDK emits it | Allowed through adapter/normalizer; current-turn `in/out/cache` may accumulate samples, context may use the latest single-sample estimate |
| SDK `result.usage` | Final turn-consumption usage | Allowed as final sample for `in/out/cache/duration/cost` |
| SDK `query.getContextUsage()` | Official current context-window snapshot | Not used for automatic sampling: local validation showed it can block around 60s before init and fail after assistant/result on the current transport |
| JSONL assistant usage | Transcript request sample for turn `in/out/cache`; latest single sample can estimate context | Allowed only after boundary guard |
| compact boundary | Confirmed transcript context fallback | Context only |
| system context_usage | Legacy/defensive transcript parser branch; not observed as a reliable ClaudeCode source in current samples | Context only if present |

Rules:
- Claude assistant/message `usage` has two different consumers:
  - Current-turn consumption: accumulate request samples within the same user turn for `in/out/cache`, because tool-heavy turns can produce multiple real usage records.
  - Current context estimate: use only the latest single assistant/message usage sample, computed as `inputTokens + cacheReadTokens + outputTokens`; never sum multiple samples for context.
- Claude assistant/result `usage` normalizes current-turn tokens as `in = input_tokens + cache_creation_input_tokens`, `cache = cache_read_input_tokens`, `out = output_tokens`; it must not emit context because result usage may be current-turn accumulated consumption, not a single request context snapshot.
- Claude transcript restore must identify user-turn boundaries. Without an explicit `tokenSinceMs`, JSONL metrics may summarize only the latest user turn for StatusBar; they must never sum the whole transcript as current-turn `in/out/cache`.
- Claude history/footer restore must aggregate all assistant usage samples inside the same user turn and attach the final `_turnTokens` to the last renderable assistant message in that turn. Tool-result-only `user` entries are not new turn boundaries.
- Claude context may also update from explicit context samples. Current reliable transcript source is `compact_boundary`; the legacy `system context_usage` branch is accepted only if the provider emits it. SDK `query.getContextUsage()` must stay manual/diagnostic until proven non-blocking in the app runtime.
- `result.usage` must not be used as context. If `result.usage` is missing token fields, finalization must preserve the live/request aggregate instead of replacing it with zeros.
- Do not call `query.getContextUsage()` from 1s polling or live usage events. It is a control request over the active CLI transport, not a cheap metric getter in the current integration.
- If no valid live SDK/JSONL usage exists before turn end, UI must not fake token growth.

### CodeX

| Source | Semantics | StatusBar use |
| --- | --- | --- |
| `token_count.last_token_usage` | Last model-request usage sample | Fallback only when turn-start totals are unavailable |
| `token_count.total_token_usage` | Session cumulative total | Never direct; delta only when start totals are known |
| `turn.completed.usage` | Final fallback; may be empty/unstable | Allowed only through adapter/normalizer |
| `model_context_window` / context fields | Context capacity/occupancy | Context only |

Rules:
- If `total_token_usage` and turn-start totals exist, current-turn `in/out/cache` must use `total_token_usage - turnStartTotals`. This covers multi-request/tool-heavy turns and naturally deduplicates repeated `token_count` rows.
- If turn-start totals are unavailable, `last_token_usage` may be used only as a degraded latest-request fallback. A zero field is valid.
- `last_token_usage.cached_input_tokens = 0` must not fallback to `total_token_usage.cached_input_tokens`.
- `total_token_usage` must never be displayed directly as current-turn tokens.
- `turn.completed.usage` must not be treated as per-turn final when it looks session-cumulative and no current-turn live authority exists. In that case, degrade conservatively instead of fabricating precise turn tokens.
- Running StatusBar queries must not fall back to historical JSONL final turns. During `thinking=true`, CodeX token fields may come only from a fresh current-turn TurnStore snapshot; JSONL/session aggregate may supplement context only.

## 4. Phase Plan

### Phase 0: Stop The Bleeding

Goal: fix known clearly wrong values without changing UI behavior.

- Fix CodeX total/last mixing that displayed session cumulative cache as current-turn cache.
- Add regression fixture for `last_token_usage.cached_input_tokens = 0` with huge `total_token_usage.cached_input_tokens`.
- Keep dynamic animation unchanged until data correctness is stable.

### Phase 1: Data-Layer Contract Guards

Goal: make invalid source/consumer combinations hard to express.

Status: started. TurnStore now accepts an explicit `scope` (`turn-live`, `turn-final`, `session-context`, `session-total`). Session context/total samples are stripped of turn token fields before they can update live snapshots.
Claude history restore is now also part of this boundary: the main process annotates transcript assistant entries with normalized `_turnTokens`, and the renderer consumes that payload only. Renderer-side raw `message.usage` formulas are forbidden.

- Introduce or formalize `MetricSample` fields:
  - `scope`: `turn-live` / `turn-final` / `session-context` / `session-total`
  - `source`: provider source name
  - `provider`: `claude` / `codex`
- TurnStore should accept current-turn tokens only from `turn-live` or `turn-final` samples.
- Session context updates must not carry `in/out/cache`.
- Frontend metrics updates must consume snapshots, not raw usage.
- Session/file aggregate helpers may provide `contextUsage/contextWindow`, but they must not feed StatusBar `inputTokens/outputTokens/cacheReadTokens`.

### Phase 2: Golden Fixtures

Goal: validate real provider transcripts before UI validation.

Add fixtures for:
- Claude normal turn.
- Claude tool-heavy turn.
- Claude compact boundary then continuing assistant usage.
- Claude third-party provider with high cache read.
- CodeX long session with huge totals and zero last cache.
- CodeX first turn with no cache.
- CodeX repeated token_count events.

Expected outputs must separate:

```js
{
  statusBarLive: { inputTokens, outputTokens, cacheReadTokens, contextUsage },
  finalTurn: { inputTokens, outputTokens, cacheReadTokens, durationMs },
  context: { contextUsage, contextWindow }
}
```

### Phase 3: UI And Animation

Goal: restore dynamic display only after contract correctness.

- StatusBar can animate only between real increasing samples.
- If a provider emits no intermediate usage, StatusBar shows time/context during run and final tokens after result.
- No fake token growth, no reuse of previous turn tokens.
- Dynamic display does not mean continuous growth. Stepwise jumps are acceptable when provider samples are sparse.
- ClaudeCode and CodeX have different live sample ceilings: CodeX can usually advance on `token_count`; ClaudeCode can advance only when SDK `assistant.message.usage` or isolated current-turn JSONL usage exists before final result.
- Next implementation step is consumer convergence, not visual interpolation: ClaudeCode runtime metrics should route by `sessionId` like CodeX, instead of depending on `activeTab` during live updates.

## 5. Live Sample Diagnostics

Use this only for debugging why StatusBar live tokens do or do not move.

- Recommended: enable diagnostics from the app System Settings toggle. This also enables `diagnostics.tokenMetricsDebug` automatically.
- Manual fallback: set `diagnostics.tokenMetricsDebug = true` in `app-settings.json`.
- Run the app in `dev`, reproduce one ClaudeCode turn or one CodeX turn, then inspect `token-metrics-diagnostics.log`.
- Each completed turn now writes one `turn-sample-summary` line.

Interpretation:

- `codex.tokenCount > 0` but live UI still does not move: the problem is in our routing/render path, not in provider sample availability.
- `claude.sdkLive = 0` and `claude.jsonlPoll = 0`: that turn had no real live token sample before final result; UI should not fabricate growth.
- `jsonlPoll > 0` but `sawLiveTurnTokens = false`: transcript polling saw session activity/context, but not isolated current-turn token growth.

## 6. Acceptance Criteria

- CodeX long sessions never show session cumulative totals as current-turn `in/cache`.
- Claude compact context never pollutes current-turn tokens.
- StatusBar and TokenMetaRow share the same final snapshot contract for completed turns, but remain different consumers.
- Refreshing a session does not convert historical aggregate into current turn metrics.
- Starting a new CodeX turn does not briefly revive the previous turn's `in/out/cache` while waiting for the first live sample.
- Dynamic token growth appears only when real live samples exist.

## 6.1 Dirty State Audit

When metrics look unstable, check these in order before changing provider formulas:

1. `panel state`
   - Must not persist current-turn fields: `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens/durationMs/costUsd`.
   - Allowed only: model, git, context snapshot, draft, session UI state.
2. `TurnStore current/final`
   - `session-context` samples may update only `context/duration`.
   - Context-only snapshots must not win over a real final turn snapshot.
3. `history/jsonl restore`
   - Footer/history must come from finalized `_turnTokens` or finalized snapshot reconstruction.
   - Session aggregate helpers must not be treated as current-turn tokens.
4. `renderer tab.metrics`
   - Repeated identical payloads should not rewrite state.
   - Idle tab restore must not trigger perpetual refresh loops.
5. `main-process pollers`
   - A run-scoped poller must stop once `streamClosed`, `doneSent`, or `resultReceived` is true.
   - Same `sessionId` must not keep more than one active poller.

## 6.2 Performance Guardrails

- `1s` polling is acceptable only for active runs or bounded done-retry windows.
- Idle sessions may query once on switch/restore/history load, but must not keep polling forever.
- If diagnostics show repeated `jsonl-poll` rows for the same idle `sessionId`, treat it as a lifecycle bug, not a rendering issue.

## 6.3 Renderer Convergence Gap

Current status:

- Main-process semantics are mostly converged: `normalizer -> TurnStore -> snapshot`.
- Renderer semantics are not fully converged yet, especially on first hydrate and live routing.

Known gap:

- ClaudeCode still has renderer paths that depend on `activeTab` timing more directly than CodeX.
- This can produce a split where history/footer is already correct, but the first `StatusBarMetrics` render for that session is empty until the user clicks the session again.

Required direction:

- ClaudeCode and CodeX renderer layers should both consume metrics by stable `sessionId/chatKey` ownership, not by incidental active-tab timing.
- First entry into a historical session must render the latest final snapshot without requiring a second manual click.
- Renderer convergence is a remaining architecture task, not an optional polish item.

Renderer acceptance:
- For one completed turn, that turn's `TokenMetaRow` shows that turn's own finalized snapshot only.
- For the active session, `StatusBarMetrics` shows:
  - running turn: current live snapshot for that turn
  - idle session after completion: latest finalized snapshot for that session
  - after refresh/reopen: reconstructed latest finalized snapshot for that session, not stale panel state and not session aggregate totals
- Refresh must not produce any of these split-brain states:
  - footer populated but StatusBar empty
  - footer correct but StatusBar showing panel-state leftovers
  - compact/context icon correct while StatusBar `in/out/cache` comes from session totals

Non-goals:
- Do not make `StatusBarMetrics` render every historical turn at once.
- Do not let `TokenMetaRow` subscribe to live token samples after the turn is finalized.

## 7. Incident Review: Persisted Panel Metrics

2026-06-27 root cause from the `token消耗展示` production session:

- The provider/TurnStore path was not the only StatusBar source.
- CodeX panel state had persisted dirty `tab.metrics` values such as huge `inputTokens` and `cacheReadTokens`.
- On reload, renderer restored those values before query/JSONL/TurnStore could replace them.
- Message footer looked correct because it consumed JSONL `_turnTokens`; bottom StatusBar looked wrong because it consumed restored panel state.
- Existing tests covered provider samples, TurnStore, JSONL fallback, and final turn snapshots, but did not cover dirty persisted renderer state.

Permanent contract:

- Panel state may persist session UI fields: model, effort, context snapshot, git snapshot, draft, active chat/project, registry mapping.
- Panel state must not persist current-turn token/cost fields:
  - `inputTokens`
  - `outputTokens`
  - `cacheReadTokens`
  - `cacheCreationTokens`
  - `durationMs`
  - `costUsd`
- Restore code must sanitize legacy panel state before assigning `tab.metrics`.
- Persist code must strip those fields before writing panel state.

Regression coverage:

- `tests/persisted-metrics.test.mjs` verifies the shared persisted metrics sanitizer.
- `tests/claude-runtime-state.test.mjs` verifies Claude persisted metrics exclude current-turn token fields.
- `tests/codex-runtime-state.test.mjs` verifies CodeX persisted metrics exclude current-turn token fields.

Debug rule:

- If StatusBar and message footer disagree after refresh, first inspect panel state restore/persist paths before changing provider formulas.
