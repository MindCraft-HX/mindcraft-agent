'use strict';

/**
 * System-level config export IPC handlers.
 *
 * These operate at the system level — reading both CodeX and Claude provider
 * state via the same deps as systemImportIpc, then delegating to pure SQL
 * generation in db/export/ccSwitch.js.
 *
 * Handlers:
 *  - config-export-preview  → read providers, return counts + risk info
 *  - config-export-save     → open save dialog, generate SQL, write file
 */

const fs = require('fs');
const { dialog } = require('electron');
const { buildProviderSqlExport } = require('./ccSwitch');

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register system-level export IPC handlers.
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} deps — same shape as registerSystemImportIpc
 * @param {function(): object|null} deps.readCodexProviders
 * @param {function(string, any): any} deps.claudeGetConfig
 */
function registerSystemExportIpc(ipcMain, deps) {
  const { readCodexProviders, claudeGetConfig } = deps;

  // ---- Preview ----
  ipcMain.handle('config-export-preview', async () => {
    try {
      const codexStored = readCodexProviders ? (readCodexProviders()?.providers || []) : [];
      const claudeStored = claudeGetConfig
        ? (claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 }).providers || [])
        : [];

      const codexActiveIdx = readCodexProviders ? (readCodexProviders()?.activeIdx ?? -1) : -1;
      const claudeActiveIdx = claudeGetConfig
        ? (claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 }).activeIdx ?? -1)
        : -1;

      // Check for providers missing critical fields
      const incompleteClaude = claudeStored.filter((p) => !p.key && (!p.config || !p.config.env));
      const incompleteCodex = codexStored.filter((p) => !p.key);

      return {
        ok: true,
        codexCount: codexStored.length,
        claudeCount: claudeStored.length,
        codexActiveIdx,
        claudeActiveIdx,
        hasSecrets: claudeStored.some((p) => p.key) || codexStored.some((p) => p.key),
        incompleteCount: incompleteClaude.length + incompleteCodex.length,
        incompleteNames: [
          ...incompleteClaude.map((p) => p.name || '(unnamed)'),
          ...incompleteCodex.map((p) => p.name || '(unnamed)'),
        ],
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ---- Save ----
  ipcMain.handle('config-export-save', async (_, payload) => {
    const { includeSecrets = true, includeActive = false } = payload || {};

    try {
      // Read providers via deps (same adapters used by import)
      const codexStored = readCodexProviders ? (readCodexProviders()?.providers || []) : [];
      const claudeStored = claudeGetConfig
        ? (claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 }).providers || [])
        : [];
      const codexActiveIdx = readCodexProviders ? (readCodexProviders()?.activeIdx ?? -1) : -1;
      const claudeActiveIdx = claudeGetConfig
        ? (claudeGetConfig('claudeProviders', { providers: [], activeIdx: -1 }).activeIdx ?? -1)
        : -1;

      if (claudeStored.length === 0 && codexStored.length === 0) {
        return { ok: false, error: 'No providers to export' };
      }

      // Generate default filename
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
      const defaultName = `mindcraft-providers-${dateStr}-${timeStr}.sql`;

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Export Provider Config',
        defaultPath: defaultName,
        filters: [
          { name: 'SQL Files', extensions: ['sql'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }

      // Generate SQL
      const sql = buildProviderSqlExport({
        claudeProviders: claudeStored,
        claudeActiveIdx,
        codexProviders: codexStored,
        codexActiveIdx,
        includeSecrets,
        includeActive,
      });

      // Write file
      fs.writeFileSync(result.filePath, sql, 'utf8');

      // Build summary (without sensitive data)
      const exported = claudeStored.length + codexStored.length;
      const warnings = [];
      if (!includeSecrets) {
        warnings.push('Keys were redacted (hidden-key export)');
      }

      return {
        ok: true,
        filePath: result.filePath,
        exported,
        codexCount: codexStored.length,
        claudeCount: claudeStored.length,
        includeSecrets,
        warnings,
      };
    } catch (e) {
      // Do NOT include SQL text or key-related info in error
      return { ok: false, error: 'Export failed: ' + (e.message || 'unknown error') };
    }
  });
}

module.exports = { registerSystemExportIpc };
