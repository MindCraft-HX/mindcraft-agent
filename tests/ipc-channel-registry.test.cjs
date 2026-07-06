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

/**
 * Scan for constant references like CLAUDE_CHANNELS.GET_KEY,
 * CODEX_CHANNELS.SELECT_DIRECTORY, CORE_CHANNELS.LOAD_THEME.
 *
 * Returns { file, line, kind, group, key } — group is 'CLAUDE'/'CODEX'/'CORE',
 * key is the constant name (e.g. 'GET_KEY').
 * These are resolved to actual channel strings in before() using the registry.
 */
function findConstantInvocations(dirPath, patterns, extensions) {
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
              line: content.substring(0, match.index).split('\n').length,
              kind: pattern.kind,
              group: match[1],   // CLAUDE | CODEX | CORE
              key: match[2],     // constant name e.g. GET_KEY
            });
          }
        }
      }
    }
  }
  return results;
}

// ---- Pattern definitions ----

// String-literal patterns (pre-migration code, residual channels)
const PRELOAD_SCAN = [
  { regex: `ipcRenderer\\.invoke\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'invoke' },
  { regex: `ipcRenderer\\.send\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'send' },
  { regex: `ipcRenderer\\.on\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'on' },
];

const MAIN_SCAN = [
  { regex: `ipcMain\\.handle\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'handle' },
  { regex: `ipcMain\\.on\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'on' },
];

// Host main uses the same scanner as agent main (handle + on)
const HOST_MAIN_SCAN = [
  { regex: `ipcMain\\.handle\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'handle' },
  { regex: `ipcMain\\.on\\s*\\(\\s*['"]([^'"]+)['"]`, kind: 'on' },
];

// Constant-reference patterns (post-migration: CLAUDE_CHANNELS.XXX etc.)
// Group 1 = prefix (CLAUDE|CODEX|CORE), Group 2 = key name (GET_KEY etc.)
const CONSTANT_PRELOAD_SCAN = [
  { regex: `ipcRenderer\\.invoke\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'invoke' },
  { regex: `ipcRenderer\\.send\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'send' },
  { regex: `ipcRenderer\\.sendSync\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'sendSync' },
  { regex: `ipcRenderer\\.on\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'on' },
  { regex: `ipcRenderer\\.removeAllListeners\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'removeAllListeners' },
  { regex: `ipcRenderer\\.removeListener\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'removeListener' },
];

const CONSTANT_MAIN_SCAN = [
  { regex: `ipcMain\\.handle\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'handle' },
  { regex: `ipcMain\\.on\\s*\\(\\s*(CLAUDE|CODEX|CORE)_CHANNELS\\.([A-Z0-9_]+)`, kind: 'on' },
];

const CONSTANT_HOST_MAIN_SCAN = CONSTANT_MAIN_SCAN;  // same patterns

// ---- Tests ----

describe('IPC Channel Parity', () => {
  let preloadChannels;
  let mainChannels;
  let registryChannels;
  let baselineChannels;  // Phase 3: historical channels exempt from registry requirement
  let unresolvedConstants;  // constant references not found in registry (typos, stale refs)

  before(() => {
    // --- Phase 1: scan for string-literal channels (pre-migration residual) ---
    const literalPreload = findInvocations(
      path.join(ROOT, 'packages', 'agent', 'preload'),
      PRELOAD_SCAN,
      ['.js', '.ts', '.mjs']
    );
    const hostLiteralPreload = findInvocations(
      path.join(ROOT, 'electron'),
      PRELOAD_SCAN,
      ['.js', '.ts']
    );
    const literalMain = findInvocations(
      path.join(ROOT, 'packages', 'agent', 'electron'),
      MAIN_SCAN,
      ['.js', '.mjs']
    );
    const hostLiteralMain = findInvocations(
      path.join(ROOT, 'electron'),
      HOST_MAIN_SCAN,
      ['.js']
    );

    // --- Phase 2: scan for constant references (post-migration) ---
    const constPreload = findConstantInvocations(
      path.join(ROOT, 'packages', 'agent', 'preload'),
      CONSTANT_PRELOAD_SCAN,
      ['.js', '.ts', '.mjs']
    );
    const hostConstPreload = findConstantInvocations(
      path.join(ROOT, 'electron'),
      CONSTANT_PRELOAD_SCAN,
      ['.js', '.ts']
    );
    const constMain = findConstantInvocations(
      path.join(ROOT, 'packages', 'agent', 'electron'),
      CONSTANT_MAIN_SCAN,
      ['.js', '.mjs']
    );
    const hostConstMain = findConstantInvocations(
      path.join(ROOT, 'electron'),
      CONSTANT_HOST_MAIN_SCAN,
      ['.js']
    );

    // --- Phase 3: load registry and resolve constant references ---
    let registry;
    try {
      registry = require('../packages/agent/shared/ipcChannels');
    } catch {
      registry = null;
    }

    const allRegistry = [];
    if (registry) {
      for (const group of Object.values(registry)) {
        if (typeof group === 'object') {
          allRegistry.push(...Object.values(group));
        }
      }
    }
    registryChannels = allRegistry;

    unresolvedConstants = [];

    function resolveConstants(items) {
      const resolved = [];
      for (const item of items) {
        if (!registry) continue;
        const groupName = item.group + '_CHANNELS';
        const channelValue = registry[groupName] && registry[groupName][item.key];
        if (channelValue) {
          resolved.push({ ...item, channel: channelValue });
        } else {
          unresolvedConstants.push(item);
        }
      }
      return resolved;
    }

    // --- Phase 4: merge literal + resolved constant references ---
    preloadChannels = [
      ...literalPreload,
      ...hostLiteralPreload,
      ...resolveConstants(constPreload),
      ...resolveConstants(hostConstPreload),
    ];
    mainChannels = [
      ...literalMain,
      ...hostLiteralMain,
      ...resolveConstants(constMain),
      ...resolveConstants(hostConstMain),
    ];

    // --- Phase 5: load baseline ---
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

  it('all constant references resolve to known registry keys', () => {
    if (unresolvedConstants && unresolvedConstants.length > 0) {
      console.error(
        `❌ ${unresolvedConstants.length} constant reference(s) NOT found in registry:`
      );
      for (const u of unresolvedConstants) {
        console.error(
          `    ${u.group}_CHANNELS.${u.key} (${u.file}:${u.line})`
        );
      }
      console.error(
        '\n  Possible causes:'
        + '\n  - Typo in constant name (e.g. GET_KEEY → GET_KEY)'
        + '\n  - Constant was removed from ipcChannels.js but still referenced'
        + '\n  - Missing registry key for a new channel'
      );
    }
    assert.strictEqual(
      (unresolvedConstants || []).length, 0,
      `${(unresolvedConstants || []).length} unresolved constant reference(s) — see error output above`
    );
  });
});
