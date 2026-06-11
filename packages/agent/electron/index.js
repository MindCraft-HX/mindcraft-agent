const { setupClaudeHandlers } = require('./claudeAgent')
const { setupCodexSdkHandlers, resetCodexSdkRuntime } = require('./codexAgent')
const { registerLocalSearchIpc } = require('./localSearch')
const { setupHomeMetricsHandlers } = require('./homeMetrics')

function registerAgentIPCs(ipcMain) {
  setupClaudeHandlers()
  setupCodexSdkHandlers()
  registerLocalSearchIpc(ipcMain)
  setupHomeMetricsHandlers(ipcMain)
}

module.exports = {
  registerAgentIPCs,
  resetCodexSdkRuntime,
}
