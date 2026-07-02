# Token Metrics Notes

> Status: legacy entry point.
> Authoritative contract: `docs/token-metrics-contract.md`.

This file intentionally stays short. The previous long note had stale formulas
and mojibake text, which repeatedly caused fixes to mix turn usage and context
usage. New work must start from `docs/token-metrics-contract.md`.

Current decisions:

- Turn metrics (`in/out/cache/duration/cost`) come from normalized provider usage.
- ClaudeCode assistant/message `usage` has two consumers: per-turn
  `in/out/cache` accumulates request samples within one user turn; context uses
  only the latest single usage sample as an estimate.
- ClaudeCode explicit context sources still win by order when newer:
  `compact_boundary` is confirmed; `system context_usage` is defensive if a
  provider emits it. SDK `query.getContextUsage()` exists but must not be used
  for automatic sampling until it is proven non-blocking in the app runtime.
- CodeX context follows its own token-count/context-window contract; do not copy
  ClaudeCode context rules into CodeX.
- Dynamic token animation may only interpolate between real samples. Missing
  provider samples must not be replaced with fake growth.

Cleanup tracker:

- Keep provider raw usage interpretation in main-process adapters/normalizers.
- Do not add renderer-side formulas for `input_tokens`, `cached_input_tokens`,
  `cache_read_input_tokens`, or `cache_creation_input_tokens`.
- If a metric bug regresses three times in the same path, add or update a
  contract test before changing the formula again.
