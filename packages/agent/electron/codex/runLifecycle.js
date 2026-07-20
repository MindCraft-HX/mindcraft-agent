'use strict'

const CODEX_TERMINAL_CLOSE_GRACE_MS = 5000

function clearCodexTerminalCloseWatchdog(session) {
  const watch = session?.__terminalCloseWatch
  if (!watch) return false
  session.__terminalCloseWatch = null
  try { watch.clearTimeoutImpl(watch.timer) } catch (_) {}
  return true
}

function armCodexTerminalCloseWatchdog(session, {
  delayMs = CODEX_TERMINAL_CLOSE_GRACE_MS,
  onTimeout = null,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (!session?.terminalSeen || session.streamClosed) return null
  clearCodexTerminalCloseWatchdog(session)
  const watch = { timer: null, clearTimeoutImpl }
  watch.timer = setTimeoutImpl(() => {
    if (session.__terminalCloseWatch !== watch) return
    session.__terminalCloseWatch = null
    if (!session.terminalSeen || session.streamClosed) return
    session.terminalCloseForced = true
    if (typeof onTimeout === 'function') onTimeout()
  }, Math.max(0, Number(delayMs) || 0))
  session.__terminalCloseWatch = watch
  return watch.timer
}

// Logical terminal events and transport closure are intentionally separate.
function markCodexTerminalSeen(session) {
  if (!session) return false
  session.terminalSeen = true
  return true
}

function markCodexTransportClosed(session) {
  if (!session) return false
  clearCodexTerminalCloseWatchdog(session)
  session.streamClosed = true
  return true
}

function isCodexTransportClosed(session) {
  return session?.streamClosed === true
}

function canStartCodexSessionRun(session) {
  return !session || isCodexTransportClosed(session)
}

function didCodexTranscriptAdvance(previous = null, next = null) {
  if (!next) return false
  if (!previous) return false
  return Number(next.size || 0) > Number(previous.size || 0)
    || Number(next.mtimeMs || 0) > Number(previous.mtimeMs || 0)
}

module.exports = {
  CODEX_TERMINAL_CLOSE_GRACE_MS,
  armCodexTerminalCloseWatchdog,
  canStartCodexSessionRun,
  clearCodexTerminalCloseWatchdog,
  didCodexTranscriptAdvance,
  isCodexTransportClosed,
  markCodexTerminalSeen,
  markCodexTransportClosed,
}
