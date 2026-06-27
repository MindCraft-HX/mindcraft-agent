const CURRENT_TURN_METRIC_FIELDS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
  'durationMs',
  'costUsd',
]

export function sanitizePersistedMetrics(metrics = null) {
  if (!metrics || typeof metrics !== 'object') return null
  const next = { ...metrics }
  for (const field of CURRENT_TURN_METRIC_FIELDS) {
    delete next[field]
  }
  next.thinking = false
  return next
}

export { CURRENT_TURN_METRIC_FIELDS }
