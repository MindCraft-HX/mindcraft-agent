'use strict';

/**
 * T198 Settings Storage Facade — single authority for all app-owned settings.
 *
 * Backed by a single JSON file: {userData}/app-settings.json
 * Replaces the 5-backend-7-location fragmentation with namespaced sections:
 *
 *   diagnostics    — enabled, tokenMetricsDebug
 *   app            — locale, theme
 *   codexDefaults  — sandboxMode, defaultNetworkAccess, defaultWebSearch
 *   claudePrefs    — permissionPolicy, language, model, executablePath, tierModels
 *   misc           — generic KV (isUpdateAvailable, openDocTabs, recentDocs, etc.)
 *
 * Migration is lazy, per-namespace, on init(). Old backends are read once and
 * their data merged into app-settings.json. Old backends are NOT deleted.
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** @type {string|null} */
let _dataDir = null;

/** @type {object|null} — in-memory cache, flushed on every set */
let _cache = null;

/** Which namespaces have already been migrated from old backends */
const _migrated = new Set();

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function _filePath() {
  if (!_dataDir) throw new Error('settingsFacade not initialized — call init(userDataPath) first');
  return path.join(_dataDir, 'app-settings.json');
}

function _read() {
  try {
    const fp = _filePath();
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch (_) { /* corrupt JSON → rebuild */ }
  return {};
}

function _write(data) {
  const fp = _filePath();
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  // atomic rename (Windows-safe: remove target first)
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  fs.renameSync(tmp, fp);
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function _ensureSection(name) {
  if (!_cache) _cache = _read();
  if (!_cache[name] || typeof _cache[name] !== 'object' || Array.isArray(_cache[name])) {
    _cache[name] = {};
  }
  return _cache[name];
}

function _getSection(name) {
  if (!_cache) _cache = _read();
  const s = _cache[name];
  if (s && typeof s === 'object' && !Array.isArray(s)) return s;
  return {};
}

// ---------------------------------------------------------------------------
// Migration — read from old backends
// ---------------------------------------------------------------------------

/**
 * Try to read a value from an electron-conf store.
 * Returns undefined if the store is unavailable or key is missing.
 */
function _tryConfGet(configName, key) {
  try {
    // electron-conf is an optional dependency; don't crash if unavailable
    const Conf = require('electron-conf');
    const c = new Conf({ configName });
    return c.get(key);
  } catch (_) { /* not available */ }
}

/**
 * Read old theme.json if it exists.
 */
function _tryOldTheme() {
  if (!_dataDir) return undefined;
  try {
    const p = path.join(_dataDir, 'theme.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return data?.theme;
    }
  } catch (_) {}
}

/**
 * Read old claude-internal conf (fallback JSON if electron-conf unavailable).
 */
function _tryClaudeInternalConf() {
  try {
    const Conf = require('electron-conf');
    const c = new Conf({ configName: 'claude-internal' });
    return {
      permissionPolicy: c.get('claudePermissionPolicy'),
      language: c.get('claudeLanguage'),
      model: c.get('claudeModel'),
      executablePath: c.get('claudeExecutablePath'),
      tierModels: c.get('tierModels'),
    };
  } catch (_) {}
  // Fallback: read claude-internal.json directly
  try {
    if (_dataDir) {
      const p = path.join(_dataDir, 'claude-internal.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          permissionPolicy: data?.claudePermissionPolicy,
          language: data?.claudeLanguage,
          model: data?.claudeModel,
          executablePath: data?.claudeExecutablePath,
          tierModels: data?.tierModels,
        };
      }
    }
  } catch (_) {}
  return {};
}

/**
 * Migrate flat KV keys from old settingsStore into the misc namespace.
 * Old app-settings.json (from settingsStore.js) stored keys like
 * `isUpdateAvailable`, `recentDocs`, `openDocTabs` at the top level.
 */
function _migrateFlatKeys(existing) {
  const knownNamespaces = new Set(['diagnostics', 'app', 'codexDefaults', 'claudePrefs', 'misc']);
  let changed = false;
  for (const key of Object.keys(existing)) {
    if (knownNamespaces.has(key)) continue;
    const value = existing[key];
    // Only migrate if it looks like a plain value (not a namespace object)
    if (value === undefined) continue;
    if (!existing.misc) existing.misc = {};
    existing.misc[key] = value;
    delete existing[key];
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Public: init
// ---------------------------------------------------------------------------

/**
 * Initialize the facade and run migration from old backends.
 * Must be called once during app startup, before any getters/setters.
 *
 * @param {string} userDataPath — app.getPath('userData')
 */
function init(userDataPath) {
  if (_dataDir) return; // already initialized
  if (!userDataPath || typeof userDataPath !== 'string') {
    throw new Error('settingsFacade.init: userDataPath is required');
  }
  _dataDir = userDataPath;

  // Read existing file (may already have data from old diagnosticsFileUtils or settingsStore)
  let data = _read();

  // Migrate flat KV keys from old settingsStore into misc
  if (_migrateFlatKeys(data)) {
    _write(data);
  }

  _cache = data;
  _migrated.clear();

  // Ensure all known sections exist with defaults
  const defaults = {
    diagnostics: { enabled: false, tokenMetricsDebug: false },
    app: {},
    codexDefaults: {},
    claudePrefs: {},
    misc: {},
  };

  let changed = false;
  for (const [name, def] of Object.entries(defaults)) {
    if (!data[name] || typeof data[name] !== 'object' || Array.isArray(data[name])) {
      data[name] = { ...def };
      changed = true;
    }
  }

  // Migrate diagnostics — may already exist from old diagnosticsFileUtils
  _migrateNamespace('diagnostics', () => ({}));

  // Migrate app settings
  _migrateNamespace('app', () => ({
    locale: _tryConfGet('app-config', 'locale') || undefined,
    theme: _tryOldTheme() || undefined,
  }));

  // Migrate CodeX defaults
  _migrateNamespace('codexDefaults', () => {
    const vals = {};
    const sm = _tryConfGet('mindcraft-codex', 'sandboxMode');
    if (sm !== undefined) vals.sandboxMode = sm;
    const na = _tryConfGet('mindcraft-codex', 'defaultNetworkAccess');
    if (na !== undefined) vals.defaultNetworkAccess = na;
    const ws = _tryConfGet('mindcraft-codex', 'defaultWebSearch');
    if (ws !== undefined) vals.defaultWebSearch = ws;
    return vals;
  });

  // Migrate Claude internal prefs
  _migrateNamespace('claudePrefs', () => {
    const old = _tryClaudeInternalConf();
    const vals = {};
    if (old.permissionPolicy !== undefined) vals.permissionPolicy = old.permissionPolicy;
    if (old.language !== undefined) vals.language = old.language;
    if (old.model !== undefined) vals.model = old.model;
    if (old.executablePath !== undefined) vals.executablePath = old.executablePath;
    if (old.tierModels !== undefined && typeof old.tierModels === 'object') {
      vals.tierModels = old.tierModels;
    }
    return vals;
  });

  if (changed) {
    _write(_cache);
  }
}

/**
 * Migrate one namespace from old backend if not already present.
 */
function _migrateNamespace(name, reader) {
  if (_migrated.has(name)) return;
  _migrated.add(name);

  const section = _ensureSection(name);
  const existing = Object.keys(section).length;

  // If section has data (either pre-existing or migrated), skip
  if (existing > 0) {
    // Check if it's only the defaults we just set
    // If section was empty before defaults, try migration
  }

  const oldValues = reader();
  if (!oldValues || Object.keys(oldValues).length === 0) return;

  let changed = false;
  for (const [k, v] of Object.entries(oldValues)) {
    if (v !== undefined && section[k] === undefined) {
      section[k] = v;
      changed = true;
    }
  }
  if (changed) _write(_cache);
}

// ---------------------------------------------------------------------------
// Public: Diagnostics
// ---------------------------------------------------------------------------

function getDiagnosticsEnabled() {
  const s = _getSection('diagnostics');
  return typeof s.enabled === 'boolean' ? s.enabled : false;
}

function setDiagnosticsEnabled(enabled) {
  const s = _ensureSection('diagnostics');
  s.enabled = Boolean(enabled);
  s.tokenMetricsDebug = Boolean(enabled); // keep the coupled behavior
  _write(_cache);
}

// ---------------------------------------------------------------------------
// Public: App (locale, theme)
// ---------------------------------------------------------------------------

function getLocale() {
  const s = _getSection('app');
  return s.locale || null;
}

function setLocale(loc) {
  const s = _ensureSection('app');
  s.locale = loc;
  _write(_cache);
}

function getTheme() {
  const s = _getSection('app');
  return s.theme || null;
}

function setTheme(name) {
  const s = _ensureSection('app');
  s.theme = name;
  _write(_cache);
}

// ---------------------------------------------------------------------------
// Public: CodeX defaults
// ---------------------------------------------------------------------------

/** @param {'sandboxMode'|'defaultNetworkAccess'|'defaultWebSearch'} key */
function getCodexDefault(key) {
  const s = _getSection('codexDefaults');
  return s[key];
}

/** @param {'sandboxMode'|'defaultNetworkAccess'|'defaultWebSearch'} key */
function setCodexDefault(key, value) {
  const s = _ensureSection('codexDefaults');
  s[key] = value;
  _write(_cache);
}

// ---------------------------------------------------------------------------
// Public: Claude internal prefs
// ---------------------------------------------------------------------------

/** @param {'permissionPolicy'|'language'|'model'|'executablePath'|'tierModels'} key */
function getClaudePref(key) {
  const s = _getSection('claudePrefs');
  return s[key];
}

/** @param {'permissionPolicy'|'language'|'model'|'executablePath'|'tierModels'} key */
function setClaudePref(key, value) {
  const s = _ensureSection('claudePrefs');
  s[key] = value;
  _write(_cache);
}

// ---------------------------------------------------------------------------
// Public: Misc KV (generic settings)
// ---------------------------------------------------------------------------

/**
 * Get a misc key. Returns defaultValue if key doesn't exist.
 */
function getMisc(key, defaultValue) {
  const s = _getSection('misc');
  const val = s[key];
  return val !== undefined ? val : defaultValue;
}

/**
 * Set a misc key.
 */
function setMisc(key, value) {
  const s = _ensureSection('misc');
  s[key] = value;
  _write(_cache);
}

// ---------------------------------------------------------------------------
// Public: Diagnostics internals (for test observation only)
// ---------------------------------------------------------------------------

/**
 * Return the raw in-memory cache. For tests only.
 */
function _getCache() {
  return _cache;
}

/**
 * Reset internal state. For tests only.
 */
function _reset() {
  _dataDir = null;
  _cache = null;
  _migrated.clear();
}

module.exports = {
  init,
  getDiagnosticsEnabled,
  setDiagnosticsEnabled,
  getLocale,
  setLocale,
  getTheme,
  setTheme,
  getCodexDefault,
  setCodexDefault,
  getClaudePref,
  setClaudePref,
  getMisc,
  setMisc,
  // test helpers
  _getCache,
  _reset,
};
