const { ipcMain } = require('electron')
const { Conf } = require('electron-conf')
const { setupClaudeHandlers } = require('./claudeAgent')
const { setupCodexSdkHandlers, resetCodexSdkRuntime } = require('./codexAgent')
const { registerLocalSearchIpc } = require('./localSearch')
const { setupHomeMetricsHandlers } = require('./homeMetrics')
const { setLocale } = require('./localeHelper')

const localeConf = new Conf({ configName: 'app-config' })

function registerAgentIPCs(ipcMain) {
  setupClaudeHandlers()
  setupCodexSdkHandlers()
  registerLocalSearchIpc(ipcMain)
  setupHomeMetricsHandlers(ipcMain)

  // Locale persistence
  ipcMain.handle('load-locale', () => {
    const loc = localeConf.get('locale')
    if (loc === 'zh' || loc === 'en') setLocale(loc)
    return loc || null
  })
  ipcMain.on('save-locale', (_e, loc) => {
    if (loc === 'zh' || loc === 'en') {
      localeConf.set('locale', loc)
      setLocale(loc)
    }
  })
}

module.exports = {
  registerAgentIPCs,
  resetCodexSdkRuntime,
}
