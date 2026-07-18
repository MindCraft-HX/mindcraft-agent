import { sanitizePersistedMetrics } from '../../agentCommon/utils/persistedMetrics.mjs'

export const CODEX_RUNTIME_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  TERMINAL_SEEN: 'terminal_seen',
  DONE: 'done',
  FAILED: 'failed',
  ABORT_REQUESTED: 'abort_requested',
  ABORTED: 'aborted',
  QUEUED: 'queued',
})

const RUNTIME_FIELD = '_codexRuntimeState'

function getRuntimeState(tab = {}) {
  return tab?.[RUNTIME_FIELD] || (tab?.thinking ? CODEX_RUNTIME_STATES.STREAMING : CODEX_RUNTIME_STATES.IDLE)
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

function toTime(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export function mergeCodexUpdatedAt(localValue, providerValue) {
  const localTime = toTime(localValue)
  const providerTime = toTime(providerValue)
  if (!localTime) return providerValue || null
  if (!providerTime) return localValue || null
  return providerTime > localTime ? providerValue : localValue
}

function isBoundCodexChat(chat = {}) {
  return Boolean(chat?.cliSessionId || chat?.filePath)
}

function clearRuntimeState(tab) {
  if (!tab) return tab
  delete tab[RUNTIME_FIELD]
  return tab
}

function clearRuntimeFields(tab, { clearState = true } = {}) {
  if (!tab) return tab
  tab.thinking = false
  tab._awaitingDone = false
  tab._thinkingStart = null
  tab.currentAssistantId = null
  if (tab.metrics) tab.metrics.thinking = false
  if (clearState) clearRuntimeState(tab)
  return tab
}

export function isCodexTurnLocked(tab = {}) {
  return Boolean(tab?.thinking || tab?._awaitingDone)
}

export async function claimCodexSessionForSend(tab = {}, claimSession) {
  if (!tab?.cliSessionId || tab?._resumeAllowed !== false) return { ok: true, claimed: false }
  if (typeof claimSession !== 'function') return { ok: false, error: 'Session claim is unavailable' }
  try {
    const result = await claimSession({
      sessionId: tab.sessionId,
      cliSessionId: tab.cliSessionId,
      filePath: tab.filePath || '',
    })
    if (!result?.ok) return { ok: false, error: result?.error || 'Unable to continue this session' }
    tab._resumeAllowed = true
    tab._resumeClaimed = true
    return { ok: true, claimed: true }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
}

export function shouldHydrateHistoryFromDisk(tab = {}) {
  return !isCodexTurnLocked(tab)
}

export function shouldSyncThinkingFromMetrics({
  currentThinking = false,
  awaitingDone = false,
  nextThinking,
  runtimeState = null,
} = {}) {
  if (nextThinking === true) {
    return Boolean(currentThinking || awaitingDone)
      && ![
        CODEX_RUNTIME_STATES.TERMINAL_SEEN,
        CODEX_RUNTIME_STATES.DONE,
        CODEX_RUNTIME_STATES.FAILED,
        CODEX_RUNTIME_STATES.ABORT_REQUESTED,
        CODEX_RUNTIME_STATES.ABORTED,
        CODEX_RUNTIME_STATES.IDLE,
      ].includes(runtimeState)
  }
  if (nextThinking !== false) return false
  return !awaitingDone
}

export function markCodexTurnStarting(tab, now = Date.now()) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.STARTING)
  tab._awaitingDone = true
  tab.thinking = true
  tab._thinkingStart = now
  if (tab.metrics) tab.metrics.thinking = true
  return tab
}

export function restoreCodexActiveRuns(chats = [], activeRuns = []) {
  const tabsByChatKey = new Map((Array.isArray(chats) ? chats : [])
    .filter(tab => tab?.sessionId)
    .map(tab => [tab.sessionId, tab]))
  let restored = 0
  for (const run of Array.isArray(activeRuns) ? activeRuns : []) {
    const tab = tabsByChatKey.get(run?.chatKey)
    if (!tab) continue
    markCodexTurnStarting(tab, Number(run.startedAt) || Date.now())
    if (run.cliSessionId) tab.cliSessionId = run.cliSessionId
    restored += 1
  }
  return restored
}

export function markCodexIdle(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.IDLE)
  clearRuntimeFields(tab)
  return tab
}

export function markCodexTurnAccepted(tab, metricsDefaults = {}) {
  if (!tab) return tab
  const state = getRuntimeState(tab)
  if ([
    CODEX_RUNTIME_STATES.TERMINAL_SEEN,
    CODEX_RUNTIME_STATES.DONE,
    CODEX_RUNTIME_STATES.FAILED,
    CODEX_RUNTIME_STATES.ABORT_REQUESTED,
    CODEX_RUNTIME_STATES.ABORTED,
  ].includes(state)) {
    return tab
  }
  if (metricsDefaults && Object.keys(metricsDefaults).length) {
    tab.metrics = { ...(tab.metrics || {}), ...metricsDefaults, thinking: Boolean(tab.thinking) }
  }
  return tab
}

export function markCodexQueued(tab, { messageId = null, text = null, now = Date.now() } = {}) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.QUEUED)
  if (typeof text === 'string') tab._queuedInput = text
  if (messageId != null) tab._queuedInputMessageId = messageId
  tab._awaitingDone = true
  tab.thinking = true
  if (!tab._thinkingStart) tab._thinkingStart = now
  if (tab.metrics) tab.metrics.thinking = true
  return tab
}

