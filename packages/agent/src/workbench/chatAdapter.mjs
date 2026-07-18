function shallowEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Public host port for the one resident simple-chat surface. */
export function createChatWorkbenchAdapter({ getSession, activateSession, focus, requestClose } = {}) {
  if (typeof getSession !== 'function') throw new Error('chat workbench adapter requires getSession')
  const listeners = new Set()
  let lastSnapshot = null

  function getSnapshot() {
    const session = getSession() || {}
    return {
      itemId: 'chat:simple',
      kind: 'chat',
      title: String(session.title || ''),
      sessionId: String(session.id || ''),
      streaming: Boolean(session.streaming),
    }
  }

  function publish() {
    const next = getSnapshot()
    if (lastSnapshot && shallowEqual(next, lastSnapshot)) return
    lastSnapshot = next
    for (const listener of listeners) listener(next)
  }

  return {
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async activate(context = {}) {
      const sessionId = context.sessionId || context.chatTarget?.sessionId
      if (sessionId) await activateSession?.(sessionId)
      focus?.()
      publish()
    },
    deactivate() {},
    requestClose(reason) {
      return typeof requestClose === 'function' ? requestClose(reason) : Promise.resolve({ status: 'ready' })
    },
    publish,
  }
}
