'use strict'

const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels')
const { WINDOW_ROLES } = require('./windowRoles')

function boundedString(value, limit = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit ? value : ''
}

function isBoundedPayload(payload) {
  try { return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 64 * 1024 } catch (_) { return false }
}

/** Registers the only renderer API allowed to read or change Workbench layout. */
function registerLayoutIpc({ ipcMain, repository, roles, createWindowInstanceId } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('ipcMain.handle is required')
  if (!repository || !roles) throw new Error('layout repository and role registry are required')
  if (typeof createWindowInstanceId !== 'function') throw new Error('createWindowInstanceId is required')

  const instances = new Map()

  function requireMainWorkbench(event) {
    if (!roles.isSenderInRole(event?.sender, WINDOW_ROLES.MAIN_WORKBENCH)) return null
    const senderId = event.sender.id
    let windowInstanceId = instances.get(senderId)
    if (!windowInstanceId) {
      windowInstanceId = createWindowInstanceId()
      instances.set(senderId, windowInstanceId)
      repository.setWindowInstance(windowInstanceId)
      event.sender.once?.('destroyed', () => instances.delete(senderId))
    }
    return windowInstanceId
  }

  ipcMain.handle(CORE_CHANNELS.WORKBENCH_LAYOUT_LOAD, event => {
    const windowInstanceId = requireMainWorkbench(event)
    if (!windowInstanceId) return { ok: false, reason: 'unauthorized' }
    return { ok: true, windowInstanceId, ...repository.read() }
  })

  ipcMain.handle(CORE_CHANNELS.WORKBENCH_LAYOUT_SAVE, (event, payload) => {
    const windowInstanceId = requireMainWorkbench(event)
    if (!windowInstanceId) return { ok: false, reason: 'unauthorized' }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !isBoundedPayload(payload)) return { ok: false, reason: 'invalid-payload' }
    if (boundedString(payload.windowInstanceId) !== windowInstanceId) return { ok: false, reason: 'stale-window' }
    return { ok: true, ...repository.save(payload) }
  })

  return {
    disposeSender(senderId) { instances.delete(senderId) },
  }
}

module.exports = { registerLayoutIpc }
