/**
 * AgentInputDockShell — public contract for the shared agent input dock.
 *
 * Design (docs/workbench-split-and-terminal.md): providers keep their
 * composer in the `chat` slot (kept alive with v-show); the shell tracks
 * the active external dock anchor so CodeHub, and through it the host,
 * can position a terminal viewport over the dock. Mode is runtime-only:
 * it is never persisted (layout serializer keeps only expandedSizePx).
 *
 * Pure data contract: no DOM, no terminal code, no host-side imports.
 */

export const INPUT_DOCK_SLOT = Object.freeze({ CHAT: 'chat' })

export const INPUT_DOCK_MODE = Object.freeze({ CHAT: 'chat', TERMINAL: 'terminal' })

const MAX_ANCHORS = 8
const MAX_ANCHOR_ID_LENGTH = 128
const MAX_AGENT_TYPE_LENGTH = 64

function isValidAnchorId(anchorId) {
  return typeof anchorId === 'string' && anchorId.length > 0 && anchorId.length <= MAX_ANCHOR_ID_LENGTH
}

export function createInputDockShell({ now = () => Date.now() } = {}) {
  const anchors = new Map()
  const listeners = new Set()
  let mode = INPUT_DOCK_MODE.CHAT
  let activeAnchorId = null
  let revision = 0

  function getSnapshot() {
    return {
      mode,
      activeAnchorId,
      revision,
      anchors: [...anchors.values()].map(anchor => ({ ...anchor })),
    }
  }

  function emit() {
    const snapshot = getSnapshot()
    for (const listener of listeners) listener(snapshot)
  }

  function registerAnchor(input = {}) {
    const { anchorId, agentType = '', slot = INPUT_DOCK_SLOT.CHAT } = input || {}
    if (!isValidAnchorId(anchorId)) return { ok: false, reason: 'invalid-anchor' }
    if (slot !== INPUT_DOCK_SLOT.CHAT) return { ok: false, reason: 'invalid-slot' }
    if (!anchors.has(anchorId) && anchors.size >= MAX_ANCHORS) return { ok: false, reason: 'anchor-limit' }
    revision += 1
    anchors.set(anchorId, {
      anchorId,
      agentType: String(agentType).slice(0, MAX_AGENT_TYPE_LENGTH),
      slot,
      registeredAt: now(),
      revision,
    })
    if (!activeAnchorId) activeAnchorId = anchorId
    emit()
    return { ok: true, unregister: () => unregisterAnchor(anchorId) }
  }

  function unregisterAnchor(anchorId) {
    if (!anchors.delete(anchorId)) return false
    revision += 1
    if (activeAnchorId === anchorId) {
      activeAnchorId = anchors.keys().next().value || null
      // 终端视口必须附着在 anchor 上；最后一个 anchor 消失时回落 chat 模式。
      if (!activeAnchorId) mode = INPUT_DOCK_MODE.CHAT
    }
    emit()
    return true
  }

  function activateAnchor(anchorId) {
    if (!anchors.has(anchorId)) return false
    if (activeAnchorId !== anchorId) {
      activeAnchorId = anchorId
      revision += 1
      emit()
    }
    return true
  }

  function setMode(nextMode) {
    if (!Object.values(INPUT_DOCK_MODE).includes(nextMode)) return { ok: false, reason: 'invalid-mode' }
    if (nextMode === INPUT_DOCK_MODE.TERMINAL && !activeAnchorId) return { ok: false, reason: 'no-anchor' }
    if (mode !== nextMode) {
      mode = nextMode
      revision += 1
      emit()
    }
    return { ok: true }
  }

  function getActiveAnchor() {
    const anchor = anchors.get(activeAnchorId)
    return anchor ? { ...anchor } : null
  }

  return {
    registerAnchor,
    unregisterAnchor,
    activateAnchor,
    setMode,
    getMode: () => mode,
    getActiveAnchor,
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
