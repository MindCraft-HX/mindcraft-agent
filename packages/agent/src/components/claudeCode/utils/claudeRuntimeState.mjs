import { sanitizePersistedMetrics } from '../../agentCommon/utils/persistedMetrics.mjs'

export const CLAUDE_RUNTIME_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  TERMINAL_SEEN: 'terminal_seen',
  DONE: 'done',
  FAILED: 'failed',
  ABORT_REQUESTED: 'abort_requested',
  ABORTED: 'aborted',
})

const RUNTIME_FIELD = '_claudeRuntimeState'

function getRuntimeState(tab = {}) {
  return tab?.[RUNTIME_FIELD] || (tab?.thinking ? CLAUDE_RUNTIME_STATES.STREAMING : CLAUDE_RUNTIME_STATES.IDLE)
}

function setRuntimeState(tab, state) {
  if (!tab) return tab
  tab[RUNTIME_FIELD] = state
  return tab
}

function touchRuntimeUpdatedAt(tab, now = Date.now()) {
  if (!tab) return tab
  tab.updatedAt = now
  return tab
}

function clearRuntimeState(tab) {
  if (!tab) return tab
  delete tab[RUNTIME_FIELD]
  return tab
}

function clearRuntimeFields(tab, { clearState = true } = {}) {
  if (!tab) return tab
  tab.thinking = false
  tab._thinkingStart = null
  tab.currentAssistantId = null
  if (tab.metrics) tab.metrics.thinking = false
  if (clearState) clearRuntimeState(tab)
  return tab
}

export function isClaudeTurnLocked(tab = {}) {
  return Boolean(tab?.thinking || tab?.[RUNTIME_FIELD] === CLAUDE_RUNTIME_STATES.ABORT_REQUESTED)
}

export function markClaudeTurnStarting(tab, now = Date.now()) {
  if (!tab) return tab
  if (!tab.cliSessionId && !tab.filePath) tab._pendingSessionBinding = true
  setRuntimeState(tab, CLAUDE_RUNTIME_STATES.STARTING)
  tab.thinking = true
  tab._thinkingStart = now
  if (tab.metrics) tab.metrics.thinking = true
  return tab
}

export function markClaudeStreamActivity(tab, _msg = null, now = Date.now()) {
  if (!tab) return tab
  const state = getRuntimeState(tab)
  if ([
    CLAUDE_RUNTIME_STATES.IDLE,
    CLAUDE_RUNTIME_STATES.DONE,
    CLAUDE_RUNTIME_STATES.FAILED,
    CLAUDE_RUNTIME_STATES.ABORT_REQUESTED,
    CLAUDE_RUNTIME_STATES.ABORTED,
  ].includes(state)) {
    return tab
  }
  setRuntimeState(tab, CLAUDE_RUNTIME_STATES.STREAMING)
  tab.thinking = true
  if (!tab._thinkingStart) tab._thinkingStart = now
  if (tab.metrics) tab.metrics.thinking = true
  return tab
}

export function markClaudeDone(tab, { cliSessionId = '', filePath = '', reason = 'completed' } = {}) {
  if (!tab) return tab
  if (cliSessionId) tab.cliSessionId = cliSessionId
  if (filePath) tab.filePath = filePath
  setRuntimeState(tab, reason === 'completed' ? CLAUDE_RUNTIME_STATES.DONE : CLAUDE_RUNTIME_STATES.FAILED)
  touchRuntimeUpdatedAt(tab)
  clearRuntimeFields(tab, { clearState: false })
  return tab
}

export function markClaudeFailed(tab, _error = null) {
  if (!tab) return tab
  setRuntimeState(tab, CLAUDE_RUNTIME_STATES.FAILED)
  clearRuntimeFields(tab, { clearState: false })
  return tab
}

export function markClaudeAbortRequested(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CLAUDE_RUNTIME_STATES.ABORT_REQUESTED)
  tab.thinking = false
  tab._thinkingStart = null
  tab.currentAssistantId = null
  if (tab.metrics) tab.metrics.thinking = false
  return tab
}

export function markClaudeAborted(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CLAUDE_RUNTIME_STATES.ABORTED)
  clearRuntimeFields(tab, { clearState: false })
  return tab
}

export function markClaudeIdle(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CLAUDE_RUNTIME_STATES.IDLE)
  clearRuntimeFields(tab, { clearState: false })
  return tab
}

export function applyClaudeMetrics(tab, data = {}) {
  if (!tab || !data || typeof data.thinking !== 'boolean') return tab
  const state = getRuntimeState(tab)
  if (data.thinking && ![
    CLAUDE_RUNTIME_STATES.DONE,
    CLAUDE_RUNTIME_STATES.FAILED,
    CLAUDE_RUNTIME_STATES.ABORT_REQUESTED,
    CLAUDE_RUNTIME_STATES.ABORTED,
    CLAUDE_RUNTIME_STATES.IDLE,
  ].includes(state)) {
    if (!tab._thinkingStart) tab._thinkingStart = Date.now() - (data.durationMs || 0)
  } else if (!tab.thinking) {
    tab._thinkingStart = null
  }
  if (tab.metrics) tab.metrics.thinking = Boolean(tab.thinking)
  return tab
}

export function buildPersistableClaudeChat(chat = {}) {
  const c = { ...chat }
  delete c[RUNTIME_FIELD]
  delete c._chunk
  delete c._messagesLoaded
  c.thinking = false
  c._thinkingStart = null
  c.currentAssistantId = null
  c.draftText = ''
  c.inputHistory = Array.isArray(c.inputHistory) ? c.inputHistory.slice(0, 5) : []
  c.metrics = sanitizePersistedMetrics(c.metrics)
  return c
}

export const sanitizeClaudePersistedMetrics = sanitizePersistedMetrics
