const { BrowserWindow, ipcMain } = require('electron')
const path = require('path')

let mdWin = null
let pendingPayloads = []

function openMdWin({ initUrl, env, payload }) {
  if (payload) pendingPayloads.push(payload)

  if (mdWin && !mdWin.isDestroyed()) {
    if (mdWin.isMinimized()) mdWin.restore()
    mdWin.show()
    mdWin.focus()
    if (!mdWin.webContents.isLoading()) flushPendingPayloads()
    return
  }

  mdWin = new BrowserWindow({
    useContentSize: true,
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    show: false,
    title: '文档浏览',
    icon: path.join(__dirname, '../../dist/logo-html.png'),
    webPreferences: {
      preload: path.join(__dirname, '../../electron/preload.js'),
      webSecurity: false,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: true,
    },
  })

  mdWin.setMenu(null)
  mdWin.center()

  const url = env === 'development'
    ? 'http://127.0.0.1:5173/#/mdViewer'
    : `file://${initUrl}#/mdViewer`

  mdWin.loadURL(url)
  mdWin.once('ready-to-show', () => mdWin.show())
  mdWin.on('closed', () => { mdWin = null })
}

function flushPendingPayloads() {
  if (!mdWin || mdWin.isDestroyed() || !pendingPayloads.length) return
  for (const payload of pendingPayloads) {
    mdWin.webContents.send('md-content', payload)
  }
  pendingPayloads = []
}

function registerMdViewerHandlers() {
  ipcMain.handle('md-viewer-ready', () => {
    const payloads = [...pendingPayloads]
    pendingPayloads = []
    return payloads
  })
}

module.exports = { openMdWin, registerMdViewerHandlers }
