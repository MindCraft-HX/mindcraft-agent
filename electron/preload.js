// preload.js
const { ipcRenderer, contextBridge, clipboard } = require("electron");
const path = require("path");
const os = require("os");
const { createAgentBridge } = require("../packages/agent/preload");

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
  readFileByPath: (option) => ipcRenderer.invoke("read-file-by-path",option),
  openFileDialog: (option) => ipcRenderer.invoke("open-file-dialog", option), //上传文件 拿到路径的
  readFileSync: (filePath) => ipcRenderer.invoke("read-file-sync", filePath),
  writeFileSync: (path, buffer) =>
    ipcRenderer.invoke("write-file-sync", path, buffer),
  unlinkFileSync: (path) => ipcRenderer.invoke("unlink-file-sync", path),
  rmdirSync: (path) => ipcRenderer.invoke("rmdir-sync", path),
  existsSync: (path) => ipcRenderer.invoke("exists-file-sync", path),
  mkdirSync: (path) => ipcRenderer.invoke("mkdir-sync", path),
  copyFileSync: (srcPath, targetPath) =>
    ipcRenderer.invoke("copy-file-sync", srcPath, targetPath),
  renameSync: (oldPath, newPath) =>
    ipcRenderer.invoke("rename-file-sync", oldPath, newPath),
  readdirSync: (dir) => ipcRenderer.invoke("read-dir-Sync", dir),
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
  execCmd: (cmd, dir) => ipcRenderer.invoke("exec-cmd", cmd, dir),
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
  openNewWindow: (url) => ipcRenderer.send("open-new-window", url),

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
  openSingleWindow:(info) => ipcRenderer.send("open-single-window", info),
  openSystemSettings: () => ipcRenderer.send("open-system-settings"),

  // 浮动窗口
  openFloat: () => ipcRenderer.send('open-float'),
  floatOperation: (info) => ipcRenderer.send('float-operation', info),
  getFloatInfo: (info) => ipcRenderer.invoke('get-float-info', info),
  setFloatInfo: (info) => ipcRenderer.invoke('set-float-info', info),
  getSideFloatInfo: (info) => ipcRenderer.invoke('get-side-float-info', info),
  setSideFloatInfo: (info) => ipcRenderer.invoke('set-side-float-info', info),
  sidefloatOperation: (info) => ipcRenderer.send('side-float-operation', info),
  beforeFloatWinClose: (callback) => {
    ipcRenderer.on('before-float-win-close', async () => {
      const allowClose = await callback();
      ipcRenderer.invoke('confirm-close-window', allowClose);
    });
  },

  // 设置
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  setLoginItemSettings: (settings) => ipcRenderer.invoke('set-login-item-settings', settings),
  openTabByName: (callback) => {
    ipcRenderer.on("open-tab-by-name", (event, progress) => {
      callback(progress);
    });
  },
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  clientUpdateInfoData: (callback) => {
    ipcRenderer.on("client-update-info-data", (event, progress) => {
      callback(progress);
    });
  },
  getClientUpdateInfoData: () => ipcRenderer.send('get-update-info-data'),

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
});
