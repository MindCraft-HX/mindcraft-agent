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
    // 入队兜底：保证刷新/首访等场景下 onMounted→getPendingMdContent 可拉到
    pendingPayloads.push(payload)
    if (pendingPayloads.length > MAX_PENDING_PAYLOADS) {
      pendingPayloads = pendingPayloads.slice(-MAX_PENDING_PAYLOADS)
    }
    // 直投路径：keep-alive 保留组件实例，onMounted 不会重新触发导致队列无人消费，
    // 已就绪时必须直接投递给活跃的 onMdContent 监听器。
    // did-start-loading 会在刷新前重置 mdViewerReady=false，不会误投到已销毁的组件。
    if (mdViewerReady) {
      mainWin.webContents.send('md-content', payload)
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
