import {
  PRIMARY_GROUP_ID,
  closeItem,
  createDefaultLayout,
  mergeSecondaryGroup,
  moveItem,
  normalizeLayout,
  openItem,
  resolveSurfaceStates,
} from './layoutModel.mjs'
import { createIntentQueue } from './navigationIntent.mjs'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getItem(layout, itemId) {
  return layout.items[itemId] || null
}

function findGroup(layout, itemId) {
  return layout.groups.find(group => group.itemIds.includes(itemId)) || null
}

function activateLayoutItem(layout, itemId) {
  const next = clone(normalizeLayout(layout))
  const group = findGroup(next, itemId)
  if (!group) return next
  group.activeItemId = itemId
  next.activeGroupId = group.id
  next.revision += 1
  return next
}

/**
 * Host-only composition store. It owns layout placement and delegates all
 * resource behavior to registered public adapters.
 */
export function createWorkbenchStore({ loadLayout, saveLayout, resolveIntent } = {}) {
  const adapters = new Map()
  const listeners = new Set()
  const intents = createIntentQueue()
  let layout = createDefaultLayout()
  let windowInstanceId = ''
  let hydrated = false
  let persistInFlight = null
  let persistQueued = false

  function emit() {
    const snapshot = getSnapshot()
    for (const listener of listeners) listener(snapshot)
  }

  function getAdapter(itemId) {
    return adapters.get(itemId) || adapters.get(getItem(layout, itemId)?.type) || null
  }

  function getSnapshot() {
    return {
      hydrated,
      windowInstanceId,
      layout: clone(layout),
      surfaces: resolveSurfaceStates(layout),
    }
  }

  function replaceLayout(next) {
    layout = normalizeLayout(next)
    emit()
    return getSnapshot()
  }

  async function activate(itemId, context = {}) {
    const item = getItem(layout, itemId)
    if (!item) return { ok: false, reason: 'not-found' }
    const previousGroup = layout.groups.find(group => group.id === layout.activeGroupId)
    const previousItemId = previousGroup?.activeItemId || ''
    if (previousItemId && previousItemId !== itemId) {
      await getAdapter(previousItemId)?.deactivate?.({ itemId: previousItemId, reason: 'switch' })
    }
    replaceLayout(activateLayoutItem(layout, itemId))
    await getAdapter(itemId)?.activate?.({ itemId, item: clone(item), ...context })
    return { ok: true }
  }

  async function persist() {
    if (!hydrated || !windowInstanceId || typeof saveLayout !== 'function') return { saved: false, reason: 'unavailable' }
    if (persistInFlight) {
      persistQueued = true
      return persistInFlight
    }
    const request = { windowInstanceId, revision: layout.revision, layout: clone(layout) }
    persistInFlight = Promise.resolve(saveLayout(request))
      .catch(() => ({ saved: false, reason: 'write-failed' }))
      .finally(async () => {
        persistInFlight = null
        if (persistQueued) {
          persistQueued = false
          await persist()
        }
      })
    return persistInFlight
  }

  async function open(itemId, item, options = {}) {
    replaceLayout(mergeSecondaryGroup(openItem(layout, itemId, item, options)))
    const result = await activate(itemId, { reason: 'open' })
    void persist()
    return result
  }

  async function close(itemId, reason = 'tab-close') {
    const item = getItem(layout, itemId)
    if (!item) return { status: 'ready' }
    const result = await getAdapter(itemId)?.requestClose?.(itemId, { reason }) || { status: 'ready' }
    if (result.status !== 'ready') return result
    replaceLayout(closeItem(layout, itemId))
    void persist()
    return { status: 'ready' }
  }

  async function drainIntents() {
    const results = []
    for (const intent of intents.drain()) {
      if (intent.type === 'focus-agent') results.push(await activate('agent:codehub', intent))
      else if (intent.type === 'focus-chat') results.push(await open('chat:simple', { type: 'chat', singleton: true }, intent))
      else if (typeof resolveIntent === 'function') {
        const resolved = await resolveIntent(intent)
        if (resolved?.itemId && resolved?.item) results.push(await open(resolved.itemId, resolved.item, intent))
        else results.push({ ok: false, reason: 'unresolved-intent' })
      } else results.push({ ok: false, reason: 'unresolved-intent' })
    }
    return results
  }

  return {
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    registerAdapter(key, adapter) {
      if (typeof key !== 'string' || !key || !adapter) throw new Error('adapter key and adapter are required')
      adapters.set(key, adapter)
      return () => adapters.delete(key)
    },
    async hydrate() {
      if (hydrated) return getSnapshot()
      const result = typeof loadLayout === 'function' ? await loadLayout() : null
      if (result?.ok && result.windowInstanceId) {
        windowInstanceId = result.windowInstanceId
        const restored = normalizeLayout(result.layout)
        const needsMigration = restored.groups.length > 1
        // A split layout can park a resident surface in an empty pane after a
        // reload. Keep one host until every resident surface has pane-safe ownership.
        layout = needsMigration ? mergeSecondaryGroup(restored) : restored
        if (needsMigration) {
          hydrated = true
          emit()
          void persist()
          return getSnapshot()
        }
      }
      hydrated = true
      emit()
      return getSnapshot()
    },
    open,
    activate,
    close,
    move(itemId, targetGroupId) {
      replaceLayout(mergeSecondaryGroup(moveItem(layout, itemId, targetGroupId)))
      void persist()
      return getSnapshot()
    },
    mergeSecondary() {
      replaceLayout(mergeSecondaryGroup(layout))
      void persist()
      return getSnapshot()
    },
    enqueueIntent(intent) {
      return intents.push(intent)
    },
    drainIntents,
    persist,
    get activeGroupId() { return layout.activeGroupId || PRIMARY_GROUP_ID },
  }
}
