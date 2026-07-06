'use strict';

const { CODEX_CHANNELS } = require('../../shared/ipcChannels');

/**
 * CodeX config/settings IPC handlers — key, model, base URL, reasoning effort,
 * API format, sandbox mode, project settings, default network/web-search.
 *
 * Extracted from codexAgent.js (R09 main handler setup split).
 * TOML file read/write/repair added in Batch 5c.
 */

const { Conf } = require('electron-conf');
const fs = require('fs');
const path = require('path');
const { getCodexDefault, setCodexDefault } = require('../settingsFacade');
const { appendPreservedCodexConfigSections } = require('./configTomlPreserve');
const { previewLocalCliConfig, annotateConflicts, commitImport } = require('../db/import/index');
const { getDb, persistDb } = require('../db/index');
const { parseSimpleTomlContent } = require('./configManager');

function registerConfigIpc(ipcMain, {
  readRuntimeConfig,
  codexConfigDir,
  configTomlFile,
  readSandboxMode,
  CODEX_SANDBOX_MODES,
  findLegacyUserData,
  normalizeCodexReasoningEffort,
  userDataDir,
  readProviders,
  writeProviders,
  readCodexConfigTomlRaw,
}) {
  // ---- API Key ----
  ipcMain.handle(CODEX_CHANNELS.GET_KEY, () => {
    const rt = readRuntimeConfig();
    return rt.apiKey || '';
  });
  ipcMain.handle(CODEX_CHANNELS.SET_KEY, (_, key) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.apiKey = key; c.set('runtime', r); } catch (_) {}
    return true;
  });

  // ---- Base URL ----
  ipcMain.handle(CODEX_CHANNELS.GET_BASE_URL, () => {
    const rt = readRuntimeConfig();
    return rt.baseURL || '';
  });
  ipcMain.handle(CODEX_CHANNELS.SET_BASE_URL, (_, url) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.baseURL = url; c.set('runtime', r); } catch (_) {}
    return true;
  });

  // ---- Model ----
  ipcMain.handle(CODEX_CHANNELS.GET_MODEL, () => {
    const rt = readRuntimeConfig();
    return rt.model || '';
  });
  ipcMain.handle(CODEX_CHANNELS.SET_MODEL, (_, model) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.model = model; c.set('runtime', r); } catch (_) {}
    return true;
  });

  // ---- Reasoning Effort ----
  ipcMain.handle(CODEX_CHANNELS.GET_REASONING_EFFORT, () => {
    const rt = readRuntimeConfig();
    return rt.reasoningEffort || '';
  });
  ipcMain.handle(CODEX_CHANNELS.SET_REASONING_EFFORT, (_, effort) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' });
      const r = c.get('runtime') || {};
      r.reasoningEffort = normalizeCodexReasoningEffort(effort);
      c.set('runtime', r);
    } catch (_) {}
    return true;
  });

  // ---- API Format ----
  ipcMain.handle(CODEX_CHANNELS.GET_API_FORMAT, () => {
    const rt = readRuntimeConfig();
    return rt.apiFormat || 'responses';
  });
  ipcMain.handle(CODEX_CHANNELS.SET_API_FORMAT, (_, format) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' });
      const r = c.get('runtime') || {};
      r.apiFormat = format === 'chat' ? 'chat' : 'responses';
      c.set('runtime', r);
    } catch (_) {}
    return true;
  });

  // ---- Legacy Config Import ----
  ipcMain.handle(CODEX_CHANNELS.IMPORT_LEGACY_CONFIG, (_, customPath) => {
    const imported = { key: false, url: false, model: false, reasoningEffort: false };
    try {
      const legacyDir = customPath || findLegacyUserData();
      if (!legacyDir) return { notFound: true };

      const codexPath = path.join(legacyDir, 'mindcraft-codex.json');
      if (!fs.existsSync(codexPath)) {
        return { success: true, imported };
      }

      let legacy = {};
      try { legacy = JSON.parse(fs.readFileSync(codexPath, 'utf8')); } catch {
        return { success: true, imported };
      }

      const rt = legacy.runtime || {};
      const mergeRuntime = (key, val, flag) => {
        if (!val) return;
        try {
          const c = new Conf({ name: 'mindcraft-codex' });
          const r = c.get('runtime') || {};
          r[key] = val;
          c.set('runtime', r);
          imported[flag] = true;
        } catch (_) {}
      };
      mergeRuntime('apiKey', rt.apiKey, 'key');
      mergeRuntime('baseURL', rt.baseURL, 'url');
      mergeRuntime('model', rt.model, 'model');
      mergeRuntime('reasoningEffort', rt.reasoningEffort, 'reasoningEffort');

      return { success: true, imported };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  // ---- Sandbox Mode (T198: routed through settingsFacade) ----
  ipcMain.handle(CODEX_CHANNELS.GET_SANDBOX_MODE, () => {
    const val = getCodexDefault('sandboxMode');
    if (val && CODEX_SANDBOX_MODES.includes(val)) return val;
    return readSandboxMode();
  });
  ipcMain.handle(CODEX_CHANNELS.SET_SANDBOX_MODE, (_, mode) => {
    if (mode && CODEX_SANDBOX_MODES.includes(mode)) {
      setCodexDefault('sandboxMode', mode);
    }
    return true;
  });

  // ---- Project Settings ----
  ipcMain.handle(CODEX_CHANNELS.GET_PROJECT_SETTINGS, (_, { cwd }) => {
    try {
      const conf = new Conf({ name: 'mindcraft-codex' });
      const all = conf.get('projectSettings') || {};
      return all[cwd] || null;
    } catch (_) { return null; }
  });
  ipcMain.handle(CODEX_CHANNELS.SET_PROJECT_SETTINGS, (_, { cwd, settings }) => {
    try {
      const conf = new Conf({ name: 'mindcraft-codex' });
      const all = conf.get('projectSettings') || {};
      if (settings) {
        all[cwd] = { ...(all[cwd] || {}), ...settings };
      } else {
        delete all[cwd];
      }
      conf.set('projectSettings', all);
      return true;
    } catch (_) { return false; }
  });

  // ---- Default Network / Web Search (T198: routed through settingsFacade) ----
  ipcMain.handle(CODEX_CHANNELS.GET_DEFAULT_NETWORK_ACCESS, () => {
    const val = getCodexDefault('defaultNetworkAccess');
    return val !== undefined ? val : true;
  });
  ipcMain.handle(CODEX_CHANNELS.SET_DEFAULT_NETWORK_ACCESS, (_, val) => {
    setCodexDefault('defaultNetworkAccess', !!val);
    return true;
  });
  ipcMain.handle(CODEX_CHANNELS.GET_DEFAULT_WEB_SEARCH, () => {
    const val = getCodexDefault('defaultWebSearch');
    return val || 'cached';
  });
  ipcMain.handle(CODEX_CHANNELS.SET_DEFAULT_WEB_SEARCH, (_, val) => {
    setCodexDefault('defaultWebSearch', val || 'cached');
    return true;
  });

  // ---- Raw config.toml file operations (Batch 5c) ----

  ipcMain.handle(CODEX_CHANNELS.READ_CONFIG_TOML, () => {
    try {
      if (fs.existsSync(configTomlFile)) return fs.readFileSync(configTomlFile, 'utf8');
      return '';
    } catch (_) { return ''; }
  });

  ipcMain.handle(CODEX_CHANNELS.WRITE_CONFIG_TOML, (_, content) => {
    try {
      if (!fs.existsSync(codexConfigDir)) fs.mkdirSync(codexConfigDir, { recursive: true });
      // 保留现有文件中的 plugin/marketplace 段，防止模型配置保存时覆盖插件信息
      let finalContent = content || '';
      if (fs.existsSync(configTomlFile)) {
        const existing = fs.readFileSync(configTomlFile, 'utf8');
        finalContent = appendPreservedCodexConfigSections(finalContent, existing);
      }
      fs.writeFileSync(configTomlFile, finalContent, 'utf8');
      return { ok: true };
    } catch (e) { return { ok: false, message: e.message }; }
  });

  ipcMain.handle(CODEX_CHANNELS.REPAIR_CONFIG_TOML, (_, content) => {
    try {
      if (!fs.existsSync(codexConfigDir)) fs.mkdirSync(codexConfigDir, { recursive: true });
      const previous = fs.existsSync(configTomlFile) ? fs.readFileSync(configTomlFile, 'utf8') : '';
      let finalContent = content || '';
      if (fs.existsSync(configTomlFile)) {
        const existing = fs.readFileSync(configTomlFile, 'utf8');
        finalContent = appendPreservedCodexConfigSections(finalContent, existing);
      }
      if (previous === finalContent) return { ok: true, changed: false, backupPath: '' };
      let backupPath = '';
      if (previous) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
        backupPath = path.join(codexConfigDir, `config.toml.mindcraft-bak-${stamp}`);
        fs.copyFileSync(configTomlFile, backupPath);
      }
      fs.writeFileSync(configTomlFile, finalContent, 'utf8');
      return { ok: true, changed: true, backupPath };
    } catch (e) { return { ok: false, message: e.message }; }
  });

  // ---- Import Preview (local-cli only) ----
  ipcMain.handle(CODEX_CHANNELS.CONFIG_IMPORT_PREVIEW, async (_, payload) => {
    const { source } = payload || {};
    if (source === 'cc-switch') {
      return { ok: false, providers: [], warnings: ['CC Switch import has moved to System Settings > Import Config.'] };
    }
    if (source !== 'local-cli') {
      return { ok: false, providers: [], warnings: [`Unsupported source: ${source}`] };
    }
    try {
      const tomlRaw = readCodexConfigTomlRaw ? readCodexConfigTomlRaw() : '';
      let tomlConfig = {};
      if (tomlRaw) {
        try { tomlConfig = parseSimpleTomlContent(tomlRaw); } catch (_) { /* keep empty */ }
      }
      const preview = previewLocalCliConfig({ agentType: 'codex', cliConfig: tomlConfig });
      if (!preview.ok) return preview;
      const existing = readProviders ? ((await readProviders())?.providers || []) : [];
      preview.providers = annotateConflicts(preview.providers, existing);
      return preview;
    } catch (e) {
      return { ok: false, providers: [], warnings: [e.message] };
    }
  });

  // ---- Import Commit (local-cli only) ----
  ipcMain.handle(CODEX_CHANNELS.CONFIG_IMPORT_COMMIT, async (_, payload) => {
    const { source, providers: decisions } = payload || {};
    if (source === 'cc-switch') {
      return { ok: false, providers: [], warnings: ['CC Switch import has moved to System Settings > Import Config.'] };
    }
    if (source !== 'local-cli') {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: [`Unsupported source: ${source}`] };
    }
    try {
      // Re-parse for preview
      const tomlRaw = readCodexConfigTomlRaw ? readCodexConfigTomlRaw() : '';
      let tomlConfig = {};
      if (tomlRaw) {
        try { tomlConfig = parseSimpleTomlContent(tomlRaw); } catch (_) {}
      }
      const preview = previewLocalCliConfig({ agentType: 'codex', cliConfig: tomlConfig });
      if (!preview.ok) return { ...preview, imported: 0, skipped: 0, backupPath: '' };

      const codexStored = readProviders ? (await readProviders()) : null;
      const existing = codexStored?.providers || [];
      const activeIdx = codexStored?.activeIdx ?? -1;

      const db = await getDb({ userDataDir });

      const result = commitImport(db, {
        providers: decisions || [],
        previewProviders: preview.providers,
        existingProviders: existing.map((p, i) => ({
          id: p.id,  // real UUID from repository
          name: p.name,
          config: {
            key: p.key || '',
            url: p.url || '',
            model: p.model || '',
            reasoningEffort: p.reasoningEffort || '',
            apiFormat: p.apiFormat || '',
            authJson: p.authJson || {},
            alternativeModels: Array.isArray(p.alternativeModels) ? p.alternativeModels : [],
            tomlText: p.tomlText || '',
          },
          isActive: i === activeIdx,
        })),
        agentType: 'codex',
        source: 'local-cli',
        sourcePath: null,
        userDataDir,
      });

      if (result.ok && writeProviders) {
        const existingById = new Map(existing.map((p) => [p.id, p]));
        const existingByName = new Map(existing.map((p) => [String(p.name || '').toLowerCase(), p]));
        const newProviderList = result.providers.map((p) => ({
          id: p.id,  // preserve stable UUID from commitImport
          name: p.name,
          key: p.key || p.config?.key || '',
          url: p.url || p.config?.url || '',
          model: p.model || p.config?.model || '',
          reasoningEffort: p.reasoningEffort || p.config?.reasoningEffort || '',
          apiFormat: p.apiFormat || p.config?.apiFormat || 'responses',
          authJson: p.config?.authJson || p.authJson || {},
          alternativeModels: Array.isArray(p.config?.alternativeModels)
            ? p.config.alternativeModels
            : (Array.isArray(p.alternativeModels) ? p.alternativeModels : []),
          tomlText: p.config?.tomlText
            || p.tomlText
            || existingById.get(p.id)?.tomlText
            || existingByName.get(String(p.name || '').toLowerCase())?.tomlText
            || '',
        }));

        await writeProviders({
          providers: newProviderList,
          activeIdx: Math.max(-1, activeIdx),
        });
      }

      await persistDb();

      return {
        ok: result.ok,
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        backupPath: result.backupPath || '',
        warnings: result.warnings || [],
      };
    } catch (e) {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: [e.message] };
    }
  });
}

module.exports = { registerConfigIpc };
