# Token Metrics Contract

> Last updated: 2026-06-26
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
| StatusBarMetrics | Current turn live/final snapshot + session context | Session cumulative totals as current turn |
| TokenMetaRow | Final turn snapshot | Live samples after finalization |
| Compact icon | Session context snapshot | Current turn `in/out/cache` |
| History/Home aggregate | Historical final snapshots / provider aggregate | Current live StatusBar state |

## 3. Provider Source Semantics

### ClaudeCode

| Source | Semantics | StatusBar use |
| --- | --- | --- |
| SDK `assistant.message.usage` | Real live usage if SDK emits it | Allowed through adapter/normalizer |
| SDK `result.usage` | Final turn usage | Allowed as final sample |
| JSONL assistant usage | Transcript sample; may update session context; may update current turn only if isolated by turn boundary/time | Allowed only after boundary guard |
| compact boundary | Session context sample | Context only |

Rules:
- `contextUsage/contextWindow` never derives current-turn `in/out/cache`.
- If no valid live SDK/JSONL usage exists before turn end, UI must not fake token growth.

### CodeX

| Source | Semantics | StatusBar use |
| --- | --- | --- |
| `token_count.last_token_usage` | Last request/turn usage sample | Allowed as a coherent set |
| `token_count.total_token_usage` | Session cumulative total | Never direct; delta only when start totals are known |
| `turn.completed.usage` | Final fallback; may be empty/unstable | Allowed only through adapter/normalizer |
| `model_context_window` / context fields | Context capacity/occupancy | Context only |

Rules:
- If `last_token_usage` exists, use it as one coherent sample. A zero field is valid.
- `last_token_usage.cached_input_tokens = 0` must not fallback to `total_token_usage.cached_input_tokens`.
- `total_token_usage` can enter current turn only as `total - turnStartTotals`.

## 4. Phase Plan

### Phase 0: Stop The Bleeding

Goal: fix known clearly wrong values without changing UI behavior.

- Fix CodeX total/last mixing that displayed session cumulative cache as current-turn cache.
- Add regression fixture for `last_token_usage.cached_input_tokens = 0` with huge `total_token_usage.cached_input_tokens`.
- Keep dynamic animation unchanged until data correctness is stable.

### Phase 1: Data-Layer Contract Guards

Goal: make invalid source/consumer combinations hard to express.

- Introduce or formalize `MetricSample` fields:
  - `scope`: `turn-live` / `turn-final` / `session-context` / `session-total`
  - `source`: provider source name
  - `provider`: `claude` / `codex`
- TurnStore should accept current-turn tokens only from `turn-live` or `turn-final` samples.
- Session context updates must not carry `in/out/cache`.
- Frontend metrics updates must consume snapshots, not raw usage.

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

## 5. Acceptance Criteria

- CodeX long sessions never show session cumulative totals as current-turn `in/cache`.
- Claude compact context never pollutes current-turn tokens.
- StatusBar and TokenMetaRow share the same TurnStore final snapshot for completed turns.
- Refreshing a session does not convert historical aggregate into current turn metrics.
- Dynamic token growth appears only when real live samples exist.
