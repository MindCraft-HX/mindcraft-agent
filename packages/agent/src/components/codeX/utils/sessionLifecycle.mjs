export function isCodexTurnLocked(tab = {}) {
  return Boolean(tab?.thinking || tab?._awaitingDone)
}

export function shouldHydrateHistoryFromDisk(tab = {}) {
  return !isCodexTurnLocked(tab)
}

export function shouldSyncThinkingFromMetrics({ awaitingDone = false, nextThinking } = {}) {
  if (nextThinking !== false) return true
  return !awaitingDone
}
