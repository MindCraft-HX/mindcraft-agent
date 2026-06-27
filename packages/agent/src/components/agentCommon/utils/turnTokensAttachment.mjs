export function normalizeTurnTokens(turnTokens = null) {
  if (!turnTokens || typeof turnTokens !== 'object') return null
  return {
    inputTokens: Number(turnTokens.inputTokens || 0),
    outputTokens: Number(turnTokens.outputTokens || 0),
    cacheReadTokens: Number(turnTokens.cacheReadTokens || 0),
    cacheCreationTokens: Number(turnTokens.cacheCreationTokens || 0),
    durationMs: Number(turnTokens.durationMs || 0),
    costUsd: Number(turnTokens.costUsd || 0),
  }
}

export function hasMeaningfulTurnTokens(turnTokens = null) {
  const tokens = normalizeTurnTokens(turnTokens)
  if (!tokens) return false
  return (
    tokens.inputTokens > 0
    || tokens.outputTokens > 0
    || tokens.cacheReadTokens > 0
    || tokens.cacheCreationTokens > 0
    || tokens.durationMs > 0
  )
}

export function attachTurnTokensToLastRenderableMessage(messages, turnTokens, { nextMsgId, onNewMessage, replace = false } = {}) {
  if (!Array.isArray(messages)) return false
  const normalized = normalizeTurnTokens(turnTokens)
  if (!hasMeaningfulTurnTokens(normalized)) return false

  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i
      break
    }
  }

  for (let i = messages.length - 1; i > lastUserIndex; i -= 1) {
    const message = messages[i]
    if (!message || message.role !== 'assistant') continue
    if (!message._turnTokens || replace) {
      message._turnTokens = normalized
      return true
    }
    return false
  }

  if (typeof nextMsgId === 'function') {
    messages.push({ id: nextMsgId(), role: 'assistant', text: '', _turnTokens: normalized })
    onNewMessage?.()
    return true
  }

  return false
}
