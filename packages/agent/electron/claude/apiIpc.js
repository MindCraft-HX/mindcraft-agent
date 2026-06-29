'use strict';

/**
 * Claude API key validation IPC handler.
 *
 * Extracted from claudeAgent.js (R09 main handler setup split).
 */

function registerApiIpc(ipcMain, { lt }) {
  ipcMain.handle('claude-validate-key', async (_, { key, baseURL, model }) => {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const opts = { apiKey: key };
      if (baseURL) opts.baseURL = baseURL;
      const client = new Anthropic.default(opts);
      await client.messages.create({
        model: model || '',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return { valid: true };
    } catch (e) {
      const status = e.status || e.statusCode;
      const msg = (e?.message || '').toLowerCase();
      if (status === 401) return { valid: false, error: lt('api.invalidKey') };
      if (status === 429 || msg.includes('quota') || msg.includes('rate')) {
        return { valid: false, error: lt('api.quotaExceeded') };
      }
      if (status === 404 || status === 400 || msg.includes('model') || msg.includes('not found')) {
        return { valid: false, error: lt('api.unsupportedModel') };
      }
      if (status >= 500) return { valid: false, error: lt('api.serverUnavailable') };
      return { valid: false, error: e?.message || lt('api.verifyFailed') };
    }
  });
}

module.exports = { registerApiIpc };
