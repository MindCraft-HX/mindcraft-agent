'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { createCloseHandshake } = require('../electron/workbench/closeHandshake')
const { WINDOW_ROLES, createWindowRoleRegistry } = require('../electron/workbench/windowRoles')

function createWindow(id) {
  const sent = []
  return {
    sent,
    webContents: { id, send(channel, payload) { sent.push({ channel, payload }) } },
    once() {},
    isDestroyed: () => false,
  }
}

function setup() {
  const handlers = new Map()
  const roles = createWindowRoleRegistry()
  const window = createWindow(1)
  roles.registerWindow(window, WINDOW_ROLES.MAIN_WORKBENCH)
  const handshake = createCloseHandshake({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler) } },
    roles,
    getMainWindow: () => window,
    now: () => 123,
    timeoutMs: 100,
  })
  return { handlers, roles, window, handshake }
}

test('close handshake accepts a response only from the registered main workbench', async () => {
  const { handlers, roles, window, handshake } = setup()
  const other = createWindow(2)
  roles.registerWindow(other, WINDOW_ROLES.STANDALONE_AGENT)
  const pending = handshake.requestClose('quit')
  const requestId = window.sent[0].payload.requestId

  assert.deepEqual(handlers.get('close-coordinator-response')({ sender: other.webContents }, { requestId, status: 'ready' }), {
    accepted: false, reason: 'unauthorized',
  })
  assert.deepEqual(handlers.get('close-coordinator-response')({ sender: window.webContents }, { requestId, status: 'ready' }), {
    accepted: true,
  })
  assert.deepEqual(await pending, { requestId, status: 'ready', reason: '' })
})

test('close handshake fails safely when renderer never returns a result', async () => {
  const { handshake } = setup()
  const result = await handshake.requestClose('update')
  assert.equal(result.status, 'error')
  assert.equal(result.reason, 'timeout')
})
