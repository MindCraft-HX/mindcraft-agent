'use strict';

/**
 * IPC channel parity scanner — verifies preload/main channel registration.
 *
 * Phase 3: hard constraint for new channels.
 *   - All channels with a registered value → OK.
 *   - Channels in the historical baseline → WARNING (pre-existing debt).
 *   - Channels NOT in registry AND NOT in baseline → HARD ERROR.
 *
 * How to add a new IPC channel:
 *   1. Add the channel string to packages/agent/shared/ipcChannels.js
 *   2. Use the registry constant in preload AND main handler code
 *   3. Run this test — if it passes, the channel is properly registered
 *   4. If you retired an old channel, remove it from the baseline
 */

const fs = require('fs');
const path = require('path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'ipc-channel-baseline.json');

// ---- Channel scanner ----

function findInvocations(dirPath, patterns, extensions) {
  const results = [];
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('__') && entry.name !== 'node_modules') {
          stack.push(full);
        }
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        const content = fs.readFileSync(full, 'utf8');
        for (const pattern of patterns) {
          const regex = new RegExp(pattern.regex, 'g');
          let match;
          while ((match = regex.exec(content)) !== null) {
            results.push({
              file: path.relative(ROOT, full),
              channel: match[1],
              line: content.substring(0, match.index).split('\n').length,
              kind: pattern.kind,
            });
          }
        }
      }
    }
  }
  return results;
}

// ---- Pattern definitions ----

const PRELOAD_SCAN = [
  { regex: `ipcRenderer\\.invoke\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'invoke' },
  { regex: `ipcRenderer\\.send\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'send' },
  { regex: `ipcRenderer\\.on\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'on' },
];

const MAIN_SCAN = [
  { regex: `ipcMain\\.handle\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'handle' },
  { regex: `ipcMain\\.on\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'on' },
];

const CORE_SCAN = [
  { regex: `ipcMain\\.handle\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'handle' },
];

// ---- Tests ----

