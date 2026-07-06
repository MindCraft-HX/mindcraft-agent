const { ipcMain } = require('electron')
const { CORE_CHANNELS } = require('../packages/agent/shared/ipcChannels')

let mainWin = null
let mdViewerReady = false
let pendingPayloads = []
let nextPayloadId = 0
const MAX_PENDING_PAYLOADS = 20

function setMainWindow(win) {
  mainWin = win
  if (win && !win.isDestroyed()) {
    win.webContents.on('did-start-loading', () => { mdViewerReady = false })
    win.on('closed', () => { mainWin = null; mdViewerReady = false; pendingPayloads = [] })
  }
}

function withRequestId(payload) {
  if (!payload) return null
  if (payload.__mdRequestId) return payload
  nextPayloadId += 1
  return {
    ...payload,
    __mdRequestId: `md-${Date.now()}-${nextPayloadId}`,
  }
}

function pushPendingPayload(payload) {
  if (!payload) return
  pendingPayloads.push(payload)
  if (pendingPayloads.length > MAX_PENDING_PAYLOADS) {
    pendingPayloads = pendingPayloads.slice(-MAX_PENDING_PAYLOADS)
  }
}

function openMdInMain(payload) {
  if (!mainWin || mainWin.isDestroyed()) return

  const routedPayload = withRequestId(payload)
  if (routedPayload) {
    pushPendingPayload(routedPayload)
    if (mdViewerReady) {
      mainWin.webContents.send(CORE_CHANNELS.MD_CONTENT, routedPayload)
    }
  }

  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()

  mainWin.webContents.send(CORE_CHANNELS.OPEN_MD_VIEWER)
}

function registerMdViewerHandlers() {
  ipcMain.handle(CORE_CHANNELS.MD_VIEWER_READY, () => {
    mdViewerReady = true
    const payloads = [...pendingPayloads]
    pendingPayloads = []
    return payloads
  })
}

function resetForTest() {
  mainWin = null
  mdViewerReady = false
  pendingPayloads = []
  nextPayloadId = 0
}

module.exports = {
  setMainWindow,
  openMdInMain,
  registerMdViewerHandlers,
  __test__: {
    resetForTest,
    setReady(value) { mdViewerReady = Boolean(value) },
    drainPendingPayloads() {
      const payloads = [...pendingPayloads]
      pendingPayloads = []
      return payloads
    },
    getState() {
      return {
        mdViewerReady,
        pendingPayloads: [...pendingPayloads],
      }
    },
  },
}
