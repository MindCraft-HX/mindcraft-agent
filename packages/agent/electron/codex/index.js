'use strict';

/**
 * CodeX 叶子 IPC 聚合边界。
 *
 * R09 从 codexAgent.js 拆出了四个叶子 IPC 模块，这个文件统一通过
 * `registerCodexLeafIpcs(ipcMain, deps)` 暴露，避免调用方后续继续增加 import。
 *
 * 职责范围（保持 R09 行为不变）：
 *   - 配置 / 设置（key、model、base URL、sandbox、project settings 等）
 *   - 环境检测 / 安装 / 目录选择
 *   - API 校验 / 模型列表 / last-cwd
 *   - git diff 命令
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
 * @param {Function} [deps.getConfiguredExecutablePath]
 * @param {Function} [deps.isExecutableHealthy]
 * @param {Function} [deps.clearGlobalCodexPathCache]
 * @param {Function} deps.isInstallingCodex
 * @param {Function} deps.setInstallingCodex
 * @param {Function} deps.resetCodexSdkPromise
 * @param {Function} deps.readPanelState
 * @param {Function} deps.lt — 本地化翻译函数
 * @param {string} deps.userDataDir — app.getPath('userData')
 * @param {Function} deps.readProviders — 读取 providers.json
 * @param {Function} deps.writeProviders — 写入 providers.json
 * @param {Function} deps.readCodexConfigTomlRaw — 读取原始 config.toml 内容
 * @param {Function} [deps.onCodexExecutablePathChanged]
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
    onExecutablePathChanged: deps.onCodexExecutablePathChanged,
  });

  registerEnvironmentIpc(ipcMain, {
    loadCodexSdk: deps.loadCodexSdk,
    findGlobalCodexPath: deps.findGlobalCodexPath,
    getConfiguredExecutablePath: deps.getConfiguredExecutablePath,
    isExecutableHealthy: deps.isExecutableHealthy,
    clearGlobalCodexPathCache: deps.clearGlobalCodexPathCache,
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
