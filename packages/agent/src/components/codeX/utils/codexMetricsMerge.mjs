export function mergeCodexMetrics(base = {}, result = {}, overrides = {}) {
  return {
    ...base,
    ...result,
    ...overrides,
    gitBranch: typeof overrides.gitBranch === 'string'
      ? overrides.gitBranch
      : (typeof result.gitBranch === 'string' ? result.gitBranch : (base.gitBranch || '')),
    gitChanges: typeof overrides.gitChanges === 'number'
      ? overrides.gitChanges
      : (typeof result.gitChanges === 'number' ? result.gitChanges : (base.gitChanges || 0)),
  }
}

export function areCodexMetricsEquivalent(a = {}, b = {}) {
  const KEYS = [
    'sessionId',
    'model',
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'contextUsage',
    'contextWindow',
    'durationMs',
    'costUsd',
    'speedOutputPerSec',
    'gitBranch',
    'gitChanges',
    'thinking',
    'compacting',
  ]
  return KEYS.every((key) => {
    const left = a?.[key]
    const right = b?.[key]
    if (typeof left === 'number' || typeof right === 'number') return Number(left || 0) === Number(right || 0)
    return (left ?? null) === (right ?? null)
  })
}
