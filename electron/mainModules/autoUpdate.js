const { autoUpdater } = require("electron-updater");
const { app, ipcMain } = require("electron");

const { getSetting, setSetting } = require('./settingsStore')

// 缓存当前更新状态，供 renderer 按需查询
let currentStatus = { state: 'idle' }
function sendStatus(win, status) {
  currentStatus = { ...currentStatus, ...status }
  if (win && !win.isDestroyed()) {
    win.webContents.send('app-update-status', currentStatus)
  }
}

function setupAutoUpdater(env, win, { beforeInstall } = {}) {
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

  // 监听更新事件 — 不再使用模态对话框，改为通过 sendStatus 通知 SystemSettings
  autoUpdater.on("update-available", (info) => {
    clearUpdateTimeout()
    console.log("发现可用更新");
    console.log("版本号：", info.version);
    console.log("更新内容：", info.releaseNotes);
    setSetting("isUpdateAvailable", true);
    win.webContents.send("client-update-info-data", true)
    sendStatus(win, { state: 'available', version: info.version, releaseNotes: info.releaseNotes, force: !!info.force })
    // 强制更新：给 renderer 300ms 接收状态后退出
    if (info.force) {
      setTimeout(() => { app.exit() }, 300)
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


  // 应用更新进度 — 仅通过 sendStatus 推送给 SystemSettings 进度条
  autoUpdater.on("download-progress", (progressObj) => {
    sendStatus(win, { state: 'downloading', progress: progressObj.percent })
  });

  autoUpdater.on("update-downloaded", () => {
    // 更新下载完成 — 不弹对话框，等用户在 SystemSettings 中点击"重启安装"
    sendStatus(win, { state: 'downloaded', version: currentStatus.version })
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

  // 下载更新（由 SystemSettings "下载更新" 按钮触发）
  ipcMain.handle('download-update', async () => {
    try {
      setSetting("isUpdateAvailable", false);
      win.webContents.send("client-update-info-data", false)
      sendStatus(win, { state: 'downloading', progress: 0 })
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e) {
      console.error('下载更新失败:', e)
      sendStatus(win, { state: 'error', error: e?.message || String(e) })
      return { success: false, error: e?.message || String(e) }
    }
  })
  // 安装更新（由 SystemSettings 按钮触发）
  // quitAndInstall 会先关闭窗口再退出，必须在调用前让主窗口 close handler 放行。
  ipcMain.on('install-update', () => {
    try {
      beforeInstall?.()
    } catch (e) {
      console.warn('[auto-update] before install cleanup failed:', e?.message || e)
    }
    autoUpdater.quitAndInstall(true, true)
  })
}

module.exports = { setupAutoUpdater };
