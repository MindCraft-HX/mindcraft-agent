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
