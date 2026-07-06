'use strict';

/**
 * Chat message file layer contract tests.
 *
 * Covers:
 *   (a) validateThreadId — rejects path traversal and dangerous inputs
 *   (b) readMessages / writeMessages / deleteThreadDir — filesystem layer
 *   (c) getThreadDir type check
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  validateThreadId,
  getThreadDir,
  readMessages,
  writeMessages,
  deleteThreadDir,
} = require('./chatMessageFiles');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary userData-like directory for isolated file tests. */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mc-chatmsg-test-'));
}

/** Remove a temp directory tree. */
function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// (a) validateThreadId — path traversal & dangerous inputs
// ---------------------------------------------------------------------------

test('validateThreadId rejects empty / non-string', () => {
  assert.equal(validateThreadId(''), false);
  assert.equal(validateThreadId(null), false);
  assert.equal(validateThreadId(undefined), false);
  assert.equal(validateThreadId(123), false);
  assert.equal(validateThreadId({}), false);
  assert.equal(validateThreadId([]), false);
});

test('validateThreadId rejects path traversal sequences', () => {
  assert.equal(validateThreadId('../etc/passwd'), false);
  assert.equal(validateThreadId('..\\windows'), false);
  assert.equal(validateThreadId('foo/bar'), false);
  assert.equal(validateThreadId('foo\\bar'), false);
  assert.equal(validateThreadId('/root'), false);
  assert.equal(validateThreadId('C:\\data'), false);
  assert.equal(validateThreadId('.'), false);
  assert.equal(validateThreadId('..'), false);
});

test('validateThreadId rejects null byte and special chars', () => {
  assert.equal(validateThreadId('abc\0def'), false);
  assert.equal(validateThreadId('abc\x00'), false);
  assert.equal(validateThreadId('my id'), false);      // space
  assert.equal(validateThreadId('id;drop'), false);     // semicolon
  assert.equal(validateThreadId('<script>'), false);    // angle brackets
  assert.equal(validateThreadId('id|pipe'), false);     // pipe
});

test('validateThreadId accepts valid IDs', () => {
  // UUID-like
  assert.equal(validateThreadId('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true);
  // simple alphanumeric + hyphens/underscores/dots
  assert.equal(validateThreadId('session_42'), true);
  assert.equal(validateThreadId('chat-2026-07-06'), true);
  assert.equal(validateThreadId('v1.2.3'), true);
  assert.equal(validateThreadId('a'), true);
  // 128 chars max (1 leading + 127)
  const long = 'a' + 'b'.repeat(127);
  assert.equal(long.length, 128);
  assert.equal(validateThreadId(long), true);
  // 129 chars → reject
  assert.equal(validateThreadId(long + 'c'), false);
});

// ---------------------------------------------------------------------------
// (b) readMessages / writeMessages / deleteThreadDir
// ---------------------------------------------------------------------------

test('readMessages returns empty array for non-existent thread', () => {
  const dir = tmpDir();
  try {
    const msgs = readMessages(dir, 'nonexistent');
    assert.deepEqual(msgs, []);
  } finally {
    rmDir(dir);
  }
});

test('writeMessages + readMessages round-trip', () => {
  const dir = tmpDir();
  try {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    writeMessages(dir, 'thread1', messages);
    const result = readMessages(dir, 'thread1');
    assert.deepEqual(result, messages);
  } finally {
    rmDir(dir);
  }
});

test('writeMessages overwrites existing file', () => {
  const dir = tmpDir();
  try {
    writeMessages(dir, 'thread1', [{ role: 'user', content: 'v1' }]);
    writeMessages(dir, 'thread1', [{ role: 'user', content: 'v2' }]);
    const result = readMessages(dir, 'thread1');
    assert.equal(result.length, 1);
    assert.equal(result[0].content, 'v2');
  } finally {
    rmDir(dir);
  }
});

test('writeMessages handles empty messages array', () => {
  const dir = tmpDir();
  try {
    writeMessages(dir, 'thread1', []);
    const result = readMessages(dir, 'thread1');
    assert.deepEqual(result, []);
  } finally {
    rmDir(dir);
  }
});

test('deleteThreadDir removes messages', () => {
  const dir = tmpDir();
  try {
    writeMessages(dir, 'thread1', [{ role: 'user', content: 'test' }]);
    assert.ok(fs.existsSync(path.join(dir, 'simple-chat', 'threads', 'thread1')));
    deleteThreadDir(dir, 'thread1');
    assert.equal(fs.existsSync(path.join(dir, 'simple-chat', 'threads', 'thread1')), false);
  } finally {
    rmDir(dir);
  }
});

test('deleteThreadDir is safe for non-existent thread', () => {
  const dir = tmpDir();
  try {
    // Should not throw
    deleteThreadDir(dir, 'nonexistent');
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// (c) getThreadDir type check (defense in depth)
// ---------------------------------------------------------------------------

test('getThreadDir throws on invalid threadId', () => {
  assert.throws(() => getThreadDir('/tmp', '../escape'), /Invalid threadId/);
  assert.throws(() => getThreadDir('/tmp', ''), /Invalid threadId/);
  assert.throws(() => getThreadDir('/tmp', 'foo/bar'), /Invalid threadId/);
});

test('getThreadDir returns expected path for valid ID', () => {
  const result = getThreadDir('/data', 'thread1');
  assert.equal(result, path.join('/data', 'simple-chat', 'threads', 'thread1'));
});
