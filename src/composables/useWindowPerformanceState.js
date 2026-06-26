import { computed, ref } from 'vue'

const state = ref(buildDefaultState())
let initialized = false
let cleanup = null
let safetyTimer = null
let teardownListeners = null

const MAX_ACTIVE_DURATION = 3000

function buildDefaultState() {
  return {
    active: false,
    reason: '',
    frameRate: 60,
    effectsReduced: false,
    since: 0,
  }
}

function normalizePayload(payload) {
  if (typeof payload === 'boolean') {
    return payload
      ? {
          active: true,
          reason: 'drag',
          frameRate: 30,
          effectsReduced: true,
          since: Date.now(),
        }
      : buildDefaultState()
  }

  if (!payload || typeof payload !== 'object') return buildDefaultState()

  return {
    active: Boolean(payload.active),
    reason: String(payload.reason || ''),
    frameRate: Number.isFinite(payload.frameRate) ? Number(payload.frameRate) : 60,
    effectsReduced: Boolean(payload.effectsReduced),
    since: Number.isFinite(payload.since) ? Number(payload.since) : (payload.active ? Date.now() : 0),
  }
}

function applyState(nextPayload) {
  const nextState = normalizePayload(nextPayload)
  const prevActive = state.value.active
  const nextActive = nextState.active

  state.value = nextState
  window.__windowPerformanceState = nextState
  window.__isWindowDragging = nextActive && nextState.reason === 'drag'

  if (prevActive === nextActive) return
  document.documentElement.classList.toggle('is-window-dragging', nextActive && nextState.reason === 'drag')
  document.documentElement.classList.toggle('is-window-performance-reduced', nextActive && nextState.effectsReduced)

  clearTimeout(safetyTimer)
  if (nextActive) {
    safetyTimer = setTimeout(() => applyState(buildDefaultState()), MAX_ACTIVE_DURATION)
  }
}

function installRecoveryListeners() {
  if (teardownListeners) return

  const recover = () => applyState(buildDefaultState())
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') recover()
  }

  window.addEventListener('focus', recover)
  window.addEventListener('blur', recover)
  window.addEventListener('pagehide', recover)
  document.addEventListener('visibilitychange', onVisibilityChange)

  teardownListeners = () => {
    window.removeEventListener('focus', recover)
    window.removeEventListener('blur', recover)
    window.removeEventListener('pagehide', recover)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

export function useWindowPerformanceState() {
  if (!initialized) {
    initialized = true
    const api = window.electronAPI || {}
    cleanup = api.onWindowPerformanceState?.((payload) => {
      applyState(payload)
    })
    installRecoveryListeners()
  }

  return {
    state,
    isReduced: computed(() => state.value.active && state.value.effectsReduced),
    isWindowDragging: computed(() => state.value.active && state.value.reason === 'drag'),
    cleanup,
  }
}
