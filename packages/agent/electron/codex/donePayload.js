'use strict';

/**
 * CodeX agent "done" payload builders (pure helpers).
 *
 * Extracted from codexAgent.js as part of Batch 2 — pure data
 * transformation with no IO, no module-level mutable state, and no
 * dependency on the stream loop or session maps.
 *
 * Responsibilities:
 *   - resolveCodexDoneReasonFromError  — classify an error as 'aborted' or 'failed'
 *   - buildCodexAgentDonePayload       — construct the IPC done-payload object
 */

/**
 * Classify an error into a terminal reason string.
 *
 * @param {Error|*} err
 * @returns {'aborted'|'failed'}
 */
function resolveCodexDoneReasonFromError(err) {
  const errMsg = err?.message || String(err || '')
  if (err?.name === 'AbortError' || errMsg.includes('AbortError') || errMsg.includes('The operation was aborted')) {
    return 'aborted'
  }
  return 'failed'
}

/**
 * Build the standardised IPC "done" payload sent to the renderer when a
 * CodeX agent run finishes (success, abort, or failure).
 *
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} [opts.cliSessionId='']
 * @param {string} [opts.filePath='']
 * @param {'completed'|'aborted'|'failed'} [opts.reason='completed']
 * @param {boolean} [opts.detachResume=false]
 * @returns {{sessionId:string, cliSessionId:string, filePath:string, reason:string, detachResume:boolean}}
 */
function buildCodexAgentDonePayload({
  sessionId,
  cliSessionId = '',
  filePath = '',
  reason = 'completed',
  detachResume = false,
} = {}) {
  return {
    sessionId,
    cliSessionId,
    filePath,
    reason,
    detachResume: Boolean(detachResume),
  }
}

module.exports = {
  resolveCodexDoneReasonFromError,
  buildCodexAgentDonePayload,
}
