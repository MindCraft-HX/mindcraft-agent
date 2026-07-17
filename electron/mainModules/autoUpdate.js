const { autoUpdater } = require('electron-updater')
const { app, ipcMain } = require('electron')

const { getSetting, setSetting } = require('./settingsStore')
const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels')

let currentStatus = {
  state: 'idle',
  checkId: 0,
  checkedAt: 0,
  version: '',
  progress: 0,
  releaseNotes: '',
  force: false,
  error: '',
  dev: false,
}

function sendStatus(win, status) {
  currentStatus = { ...currentStatus, ...status }
  if (win && !win.isDestroyed()) {
    win.webContents.send(CORE_CHANNELS.APP_UPDATE_STATUS, currentStatus)
  }
}

function getDefaultUpdateUrl(env, platform) {
  if (env === 'development' || env === 'testing') {
    return platform === 'IOS' ? 'http://localhost:8091/mac' : 'http://localhost:8091/win'
  }
  const base = 'https://download.mindcraft.com.cn/MindCraft-Agent/installer'
  return platform === 'IOS' ? `${base}/mac` : `${base}/win`
}

function setupAutoUpdater(env, platform, win, { beforeInstall } = {}) {
  let activeCheckId = 0
  let updateCheckTimeout = null
  let updateCheckInFlight = false
  let updateUrl = getDefaultUpdateUrl(env, platform)

  autoUpdater.setFeedURL(updateUrl)
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  function clearUpdateTimeout() {
    if (!updateCheckTimeout) return
    clearTimeout(updateCheckTimeout)
    updateCheckTimeout = null
  }

  function finishCheck(checkId, status) {
    updateCheckInFlight = false
    clearUpdateTimeout()
    sendStatus(win, markChecked(status, checkId))
  }

  function markChecked(status, checkId = activeCheckId) {
    return {
      ...status,
      checkId,
      checkedAt: Date.now(),
    }
  }

  function checkForUpdatesSafe(checkId) {
    clearUpdateTimeout()
    activeCheckId = checkId
    updateCheckInFlight = true

    if (env === 'development' || env === 'testing') {
      finishCheck(checkId, {
        state: 'not-available',
        dev: true,
        version: '',
        progress: 0,
        releaseNotes: '',
        force: false,
        error: '',
      })
      return
    }

    updateCheckTimeout = setTimeout(() => {
      finishCheck(checkId, {
        state: 'error',
        error: 'Update check timed out',
        progress: 0,
      })
    }, 15000)

    autoUpdater.checkForUpdates()
  }

  function startManualCheck() {
    if (updateCheckInFlight) {
      sendStatus(win, {
        state: 'checking',
        checkId: activeCheckId,
        checkedAt: currentStatus.checkedAt || Date.now(),
      })
      return { ok: true, checkId: activeCheckId, reused: true }
    }
    activeCheckId += 1
    const checkId = activeCheckId
    sendStatus(win, {
      state: 'checking',
      checkId,
      checkedAt: Date.now(),
      progress: 0,
      releaseNotes: '',
      force: false,
      error: '',
    })
    checkForUpdatesSafe(checkId)
    return { ok: true, checkId }
  }

  autoUpdater.on('update-available', (info) => {
    console.log('发现可用更新')
    console.log('版本号：', info.version)
    console.log('更新内容：', info.releaseNotes)
    setSetting('isUpdateAvailable', true)
    win.webContents.send(CORE_CHANNELS.CLIENT_UPDATE_INFO_DATA, true)
    finishCheck(activeCheckId, {
      state: 'available',
      version: info.version || '',
      releaseNotes: info.releaseNotes || '',
      force: Boolean(info.force),
      progress: 0,
      error: '',
      dev: false,
    })
    if (info.force) {
      setTimeout(() => { app.quit() }, 300)
    }
  })

  autoUpdater.on('update-not-available', () => {
    console.log('没有可用更新')
    setSetting('isUpdateAvailable', false)
    win.webContents.send(CORE_CHANNELS.CLIENT_UPDATE_INFO_DATA, false)
    finishCheck(activeCheckId, {
      state: 'not-available',
      version: '',
      progress: 0,
      releaseNotes: '',
      force: false,
      error: '',
      dev: false,
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatus(win, {
      state: 'downloading',
      progress: progressObj.percent,
      error: '',
    })
  })

  autoUpdater.on('update-downloaded', () => {
    sendStatus(win, {
      state: 'downloaded',
      version: currentStatus.version || '',
      progress: 100,
      error: '',
    })
  })

  autoUpdater.on('error', (error) => {
    console.log('更新错误：', error)
    finishCheck(activeCheckId, {
      state: 'error',
      error: error?.message || String(error),
      progress: 0,
    })
  })

  activeCheckId += 1
  checkForUpdatesSafe(activeCheckId)

  ipcMain.handle('check-for-updates', () => startManualCheck())
  ipcMain.on('check-for-updates', () => {
    startManualCheck()
  })
  ipcMain.on(CORE_CHANNELS.GET_UPDATE_INFO_DATA, () => {
    const isUpdateAvailable = getSetting('isUpdateAvailable')
    win.webContents.send(CORE_CHANNELS.CLIENT_UPDATE_INFO_DATA, isUpdateAvailable)
  })
  ipcMain.handle(CORE_CHANNELS.GET_APP_UPDATE_STATUS, () => currentStatus)

  ipcMain.handle('download-update', async () => {
    try {
      setSetting('isUpdateAvailable', false)
      win.webContents.send(CORE_CHANNELS.CLIENT_UPDATE_INFO_DATA, false)
      sendStatus(win, {
        state: 'downloading',
        progress: 0,
        error: '',
      })
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e) {
      console.error('下载更新失败:', e)
      sendStatus(win, markChecked({
        state: 'error',
        error: e?.message || String(e),
        progress: 0,
      }))
      return { success: false, error: e?.message || String(e) }
    }
  })

  ipcMain.on('install-update', () => {
    try {
      beforeInstall?.()
    } catch (e) {
      console.warn('[auto-update] before install cleanup failed:', e?.message || e)
    }
    autoUpdater.quitAndInstall(true, true)
  })
}

module.exports = { setupAutoUpdater }
