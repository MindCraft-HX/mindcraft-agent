'use strict';

/**
 * Static contract: no duplicate ipcMain.handle channels across electron/.
 *
 * Electron throws on `ipcMain.handle(channel, handler)` if the same
 * channel is already registered. This test scans the source tree and
 * fails on any duplicate — catching issues that unit/integration tests
 * may miss because they don't load the actual main process.
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'electron');

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git']);

function walkJsFiles(dir) {
  const results = [];
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
  return results.sort();
}

function extractHandleChannels(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const re = /ipcMain\.handle\s*\(\s*(['"`])([^'"`]+)\1/g;
  const channels = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    channels.push({ channel: m[2], line: content.slice(0, m.index).split('\n').length });
  }
  return channels;
}

describe('ipcMain.handle duplicate channel contract', () => {
  const files = walkJsFiles(ROOT);
  const allChannels = []; // { channel, file, line }

  for (const file of files) {
    const relative = path.relative(ROOT, file);
    const channels = extractHandleChannels(file);
    for (const c of channels) {
      allChannels.push({ channel: c.channel, file: relative, line: c.line });
    }
  }

  it('no ipcMain.handle channel is registered more than once', () => {
    const seen = new Map(); // channel → { file, line }
    const dupes = [];

    for (const { channel, file, line } of allChannels) {
      if (seen.has(channel)) {
        const prev = seen.get(channel);
        dupes.push(
          `"${channel}" registered in ${prev.file}:${prev.line} AND ${file}:${line}`
        );
      } else {
        seen.set(channel, { file, line });
      }
    }

    assert.deepStrictEqual(dupes, [], 'Duplicate ipcMain.handle channels found');
  });

  it('has at least some handlers (sanity)', () => {
    assert.ok(allChannels.length > 0, 'Expected ipcMain.handle channels to exist');
  });
});
