'use strict';

/**
 * CodeX config/settings IPC handlers — key, model, base URL, reasoning effort,
 * API format, sandbox mode, project settings, default network/web-search.
 *
 * Extracted from codexAgent.js (R09 main handler setup split).
 * TOML file read/write/repair added in Batch 5c.
 */

const { Conf } = require('electron-conf');
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { appendPreservedCodexConfigSections } = require('./configTomlPreserve');
const { previewCcSwitchFile, previewLocalCliConfig, annotateConflicts, commitImport } = require('../db/import/index');
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
  ipcMain.handle('codex-get-key', () => {
    const rt = readRuntimeConfig();
    return rt.apiKey || '';
  });
  ipcMain.handle('codex-set-key', (_, key) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.apiKey = key; c.set('runtime', r); } catch (_) {}
    return true;
  });

  // ---- Base URL ----
  ipcMain.handle('codex-get-base-url', () => {
    const rt = readRuntimeConfig();
    return rt.baseURL || '';
  });
  ipcMain.handle('codex-set-base-url', (_, url) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.baseURL = url; c.set('runtime', r); } catch (_) {}
    return true;
  });

  // ---- Model ----
  ipcMain.handle('codex-get-model', () => {
    const rt = readRuntimeConfig();
    return rt.model || '';
  });
  ipcMain.handle('codex-set-model', (_, model) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.model = model; c.set('runtime', r); } catch (_) {}
    return true;
  });

  // ---- Reasoning Effort ----
  ipcMain.handle('codex-get-reasoning-effort', () => {
    const rt = readRuntimeConfig();
    return rt.reasoningEffort || '';
  });
  ipcMain.handle('codex-set-reasoning-effort', (_, effort) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' });
      const r = c.get('runtime') || {};
      r.reasoningEffort = normalizeCodexReasoningEffort(effort);
      c.set('runtime', r);
    } catch (_) {}
    return true;
  });

  // ---- API Format ----
  ipcMain.handle('codex-get-api-format', () => {
    const rt = readRuntimeConfig();
    return rt.apiFormat || 'responses';
  });
  ipcMain.handle('codex-set-api-format', (_, format) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' });
      const r = c.get('runtime') || {};
      r.apiFormat = format === 'chat' ? 'chat' : 'responses';
      c.set('runtime', r);
    } catch (_) {}
    return true;
  });

  // ---- Legacy Config Import ----
  ipcMain.handle('codex-import-legacy-config', (_, customPath) => {
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

  // ---- Sandbox Mode ----
  ipcMain.handle('codex-get-sandbox-mode', () => readSandboxMode());
  ipcMain.handle('codex-set-sandbox-mode', (_, mode) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' });
      if (mode && CODEX_SANDBOX_MODES.includes(mode)) {
        c.set('sandboxMode', mode);
      }
    } catch (_) {}
    return true;
  });

  // ---- Project Settings ----
  ipcMain.handle('codex-get-project-settings', (_, { cwd }) => {
    try {
      const conf = new Conf({ name: 'mindcraft-codex' });
      const all = conf.get('projectSettings') || {};
      return all[cwd] || null;
    } catch (_) { return null; }
  });
  ipcMain.handle('codex-set-project-settings', (_, { cwd, settings }) => {
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

  // ---- Default Network / Web Search ----
  ipcMain.handle('codex-get-default-network-access', () => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); return c.get('defaultNetworkAccess', true); } catch (_) { return true; }
  });
  ipcMain.handle('codex-set-default-network-access', (_, val) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); c.set('defaultNetworkAccess', !!val); } catch (_) {}
    return true;
  });
  ipcMain.handle('codex-get-default-web-search', () => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); return c.get('defaultWebSearch', 'cached'); } catch (_) { return 'cached'; }
  });
  ipcMain.handle('codex-set-default-web-search', (_, val) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); c.set('defaultWebSearch', val || 'cached'); } catch (_) {}
    return true;
  });

  // ---- Raw config.toml file operations (Batch 5c) ----

  ipcMain.handle('codex-read-config-toml', () => {
    try {
      if (fs.existsSync(configTomlFile)) return fs.readFileSync(configTomlFile, 'utf8');
      return '';
    } catch (_) { return ''; }
  });

  ipcMain.handle('codex-write-config-toml', (_, content) => {
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

  ipcMain.handle('codex-repair-config-toml', (_, content) => {
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

  // ---- Import: file picker ----
  ipcMain.handle('codex-config-import-pick-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Import CC Switch Config',
        filters: [
          { name: 'SQL Files', extensions: ['sql'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      return { ok: true, filePath: result.filePaths[0] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ---- Import: preview ----
  ipcMain.handle('codex-config-import-preview', async (_, payload) => {
    const { source, filePath } = payload || {};

    try {
      if (source === 'cc-switch' && filePath) {
        const preview = previewCcSwitchFile(filePath);
        if (!preview.ok) return preview;

        // Check against existing providers
        const existing = readProviders ? (readProviders()?.providers || []) : [];
        preview.providers = annotateConflicts(preview.providers, existing);

        return preview;
      }

      if (source === 'local-cli') {
        const tomlRaw = readCodexConfigTomlRaw ? readCodexConfigTomlRaw() : '';
        const tomlConfig = tomlRaw ? parseSimpleTomlContent(tomlRaw) : {};
        const preview = previewLocalCliConfig({ agentType: 'codex', cliConfig: tomlConfig });
        if (!preview.ok) return preview;

        const existing = readProviders ? (readProviders()?.providers || []) : [];
        preview.providers = annotateConflicts(preview.providers, existing);

        return preview;
      }

      return { ok: false, providers: [], warnings: [`Unknown source: ${source}`] };
    } catch (e) {
      return { ok: false, providers: [], warnings: [e.message] };
    }
  });

  // ---- Import: commit ----
  ipcMain.handle('codex-config-import-commit', async (_, payload) => {
    const { source, providers: decisions, filePath, agentType } = payload || {};

    try {
      // Get preview data (re-parse for commit)
      let previewProviders = [];

      if (source === 'cc-switch' && filePath) {
        const preview = previewCcSwitchFile(filePath);
        if (!preview.ok) return preview;
        previewProviders = preview.providers;
      } else if (source === 'local-cli') {
        const tomlRaw = readCodexConfigTomlRaw ? readCodexConfigTomlRaw() : '';
        const tomlConfig = tomlRaw ? parseSimpleTomlContent(tomlRaw) : {};
        const preview = previewLocalCliConfig({ agentType: 'codex', cliConfig: tomlConfig });
        if (!preview.ok) return preview;
        previewProviders = preview.providers;
      }

      // Get existing providers for legacy write-back
      const existing = readProviders ? (readProviders()?.providers || []) : [];

      // Open DB
      const db = await getDb({ userDataDir });

      const result = commitImport(db, {
        providers: decisions,
        previewProviders,
        existingProviders: existing,
        agentType: agentType || 'codex',
        source,
        sourcePath: filePath || null,
        userDataDir,
      });

      if (!result.ok) return result;

      // Persist to disk (sql.js is in-memory, must write explicitly)
      await persistDb();

      // Project to legacy providers.json
      if (writeProviders) {
        const existingStored = readProviders ? readProviders() : null;
        const newProviderList = result.providers.map((p) => ({
          name: p.name,
          key: p.key || p.config?.key || '',
          url: p.url || p.config?.url || '',
          model: p.model || p.config?.model || '',
          reasoningEffort: p.reasoningEffort || p.config?.reasoningEffort || '',
          apiFormat: p.apiFormat || p.config?.apiFormat || '',
          tomlText: existingStored?.providers?.find((ep) => ep.name === p.name)?.tomlText || '',
        }));
        writeProviders({
          providers: newProviderList,
          activeIdx: existingStored?.activeIdx ?? 0,
        });
      }

      return {
        ok: true,
        imported: result.imported,
        skipped: result.skipped,
        backupPath: result.backupPath,
        warnings: result.warnings,
      };
    } catch (e) {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: [e.message] };
    }
  });
}

module.exports = { registerConfigIpc };
