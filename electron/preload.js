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
  selectAndReadFile: (option) => ipcRenderer.invoke("select-and-read-file",option),
  readFileByPath: (option) => ipcRenderer.invoke(CORE_CHANNELS.READ_FILE_BY_PATH,option),
  openFileDialog: (option) => ipcRenderer.invoke("open-file-dialog", option), //上传文件 拿到路径的
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
      "unCompress-zip-file",
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
  openEmail: (emailAddress) => ipcRenderer.send("openEmail", emailAddress),
  openFolder: async (folderPath) =>
    ipcRenderer.invoke("open-folder", folderPath),
  openFileWithDefault: (filePath) => ipcRenderer.invoke("open-file-with-default", filePath),

  // 文档浏览
  openMdWin: (payload) => ipcRenderer.invoke("open-md-win", payload),
  resolveDocumentCandidate: (payload) => ipcRenderer.invoke('resolve-document-candidate', payload),
  openDocumentCandidate: (payload) => ipcRenderer.invoke('open-document-candidate', payload),
  onMdContent: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('md-content', handler)
    return () => ipcRenderer.removeListener('md-content', handler)
  },
  getPendingMdContent: () => ipcRenderer.invoke('md-viewer-ready'),
  onOpenMdViewer: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('open-md-viewer', handler)
    return () => ipcRenderer.removeListener('open-md-viewer', handler)
  },

  // Agent 窗口
  openClaudeWin: () => ipcRenderer.invoke('open-claude-win'),
  openCodexWin: () => ipcRenderer.invoke('open-codex-win'),

  // Agent bridge (来自 packages/agent/preload)
  ...createAgentBridge(ipcRenderer),

  // 通用窗口
  openExternalWindow:(url) => ipcRenderer.send("open-external-window", url),
  openSystemSettings: () => ipcRenderer.send("open-system-settings"),


  // 设置（原生 JSON 存储，替代 electron-conf）
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // 旧接口兼容
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  setLoginItemSettings: (settings) => ipcRenderer.invoke('set-login-item-settings', settings),
  openTabByName: (callback) => {
    ipcRenderer.on("open-tab-by-name", (event, progress) => {
      callback(progress);
    });
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  clientUpdateInfoData: (callback) => {
    ipcRenderer.on("client-update-info-data", (event, progress) => {
      callback(progress);
    });
  },
  getClientUpdateInfoData: () => ipcRenderer.send('get-update-info-data'),
  onAppUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('app-update-status', handler)
    return () => ipcRenderer.removeListener('app-update-status', handler)
  },
  getAppUpdateStatus: () => ipcRenderer.invoke('get-app-update-status'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDiagnosticsEnabled: () => ipcRenderer.invoke('get-diagnostics-enabled'),
  setDiagnosticsEnabled: (enabled) => ipcRenderer.invoke('set-diagnostics-enabled', { enabled }),

  // Clipboard
  clipboard: () => clipboard,

  // 页面搜索
  sendSearchPage: (info) => ipcRenderer.send('search-page', info),
  closeSearchPage: (info) => ipcRenderer.send('close-search-page', info),
  foundInPage: (callback) => {
    ipcRenderer.on("found-in-page", (event, progress) => {
      callback(progress);
    });
  },

  // 任务栏
  flashTaskbar: () => ipcRenderer.invoke('flash-taskbar'),
  appendTaskLog: (line) => ipcRenderer.invoke('append-task-log', line),

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
  pluginGetInstalled: () => ipcRenderer.invoke('plugin-get-installed'),
  pluginMarketListing: () => ipcRenderer.invoke('plugin-marketplace-listing'),
  pluginMarketInstall: (pluginMeta) => ipcRenderer.invoke('plugin-marketplace-install', pluginMeta),
  pluginMarketUninstall: (pluginId) => ipcRenderer.invoke('plugin-marketplace-uninstall', pluginId),
  pluginMarketEnable: (pluginId) => ipcRenderer.invoke('plugin-marketplace-enable', pluginId),
  pluginMarketDisable: (pluginId) => ipcRenderer.invoke('plugin-marketplace-disable', pluginId),
  pluginGetData: (pluginId, key) => ipcRenderer.invoke('plugin-get-data', pluginId, key),
  pluginSetData: (pluginId, key, value) => ipcRenderer.invoke('plugin-set-data', pluginId, key, value),
  pluginDeleteData: (pluginId, key) => ipcRenderer.invoke('plugin-delete-data', pluginId, key),
  pluginReadAsset: (pluginId, relativePath) => ipcRenderer.invoke('plugin-read-asset', pluginId, relativePath),
  pluginReadEntry: (pluginId) => ipcRenderer.invoke('plugin-read-entry', pluginId),
  onPluginRegistryChanged: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('plugin-registry-changed', handler)
    return () => ipcRenderer.removeListener('plugin-registry-changed', handler)
  },

});
