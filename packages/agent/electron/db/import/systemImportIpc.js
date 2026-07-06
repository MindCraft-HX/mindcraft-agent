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

const fs = require('fs');
const { dialog } = require('electron');
const { CORE_CHANNELS } = require('../../../shared/ipcChannels');
const { previewCcSwitchFile, previewLocalCliConfig, annotateConflicts, commitImport } = require('./index');
const { getDb, persistDb } = require('../index');
const { getProviders } = require('../providerStorage');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read CodeX providers from repository (SQLite-authoritative, T174).
 * Falls back to legacy deps.readCodexProviders if DB unavailable.
 */
async function readCodexFromRepo(deps) {
  try {
    if (deps.getDb) {
      const db = await deps.getDb({ userDataDir: deps.userDataDir });
      return getProviders(db, 'codex', deps.readCodexProviders);
    }
  } catch (_) { /* fall through to legacy */ }
  return deps.readCodexProviders ? deps.readCodexProviders() : null;
}

/**
 * Read Claude providers from repository (SQLite-authoritative, T174).
 * Falls back to legacy deps.claudeGetConfig if DB unavailable.
 */
async function readClaudeFromRepo(deps) {
  try {
    if (deps.getDb) {
      const db = await deps.getDb({ userDataDir: deps.userDataDir });
      return getProviders(db, 'claude', () => {
        return deps.claudeGetConfig
          ? deps.claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 })
          : null;
      });
    }
  } catch (_) { /* fall through to legacy */ }
  return deps.claudeGetConfig
    ? deps.claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 })
    : null;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register system-level import IPC handlers.
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} deps
 * @param {function(): object|null} deps.readCodexProviders — returns { providers: [...], activeIdx } (read-only legacy fallback; writes go through SQLite)
 * @param {function(string, any): any} deps.claudeGetConfig — confGet from electron-conf (claude internalConf)
 * @param {function(string, any): void} deps.claudeSetConfig — confSet from electron-conf
 * @param {string} deps.userDataDir
 * @param {function(): string} [deps.readCodexConfigTomlRaw] — for local-cli CodeX import
 * @param {function(): object} [deps.readClaudeRuntimeConfig] — for local-cli Claude import
 */
function registerSystemImportIpc(ipcMain, deps) {
  const {
    claudeSetConfig,
    userDataDir,
    readCodexConfigTomlRaw,
    readClaudeRuntimeConfig,
  } = deps;

  // ---- File picker ----
  ipcMain.handle(CORE_CHANNELS.CONFIG_IMPORT_PICK_FILE, async () => {
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
  ipcMain.handle(CORE_CHANNELS.CONFIG_IMPORT_PREVIEW, async (_, payload) => {
    const { source, filePath } = payload || {};

    try {
      if (source === 'cc-switch' && filePath) {
        const preview = previewCcSwitchFile(filePath);
        if (!preview.ok) return preview;

        // Annotate conflicts against BOTH storages
        const codexPayload = await readCodexFromRepo(deps);
        const codexStored = codexPayload?.providers || [];
        const claudePayload = await readClaudeFromRepo(deps);
        const claudeStored = claudePayload?.providers || [];

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

          const codexPayload = await readCodexFromRepo(deps);
          const existing = codexPayload?.providers || [];
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

          const stored = await readClaudeFromRepo(deps) || { providers: [], activeIdx: -1 };
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
  ipcMain.handle(CORE_CHANNELS.CONFIG_IMPORT_COMMIT, async (_, payload) => {
    const {
      source,
      providers: decisions,
      filePath,
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
      const db = await getDb({ userDataDir });
      const codexPayload = await readCodexFromRepo(deps);
      const codexExisting = codexPayload?.providers || [];
      const codexActiveIdx = codexPayload?.activeIdx ?? -1;

      let codexResult = { ok: true, imported: 0, skipped: 0, providers: [], warnings: [], backupPath: '' };
      if (codexDecisions.length > 0) {
        // Always clear CC Switch active flag — MindCraft manages its own active state
        const codexPreviewForCommit = previewProviders
          .filter((p) => p.agentType === 'codex')
          .map((p) => ({ ...p, isActive: false }));

        codexResult = commitImport(db, {
          providers: codexDecisions,
          previewProviders: codexPreviewForCommit,
          existingProviders: codexExisting.map((p, i) => ({
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
            isActive: i === codexActiveIdx,
          })),
          agentType: 'codex',
          source,
          sourcePath: filePath || null,
          userDataDir,
        });
      }

      // ---- Commit Claude providers ----
      let claudeResult = { ok: true, imported: 0, skipped: 0, providers: [], warnings: [], backupPath: '' };
      if (claudeDecisions.length > 0) {
        const claudePayload = await readClaudeFromRepo(deps);
        const claudeExisting = claudePayload?.providers || [];
        const claudeOrigActiveIdx = claudePayload?.activeIdx ?? -1;

        // Always clear CC Switch active flag — MindCraft manages its own active state
        const claudePreviewForCommit = previewProviders
          .filter((p) => p.agentType === 'claude')
          .map((p) => ({ ...p, isActive: false }));

        claudeResult = commitImport(db, {
          providers: claudeDecisions,
          previewProviders: claudePreviewForCommit,
          existingProviders: claudeExisting.map((p, i) => ({
            id: p.id,  // real UUID from repository
            name: p.name,
            config: { key: p.key || '', url: p.url || '', model: '', reasoningEffort: '', apiFormat: '' },
            isActive: i === claudeOrigActiveIdx,
          })),
          agentType: 'claude',
          source,
          sourcePath: filePath || null,
          userDataDir,
        });

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
