// preload.js
const { ipcRenderer, contextBridge, clipboard } = require("electron");
const path = require("path");
const os = require("os");
const { createAgentBridge } = require("../packages/agent/preload");
const { CORE_CHANNELS } = require("../packages/agent/shared/ipcChannels");

window.addEventListener("DOMContentLoaded", () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ["chrome", "node", "electron"]) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});

// 渲染进程查看窗口大小变化
window.addEventListener("resize", () => {
  const { innerWidth, innerHeight } = window;
});

// 暴露
contextBridge.exposeInMainWorld("electronAPI", {
  selectAndReadFile: (option) => ipcRenderer.invoke(CORE_CHANNELS.SELECT_AND_READ_FILE,option),
  readFileByPath: (option) => ipcRenderer.invoke(CORE_CHANNELS.READ_FILE_BY_PATH,option),
  openFileDialog: (option) => ipcRenderer.invoke(CORE_CHANNELS.OPEN_FILE_DIALOG, option), //上传文件 拿到路径的
  readFileSync: (filePath) => ipcRenderer.invoke(CORE_CHANNELS.READ_FILE_SYNC, filePath),
  writeFileSync: (path, buffer) =>
    ipcRenderer.invoke(CORE_CHANNELS.WRITE_FILE_SYNC, path, buffer),
  unlinkFileSync: (path) => ipcRenderer.invoke(CORE_CHANNELS.UNLINK_FILE_SYNC, path),
  rmdirSync: (path) => ipcRenderer.invoke(CORE_CHANNELS.RMDIR_SYNC, path),
  existsSync: (path) => ipcRenderer.invoke(CORE_CHANNELS.EXISTS_FILE_SYNC, path),
  mkdirSync: (path) => ipcRenderer.invoke(CORE_CHANNELS.MKDIR_SYNC, path),
  copyFileSync: (srcPath, targetPath) =>
    ipcRenderer.invoke(CORE_CHANNELS.COPY_FILE_SYNC, srcPath, targetPath),
  renameSync: (oldPath, newPath) =>
    ipcRenderer.invoke(CORE_CHANNELS.RENAME_FILE_SYNC, oldPath, newPath),
  readdirSync: (dir) => ipcRenderer.invoke(CORE_CHANNELS.READ_DIR_SYNC, dir),
  createBuffer: (data) => Buffer.from(data),
  Buffer: (data, format, toFormat) =>
    Buffer.from(data, format).toString(toFormat),
  pathJoin: (aPath, bPath) => path.join(aPath, bPath),
  pathResolve: (aPath, bPath) => path.resolve(aPath, bPath),
  pathExtname: (file) => path.extname(file),
  pathDirname: (file) => path.dirname(file),
  pathBasename: (file) => path.basename(file),
  unCompressZipFile: (file, unCompressedPath, zipFileNameEncoding) =>
    ipcRenderer.invoke(
      CORE_CHANNELS.UNCOMPRESS_ZIP_FILE,
      file,
      unCompressedPath,
      zipFileNameEncoding
    ),
  getSystmpPath: () => os.tmpdir(),
  execCmd: (cmd, dir) => ipcRenderer.invoke(CORE_CHANNELS.EXEC_CMD, cmd, dir),
  send: (channel, data) => {
    let validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // 文件/文件夹操作
  openEmail: (emailAddress) => ipcRenderer.send(CORE_CHANNELS.OPEN_EMAIL, emailAddress),
  openFolder: async (folderPath) =>
    ipcRenderer.invoke(CORE_CHANNELS.OPEN_FOLDER, folderPath),
  openFileWithDefault: (filePath) => ipcRenderer.invoke(CORE_CHANNELS.OPEN_FILE_WITH_DEFAULT, filePath),

  // 文档浏览
  openMdWin: (payload) => ipcRenderer.invoke(CORE_CHANNELS.OPEN_MD_WIN, payload),
  resolveDocumentCandidate: (payload) => ipcRenderer.invoke(CORE_CHANNELS.RESOLVE_DOCUMENT_CANDIDATE, payload),
  openDocumentCandidate: (payload) => ipcRenderer.invoke(CORE_CHANNELS.OPEN_DOCUMENT_CANDIDATE, payload),
  onMdContent: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on(CORE_CHANNELS.MD_CONTENT, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.MD_CONTENT, handler)
  },
  getPendingMdContent: () => ipcRenderer.invoke(CORE_CHANNELS.MD_VIEWER_READY),
  onOpenMdViewer: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(CORE_CHANNELS.OPEN_MD_VIEWER, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.OPEN_MD_VIEWER, handler)
  },

  // Agent 窗口
  openClaudeWin: () => ipcRenderer.invoke(CORE_CHANNELS.OPEN_CLAUDE_WIN),
  openCodexWin: () => ipcRenderer.invoke(CORE_CHANNELS.OPEN_CODEX_WIN),

  // Agent bridge (来自 packages/agent/preload)
  ...createAgentBridge(ipcRenderer),

  // 通用窗口
  openExternalWindow:(url) => ipcRenderer.send(CORE_CHANNELS.OPEN_EXTERNAL_WINDOW, url),
  openSystemSettings: () => ipcRenderer.send(CORE_CHANNELS.OPEN_SYSTEM_SETTINGS),


  // 设置（原生 JSON 存储，替代 electron-conf）
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // 旧接口兼容
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  setLoginItemSettings: (settings) => ipcRenderer.invoke('set-login-item-settings', settings),
  openTabByName: (callback) => {
    ipcRenderer.on(CORE_CHANNELS.OPEN_TAB_BY_NAME, (event, progress) => {
      callback(progress);
    });
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  clientUpdateInfoData: (callback) => {
    ipcRenderer.on(CORE_CHANNELS.CLIENT_UPDATE_INFO_DATA, (event, progress) => {
      callback(progress);
    });
  },
  getClientUpdateInfoData: () => ipcRenderer.send(CORE_CHANNELS.GET_UPDATE_INFO_DATA),
  onAppUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on(CORE_CHANNELS.APP_UPDATE_STATUS, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.APP_UPDATE_STATUS, handler)
  },
  getAppUpdateStatus: () => ipcRenderer.invoke(CORE_CHANNELS.GET_APP_UPDATE_STATUS),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  getAppVersion: () => ipcRenderer.invoke(CORE_CHANNELS.GET_APP_VERSION),
  getDiagnosticsEnabled: () => ipcRenderer.invoke(CORE_CHANNELS.GET_DIAGNOSTICS_ENABLED),
  setDiagnosticsEnabled: (enabled) => ipcRenderer.invoke(CORE_CHANNELS.SET_DIAGNOSTICS_ENABLED, { enabled }),

  // Clipboard
  clipboard: () => clipboard,

  // 页面搜索
  sendSearchPage: (info) => ipcRenderer.send(CORE_CHANNELS.SEARCH_PAGE, info),
  closeSearchPage: (info) => ipcRenderer.send(CORE_CHANNELS.CLOSE_SEARCH_PAGE, info),
  foundInPage: (callback) => {
    ipcRenderer.on(CORE_CHANNELS.FOUND_IN_PAGE, (event, progress) => {
      callback(progress);
    });
  },

  // 任务栏
  flashTaskbar: () => ipcRenderer.invoke(CORE_CHANNELS.FLASH_TASKBAR),
  appendTaskLog: (line) => ipcRenderer.invoke(CORE_CHANNELS.APPEND_TASK_LOG, line),

  // 窗口控制（无边框模式）
  minimize: () => ipcRenderer.send(CORE_CHANNELS.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.send(CORE_CHANNELS.WINDOW_MAXIMIZE),
  close: () => ipcRenderer.send(CORE_CHANNELS.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(CORE_CHANNELS.WINDOW_IS_MAXIMIZED),

  // 窗口拖拽状态（性能优化：拖拽期间通知渲染端降低负载）
  onWindowPerformanceState: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on(CORE_CHANNELS.WINDOW_PERFORMANCE_STATE, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.WINDOW_PERFORMANCE_STATE, handler)
  },
  onWindowDragState: (callback) => {
    const handler = (_event, payload) => callback(Boolean(payload?.active && payload?.reason === 'drag'))
    ipcRenderer.on(CORE_CHANNELS.WINDOW_PERFORMANCE_STATE, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.WINDOW_PERFORMANCE_STATE, handler)
  },

  // ── 插件市场（MindCraft 原生插件，非 Claude/Codex SDK 插件）──
  pluginGetInstalled: () => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_GET_INSTALLED),
  pluginMarketListing: () => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_MARKETPLACE_LISTING),
  pluginMarketInstall: (pluginMeta) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_MARKETPLACE_INSTALL, pluginMeta),
  pluginMarketUninstall: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_MARKETPLACE_UNINSTALL, pluginId),
  pluginMarketEnable: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_MARKETPLACE_ENABLE, pluginId),
  pluginMarketDisable: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_MARKETPLACE_DISABLE, pluginId),
  pluginGetData: (pluginId, key) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_GET_DATA, pluginId, key),
  pluginSetData: (pluginId, key, value) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_SET_DATA, pluginId, key, value),
  pluginDeleteData: (pluginId, key) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_DELETE_DATA, pluginId, key),
  pluginReadAsset: (pluginId, relativePath) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_READ_ASSET, pluginId, relativePath),
  pluginReadEntry: (pluginId) => ipcRenderer.invoke(CORE_CHANNELS.PLUGIN_READ_ENTRY, pluginId),
  onPluginRegistryChanged: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on(CORE_CHANNELS.PLUGIN_REGISTRY_CHANGED, handler)
    return () => ipcRenderer.removeListener(CORE_CHANNELS.PLUGIN_REGISTRY_CHANGED, handler)
  },

});
