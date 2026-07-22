'use strict'

const CANCELLED_INTERACTIVE_REQUEST = Symbol('cancelled-claude-interactive-request')

function createClaudeInteractiveRequestRegistry({ ownsRun }) {
  const requests = new Map()

  function register({ requestId, chatKey, runId, kind, senderId, resolve }) {
    if (typeof resolve !== 'function') return false
    if (!requestId || !chatKey || !runId || !Number.isInteger(senderId) || requests.has(requestId)) {
      resolve(CANCELLED_INTERACTIVE_REQUEST)
      return false
    }
    requests.set(requestId, { chatKey, runId, kind, senderId, resolve })
    return true
  }

  function respond({ requestId, chatKey, kind, senderId, value }) {
    const request = requests.get(requestId)
    if (!request) return { ok: false, error: 'stale-request' }
    if (
      request.chatKey !== chatKey ||
      request.kind !== kind ||
      request.senderId !== senderId ||
      !ownsRun(request.chatKey, request.runId)
    ) {
      return { ok: false, error: 'stale-request' }
    }
    requests.delete(requestId)
    request.resolve(value)
    return { ok: true }
  }

  function cancelRun(chatKey, runId) {
    let cancelled = 0
    for (const [requestId, request] of requests.entries()) {
      if (request.chatKey !== chatKey || request.runId !== runId) continue
      requests.delete(requestId)
      request.resolve(CANCELLED_INTERACTIVE_REQUEST)
      cancelled += 1
    }
    return cancelled
  }

  return {
    register,
    respond,
    cancelRun,
    size: () => requests.size,
  }
}

module.exports = {
  CANCELLED_INTERACTIVE_REQUEST,
  createClaudeInteractiveRequestRegistry,
}
