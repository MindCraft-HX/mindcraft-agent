'use strict'

function ownsClaudeRun(sessions, chatKey, runId) {
  return Boolean(runId) && sessions.get(chatKey)?.runId === runId
}

function deleteClaudeRunIfOwned(sessions, chatKey, runId) {
  if (!ownsClaudeRun(sessions, chatKey, runId)) return false
  sessions.delete(chatKey)
  return true
}

function canStreamInputToClaudeRun(session) {
  return Boolean(session?.query) && !session.abortRequested && !session.resultReceived
}

module.exports = {
  canStreamInputToClaudeRun,
  deleteClaudeRunIfOwned,
  ownsClaudeRun,
}
