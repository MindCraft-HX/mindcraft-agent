'use strict'

const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels')
const { WINDOW_ROLES } = require('../workbench/windowRoles')

function isSmallPayload(payload, limit = 2.1 * 1024 * 1024) {
  try { return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= limit } catch (_) { return false }
}

function registerDocumentIpc({ ipcMain, roles, repository, watchManager } = {}) {
  if (!ipcMain?.handle || !roles?.isSenderInRole || !repository) throw new Error('document IPC dependencies are required')

  function authorized(event) {
    return roles.isSenderInRole(event?.sender, WINDOW_ROLES.MAIN_WORKBENCH)
  }

  ipcMain.handle(CORE_CHANNELS.DOCUMENT_DESCRIBE, (event, filePath) => {
    if (!authorized(event)) return { ok: false, reason: 'unauthorized' }
    return repository.describe(filePath)
  })
  ipcMain.handle(CORE_CHANNELS.DOCUMENT_READ, (event, identity) => {
    if (!authorized(event) || !isSmallPayload(identity, 16 * 1024)) return { ok: false, reason: 'unauthorized' }
    return repository.read(identity)
  })
  ipcMain.handle(CORE_CHANNELS.DOCUMENT_WRITE, (event, payload) => {
    if (!authorized(event) || !isSmallPayload(payload)) return { ok: false, reason: 'unauthorized' }
    const result = repository.write(payload?.identity, payload?.text)
    if (result?.ok && result.signature) {
      // Self-write token：本次写入触发的 watcher 事件不回报给 renderer。
      watchManager?.noteSelfWrite(payload?.identity?.canonicalDocumentKey, result.signature)
    }
    return result
  })
  ipcMain.handle(CORE_CHANNELS.DOCUMENT_WATCH, (event, identity) => {
    if (!authorized(event) || !isSmallPayload(identity, 16 * 1024)) return { ok: false, reason: 'unauthorized' }
    if (!watchManager) return { ok: false, reason: 'watch-unavailable' }
    return watchManager.watchDocument(identity)
  })
  ipcMain.handle(CORE_CHANNELS.DOCUMENT_UNWATCH, (event, canonicalDocumentKey) => {
    if (!authorized(event)) return { ok: false, reason: 'unauthorized' }
    if (!watchManager) return { ok: false, reason: 'watch-unavailable' }
    return { ok: true, unwatched: watchManager.unwatchDocument(canonicalDocumentKey) }
  })
}

module.exports = { registerDocumentIpc }
