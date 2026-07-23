'use strict'

const CLAUDE_RUN_MODES = new Set(['ask_before_edits', 'edit_automatically', 'plan_mode'])

function normalizeClaudeRunMode(runMode) {
  return CLAUDE_RUN_MODES.has(runMode) ? runMode : 'edit_automatically'
}

function resolveClaudePermissionMode(runMode) {
  return normalizeClaudeRunMode(runMode) === 'plan_mode' ? 'plan' : 'default'
}

module.exports = {
  normalizeClaudeRunMode,
  resolveClaudePermissionMode,
}
