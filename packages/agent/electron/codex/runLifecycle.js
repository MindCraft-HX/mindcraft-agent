'use strict'

// Logical terminal events and transport closure are intentionally separate.
function markCodexTerminalSeen(session) {
  if (!session) return false
  session.terminalSeen = true
  return true
}

function markCodexTransportClosed(session) {
  if (!session) return false
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
  canStartCodexSessionRun,
  didCodexTranscriptAdvance,
  isCodexTransportClosed,
  markCodexTerminalSeen,
  markCodexTransportClosed,
}
