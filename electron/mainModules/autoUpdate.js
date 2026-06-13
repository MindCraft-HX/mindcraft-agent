const { autoUpdater } = require("electron-updater");
const { app,dialog, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const { getSetting, setSetting } = require('./settingsStore')

// 缓存当前更新状态，供 renderer 按需查询
let currentStatus = { state: 'idle' }
function sendStatus(win, status) {
  currentStatus = { ...currentStatus, ...status }
  if (win && !win.isDestroyed()) {
    win.webContents.send('app-update-status', currentStatus)
  }
}

function setupAutoUpdater(env, win) {
  //检查更新
  let updateUrl = "https://download.mindcraft.com.cn/MindCraft-Agent/installer/win/";
  if(env === "development" || env === "testing") {
    // 本地服务的更新地址
    updateUrl = "http://localhost:8091/win"
  }
  autoUpdater.setFeedURL(updateUrl);
  // 配置自动更新
  autoUpdater.autoDownload = false; // 禁止自动下载更新
  autoUpdater.autoInstallOnAppQuit = true; // 应用退出时自动安装更新

  // 超时保护：15s 内无响应则回退到 error 状态
  let updateCheckTimeout = null
  function clearUpdateTimeout() {
    if (updateCheckTimeout) {
      clearTimeout(updateCheckTimeout)
      updateCheckTimeout = null
    }
  }
  function checkForUpdatesSafe() {
    clearUpdateTimeout()
    // 开发 / 测试模式：本地无更新服务器，直接返回
    if (env === "development" || env === "testing") {
      sendStatus(win, { state: 'not-available', dev: true })
      return
    }
    updateCheckTimeout = setTimeout(() => {
      sendStatus(win, { state: 'error', error: 'Update check timed out' })
      clearUpdateTimeout()
    }, 15000)
    autoUpdater.checkForUpdates()
  }

  // 监听更新事件
  autoUpdater.on("update-available", async (info) => {
    clearUpdateTimeout()
    console.log("发现可用更新");
    console.log("版本号：", info.version);
    console.log("更新内容：", info.releaseNotes);
    setSetting("isUpdateAvailable", true);
    win.webContents.send("client-update-info-data", true)
    sendStatus(win, { state: 'available', version: info.version, releaseNotes: info.releaseNotes })
    // 有可用更新时的处理逻辑
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["下载", "取消"],
      defaultId: 0,
      message: "发现新版本",
      detail: `版本号：${info.version}\n\n更新内容：\n${info.releaseNotes}`, // releaseNotes为更新日志
    });
    if (response === 0) {
      autoUpdater.downloadUpdate(); // 下载更新
      setSetting("isUpdateAvailable", false);
      win.webContents.send("client-update-info-data", false)
      sendStatus(win, { state: 'downloading', progress: 0 })
    }else if(response === 1) {
      sendStatus(win, { state: 'available', version: info.version, skipped: true })
      if(info.force) {
        app.exit(); //关闭软件  不更新就关闭 强制
      }
    }
  });

  autoUpdater.on("update-not-available", () => {
    clearUpdateTimeout()
    // 没有可用更新时的处理逻辑
    console.log("没有可用更新");
    setSetting("isUpdateAvailable", false);
    win.webContents.send("client-update-info-data", false)
    sendStatus(win, { state: 'not-available' })
  });


  //创建进度度条窗口
  let progressWin = null;
  function createProgressWindow() {
    progressWin = new BrowserWindow({
      width: 350,
      height: 150,
      webPreferences: {
        preload: path.join(__dirname, "../preload.js"), // 确保这里的路径正确指向你的preload.js文件
        sandbox: false,
      },
      useContentSize: true,
      autoHideMenuBar: true,
      resizable: false,
      fullscreen: false,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      title: "Updating...",
    });

    progressWin.loadFile(path.join(__dirname, "../progress.html"));
    progressWin.on("closed", () => {
      progressWin = null;
    });
  }

  // 应用更新进度
  autoUpdater.on("download-progress", (progressObj) => {
    if (!progressWin) {
      createProgressWindow();
    }
    progressWin.setProgressBar(progressObj.percent / 100);
    progressWin.setTitle(`正在更新中... (${Math.round(progressObj.percent)}%)`);
    progressWin.webContents.send("download-progress", progressObj.percent);
    sendStatus(win, { state: 'downloading', progress: progressObj.percent })
  });

  autoUpdater.on("update-downloaded", async () => {
    // 更新下载完成时的处理逻辑
    if (progressWin) {
      progressWin.close();
    }
    sendStatus(win, { state: 'downloaded', version: currentStatus.version })
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Yes", "No"],
      defaultId: 0,
      message: "更新下载完成",
      detail: "是否立即退出并安装新版本？",
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(); // 退出并安装更新包
    }
  });
  autoUpdater.on("error", (error) => {
    clearUpdateTimeout()
    console.log("更新错误：", error);
    sendStatus(win, { state: 'error', error: error.message })
  });
  // 检查更新
  checkForUpdatesSafe()
  ipcMain.on("check-for-updates", (event) => {
    sendStatus(win, { state: 'checking' })
    checkForUpdatesSafe()
  })
  ipcMain.on("get-update-info-data", (event) => {
    const isUpdateAvailable = getSetting("isUpdateAvailable");
    win.webContents.send("client-update-info-data", isUpdateAvailable);
  })
  ipcMain.handle('get-app-update-status', () => currentStatus)
}

module.exports = { setupAutoUpdater };
