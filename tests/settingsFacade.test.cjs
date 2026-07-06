'use strict';

/**
 * T198 Settings Facade contract tests.
 *
 * Covers: init, diagnostics, app (locale/theme), CodeX defaults,
 * Claude prefs, misc KV, namespace isolation, migration, edge cases.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// We must require the facade fresh per test to avoid state leaks.
// The facade is a singleton, so each test resets it.
function loadFacade() {
  // Clear require cache to get a clean state
  delete require.cache[require.resolve('../packages/agent/electron/settingsFacade')];
  return require('../packages/agent/electron/settingsFacade');
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mc-facade-test-'));
}

function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Init and defaults
// ---------------------------------------------------------------------------

test('init creates app-settings.json with all default sections', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    // Verify file was created
    const fp = path.join(dir, 'app-settings.json');
    assert.ok(fs.existsSync(fp));

    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.ok(data.diagnostics, 'diagnostics section missing');
    assert.ok(data.app, 'app section missing');
    assert.ok(data.codexDefaults, 'codexDefaults section missing');
    assert.ok(data.claudePrefs, 'claudePrefs section missing');
    assert.ok(data.misc, 'misc section missing');

    assert.equal(data.diagnostics.enabled, false);
  } finally {
    rmDir(dir);
  }
});

test('init is idempotent (second call is no-op)', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);
    // Second init should not throw
    facade.init(dir);
    assert.equal(facade.getDiagnosticsEnabled(), false);
  } finally {
    rmDir(dir);
  }
});

test('init throws without userDataPath', () => {
  const facade = loadFacade();
  assert.throws(() => facade.init(), /userDataPath is required/);
  assert.throws(() => facade.init(null), /userDataPath is required/);
  assert.throws(() => facade.init(''), /userDataPath is required/);
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

test('diagnostics: get/set round-trip', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    // Default is false
    assert.equal(facade.getDiagnosticsEnabled(), false);

    // Set true
    facade.setDiagnosticsEnabled(true);
    assert.equal(facade.getDiagnosticsEnabled(), true);

    // Verify persistence
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.diagnostics.enabled, true);
    assert.equal(data.diagnostics.tokenMetricsDebug, true);

    // Set false
    facade.setDiagnosticsEnabled(false);
    assert.equal(facade.getDiagnosticsEnabled(), false);
  } finally {
    rmDir(dir);
  }
});

test('diagnostics: tokenMetricsDebug is coupled to enabled', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    facade.setDiagnosticsEnabled(true);
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.diagnostics.tokenMetricsDebug, true);

    facade.setDiagnosticsEnabled(false);
    const data2 = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data2.diagnostics.tokenMetricsDebug, false);
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// App: locale
// ---------------------------------------------------------------------------

test('app locale: get/set round-trip', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    assert.equal(facade.getLocale(), null);

    facade.setLocale('zh');
    assert.equal(facade.getLocale(), 'zh');

    facade.setLocale('en');
    assert.equal(facade.getLocale(), 'en');

    // Verify persistence
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.app.locale, 'en');
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// App: theme
// ---------------------------------------------------------------------------

test('app theme: get/set round-trip', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    assert.equal(facade.getTheme(), null);

    facade.setTheme('dark');
    assert.equal(facade.getTheme(), 'dark');

    facade.setTheme('light');
    assert.equal(facade.getTheme(), 'light');

    // Verify persistence
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.app.theme, 'light');
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// CodeX defaults
// ---------------------------------------------------------------------------

test('codexDefaults: get/set round-trip', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    assert.equal(facade.getCodexDefault('sandboxMode'), undefined);

    facade.setCodexDefault('sandboxMode', 'danger-full-access');
    assert.equal(facade.getCodexDefault('sandboxMode'), 'danger-full-access');

    facade.setCodexDefault('defaultNetworkAccess', false);
    assert.equal(facade.getCodexDefault('defaultNetworkAccess'), false);

    facade.setCodexDefault('defaultWebSearch', 'always');
    assert.equal(facade.getCodexDefault('defaultWebSearch'), 'always');

    // Verify persistence
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.codexDefaults.sandboxMode, 'danger-full-access');
    assert.equal(data.codexDefaults.defaultNetworkAccess, false);
    assert.equal(data.codexDefaults.defaultWebSearch, 'always');
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Claude prefs
// ---------------------------------------------------------------------------

test('claudePrefs: get/set round-trip', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    assert.equal(facade.getClaudePref('permissionPolicy'), undefined);

    facade.setClaudePref('permissionPolicy', 'always-allow');
    assert.equal(facade.getClaudePref('permissionPolicy'), 'always-allow');

    facade.setClaudePref('language', 'en');
    assert.equal(facade.getClaudePref('language'), 'en');

    facade.setClaudePref('model', 'claude-sonnet-4-20250514');
    assert.equal(facade.getClaudePref('model'), 'claude-sonnet-4-20250514');

    facade.setClaudePref('executablePath', '/usr/bin/claude');
    assert.equal(facade.getClaudePref('executablePath'), '/usr/bin/claude');

    facade.setClaudePref('tierModels', { haiku: 'h', sonnet: 's' });
    assert.deepEqual(facade.getClaudePref('tierModels'), { haiku: 'h', sonnet: 's' });

    // Verify persistence
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.claudePrefs.permissionPolicy, 'always-allow');
    assert.equal(data.claudePrefs.language, 'en');
    assert.equal(data.claudePrefs.model, 'claude-sonnet-4-20250514');
    assert.equal(data.claudePrefs.executablePath, '/usr/bin/claude');
    assert.deepEqual(data.claudePrefs.tierModels, { haiku: 'h', sonnet: 's' });
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Misc KV
// ---------------------------------------------------------------------------

test('misc: get/set round-trip', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    assert.equal(facade.getMisc('nonexistent'), undefined);
    assert.equal(facade.getMisc('nonexistent', 'default'), 'default');

    facade.setMisc('isUpdateAvailable', true);
    assert.equal(facade.getMisc('isUpdateAvailable'), true);

    facade.setMisc('recentDocs', [{ path: '/a' }]);
    assert.deepEqual(facade.getMisc('recentDocs'), [{ path: '/a' }]);

    // Verify persistence
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'));
    assert.equal(data.misc.isUpdateAvailable, true);
    assert.deepEqual(data.misc.recentDocs, [{ path: '/a' }]);
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Namespace isolation
// ---------------------------------------------------------------------------

test('namespace isolation: writing one section does not affect others', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);

    // Write to each namespace
    facade.setDiagnosticsEnabled(true);
    facade.setLocale('zh');
    facade.setTheme('dark');
    facade.setCodexDefault('sandboxMode', 'read-only');
    facade.setClaudePref('permissionPolicy', 'ask');
    facade.setMisc('key1', 'value1');

    // Verify each namespace is correct
    assert.equal(facade.getDiagnosticsEnabled(), true);
    assert.equal(facade.getLocale(), 'zh');
    assert.equal(facade.getTheme(), 'dark');
    assert.equal(facade.getCodexDefault('sandboxMode'), 'read-only');
    assert.equal(facade.getClaudePref('permissionPolicy'), 'ask');
    assert.equal(facade.getMisc('key1'), 'value1');

    // Change one and verify others unchanged
    facade.setDiagnosticsEnabled(false);
    assert.equal(facade.getDiagnosticsEnabled(), false);
    assert.equal(facade.getLocale(), 'zh');  // unchanged
    assert.equal(facade.getTheme(), 'dark'); // unchanged
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Migration: flat KV keys → misc
// ---------------------------------------------------------------------------

test('migration: flat top-level keys moved to misc', () => {
  const dir = tmpDir();
  try {
    // Pre-create an old-style app-settings.json with flat keys
    const fp = path.join(dir, 'app-settings.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, JSON.stringify({
      isUpdateAvailable: true,
      recentDocs: ['doc1'],
      openDocTabs: ['tab1'],
    }, null, 2), 'utf8');

    const facade = loadFacade();
    facade.init(dir);

    // Flat keys should now be in misc
    assert.equal(facade.getMisc('isUpdateAvailable'), true);
    assert.deepEqual(facade.getMisc('recentDocs'), ['doc1']);
    assert.deepEqual(facade.getMisc('openDocTabs'), ['tab1']);

    // Top-level should be gone
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.equal(data.isUpdateAvailable, undefined);
    assert.equal(data.recentDocs, undefined);
    assert.equal(data.openDocTabs, undefined);
    assert.ok(data.misc);
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Corrupted JSON recovery
// ---------------------------------------------------------------------------

test('recovers from corrupted app-settings.json', () => {
  const dir = tmpDir();
  try {
    const fp = path.join(dir, 'app-settings.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, 'this is not valid json{{{', 'utf8');

    const facade = loadFacade();
    // Should not throw — should rebuild with defaults
    facade.init(dir);
    assert.equal(facade.getDiagnosticsEnabled(), false);
    assert.equal(facade.getLocale(), null);
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Partial migration: pre-existing sections preserved
// ---------------------------------------------------------------------------

test('partial migration: pre-existing diagnostics section preserved', () => {
  const dir = tmpDir();
  try {
    const fp = path.join(dir, 'app-settings.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, JSON.stringify({
      diagnostics: { enabled: true, tokenMetricsDebug: true },
    }, null, 2), 'utf8');

    const facade = loadFacade();
    facade.init(dir);

    // Pre-existing diagnostics value should be preserved
    assert.equal(facade.getDiagnosticsEnabled(), true);

    // Other sections should be created with defaults
    assert.equal(facade.getLocale(), null);
    assert.equal(facade.getTheme(), null);
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// File not found on boot
// ---------------------------------------------------------------------------

test('init with no existing file creates one', () => {
  const dir = tmpDir();
  try {
    const fp = path.join(dir, 'app-settings.json');
    assert.equal(fs.existsSync(fp), false);

    const facade = loadFacade();
    facade.init(dir);

    assert.ok(fs.existsSync(fp));
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.equal(typeof data.diagnostics.enabled, 'boolean');
  } finally {
    rmDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

test('_reset clears internal state', () => {
  const dir = tmpDir();
  try {
    const facade = loadFacade();
    facade.init(dir);
    facade.setLocale('zh');

    facade._reset();
    // After reset, cache should be null
    assert.equal(facade._getCache(), null);
  } finally {
    rmDir(dir);
  }
});
