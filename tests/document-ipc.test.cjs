'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { registerDocumentIpc } = require('../electron/documents/documentIpc')
const { WINDOW_ROLES, createWindowRoleRegistry } = require('../electron/workbench/windowRoles')

function fakeWindow(id) { return { webContents: { id }, once() {} } }

test('document IPC exposes named operations only to main-workbench', () => {
  const handlers = new Map()
  const roles = createWindowRoleRegistry()
  const main = fakeWindow(1)
  const standalone = fakeWindow(2)
  roles.registerWindow(main, WINDOW_ROLES.MAIN_WORKBENCH)
  roles.registerWindow(standalone, WINDOW_ROLES.STANDALONE_AGENT)
  const repository = {
    describe: filePath => ({ ok: true, filePath }),
    read: () => ({ ok: true, text: 'x', signature: {} }),
    write: () => ({ ok: true, signature: {} }),
  }
  registerDocumentIpc({ ipcMain: { handle(key, handler) { handlers.set(key, handler) } }, roles, repository })
  assert.deepEqual(handlers.get('document-describe')({ sender: main.webContents }, 'D:/repo/a.md'), { ok: true, filePath: 'D:/repo/a.md' })
  assert.deepEqual(handlers.get('document-read')({ sender: standalone.webContents }, {}), { ok: false, reason: 'unauthorized' })
})
