'use strict';

/**
 * System-level config import IPC handlers.
 *
 * Unlike the per-agent import handlers (codex-config-import-* / claude-config-import-*),
 * these operate at the system level and handle CC Switch .sql files which may contain
 * BOTH CodeX and Claude providers mixed together.
 *
 * Handlers:
 *  - config-import-pick-file     → file picker dialog for .sql files
 *  - config-import-preview       → parse .sql, group by agent type, detect conflicts
 *  - config-import-commit        → write to both CodeX and Claude storages
 */

const { dialog } = require('electron');
const { previewCcSwitchFile, previewLocalCliConfig, annotateConflicts, commitImport } = require('./index');
const { getDb, persistDb } = require('../index');

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register system-level import IPC handlers.
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} deps
 * @param {function(): object|null} deps.readCodexProviders — returns { providers: [...], activeIdx }
 * @param {function(object): void} deps.writeCodexProviders — writes { providers: [...], activeIdx }
 * @param {function(string, any): any} deps.claudeGetConfig — confGet from electron-conf (claude internalConf)
 * @param {function(string, any): void} deps.claudeSetConfig — confSet from electron-conf
 * @param {string} deps.userDataDir
 * @param {function(): string} [deps.readCodexConfigTomlRaw] — for local-cli CodeX import
 * @param {function(): object} [deps.readClaudeRuntimeConfig] — for local-cli Claude import
 */
