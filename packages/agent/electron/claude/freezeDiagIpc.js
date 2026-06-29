'use strict';

/**
 * Claude freeze diagnostic enable/disable IPC handlers.
 *
 * Extracted from claudeAgent.js (R09 main handler setup split).
 */

function registerFreezeDiagIpc(ipcMain, {
  getClaudeFreezeDiagEnabled,
  getClaudeFreezeDiagLogPath,
  setClaudeFreezeDiagEnabled,
}) {
  ipcMain.handle('claude-freeze-diag-get-enabled', () => {
    return { enabled: getClaudeFreezeDiagEnabled(), path: getClaudeFreezeDiagLogPath() };
  });

  ipcMain.handle('claude-freeze-diag-set-enabled', (_, { enabled }) => {
    const result = setClaudeFreezeDiagEnabled(enabled);
    return { ...result, logPath: getClaudeFreezeDiagLogPath() };
  });
}

module.exports = { registerFreezeDiagIpc };
