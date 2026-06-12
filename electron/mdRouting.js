const { ipcMain } = require('electron')

let mainWin = null
let mdViewerReady = false
let pendingPayloads = []
const MAX_PENDING_PAYLOADS = 20

function setMainWindow(win) {
  mainWin = win
  // 刷新/重载后渲染端监听器全部失效，重置握手标志
  if (win && !win.isDestroyed()) {
    win.webContents.on('did-start-loading', () => { mdViewerReady = false })
    win.on('closed', () => { mainWin = null; mdViewerReady = false; pendingPayloads = [] })
  }
}

function openMdInMain(payload) {
  if (!mainWin || mainWin.isDestroyed()) return

  if (payload) {
    // 始终排队到 pendingPayloads，由渲染端 onMounted 时通过 getPendingMdContent 统一拉取
    // 避免 mdViewerReady=true 时直接 send('md-content') 在组件挂载前到达而丢失
    pendingPayloads.push(payload)
    if (pendingPayloads.length > MAX_PENDING_PAYLOADS) {
      pendingPayloads = pendingPayloads.slice(-MAX_PENDING_PAYLOADS)
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
