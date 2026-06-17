const { ipcMain } = require('electron')
const { Conf } = require('electron-conf')
const { setupClaudeHandlers } = require('./claudeAgent')
const { setupCodexSdkHandlers, resetCodexSdkRuntime } = require('./codexAgent')
const { registerLocalSearchIpc } = require('./localSearch')
const { setupHomeMetricsHandlers } = require('./homeMetrics')
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
}

module.exports = {
  registerAgentIPCs,
  resetCodexSdkRuntime,
}
