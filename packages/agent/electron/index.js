const { ipcMain } = require('electron')
const { Conf } = require('electron-conf')
const { setupClaudeHandlers } = require('./claudeAgent')
const { setupCodexSdkHandlers, resetCodexSdkRuntime } = require('./codexAgent')
const { getDiagnosticsEnabled, setDiagnosticsEnabled } = require('./diagnosticsFileUtils')
const { registerLocalSearchIpc } = require('./localSearch')
const { setupHomeMetricsHandlers } = require('./homeMetrics')
const { registerSessionInstructionIpc } = require('./sessionInstructionIpc')
const { setLocale } = require('./localeHelper')

let localeConf = null

function getLocaleConf() {
  if (!localeConf) localeConf = new Conf({ configName: 'app-config' })
  return localeConf
}

function registerAgentIPCs(targetIpcMain = ipcMain) {
  setupClaudeHandlers()
  setupCodexSdkHandlers()
  registerLocalSearchIpc(targetIpcMain)
  setupHomeMetricsHandlers(targetIpcMain)
  registerSessionInstructionIpc(targetIpcMain)

  // Locale persistence
  targetIpcMain.handle('load-locale', () => {
    const loc = getLocaleConf().get('locale')
    if (loc === 'zh' || loc === 'en') setLocale(loc)
    return loc || null
  })
  targetIpcMain.on('save-locale', (_e, loc) => {
    if (loc === 'zh' || loc === 'en') {
      getLocaleConf().set('locale', loc)
      setLocale(loc)
    }
  })

  targetIpcMain.handle('get-diagnostics-enabled', () => ({ enabled: getDiagnosticsEnabled() }))
  targetIpcMain.handle('set-diagnostics-enabled', (_e, { enabled }) => setDiagnosticsEnabled(enabled))
}

module.exports = {
  registerAgentIPCs,
  resetCodexSdkRuntime,
}
