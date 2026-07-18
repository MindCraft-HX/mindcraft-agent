function normalizeRequestId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : ''
}

function withTimeout(promise, timeoutMs, participantId) {
  let timer
  return Promise.race([
    Promise.resolve(promise),
    new Promise(resolve => {
      timer = setTimeout(() => resolve({ status: 'error', participantId, reason: 'timeout' }), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

function normalizeResult(result, participantId) {
  if (result === false || result?.status === 'cancel') return { status: 'cancel', participantId }
  if (result?.status === 'error') return { status: 'error', participantId, reason: result.reason || 'participant-error' }
  return { status: 'ready', participantId }
}

/**
 * Renderer lifecycle service. Participants own their own state; this service
 * only invokes them in registration order and returns a small aggregate.
 */
export function createCloseParticipantRegistry({ timeoutMs = 10_000 } = {}) {
  const participants = new Map()
  const inFlight = new Map()
  const finished = new Map()
  const boundedTimeout = Math.max(100, Math.min(60_000, Number(timeoutMs) || 10_000))

  function register(participantId, prepareClose) {
    if (!normalizeRequestId(participantId) || typeof prepareClose !== 'function') {
      throw new Error('close participant requires an id and prepareClose function')
    }
    if (participants.has(participantId)) throw new Error(`duplicate close participant: ${participantId}`)
    participants.set(participantId, prepareClose)
    return () => participants.delete(participantId)
  }

  function run(request) {
    const requestId = normalizeRequestId(request?.requestId)
    if (!requestId) return Promise.resolve({ requestId: '', status: 'error', reason: 'invalid-request' })
    if (finished.has(requestId)) return finished.get(requestId)
    if (inFlight.has(requestId)) return inFlight.get(requestId)

    const operation = (async () => {
      for (const [participantId, prepareClose] of participants) {
        let result
        try {
          result = await withTimeout(prepareClose({ requestId, reason: request?.reason || 'quit' }), boundedTimeout, participantId)
        } catch (_) {
          result = { status: 'error', participantId, reason: 'exception' }
        }
        const normalized = normalizeResult(result, participantId)
        if (normalized.status !== 'ready') {
          const response = { requestId, ...normalized }
          finished.set(requestId, response)
          return response
        }
      }
      const response = { requestId, status: 'ready' }
      finished.set(requestId, response)
      return response
    })().finally(() => inFlight.delete(requestId))

    inFlight.set(requestId, operation)
    return operation
  }

  return {
    register,
    beforeCloseAll: run,
    get size() { return participants.size },
  }
}
