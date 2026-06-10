// preload.js
const { ipcRenderer, contextBridge, clipboard } = require("electron");
const path = require("path");
const os = require("os");
const { createAgentBridge } = require("../packages/agent/preload");

// 搭建sqlite3数据库
// const dbService = require('./db/dbService');
// let dbPath = path.join(__dirname, './db/database.db');
// // 实例化
// const db = new dbService(dbPath);

// 请求麦克风权限
// navigator.mediaDevices
//   .getUserMedia({ audio: true })
//   .then(function (stream) {
//     // 用户同意授权，可以通过IPC通信将流传递给主进程
//     ipcRenderer.send("microphone-access-granted", stream);
//   })
//   .catch(function (err) {
//     // 用户拒绝授权或其他错误发生
//     console.log(err);
//     ipcRenderer.send("microphone-access-denied", err);
//   });

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
  // console.log(`窗口大小变化：宽度${innerWidth},高度${innerHeight}`);

  // 获取得到用户的视口
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
  execKeilCmd: (compilerPath, projectPath, dir) =>
    ipcRenderer.invoke("exec-keil-cmd", compilerPath, projectPath, dir),
  execGccCmd: (cmd, dir) => ipcRenderer.invoke("exec-gcc-cmd", cmd, dir),
  execIARCmd: (compilerPath, projectPath, configName, dir) => ipcRenderer.invoke("exec-iar-cmd", compilerPath, projectPath, configName, dir),
  getSystmpPath: () => os.tmpdir(),
  //BUG:execCmd
  execCmd: (cmd, dir) => ipcRenderer.invoke("exec-cmd", cmd, dir),
  send: (channel, data) => {
    let validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // receive: (channel, func) => {
  //   let validChannels = ["download-progress"];
  //   if (validChannels.includes(channel)) {
  //     ipcRenderer.on(channel, (event, ...args) => func(...args));
  //   }
  // },
  // 数据库
  // getUrls: (callback) => db.getUrls(callback),
  // addUrl: (url, callback) => db.addUrl(url, callback),

  openEmail: (emailAddress) => ipcRenderer.send("openEmail", emailAddress), // 打开邮箱
  openCanvasWindow: () => ipcRenderer.send("open-canvas-window"),
  openFolder: async (folderPath) =>
    ipcRenderer.invoke("open-folder", folderPath), //打开文件夹
  openFileWithDefault: (filePath) => ipcRenderer.invoke("open-file-with-default", filePath),
  onDownloadProgress: (callback) => {
    ipcRenderer.on("download-progress", (event, progress) => {
      callback(progress);
    });
  },
  openPaint: () => ipcRenderer.invoke("open-paint"), //打开绘画
  openNewWindow: (url) => ipcRenderer.send("open-new-window", url),
  openMdWin: (payload) => ipcRenderer.invoke("open-md-win", payload),
  resolveDocumentCandidate: (payload) => ipcRenderer.invoke('resolve-document-candidate', payload),
  openDocumentCandidate: (payload) => ipcRenderer.invoke('open-document-candidate', payload),
  onMdContent: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('md-content', handler)
    return () => ipcRenderer.removeListener('md-content', handler)
  },
  getPendingMdContent: () => ipcRenderer.invoke('md-viewer-ready'),
  openClaudeWin: () => ipcRenderer.invoke('open-claude-win'),
  openCodexWin: () => ipcRenderer.invoke('open-codex-win'),
  // pty 终端
  ptyCreate: (opts) => ipcRenderer.invoke('pty-create', opts),
  ptyWrite: (tabId, data) => ipcRenderer.invoke('pty-write', { tabId, data }),
  ptyResize: (tabId, cols, rows) => ipcRenderer.invoke('pty-resize', { tabId, cols, rows }),
  ptyDestroy: (tabId) => ipcRenderer.invoke('pty-destroy', tabId),
  ptySelectDir: () => ipcRenderer.invoke('pty-select-dir'),
  ptySaveImage: (dataUrl) => ipcRenderer.invoke('pty-save-image', { dataUrl }),
  onPtyData: (cb) => ipcRenderer.on('pty-data', (_, d) => cb(d)),
  onPtyExit: (cb) => ipcRenderer.on('pty-exit', (_, d) => cb(d)),
  offPtyListeners: () => {
    ipcRenderer.removeAllListeners('pty-data')
    ipcRenderer.removeAllListeners('pty-exit')
  },
  ...createAgentBridge(ipcRenderer),
  openExternalWindow:(url) => ipcRenderer.send("open-external-window", url),
  openSingleWindow:(info) => ipcRenderer.send("open-single-window", info),
  openSystemSettings: () => ipcRenderer.send("open-system-settings"),
  startExe: () => ipcRenderer.send("start-exe"),
  readXmlFile: () => ipcRenderer.invoke("read-xml-file"),
  updateXmlFile: (updatedData) =>
    ipcRenderer.invoke("update-xml-file", updatedData),
  checkFolder: () => ipcRenderer.send("check-folder"),
  onFolderStatus: (callback) => ipcRenderer.on("folder-status", callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  openCodeWin: (info) => ipcRenderer.invoke('open-code-win', info),
  openFloat: () => ipcRenderer.send('open-float'),
  floatOperation: (info) => ipcRenderer.send('float-operation', info),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  getFloatInfo: (info) => ipcRenderer.invoke('get-float-info', info),
  setFloatInfo: (info) => ipcRenderer.invoke('set-float-info', info),
  getSideFloatInfo: (info) => ipcRenderer.invoke('get-side-float-info', info),
  setSideFloatInfo: (info) => ipcRenderer.invoke('set-side-float-info', info),
  clipboard: () => clipboard,
  clipboardData: (callback) => {
    ipcRenderer.on("clipboard-data", (event, progress) => {
      console.log("clipboard-data", progress);
      callback(progress);
    });
  },
  openQAModel: (callback) => {
    ipcRenderer.on("open-QA-model", (event, progress) => {
      callback(progress);
    });
  },
  openScreenShotsModel: (callback) => {
    ipcRenderer.on("open-screen-shots-model", (event, progress) => {
      callback(progress);
    });
  },
  refreshFloatInfo: (callback) => {
    ipcRenderer.on("refresh-float-info", (event, progress) => {
      callback(progress);
    });
  },
  getInitStream: (callback) => {
    ipcRenderer.on("get-init-stream", (event, progress) => {
      callback(progress);
    });
  },
  openClient: (info) => ipcRenderer.send('open-client', info),
  openRoomById: (callback) => {
    ipcRenderer.on("open-room-by-id", (event, progress) => {
      callback(progress);
    });
  },
  beforeFloatWinClose: (callback) => {
    ipcRenderer.on('before-float-win-close', async () => {
      const allowClose = await callback();
      ipcRenderer.invoke('confirm-close-window', allowClose);
    });
  },
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  setLoginItemSettings: (settings) => ipcRenderer.invoke('set-login-item-settings', settings),
  sidefloatOperation: (info) => ipcRenderer.send('side-float-operation', info),
  openTabByName: (callback) => {
    ipcRenderer.on("open-tab-by-name", (event, progress) => {
      callback(progress);
    });
  },
  addSourceByDownLoadLink: (info) => ipcRenderer.invoke('add-source-by-download-Link', info),
  addSourceByBase64: (info) => ipcRenderer.invoke('add-source-by-base64', info),
  addSourceByUpload: (info) => ipcRenderer.invoke('add-source-by-upload', info),
  deleteSourceByFilePath: (info) => ipcRenderer.invoke('delete-source-by-file-path', info),
  copySourceFromPathToPath: (info) => ipcRenderer.send('copy-source-from-path-to-path', info),
  getSourceByFilePath: (info) => ipcRenderer.invoke('get-source-by-file-path', info),
  getSourceListByFilePath: (info) => ipcRenderer.invoke('get-source-list-by-file-path', info),
  getEncodingList: (info) => ipcRenderer.invoke('get-encoding-list', info),
  openDrawWin: (info) => ipcRenderer.send('open-draw-win', info),
  openVoice: () => ipcRenderer.send('open-voice'),
  voiceOperation: (info) => ipcRenderer.send('voice-operation', info),
  addCharacterMediaByDownLoadLink: (info) => ipcRenderer.invoke('add-character-media-by-download-Link', info),
  getCharacterMediaListByfilePath: (info) => ipcRenderer.invoke('get-character-media-list-by-file-path', info),
  removeCharacterMedia: (info) => ipcRenderer.send('remove-character-media', info),
  clientUpdateInfoData: (callback) => {
    ipcRenderer.on("client-update-info-data", (event, progress) => {
      callback(progress);
    });
  },
  getClientUpdateInfoData: () => ipcRenderer.send('get-update-info-data'),

  sendSearchPage: (info) => ipcRenderer.send('search-page', info),
  closeSearchPage: (info) => ipcRenderer.send('close-search-page', info),
  foundInPage: (callback) => {
    ipcRenderer.on("found-in-page", (event, progress) => {
      callback(progress);
    });
  },
  flashTaskbar: () => ipcRenderer.invoke('flash-taskbar'),
  appendTaskLog: (line) => ipcRenderer.invoke('append-task-log', line),
});
