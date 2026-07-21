'use strict'

function ownsClaudeRun(sessions, chatKey, runId) {
  return Boolean(runId) && sessions.get(chatKey)?.runId === runId
}

function deleteClaudeRunIfOwned(sessions, chatKey, runId) {
  if (!ownsClaudeRun(sessions, chatKey, runId)) return false
  sessions.delete(chatKey)
  return true
}

module.exports = {
  deleteClaudeRunIfOwned,
  ownsClaudeRun,
}
