const { ipcMain } = require('electron')

let mainWin = null
let mdViewerReady = false
let pendingPayloads = []

function setMainWindow(win) {
  mainWin = win
  // 刷新/重载后渲染端监听器全部失效，重置握手标志
  if (win && !win.isDestroyed()) {
    win.webContents.on('did-start-loading', () => { mdViewerReady = false })
    win.on('closed', () => { mainWin = null; mdViewerReady = false })
  }
}

function openMdInMain(payload) {
  if (!mainWin || mainWin.isDestroyed()) return

  if (payload) {
    if (mdViewerReady) {
      mainWin.webContents.send('md-content', payload)
    } else {
      pendingPayloads.push(payload)
    }
  }

  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()

  // 通知渲染端切到文档视图
  mainWin.webContents.send('open-md-viewer')
}

function registerMdViewerHandlers() {
  ipcMain.handle('md-viewer-ready', () => {
    mdViewerReady = true
    const payloads = [...pendingPayloads]
    pendingPayloads = []
    return payloads
  })
}

module.exports = { setMainWindow, openMdInMain, registerMdViewerHandlers }
