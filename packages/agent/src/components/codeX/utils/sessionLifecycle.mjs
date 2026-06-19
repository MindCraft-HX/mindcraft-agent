export function isCodexTurnLocked(tab = {}) {
  return Boolean(tab?.thinking || tab?._awaitingDone)
}

export function shouldHydrateHistoryFromDisk(tab = {}) {
  return !isCodexTurnLocked(tab)
}

export function shouldSyncThinkingFromMetrics({ currentThinking = false, awaitingDone = false, nextThinking } = {}) {
  if (nextThinking === true) return Boolean(currentThinking || awaitingDone)
  if (nextThinking !== false) return false
  return !awaitingDone
}

export function mergeScannedChatsPreservingRuntime(existingChats = [], scannedChats = [], { activeChatId = null } = {}) {
  const next = Array.isArray(scannedChats) ? [...scannedChats] : []
  const seen = new Set(next.map(chat => chat?.id).filter(Boolean))
  for (const chat of Array.isArray(existingChats) ? existingChats : []) {
    if (!chat?.id || seen.has(chat.id)) continue
    const isUnboundRuntime = isCodexTurnLocked(chat) && !chat.cliSessionId && !chat.filePath
    if (chat.id === activeChatId || isUnboundRuntime) {
      next.push(chat)
      seen.add(chat.id)
    }
  }
  return next
}
