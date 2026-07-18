'use strict'

const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels')
const { WINDOW_ROLES } = require('../workbench/windowRoles')

function isSmallPayload(payload, limit = 2.1 * 1024 * 1024) {
  try { return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= limit } catch (_) { return false }
}

function registerDocumentIpc({ ipcMain, roles, repository } = {}) {
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
    return repository.write(payload?.identity, payload?.text)
  })
}

module.exports = { registerDocumentIpc }
