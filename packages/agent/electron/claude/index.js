'use strict';

/**
 * ClaudeCode leaf IPC aggregation boundary.
 *
 * R09 extracted five leaf IPC modules from claudeAgent.js.  This index
 * re-exports them through a single `registerClaudeLeafIpcs(ipcMain, deps)`
 * entry point so the caller doesn't grow a new import for every future
 * module.
 *
 * Responsibilities (no behaviour change from R09):
 *   - API key validation
 *   - freeze diagnostics enable/disable
 *   - web search (DuckDuckGo)
 *   - UI utilities (directory picker, clipboard, file listing)
 *   - chat session persistence (CRUD + title generation)
 */

const {
  registerApiIpc: _registerApiIpc,
} = require('./apiIpc');
const { registerFreezeDiagIpc } = require('./freezeDiagIpc');
const { registerWebSearchIpc } = require('./webSearchIpc');
const { registerUiUtilsIpc } = require('./uiUtilsIpc');
const { registerChatPersistenceIpc } = require('./chatPersistenceIpc');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {object} deps
 * @param {Function} deps.lt — locale translator
 * @param {Function} deps.getClaudeFreezeDiagEnabled
 * @param {Function} deps.getClaudeFreezeDiagLogPath
 * @param {Function} deps.setClaudeFreezeDiagEnabled
 * @param {string} deps.CHAT_SESSIONS_DIR
 * @param {Function} deps.ensureChatSessionsDir
 * @param {Function} deps.readChatIndex
 * @param {Function} deps.writeChatIndexAsync
 */
function registerClaudeLeafIpcs(ipcMain, deps) {
  _registerApiIpc(ipcMain, { lt: deps.lt });

  registerFreezeDiagIpc(ipcMain, {
    getClaudeFreezeDiagEnabled: deps.getClaudeFreezeDiagEnabled,
    getClaudeFreezeDiagLogPath: deps.getClaudeFreezeDiagLogPath,
    setClaudeFreezeDiagEnabled: deps.setClaudeFreezeDiagEnabled,
  });

  registerWebSearchIpc(ipcMain, { lt: deps.lt });

  registerUiUtilsIpc(ipcMain);

  registerChatPersistenceIpc(ipcMain, {
    CHAT_SESSIONS_DIR: deps.CHAT_SESSIONS_DIR,
    ensureChatSessionsDir: deps.ensureChatSessionsDir,
    readChatIndex: deps.readChatIndex,
    writeChatIndexAsync: deps.writeChatIndexAsync,
    lt: deps.lt,
  });
}

module.exports = { registerClaudeLeafIpcs };