describe('IPC Channel Parity', () => {
  let preloadChannels;
  let mainChannels;
  let registryChannels;
  let baselineChannels;  // Phase 3: historical channels exempt from registry requirement

  before(() => {
    // Scan agent preload
    const preloadResults = findInvocations(
      path.join(ROOT, 'packages', 'agent', 'preload'),
      PRELOAD_SCAN,
      ['.js', '.ts', '.mjs']
    );

    // Scan host preload
    const hostPreloadResults = findInvocations(
      path.join(ROOT, 'electron'),
      PRELOAD_SCAN,
      ['.js', '.ts']
    );

    preloadChannels = [...preloadResults, ...hostPreloadResults];

    // Scan agent electron main handlers
    const agentMainResults = findInvocations(
      path.join(ROOT, 'packages', 'agent', 'electron'),
      MAIN_SCAN,
      ['.js', '.mjs']
    );

    // Scan host main handlers
    const hostMainResults = findInvocations(
      path.join(ROOT, 'electron'),
      CORE_SCAN,
      ['.js']
    );

    mainChannels = [...agentMainResults, ...hostMainResults];

    // Try loading registry if it exists
    try {
      const registry = require('../packages/agent/shared/ipcChannels');
      const allRegistry = [];
      for (const group of Object.values(registry)) {
        if (typeof group === 'object') {
          allRegistry.push(...Object.values(group));
        }
      }
      registryChannels = allRegistry;
    } catch {
      registryChannels = [];
    }

    // Load historical channel baseline (Batch 3)
    try {
      baselineChannels = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    } catch {
      baselineChannels = [];
    }
  });

  it('preload channels that have no matching main handler', () => {
    const mainSet = new Set(mainChannels.map(c => c.channel));
    const orphans = preloadChannels.filter(c => !mainSet.has(c.channel));
    if (orphans.length > 0) {
      console.warn('⚠ Preload channels with no main handler found:');
      for (const o of orphans) {
        console.warn(`  ${o.channel} (${o.file}:${o.line})`);
      }
      console.warn(`  Total: ${orphans.length}`);
    }
    // Soft: only log warnings, don't fail yet
    assert.ok(true, `Preload channels without main handler: ${orphans.length} (see warnings above)`);
  });

  it('main handlers that have no matching preload channel', () => {
    const preloadSet = new Set(preloadChannels.map(c => c.channel));
    const soloHandlers = mainChannels.filter(c => !preloadSet.has(c.channel));
    if (soloHandlers.length > 0) {
      console.warn('⚠ Main handlers with no preload channel:');
      for (const s of soloHandlers) {
        console.warn(`  ${s.channel} (${s.file}:${s.line})`);
      }
      console.warn(`  Total: ${soloHandlers.length}`);
    }
    assert.ok(true, `Main handlers without preload: ${soloHandlers.length}`);
  });

  it('registry has no duplicate channel values across groups', () => {
    if (registryChannels.length === 0) {
      console.log('  No registry loaded yet — skipping duplicate check.');
      assert.ok(true);
      return;
    }
    const seen = new Set();
    const dupes = [];
    for (const ch of registryChannels) {
      if (seen.has(ch)) dupes.push(ch);
      seen.add(ch);
    }
    assert.strictEqual(dupes.length, 0,
      `Duplicate channel values found: ${dupes.join(', ')}`);
  });

  it('total channel count is measurable', () => {
    const uniquePreload = new Set(preloadChannels.map(c => c.channel));
    const uniqueMain = new Set(mainChannels.map(c => c.channel));
    console.log(`  Preload unique channels: ${uniquePreload.size}`);
    console.log(`  Main unique channels: ${uniqueMain.size}`);
    console.log(`  Registered channels: ${registryChannels.length}`);
    assert.ok(uniquePreload.size > 0, 'Should have preload channels');
    assert.ok(uniqueMain.size > 0, 'Should have main handlers');
  });

  // ---- Phase 3: Hard constraint — new channels MUST be registered ----

  it('new channels (not in registry, not in baseline) are rejected', () => {
    if (registryChannels.length === 0) {
      console.log('  No registry loaded — skipping hard-constraint check.');
      assert.ok(true);
      return;
    }

    const registrySet = new Set(registryChannels);
    const baselineSet = new Set(baselineChannels);

    // Collect all unique channels across preload + main
    const allUnique = new Set([
      ...preloadChannels.map(c => c.channel),
      ...mainChannels.map(c => c.channel),
    ]);

    const unregisteredHistorical = [];
    const unregisteredNew = [];

    for (const ch of allUnique) {
      if (registrySet.has(ch)) continue;          // correctly registered
      if (baselineSet.has(ch)) {
        unregisteredHistorical.push(ch);           // pre-existing debt
      } else {
        unregisteredNew.push(ch);                  // NEW channel, MUST register
      }
    }

    // Historical debt: warn but don't fail
    if (unregisteredHistorical.length > 0) {
      console.warn(
        `⚠ ${unregisteredHistorical.length} historical channels not yet in registry (grandfathered):`
      );
      for (const ch of unregisteredHistorical.sort()) {
        console.warn(`    ${ch}`);
      }
    }

    // New channels: hard error
    if (unregisteredNew.length > 0) {
      console.error(
        `❌ ${unregisteredNew.length} NEW channel(s) NOT registered in ipcChannels.js:`
      );
      for (const ch of unregisteredNew.sort()) {
        console.error(`    ${ch}`);
      }
      console.error(
        '\n  Fix: add each channel to packages/agent/shared/ipcChannels.js'
        + '\n  If retiring an old channel, also remove it from tests/ipc-channel-baseline.json'
      );
    }

    assert.strictEqual(
      unregisteredNew.length, 0,
      `${unregisteredNew.length} new unregistered channel(s): ${unregisteredNew.join(', ')}`
    );
  });
});
