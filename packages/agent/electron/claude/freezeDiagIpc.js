'use strict';

const { CLAUDE_CHANNELS } = require('../../shared/ipcChannels');

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
  ipcMain.handle(CLAUDE_CHANNELS.FREEZE_DIAG_GET_ENABLED, () => {
    return { enabled: getClaudeFreezeDiagEnabled(), path: getClaudeFreezeDiagLogPath() };
  });

  ipcMain.handle(CLAUDE_CHANNELS.FREEZE_DIAG_SET_ENABLED, (_, { enabled }) => {
    const result = setClaudeFreezeDiagEnabled(enabled);
    return { ...result, logPath: getClaudeFreezeDiagLogPath() };
  });
}

module.exports = { registerFreezeDiagIpc };