export function markCodexStreamActivity(tab, _msg = null, now = Date.now()) {
  if (!tab) return tab
  const state = getRuntimeState(tab)
  if ([
    CODEX_RUNTIME_STATES.TERMINAL_SEEN,
    CODEX_RUNTIME_STATES.DONE,
    CODEX_RUNTIME_STATES.FAILED,
    CODEX_RUNTIME_STATES.ABORT_REQUESTED,
    CODEX_RUNTIME_STATES.ABORTED,
  ].includes(state)) {
    return tab
  }
  if (tab._awaitingDone || state === CODEX_RUNTIME_STATES.STARTING || state === CODEX_RUNTIME_STATES.QUEUED) {
    setRuntimeState(tab, CODEX_RUNTIME_STATES.STREAMING)
    tab.thinking = true
    tab._awaitingDone = true
    if (!tab._thinkingStart) tab._thinkingStart = now
    if (tab.metrics) tab.metrics.thinking = true
  }
  return tab
}

export function markCodexTerminalSeen(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.TERMINAL_SEEN)
  tab.thinking = false
  tab._awaitingDone = true
  tab._thinkingStart = null
  tab.currentAssistantId = null
  if (tab.metrics) tab.metrics.thinking = false
  return tab
}

export function markCodexDone(tab, { cliSessionId, filePath, reason = 'completed' } = {}) {
  if (!tab) return tab
  if (cliSessionId !== undefined) tab.cliSessionId = cliSessionId
  if (filePath !== undefined) tab.filePath = filePath
  setRuntimeState(tab, reason === 'completed' ? CODEX_RUNTIME_STATES.DONE : CODEX_RUNTIME_STATES.FAILED)
  touchRuntimeUpdatedAt(tab)
  clearRuntimeFields(tab)
  return tab
}

export function markCodexFailed(tab, _error = null) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.FAILED)
  clearRuntimeFields(tab)
  return tab
}

export function markCodexAbortRequested(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.ABORT_REQUESTED)
  tab.thinking = false
  tab._awaitingDone = true
  tab._thinkingStart = null
  tab.currentAssistantId = null
  if (tab.metrics) tab.metrics.thinking = false
  return tab
}

export function markCodexAborted(tab) {
  if (!tab) return tab
  setRuntimeState(tab, CODEX_RUNTIME_STATES.ABORTED)
  clearRuntimeFields(tab)
  return tab
}

export function applyCodexMetrics(tab, data = {}) {
  if (!tab || !data || typeof data.thinking !== 'boolean') return tab
  const runtimeState = getRuntimeState(tab)
  const nextThinking = data.thinking
  if (shouldSyncThinkingFromMetrics({
    currentThinking: tab.thinking,
    awaitingDone: tab._awaitingDone,
    nextThinking,
    runtimeState,
  })) {
    tab.thinking = nextThinking
  }
  if (tab.metrics) tab.metrics.thinking = Boolean(tab.thinking)
  if (nextThinking && tab.thinking) {
    if (![CODEX_RUNTIME_STATES.TERMINAL_SEEN, CODEX_RUNTIME_STATES.ABORT_REQUESTED].includes(runtimeState)) {
      setRuntimeState(tab, CODEX_RUNTIME_STATES.STREAMING)
      tab._awaitingDone = true
      if (!tab._thinkingStart) tab._thinkingStart = Date.now() - (data.durationMs || 0)
    }
  } else if (!tab.thinking) {
    tab._thinkingStart = null
  }
  return tab
}

export function mergeScannedChatsPreservingRuntime(existingChats = [], scannedChats = [], { activeChatId = null } = {}) {
  const next = Array.isArray(scannedChats) ? [...scannedChats] : []
  const seen = new Set(next.map(chat => chat?.id).filter(Boolean))
  for (const chat of Array.isArray(existingChats) ? existingChats : []) {
    if (!chat?.id || seen.has(chat.id)) continue
    const isRuntimeLocked = isCodexTurnLocked(chat)
    const isUnboundDraft = chat.id === activeChatId && !isBoundCodexChat(chat)
    const isRestoredUnbound = Boolean(chat._restoredFromPanelState) && !isBoundCodexChat(chat)
    const isRestoredNonResumable = Boolean(chat._restoredFromPanelState) && chat._resumeAllowed === false
    if (isRuntimeLocked || isUnboundDraft || isRestoredUnbound || isRestoredNonResumable) {
      next.push(chat)
      seen.add(chat.id)
    }
  }
  return next
}

export const mergeScannedCodexChats = mergeScannedChatsPreservingRuntime

export const sanitizeCodexPersistedMetrics = sanitizePersistedMetrics

export function buildPersistableCodexChat(chat = {}) {
  const c = { ...chat }
  delete c[RUNTIME_FIELD]
  delete c._restoredFromPanelState
  delete c._chunk
  delete c._messagesLoaded
  c._thinkingStart = c.filePath ? null : (c._thinkingStart || null)
  c._awaitingDone = c.filePath ? false : Boolean(c._awaitingDone)
  c._resumeClaimed = Boolean(c._resumeClaimed)
  c.thinking = false
  c.currentAssistantId = null
  c.draftText = ''
  c.inputHistory = Array.isArray(c.inputHistory) ? c.inputHistory.slice(0, 5) : []
  c.metrics = sanitizeCodexPersistedMetrics(c.metrics)
  return c
}
