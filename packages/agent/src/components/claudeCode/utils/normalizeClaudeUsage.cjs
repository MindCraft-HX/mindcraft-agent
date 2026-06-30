'use strict'

function toSafeInt(v) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function isNativeClaudeModel(model) {
  const lower = String(model || '').toLowerCase()
  if (!lower) return false
  return lower.includes('claude')
    || lower.includes('sonnet')
    || lower.includes('opus')
    || lower.includes('haiku')
}

function normalizeClaudeUsage(usage, model) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  }

  const rawInput = toSafeInt(usage.input_tokens)
  const cacheRead = toSafeInt(usage.cache_read_input_tokens)
  const cacheCreation = toSafeInt(usage.cache_creation_input_tokens)

  const inputTokens = rawInput + cacheCreation

  return {
    inputTokens,
    outputTokens: toSafeInt(usage.output_tokens),
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
  }
}

module.exports = {
  normalizeClaudeUsage,
  isNativeClaudeModel,
  toSafeInt,
}
