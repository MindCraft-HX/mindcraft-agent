import { getCurrentInstance, onUnmounted, ref } from 'vue'

export function createDefaultAgentMetrics() {
  return {
    sessionId: '',
    model: '',
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    contextUsage: 0,
    contextWindow: 0,
    durationMs: 0,
    speedOutputPerSec: 0,
    thinking: false,
    compacting: false,
    gitBranch: '',
    gitChanges: 0,
    usageApiSessionPct: null,
  }
}

export function buildAgentTurnMetrics(previous = {}) {
  return {
    ...previous,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    contextUsage: previous.contextUsage || 0,
    contextWindow: previous.contextWindow || 0,
    durationMs: 0,
    speedOutputPerSec: 0,
  }
}

export function hasAgentTurnTokenSample(data = {}) {
  return ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens']
    .some((key) => Object.prototype.hasOwnProperty.call(data, key) && Number(data[key]) > 0)
}

export function hasAgentStatusBarSnapshot(data = {}) {
  return [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'contextUsage',
    'durationMs',
    'costUsd',
    'usageApiSessionPct',
  ].some((key) => Object.prototype.hasOwnProperty.call(data, key) && Number(data[key]) > 0)
}

export function mergeAgentRuntimeMetrics(current = {}, data = {}, {
  thinking = false,
  sessionId = '',
  mergeMetrics = null,
} = {}) {
  const next = { ...data }
  if (thinking && !hasAgentTurnTokenSample(data)) {
    delete next.inputTokens
    delete next.outputTokens
    delete next.cacheReadTokens
    delete next.cacheCreationTokens
  }
  const merged = typeof mergeMetrics === 'function'
    ? mergeMetrics(current, next, { sessionId })
    : { ...current, ...next, ...(sessionId ? { sessionId } : {}) }
  if (sessionId && !merged.sessionId) merged.sessionId = sessionId
  return merged
}

export function buildStatusBarMetricsView(tab = null, {
  model = '',
  compacting = false,
} = {}) {
  if (!tab) {
    return {
      ...createDefaultAgentMetrics(),
      model,
      compacting,
    }
  }
  return {
    ...createDefaultAgentMetrics(),
    ...(tab.metrics || {}),
    model: model || tab.model || tab.metrics?.model || '',
    sessionId: tab.sessionId || tab.metrics?.sessionId || '',
    compacting,
  }
}

export function useAgentMetricsTimer({
  now = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const liveDurationMs = ref(0)
  let timer = null

  function stop() {
    if (timer) {
      clearIntervalFn(timer)
      timer = null
    }
    liveDurationMs.value = 0
  }

  function start(startTime) {
    stop()
    if (!startTime) return
    liveDurationMs.value = Math.max(0, now() - startTime)
    timer = setIntervalFn(() => {
      liveDurationMs.value = Math.max(0, now() - startTime)
    }, 1000)
  }

  if (getCurrentInstance()) onUnmounted(stop)

  return {
    liveDurationMs,
    start,
    stop,
  }
}

export function useAgentMetricsController({
  mergeMetrics = null,
  areMetricsEquivalent = null,
  ensureThinkingStart = null,
  now = () => Date.now(),
} = {}) {
  const metricsData = ref(createDefaultAgentMetrics())
  const timer = useAgentMetricsTimer({ now })

  function buildNewTurnMetrics(tab = null) {
    return buildAgentTurnMetrics(tab?.metrics || {})
  }

  function mergeRuntimeMetrics(current = {}, data = {}, tab = null) {
    return mergeAgentRuntimeMetrics(current, data, {
      thinking: Boolean(tab?.thinking),
      sessionId: tab?.sessionId || data?.sessionId || current?.sessionId || '',
      mergeMetrics,
    })
  }

  function syncTimerForTab(tab = null, durationMs = 0) {
    if (!tab?.thinking) {
      timer.stop()
      return
    }
    if (!tab._thinkingStart && typeof ensureThinkingStart === 'function') {
      ensureThinkingStart(tab, durationMs)
    }
    timer.start(tab._thinkingStart || now())
  }

  function syncActiveMetricsFromTab(tab = null, options = {}) {
    Object.assign(metricsData.value, buildStatusBarMetricsView(tab, options))
  }

  function resetActiveMetrics({ keepModel = '', compacting = false } = {}) {
    timer.stop()
    Object.assign(metricsData.value, {
      ...createDefaultAgentMetrics(),
      model: keepModel,
      compacting,
    })
  }

  function applyMetricsToTab(tab, data = {}) {
    if (!tab) return null
    const merged = mergeRuntimeMetrics(tab.metrics || {}, data, tab)
    if (!areMetricsEquivalent || !areMetricsEquivalent(tab.metrics || {}, merged)) {
      tab.metrics = merged
    }
    return merged
  }

  function applyActiveMetricsSample(tab, data = {}) {
    if (!tab) return
    Object.assign(metricsData.value, mergeRuntimeMetrics(metricsData.value, data, tab))
  }

  return {
    metricsData,
    metricsLiveDurationMs: timer.liveDurationMs,
    buildNewTurnMetrics,
    mergeRuntimeMetrics,
    syncTimerForTab,
    syncActiveMetricsFromTab,
    resetActiveMetrics,
    applyMetricsToTab,
    applyActiveMetricsSample,
    stopMetricsTimer: timer.stop,
    startMetricsTimer: timer.start,
  }
}
