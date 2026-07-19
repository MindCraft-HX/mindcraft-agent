const { ipcMain } = require('electron')
const { CORE_CHANNELS } = require('../packages/agent/shared/ipcChannels')

let mainWin = null
let mdViewerReady = false
let pendingPayloads = []
let nextPayloadId = 0
const MAX_PENDING_PAYLOADS = 20
const PAYLOAD_TTL_MS = 60_000

// main 侧 intent payload 校验（设计 4.4 双侧校验）：字段白名单 + 长度界定。
const MAX_FILE_PATH_LENGTH = 1024
const MAX_NAME_LENGTH = 256
const MAX_SOURCE_LENGTH = 128
const MAX_CONTENT_LENGTH = 2_000_000
const OPEN_MODES = new Set(['mdViewer', 'textViewer'])

function boundedString(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : ''
}

function normalizeMdPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const filePath = boundedString(raw.filePath, MAX_FILE_PATH_LENGTH)
  if (!filePath) return null
  const payload = { filePath }
  const name = boundedString(raw.name, MAX_NAME_LENGTH)
  if (name) payload.name = name
  // 超长 content 直接丢弃：viewer 会按 filePath 走 file-backed 懒加载。
  if (typeof raw.content === 'string' && raw.content.length <= MAX_CONTENT_LENGTH) {
    payload.content = raw.content
  }
  const source = boundedString(raw.source, MAX_SOURCE_LENGTH)
  if (source) payload.source = source
  if (OPEN_MODES.has(raw.openMode)) payload.openMode = raw.openMode
  if (typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size >= 0) {
    payload.size = raw.size
  }
  return payload
}

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

function evictExpiredPayloads(now = Date.now()) {
  if (!pendingPayloads.length) return
  pendingPayloads = pendingPayloads.filter(
    entry => typeof entry.enqueuedAt !== 'number' || now - entry.enqueuedAt < PAYLOAD_TTL_MS
  )
}

function pushPendingPayload(payload, enqueuedAt = Date.now()) {
  if (!payload) return
  evictExpiredPayloads(enqueuedAt)
  pendingPayloads.push({ payload, enqueuedAt })
  if (pendingPayloads.length > MAX_PENDING_PAYLOADS) {
    pendingPayloads = pendingPayloads.slice(-MAX_PENDING_PAYLOADS)
  }
}

function openMdInMain(rawPayload) {
  if (!mainWin || mainWin.isDestroyed()) return false

  const payload = normalizeMdPayload(rawPayload)
  if (!payload) return false

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

  mainWin.webContents.send(CORE_CHANNELS.OPEN_MD_VIEWER, routedPayload)
  return true
}

function registerMdViewerHandlers() {
  ipcMain.handle(CORE_CHANNELS.MD_VIEWER_READY, () => {
    mdViewerReady = true
    evictExpiredPayloads()
    const payloads = pendingPayloads.map(entry => entry.payload)
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
      evictExpiredPayloads()
      const payloads = pendingPayloads.map(entry => entry.payload)
      pendingPayloads = []
      return payloads
    },
    getState() {
      return {
        mdViewerReady,
        pendingPayloads: pendingPayloads.map(entry => entry.payload),
      }
    },
    pushPendingPayload,
    normalizeMdPayload,
  },
}
