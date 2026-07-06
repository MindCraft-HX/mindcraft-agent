const { ipcMain } = require('electron')
const { Conf } = require('electron-conf')
const { setupClaudeHandlers } = require('./claudeAgent')
const { setupCodexSdkHandlers, resetCodexSdkRuntime } = require('./codexAgent')
const { getDiagnosticsEnabled, setDiagnosticsEnabled } = require('./diagnosticsFileUtils')
const { registerLocalSearchIpc } = require('./localSearch')
const { setupHomeMetricsHandlers } = require('./homeMetrics')
const { registerSessionInstructionIpc } = require('./sessionInstructionIpc')
const { setLocale } = require('./localeHelper')
const { registerSystemImportIpc } = require('./db/import/systemImportIpc')
const { CORE_CHANNELS } = require('../shared/ipcChannels');
const { registerSystemExportIpc } = require('./db/export/systemExportIpc')
const { registerCodehubSessionIndexIpc } = require('./codehubSessionIndex')
const { getDb } = require('./db')

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
  registerCodehubSessionIndexIpc(targetIpcMain)

  // System-level import IPC (T163): CC Switch SQL may contain both CodeX and Claude providers
  {
    const { getClaudeProviderStorage } = require('./claudeAgent')
    const { getCodexProviderStorage } = require('./codexAgent')
    const claudeStorage = getClaudeProviderStorage()
    const codexStorage = getCodexProviderStorage()
    if (claudeStorage && codexStorage) {
      const deps = {
        readCodexProviders: codexStorage.readProviders,
        claudeGetConfig: claudeStorage.confGet,
        claudeSetConfig: claudeStorage.confSet,
        userDataDir: claudeStorage.getMindCraftUserDataDir(),
        readCodexConfigTomlRaw: codexStorage.readCodexConfigTomlRaw,
        readClaudeRuntimeConfig: claudeStorage.readRuntimeConfigFromUserSettingsFile,
        getDb,  // T174: DB singleton for repository-backed reads
      }
      registerSystemImportIpc(targetIpcMain, deps)
      registerSystemExportIpc(targetIpcMain, deps)
    }
  }

  // Locale persistence
  targetIpcMain.handle(CORE_CHANNELS.LOAD_LOCALE, () => {
    const loc = getLocaleConf().get('locale')
    if (loc === 'zh' || loc === 'en') setLocale(loc)
    return loc || null
  })
  targetIpcMain.on(CORE_CHANNELS.SAVE_LOCALE, (_e, loc) => {
    if (loc === 'zh' || loc === 'en') {
      getLocaleConf().set('locale', loc)
      setLocale(loc)
    }
  })

  targetIpcMain.handle(CORE_CHANNELS.GET_DIAGNOSTICS_ENABLED, () => ({ enabled: getDiagnosticsEnabled() }))
  targetIpcMain.handle(CORE_CHANNELS.SET_DIAGNOSTICS_ENABLED, (_e, { enabled }) => setDiagnosticsEnabled(enabled))
}

module.exports = {
  registerAgentIPCs,
  resetCodexSdkRuntime,
}
