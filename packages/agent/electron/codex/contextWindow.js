'use strict';

/**
 * CodeX context window & cost estimation helpers (pure functions).
 *
 * Extracted from codexAgent.js as part of Batch 2.  All functions are
 * pure data transforms — no IO, no module-level mutable state.
 *
 * Responsibilities:
 *   - getCodexContextWindowForModel  — map model name to token limit
 *   - toPositiveNumber               — first-finite-positive extractor
 *   - pickCodexContextUsage          — extract context usage from event fields
 *   - pickCodexContextWindow         — extract context window from event fields
 *   - estimateCodexCostUsd           — GPT pricing estimate
 */

/**
 * Return the context-window size (tokens) for a given model name.
 * Falls back to 258 400 (CodeX binary cap) for unrecognised models.
 *
 * @param {string} [model]
 * @returns {number}
 */
function getCodexContextWindowForModel(model) {
  const lower = String(model || '').toLowerCase()
  if (!lower) return 258400
  // gpt-5 series: SDK reports 1M but CodeX binary caps at ~258K
  if (lower.includes('gpt-5')) return 258400
  // GPT-4 series: 128K
  if (lower.includes('gpt-4')) return 128000
  if (lower.includes('gpt-4o')) return 200000
  if (lower.startsWith('o')) return 200000
  if (lower.includes('claude')) return 200000
  return 258400
}

/**
 * Return the first finite positive number from the given values.
 * Returns 0 if none qualify.
 *
 * @param {...*} values
 * @returns {number}
 */
function toPositiveNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/**
 * Extract the context-usage token count from a CodeX token_count event.
 *
 * Prefers explicit context-usage fields; falls back to
 * `last_token_usage.total_tokens` (the binary's own measurement, which
 * is also what the binary uses for auto-compaction decisions).
 *
 * @param {object} [info={}]
 * @param {object} [payload={}]
 * @returns {number}
 */
function pickCodexContextUsage(info = {}, payload = {}) {
  // Prefer explicit context usage from Codex events; fallback to token estimate.
  const explicit = toPositiveNumber(
    info.context_usage,
    info.context_token_usage,
    info.context_tokens,
    info.current_context_tokens,
    info.context_used_tokens,
    payload.context_usage,
    payload.context_token_usage,
    payload.context_tokens,
    payload.current_context_tokens
  )
  if (explicit > 0) return explicit

  // Fallback: use last_token_usage.total_tokens (the binary's own
  // measurement of current context size, also used for auto-compact).
  // Do NOT use total_token_usage.input_tokens — that is cumulative.
  const last = info.last_token_usage || {}
  return toPositiveNumber(last.total_tokens, 0)
}

/**
 * Extract the context-window size from a CodeX token_count event.
 *
 * @param {object} [info={}]
 * @param {object} [payload={}]
 * @param {number} [fallback=0]
 * @returns {number}
 */
function pickCodexContextWindow(info = {}, payload = {}, fallback = 0) {
  return toPositiveNumber(
    info.model_context_window,
    info.context_window,
    info.context_window_size,
    payload.model_context_window,
    payload.context_window,
    payload.context_window_size,
    fallback
  )
}

/**
 * Estimate CodeX API cost in USD based on GPT-4o-like pricing.
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {number} cacheReadTokens
 * @returns {number}
 */
function estimateCodexCostUsd(inputTokens, outputTokens, cacheReadTokens) {
  const perMillion = { input: 1.25, output: 10.0, cacheRead: 0.125 }
  return (inputTokens / 1e6 * perMillion.input)
    + (outputTokens / 1e6 * perMillion.output)
    + (cacheReadTokens / 1e6 * perMillion.cacheRead)
}

module.exports = {
  getCodexContextWindowForModel,
  toPositiveNumber,
  pickCodexContextUsage,
  pickCodexContextWindow,
  estimateCodexCostUsd,
}
