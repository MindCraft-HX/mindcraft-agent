'use strict';

/**
 * CodeX page / JSONL reading helpers (small IO utilities).
 *
 * Extracted from codexAgent.js as part of Batch 2.
 *
 * Classification: "有 IO、无运行态" — safe to extract with
 * characterization tests because there is no shared mutable state.
 *
 * Responsibilities:
 *   - readFirstLine  — read the first meaningful line of a file
 *   - safeJsonParse  — JSON.parse that returns null on failure
 */

const fs = require('fs')

/**
 * Read the first non-blank line of a file, stripping leading markdown
 * heading markers (`# `).
 *
 * @param {string} filePath — absolute path
 * @returns {string} first meaningful line, or '' on error
 */
function readFirstLine(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const line = String(text || '').split(/\r?\n/).find(l => String(l || '').trim())
    return String(line || '').trim().replace(/^#+\s*/, '')
  } catch (_) { return '' }
}

/**
 * Safe JSON.parse — returns `null` instead of throwing on invalid input.
 *
 * @param {string} line
 * @returns {object|null}
 */
function safeJsonParse(line) {
  try { return JSON.parse(line) } catch (_) { return null }
}

module.exports = { readFirstLine, safeJsonParse }
