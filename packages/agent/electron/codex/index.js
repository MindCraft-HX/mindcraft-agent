'use strict';

/**
 * CodeX leaf IPC aggregation boundary.
 *
 * R09 extracted four leaf IPC modules from codexAgent.js.  This index
 * re-exports them through a single `registerCodexLeafIpcs(ipcMain, deps)`
 * entry point so the caller doesn't grow a new import for every future
 * module.
 *
 * Responsibilities (no behaviour change from R09):
 *   - config/settings (key, model, base URL, sandbox, project settings, …)
 *   - environment check / install / directory picker
 *   - API validation / model listing / last-cwd
 *   - git diff command
 */

const { registerConfigIpc } = require('./configIpc');
const { registerEnvironmentIpc } = require('./environmentIpc');
const { registerApiIpc } = require('./apiIpc');
const { registerGitDiffIpc } = require('./gitDiffIpc');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {object} deps
 * @param {Function} deps.readRuntimeConfig
 * @param {Function} deps.readSandboxMode
 * @param {string[]} deps.CODEX_SANDBOX_MODES
 * @param {Function} deps.findLegacyUserData
 * @param {Function} deps.normalizeCodexReasoningEffort
 * @param {Function} deps.loadCodexSdk
 * @param {Function} deps.findGlobalCodexPath
 * @param {Function} deps.isInstallingCodex
 * @param {Function} deps.setInstallingCodex
 * @param {Function} deps.resetCodexSdkPromise
 * @param {Function} deps.readPanelState
 * @param {Function} deps.lt — locale translator
 * @param {string} deps.userDataDir — app.getPath('userData')
 * @param {Function} deps.readProviders — read providers.json
 * @param {Function} deps.writeProviders — write providers.json
 * @param {Function} deps.readCodexConfigTomlRaw — read raw config.toml content
 */
function registerCodexLeafIpcs(ipcMain, deps) {
  registerConfigIpc(ipcMain, {
    readRuntimeConfig: deps.readRuntimeConfig,
    readSandboxMode: deps.readSandboxMode,
    CODEX_SANDBOX_MODES: deps.CODEX_SANDBOX_MODES,
    findLegacyUserData: deps.findLegacyUserData,
    normalizeCodexReasoningEffort: deps.normalizeCodexReasoningEffort,
    codexConfigDir: deps.codexConfigDir,
    configTomlFile: deps.configTomlFile,
    userDataDir: deps.userDataDir,
    readProviders: deps.readProviders,
    writeProviders: deps.writeProviders,
    readCodexConfigTomlRaw: deps.readCodexConfigTomlRaw,
  });

  registerEnvironmentIpc(ipcMain, {
    loadCodexSdk: deps.loadCodexSdk,
    findGlobalCodexPath: deps.findGlobalCodexPath,
    isInstallingCodex: deps.isInstallingCodex,
    setInstallingCodex: deps.setInstallingCodex,
    resetCodexSdkPromise: deps.resetCodexSdkPromise,
    lt: deps.lt,
  });

  registerApiIpc(ipcMain, {
    readRuntimeConfig: deps.readRuntimeConfig,
    readPanelState: deps.readPanelState,
    lt: deps.lt,
  });

  registerGitDiffIpc(ipcMain);
}

module.exports = { registerCodexLeafIpcs };
