'use strict';

/**
 * Simple Chat message file layer.
 *
 * Reads/writes message bodies to JSONL files under:
 *   {userData}/simple-chat/threads/<threadId>/messages.jsonl
 *
 * One JSON object per line, matching the renderer's message shape.
 * Write strategy: overwrite (the renderer sends full messages[] on each saveSession).
 * This keeps the API simple and avoids per-message append complexity
 * — Simple Chat histories are typically modest in size.
 */

const path = require('path');
const fs = require('fs');

/**
 * Get the directory for a thread's files.
 *
 * @param {string} userDataDir
 * @param {string} threadId
 * @returns {string}
 */
function getThreadDir(userDataDir, threadId) {
  return path.join(userDataDir, 'simple-chat', 'threads', String(threadId));
}

/**
 * Ensure the thread directory exists.
 *
 * @param {string} userDataDir
 * @param {string} threadId
 * @returns {string} the thread directory path
 */
function ensureThreadDir(userDataDir, threadId) {
  const dir = getThreadDir(userDataDir, threadId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Read all messages for a thread as parsed objects.
 * Returns an empty array if the file doesn't exist or is empty.
 *
 * @param {string} userDataDir
 * @param {string} threadId
 * @returns {Array<object>}
 */
function readMessages(userDataDir, threadId) {
  const file = path.join(getThreadDir(userDataDir, threadId), 'messages.jsonl');
  try {
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return [];
    return text.trim().split('\n').map(line => JSON.parse(line));
  } catch (e) {
    console.error('[chatMessageFiles] readMessages error:', e.message);
    return [];
  }
}

/**
 * Write all messages for a thread (overwrite).
 * Uses atomic write: write to .tmp, then rename.
 *
 * @param {string} userDataDir
 * @param {string} threadId
 * @param {Array<object>} messages
 */
function writeMessages(userDataDir, threadId, messages) {
  const dir = ensureThreadDir(userDataDir, threadId);
  const file = path.join(dir, 'messages.jsonl');
  const lines = (Array.isArray(messages) ? messages : [])
    .map(m => JSON.stringify(m))
    .join('\n');
  const content = lines ? lines + '\n' : '';
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  // Atomic rename on Windows: remove existing first
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  fs.renameSync(tmp, file);
}

/**
 * Delete a thread's entire message directory.
 *
 * @param {string} userDataDir
 * @param {string} threadId
 */
function deleteThreadDir(userDataDir, threadId) {
  const dir = getThreadDir(userDataDir, threadId);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('[chatMessageFiles] deleteThreadDir error:', e.message);
  }
}

module.exports = {
  getThreadDir,
  ensureThreadDir,
  readMessages,
  writeMessages,
  deleteThreadDir,
};
