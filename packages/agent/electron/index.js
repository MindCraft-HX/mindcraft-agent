const { setupClaudeHandlers } = require('./claudeAgent')
const { setupCodexSdkHandlers, resetCodexSdkRuntime } = require('./codexAgent')
const { registerLocalSearchIpc } = require('./localSearch')

function registerAgentIPCs(ipcMain) {
  setupClaudeHandlers()
  setupCodexSdkHandlers()
  registerLocalSearchIpc(ipcMain)
}

module.exports = {
  registerAgentIPCs,
  resetCodexSdkRuntime,
}
