'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createLayoutRepository } = require('../electron/workbench/layoutRepository')
const { registerLayoutIpc } = require('../electron/workbench/layoutIpc')
const { WINDOW_ROLES, createWindowRoleRegistry } = require('../electron/workbench/windowRoles')

function layout(revision = 0) {
  return {
    version: 1,
    revision,
    orientation: 'horizontal',
    activeGroupId: 'group-primary',
    groups: [{ id: 'group-primary', size: 1, activeItemId: 'agent:codehub', itemIds: ['agent:codehub'] }],
    items: { 'agent:codehub': { type: 'agent', singleton: true } },
    inputDock: { expandedSizePx: 420 },
  }
}

function validate(raw) { return raw?.version === 1 && Number.isInteger(raw.revision) ? raw : null }

function fakeWindow(id) {
  return {
    webContents: { id },
    once() {},
  }
}

function setup() {
  const handlers = new Map()
  const roles = createWindowRoleRegistry()
  const repo = createLayoutRepository({
    directory: fs.mkdtempSync(path.join(os.tmpdir(), 'mc-workbench-ipc-')),
    validate,
    createDefault: () => layout(),
  })
  let sequence = 0
  registerLayoutIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler) } },
    repository: repo,
    roles,
    createWindowInstanceId: () => `renderer-${++sequence}`,
  })
  return { handlers, roles }
}

test('only main-workbench renderer can load and save a Workbench descriptor', () => {
  const { handlers, roles } = setup()
  const mainWindow = fakeWindow(1)
  const agentWindow = fakeWindow(2)
  roles.registerWindow(mainWindow, WINDOW_ROLES.MAIN_WORKBENCH)
  roles.registerWindow(agentWindow, WINDOW_ROLES.STANDALONE_AGENT)

  const load = handlers.get('workbench-layout-load')({ sender: mainWindow.webContents })
  assert.equal(load.ok, true)
  assert.equal(load.windowInstanceId, 'renderer-1')
  assert.equal(handlers.get('workbench-layout-load')({ sender: agentWindow.webContents }).reason, 'unauthorized')

  const save = handlers.get('workbench-layout-save')({ sender: mainWindow.webContents }, {
    windowInstanceId: load.windowInstanceId,
    revision: 1,
    layout: layout(1),
  })
  assert.equal(save.ok, true)
  assert.equal(save.saved, true)
  assert.equal(handlers.get('workbench-layout-save')({ sender: agentWindow.webContents }, {
    windowInstanceId: load.windowInstanceId,
    revision: 2,
    layout: layout(2),
  }).reason, 'unauthorized')
})

test('layout IPC rejects a renderer-supplied instance id that does not match main authority', () => {
  const { handlers, roles } = setup()
  const mainWindow = fakeWindow(1)
  roles.registerWindow(mainWindow, WINDOW_ROLES.MAIN_WORKBENCH)
  handlers.get('workbench-layout-load')({ sender: mainWindow.webContents })

  const response = handlers.get('workbench-layout-save')({ sender: mainWindow.webContents }, {
    windowInstanceId: 'forged',
    revision: 1,
    layout: layout(1),
  })
  assert.deepEqual(response, { ok: false, reason: 'stale-window' })
})
