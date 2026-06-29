'use strict';

/**
 * CodeX API validation / model listing / last CWD IPC handlers.
 *
 * Extracted from codexAgent.js (R09 main handler setup split).
 */

function registerApiIpc(ipcMain, {
  readRuntimeConfig,
  readPanelState,
  lt,
}) {
  ipcMain.handle('codex-get-last-cwd', () => readPanelState()?.lastCwd || '');

  ipcMain.handle('codex-validate-key', async (_, { key, baseURL, model: _model }) => {
    const start = Date.now();
    try {
      const fetchUrl = `${baseURL.replace(/\/$/, '')}/models`;
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      const elapsed = Date.now() - start;
      if (res.ok) {
        return { valid: true, elapsed };
      }
      const body = await res.text().catch(() => '');
      return { valid: false, elapsed, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    } catch (e) {
      return { valid: false, elapsed: Date.now() - start, error: e.message };
    }
  });

  ipcMain.handle('codex-list-available-models', async () => {
    try {
      const rt = readRuntimeConfig();
      if (!rt.apiKey || !rt.baseURL) return { models: [], error: lt('noApiKey') };
      const fetchUrl = `${rt.baseURL.replace(/\/$/, '')}/models`;
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rt.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { models: [], error: `HTTP ${res.status}` };
      const body = await res.json();
      const models = (body.data || []).map(m => ({ id: m.id, owned_by: m.owned_by || '' }));
      return { models, error: null };
    } catch (e) {
      return { models: [], error: e.message };
    }
  });
}

module.exports = { registerApiIpc };