function registerSystemImportIpc(ipcMain, deps) {
  const {
    readCodexProviders,
    writeCodexProviders,
    claudeGetConfig,
    claudeSetConfig,
    userDataDir,
    readCodexConfigTomlRaw,
    readClaudeRuntimeConfig,
  } = deps;

  // ---- File picker ----
  ipcMain.handle('config-import-pick-file', async () => {
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

  // ---- Preview ----
  ipcMain.handle('config-import-preview', async (_, payload) => {
    const { source, filePath } = payload || {};

    try {
      if (source === 'cc-switch' && filePath) {
        const preview = previewCcSwitchFile(filePath);
        if (!preview.ok) return preview;

        // Annotate conflicts against BOTH storages
        const codexStored = readCodexProviders ? (readCodexProviders()?.providers || []) : [];
        const claudeStored = claudeGetConfig
          ? (claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 }).providers || [])
          : [];

        // Annotate per agent type
        const annotated = preview.providers.map((p) => {
          const existing = p.agentType === 'codex' ? codexStored : claudeStored;
          const existingNames = new Set(
            existing.map((ep) => (ep.name || '').toLowerCase()).filter(Boolean),
          );
          const nameKey = (p.name || '').toLowerCase();
          return { ...p, conflict: existingNames.has(nameKey) ? 'name' : null };
        });

        return {
          ok: true,
          source: 'cc-switch',
          summary: {
            codex: annotated.filter((p) => p.agentType === 'codex').length,
            claude: annotated.filter((p) => p.agentType === 'claude').length,
            skipped: preview.warnings ? preview.warnings.filter((w) => w.includes('unsupported app_type')).length : 0,
          },
          providers: annotated,
          skippedRows: (preview.warnings || [])
            .filter((w) => w.includes('unsupported app_type'))
            .map((w) => ({ reason: w, appType: '', name: '' })),
          warnings: (preview.warnings || []).filter((w) => !w.includes('unsupported app_type')),
        };
      }

      if (source === 'local-cli') {
        // Local CLI import — per agent type
        const { agentType } = payload || {};
        if (!agentType) {
          return { ok: false, providers: [], warnings: ['agentType required for local-cli import'] };
        }

        if (agentType === 'codex') {
          const tomlRaw = readCodexConfigTomlRaw ? readCodexConfigTomlRaw() : '';
          let tomlConfig = {};
          if (tomlRaw) {
            try {
              const { parseSimpleTomlContent } = require('../../codex/configManager');
              tomlConfig = parseSimpleTomlContent(tomlRaw);
            } catch (_) { /* keep empty */ }
          }
          const preview = previewLocalCliConfig({ agentType: 'codex', cliConfig: tomlConfig });
          if (!preview.ok) return preview;

          const existing = readCodexProviders ? (readCodexProviders()?.providers || []) : [];
          preview.providers = annotateConflicts(preview.providers, existing);
          return preview;
        }

        if (agentType === 'claude') {
          const fromFile = readClaudeRuntimeConfig ? readClaudeRuntimeConfig() : {};
          const cliConfig = {
            ANTHROPIC_AUTH_TOKEN: fromFile.apiKey || '',
            ANTHROPIC_BASE_URL: fromFile.baseURL || '',
          };
          const preview = previewLocalCliConfig({ agentType: 'claude', cliConfig });
          if (!preview.ok) return preview;

          const stored = claudeGetConfig
            ? claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 })
            : { providers: [], activeIdx: -1 };
          preview.providers = annotateConflicts(preview.providers, stored.providers || []);
          return preview;
        }

        return { ok: false, providers: [], warnings: [`Unknown agentType for local-cli: ${agentType}`] };
      }

      return { ok: false, providers: [], warnings: [`Unknown source: ${source}`] };
    } catch (e) {
      return { ok: false, providers: [], warnings: [e.message] };
    }
  });

  // ---- Commit (global CC Switch) ----
  ipcMain.handle('config-import-commit', async (_, payload) => {
    const {
      source,
      providers: decisions,
      filePath,
      applyActiveFromCcSwitch = false,
    } = payload || {};

    try {
      // ---- Re-parse preview ----
      let previewProviders = [];

      if (source === 'cc-switch' && filePath) {
        const preview = previewCcSwitchFile(filePath);
        if (!preview.ok) return preview;
        previewProviders = preview.providers;
      } else {
        return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: ['Unsupported source for system import'] };
      }

      // ---- Split decisions by agent type ----
      const previewMap = new Map();
      for (const pp of previewProviders) {
        previewMap.set(pp.tempId, pp);
      }

      const codexDecisions = [];
      const claudeDecisions = [];
      let skipped = 0;

      for (const d of (decisions || [])) {
        if (d.action === 'skip') {
          skipped += 1;
          continue;
        }
        const preview = previewMap.get(d.tempId);
        if (!preview) {
          skipped += 1;
          continue;
        }
        if (preview.agentType === 'codex') {
          codexDecisions.push(d);
        } else if (preview.agentType === 'claude') {
          claudeDecisions.push(d);
        } else {
          skipped += 1;
        }
      }

      // ---- Commit CodeX providers ----
      const codexExisting = readCodexProviders ? (readCodexProviders()?.providers || []) : [];
      const codexStored = readCodexProviders ? readCodexProviders() : null;
      const codexActiveIdx = codexStored?.activeIdx ?? -1;

      const db = await getDb({ userDataDir });

      let codexResult = { ok: true, imported: 0, skipped: 0, providers: [], warnings: [], backupPath: '' };
      if (codexDecisions.length > 0) {
        // Enrich codex decisions with existing IDs for overwrite matching
        const codexNameMap = new Map();
        for (const ep of codexExisting) {
          const key = (ep.name || '').toLowerCase();
          if (key && !codexNameMap.has(key)) {
            codexNameMap.set(key, ep);
          }
        }
        for (const d of codexDecisions) {
          const preview = previewMap.get(d.tempId);
          if (d.action === 'overwrite' && !d.targetProviderId) {
            const nameKey = (preview.name || '').toLowerCase();
            if (nameKey && codexNameMap.has(nameKey)) {
              // Assign a synthetic ID for the existing provider
              d._codexIdx = codexExisting.indexOf(codexNameMap.get(nameKey));
            }
          }
        }

        codexResult = commitImport(db, {
          providers: codexDecisions,
          previewProviders: previewProviders.filter((p) => p.agentType === 'codex'),
          existingProviders: codexExisting.map((p, i) => ({
            id: `codex-${i}`,
            name: p.name,
            config: { key: p.key || '', url: p.url || '', model: p.model || '', reasoningEffort: p.reasoningEffort || '', apiFormat: p.apiFormat || '' },
            isActive: i === codexActiveIdx,
          })),
          agentType: 'codex',
          source,
          sourcePath: filePath || null,
          userDataDir,
        });

        if (codexResult.ok && writeCodexProviders) {
          const newProviderList = codexResult.providers.map((p) => ({
            name: p.name,
            key: p.key || p.config?.key || '',
            url: p.url || p.config?.url || '',
            model: p.model || p.config?.model || '',
            reasoningEffort: p.reasoningEffort || p.config?.reasoningEffort || '',
            apiFormat: p.apiFormat || p.config?.apiFormat || '',
            tomlText: codexStored?.providers?.find((ep) => ep.name === p.name)?.tomlText || '',
          }));

          // Handle active: keep existing activeIdx unless applyActiveFromCcSwitch is on
          let newActiveIdx = codexActiveIdx;
          if (applyActiveFromCcSwitch) {
            const activeName = previewProviders
              .filter((p) => p.agentType === 'codex' && p.isActive)
              .map((p) => p.name)
              .pop();
            if (activeName) {
              const foundIdx = newProviderList.findIndex(
                (p) => (p.name || '').toLowerCase() === activeName.toLowerCase(),
              );
              if (foundIdx >= 0) newActiveIdx = foundIdx;
            }
          }

          writeCodexProviders({
            providers: newProviderList,
            activeIdx: Math.max(-1, newActiveIdx),
          });
        }
      }

      // ---- Commit Claude providers ----
      let claudeResult = { ok: true, imported: 0, skipped: 0, providers: [], warnings: [], backupPath: '' };
      if (claudeDecisions.length > 0) {
        const claudeStored = claudeGetConfig
          ? claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 })
          : { providers: [], activeIdx: -1 };
        const claudeExisting = claudeStored.providers || [];
        const claudeOrigActiveIdx = claudeStored.activeIdx ?? -1;

        claudeResult = commitImport(db, {
          providers: claudeDecisions,
          previewProviders: previewProviders.filter((p) => p.agentType === 'claude'),
          existingProviders: claudeExisting.map((p, i) => ({
            id: `claude-${i}`,
            name: p.name,
            config: { key: p.key || '', url: p.url || '', model: '', reasoningEffort: '', apiFormat: '' },
            isActive: i === claudeOrigActiveIdx,
          })),
          agentType: 'claude',
          source,
          sourcePath: filePath || null,
          userDataDir,
        });

        if (claudeResult.ok && claudeSetConfig) {
          const newProviderList = claudeResult.providers.map((p) => ({
            name: p.name,
            key: p.key || p.config?.key || '',
            url: p.url || p.config?.url || '',
            tierModels: (claudeExisting.find((ep) => ep.name === p.name)?.tierModels) || {},
          }));

          let newActiveIdx = claudeOrigActiveIdx;
          if (applyActiveFromCcSwitch) {
            const activeName = previewProviders
              .filter((p) => p.agentType === 'claude' && p.isActive)
              .map((p) => p.name)
              .pop();
            if (activeName) {
              const foundIdx = newProviderList.findIndex(
                (p) => (p.name || '').toLowerCase() === activeName.toLowerCase(),
              );
              if (foundIdx >= 0) newActiveIdx = foundIdx;
            }
          }

          claudeSetConfig('claudeProviders', {
            providers: newProviderList,
            activeIdx: Math.max(-1, newActiveIdx),
          });
        }
      }

      // ---- Persist DB ----
      await persistDb();

      return {
        ok: codexResult.ok && claudeResult.ok,
        imported: (codexResult.imported || 0) + (claudeResult.imported || 0),
        skipped: skipped + (codexResult.skipped || 0) + (claudeResult.skipped || 0),
        backupPath: codexResult.backupPath || claudeResult.backupPath || '',
        details: {
          codex: { imported: codexResult.imported || 0, skipped: codexResult.skipped || 0 },
          claude: { imported: claudeResult.imported || 0, skipped: claudeResult.skipped || 0 },
        },
        warnings: [
          ...(codexResult.warnings || []),
          ...(claudeResult.warnings || []),
        ],
      };
    } catch (e) {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: [e.message] };
    }
  });
}

module.exports = { registerSystemImportIpc };
