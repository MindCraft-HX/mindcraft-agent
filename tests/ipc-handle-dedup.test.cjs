'use strict';

/**
 * Static contract: no duplicate ipcMain.handle or ipcMain.on channels
 * across electron/ and packages/agent/electron/.
 *
 * - ipcMain.handle duplicates: Electron throws at startup — hard error.
 * - ipcMain.on duplicates: won't crash, but silently stacks listeners and
 *   fires callbacks multiple times — soft constraint, still treated as
 *   a test failure here since the project should not rely on that behavior.
 *
 * This test scans the source tree and fails on any duplicate — catching
 * issues that unit/integration tests may miss because they don't load the
 * actual main process.
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROOTS = [
  path.join(PROJECT_ROOT, 'electron'),
  path.join(PROJECT_ROOT, 'packages', 'agent', 'electron'),
];

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git']);

function walkJsFiles(roots) {
  const results = [];
  for (const dir of roots) {
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try { entries = fs.readdirSync(current, { withFileTypes: true }); }
      catch (_) { continue; }
      for (const entry of entries) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && /\.(js|cjs|mjs)$/.test(entry.name)) {
          results.push(full);
        }
      }
    }
  }
  return results.sort();
}

function extractChannels(filePath, method) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Match ipcMain.handle('channel', ...) or ipcMain.on('channel', ...)
  const re = new RegExp(
    `ipcMain\\.${method}\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`, 'g'
  );
  const channels = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    channels.push({ channel: m[2], line: content.slice(0, m.index).split('\n').length });
  }
  return channels;
}

function collectChannelRegistrations(files, method) {
  const all = [];
  for (const file of files) {
    const relative = path.relative(PROJECT_ROOT, file);
    for (const c of extractChannels(file, method)) {
      all.push({ channel: c.channel, file: relative, line: c.line });
    }
  }
  return all;
}

function findDupes(registrations) {
  const seen = new Map();
  const dupes = [];
  for (const { channel, file, line } of registrations) {
    if (seen.has(channel)) {
      const prev = seen.get(channel);
      dupes.push(
        `"${channel}" registered in ${prev.file}:${prev.line} AND ${file}:${line}`
      );
    } else {
      seen.set(channel, { file, line });
    }
  }
  return dupes;
}

describe('ipcMain channel duplicate contract', () => {
  const files = walkJsFiles(ROOTS);

  const handleRegs = collectChannelRegistrations(files, 'handle');
  const onRegs = collectChannelRegistrations(files, 'on');

  describe('ipcMain.handle', () => {
    it('no channel is registered more than once (crashes Electron)', () => {
      const dupes = findDupes(handleRegs);
      assert.deepStrictEqual(dupes, [], 'Duplicate ipcMain.handle channels found');
    });

    it('has at least some handlers (sanity)', () => {
      assert.ok(handleRegs.length > 0, 'Expected ipcMain.handle channels to exist');
    });
  });

  describe('ipcMain.on', () => {
    it('no channel is listened more than once (silent listener stacking)', () => {
      const dupes = findDupes(onRegs);
      assert.deepStrictEqual(dupes, [], 'Duplicate ipcMain.on channels found');
    });

    it('has at least some listeners (sanity)', () => {
      assert.ok(onRegs.length > 0, 'Expected ipcMain.on channels to exist');
    });
  });
});
