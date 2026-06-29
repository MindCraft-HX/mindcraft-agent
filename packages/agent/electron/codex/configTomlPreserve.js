'use strict';

/**
 * TOML section preservation — prevents model-config save from overwriting
 * [plugins.*] and [marketplaces.*] sections in ~/.codex/config.toml.
 *
 * Extracted from codexAgent.js (Batch 5c).
 *
 * Pure function — no I/O, no state.
 */

/**
 * Append preserved [plugins.*] and [marketplaces.*] sections from the
 * existing TOML content to the new content.
 *
 * @param {string} content  — new TOML content being written
 * @param {string} existing — current TOML file content on disk
 * @returns {string} content with preserved sections appended (if any)
 */
function appendPreservedCodexConfigSections(content, existing) {
  let finalContent = content || '';
  const preserved = [];
  let inPreserve = false;
  for (const line of String(existing || '').split('\n')) {
    const trimmed = line.trim();
    if (/^\[plugins\./.test(trimmed) || /^\[marketplaces\./.test(trimmed)) {
      inPreserve = true;
    } else if (inPreserve && /^\[/.test(trimmed) && !/^\[plugins\./.test(trimmed) && !/^\[marketplaces\./.test(trimmed)) {
      inPreserve = false;
    }
    if (inPreserve) preserved.push(line);
  }
  const preserveBlock = preserved.join('\n').trim();
  if (!preserveBlock) return finalContent;

  const normalizeNewlines = (value) => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalizeNewlines(finalContent).includes(normalizeNewlines(preserveBlock))) {
    finalContent = finalContent.trimEnd() + '\n\n' + preserveBlock + '\n';
  }
  return finalContent;
}

module.exports = { appendPreservedCodexConfigSections };
