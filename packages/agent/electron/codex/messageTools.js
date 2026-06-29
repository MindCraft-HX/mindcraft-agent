'use strict';

/**
 * CodeX message / tool-name helpers (pure functions).
 *
 * Extracted from codexAgent.js as part of Batch 2.  All functions are
 * pure data transforms — no IO, no module-level mutable state beyond
 * the three tool-name Sets.
 *
 * Responsibilities:
 *   - pickFirstStringValue      — first truthy string from a series of values
 *   - buildMessageDedupKey      — deterministic key for history dedup
 *   - normalizeCodexToolName    — lowercase tool name
 *   - tool name classification  — isCodeX{Write,Edit,Read}ToolName
 */

/**
 * Return the first non-empty string from the given values.
 *
 * @param {...*} values
 * @returns {string}
 */
function pickFirstStringValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
  }
  return ''
}

/**
 * Build a deterministic dedup key from a history message's role, text,
 * and optional structured content array.
 *
 * @param {string} role
 * @param {string} text
 * @param {Array} [content]
 * @returns {string}
 */
function buildMessageDedupKey(role, text, content) {
  const safeRole = role || ''
  const safeText = text || ''
  if (Array.isArray(content) && content.length) {
    try {
      return `${safeRole}:${safeText}:${JSON.stringify(content)}`
    } catch (_) {}
  }
  return `${safeRole}:${safeText}`
}

// ---- Tool name classification ----

const CODEX_WRITE_TOOL_NAMES = new Set([
  'write',
  'write_file',
  'create_file',
  'writefile',
])

const CODEX_EDIT_TOOL_NAMES = new Set([
  'edit',
  'edit_file',
  'str_replace',
  'str_replace_editor',
  'str_replace_based_edit',
])

const CODEX_READ_TOOL_NAMES = new Set([
  'read',
  'read_file',
])

/**
 * Normalize a tool name to lowercase for consistent lookups.
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeCodexToolName(name) {
  return String(name || '').toLowerCase()
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isCodeXWriteToolName(name) {
  return CODEX_WRITE_TOOL_NAMES.has(normalizeCodexToolName(name))
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isCodeXEditToolName(name) {
  return CODEX_EDIT_TOOL_NAMES.has(normalizeCodexToolName(name))
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isCodeXReadToolName(name) {
  return CODEX_READ_TOOL_NAMES.has(normalizeCodexToolName(name))
}

module.exports = {
  pickFirstStringValue,
  buildMessageDedupKey,
  normalizeCodexToolName,
  isCodeXWriteToolName,
  isCodeXEditToolName,
  isCodeXReadToolName,
}
