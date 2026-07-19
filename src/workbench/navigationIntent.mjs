const INTENT_TYPES = new Set(['focus-agent', 'open-document', 'focus-chat'])
const TARGETS = new Set(['active', 'beside'])

function boundedString(value, max = 1024) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : ''
}

export function normalizeWorkbenchIntent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!INTENT_TYPES.has(raw.type)) return null
  const requestId = boundedString(raw.requestId, 128)
  if (!requestId) return null
  const target = TARGETS.has(raw.target) ? raw.target : 'active'
  const intent = { requestId, type: raw.type, target, source: boundedString(raw.source, 128) || 'unknown' }
  if (raw.type === 'open-document') {
    const resourceId = boundedString(raw.resourceId)
    if (!resourceId) return null
    intent.resourceId = resourceId
  }
  if (boundedString(raw.workspaceKey)) intent.workspaceKey = raw.workspaceKey
  if (raw.agentTarget && typeof raw.agentTarget === 'object' && !Array.isArray(raw.agentTarget)) {
    intent.agentTarget = {
      agent: boundedString(raw.agentTarget.agent, 64),
      projectId: boundedString(raw.agentTarget.projectId, 256),
      chatId: boundedString(raw.agentTarget.chatId, 256),
      sessionId: boundedString(raw.agentTarget.sessionId, 256),
    }
  }
  if (raw.chatTarget && typeof raw.chatTarget === 'object' && !Array.isArray(raw.chatTarget)) {
    intent.chatTarget = { sessionId: boundedString(raw.chatTarget.sessionId, 256) }
  }
  return intent
}

export function createIntentQueue({ limit = 20 } = {}) {
  const pending = []
  const seen = new Set()
  const max = Math.max(1, Math.min(100, Number(limit) || 20))

  return {
    push(raw) {
      const intent = normalizeWorkbenchIntent(raw)
      if (!intent || seen.has(intent.requestId)) return false
      seen.add(intent.requestId)
      pending.push(intent)
      if (pending.length > max) pending.shift()
      return true
    },
    drain() {
      const intents = pending.splice(0, pending.length)
      return intents
    },
    clear() {
      pending.length = 0
      seen.clear()
    },
    get size() {
      return pending.length
    },
  }
}

/**
 * Adapts typed navigation intents to the currently routed UI.
 *
 * The adapter intentionally knows only route/query identities. Domain
 * components continue to own document/session activation and payload loading.
 */
export function createLegacyNavigationAdapter({ router } = {}) {
  if (!router || typeof router.push !== 'function') throw new Error('router.push is required')

  function routeForIntent(intent) {
    if (intent.type === 'open-document') return { path: '/main/mdViewer' }
    if (intent.type === 'focus-chat') {
      const sessionId = intent.chatTarget?.sessionId
      return sessionId ? { path: '/main/chat', query: { sessionId } } : { path: '/main/chat' }
    }
    if (intent.type === 'focus-agent') {
      // Query keys mirror what CodeHub consumes (route.query.agent /
      // projectId / chatId / sessionId).
      const query = {}
      if (intent.agentTarget?.agent) query.agent = intent.agentTarget.agent
      if (intent.agentTarget?.projectId) query.projectId = intent.agentTarget.projectId
      if (intent.agentTarget?.chatId) query.chatId = intent.agentTarget.chatId
      if (intent.agentTarget?.sessionId) query.sessionId = intent.agentTarget.sessionId
      return Object.keys(query).length ? { path: '/main/codeHub', query } : { path: '/main/codeHub' }
    }
    return null
  }

  return {
    dispatch(raw) {
      const intent = normalizeWorkbenchIntent(raw)
      if (!intent) return Promise.resolve({ accepted: false, reason: 'invalid-intent' })
      const route = routeForIntent(intent)
      if (!route) return Promise.resolve({ accepted: false, reason: 'unsupported-intent' })
      return Promise.resolve(router.push(route))
        .then(() => ({ accepted: true, requestId: intent.requestId, intent }))
        .catch(error => ({ accepted: false, requestId: intent.requestId, reason: error?.message || 'navigation-failed' }))
    },
  }
}

export function documentPayloadToIntent(payload = {}) {
  const requestId = boundedString(payload.__mdRequestId, 128)
  const resourceId = boundedString(payload.filePath)
  if (!requestId || !resourceId) return null
  return normalizeWorkbenchIntent({
    requestId,
    type: 'open-document',
    target: 'active',
    source: boundedString(payload.source, 128) || 'document-open',
    resourceId,
  })
}
