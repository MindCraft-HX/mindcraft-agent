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

test('document WATCH/UNWATCH require main-workbench role and a watch manager', () => {
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
  const watched = []
  const watchManager = {
    watchDocument: identity => { watched.push(identity); return { ok: true, alreadyWatching: false } },
    unwatchDocument: () => true,
    noteSelfWrite: () => true,
  }
  registerDocumentIpc({ ipcMain: { handle(key, handler) { handlers.set(key, handler) } }, roles, repository, watchManager })
  const identity = { filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1' }
  assert.deepEqual(handlers.get('document-watch')({ sender: standalone.webContents }, identity), { ok: false, reason: 'unauthorized' })
  assert.deepEqual(handlers.get('document-unwatch')({ sender: standalone.webContents }, 'k1'), { ok: false, reason: 'unauthorized' })
  assert.deepEqual(handlers.get('document-watch')({ sender: main.webContents }, identity), { ok: true, alreadyWatching: false })
  assert.deepEqual(watched, [identity])
  assert.deepEqual(handlers.get('document-unwatch')({ sender: main.webContents }, 'k1'), { ok: true, unwatched: true })
})

test('document WRITE success records a self-write token on the watch manager', () => {
  const handlers = new Map()
  const roles = createWindowRoleRegistry()
  const main = fakeWindow(1)
  roles.registerWindow(main, WINDOW_ROLES.MAIN_WORKBENCH)
  const signature = { mtimeMs: 1, size: 2, ino: 3 }
  const repository = {
    describe: filePath => ({ ok: true, filePath }),
    read: () => ({ ok: true, text: 'x', signature: {} }),
    write: () => ({ ok: true, signature }),
  }
  const selfWrites = []
  const watchManager = {
    watchDocument: () => ({ ok: true, alreadyWatching: false }),
    unwatchDocument: () => true,
    noteSelfWrite: (key, sig) => { selfWrites.push([key, sig]); return true },
  }
  registerDocumentIpc({ ipcMain: { handle(key, handler) { handlers.set(key, handler) } }, roles, repository, watchManager })
  const identity = { filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: {} }
  const result = handlers.get('document-write')({ sender: main.webContents }, { identity, text: 'new' })
  assert.deepEqual(result, { ok: true, signature })
  assert.deepEqual(selfWrites, [['k1', signature]])
})

test('document WRITE failure does not record a self-write token', () => {
  const handlers = new Map()
  const roles = createWindowRoleRegistry()
  const main = fakeWindow(1)
  roles.registerWindow(main, WINDOW_ROLES.MAIN_WORKBENCH)
  const repository = {
    describe: filePath => ({ ok: true, filePath }),
    read: () => ({ ok: true, text: 'x', signature: {} }),
    write: () => ({ ok: false, reason: 'conflict' }),
  }
  const selfWrites = []
  const watchManager = {
    watchDocument: () => ({ ok: true, alreadyWatching: false }),
    unwatchDocument: () => true,
    noteSelfWrite: (key, sig) => { selfWrites.push([key, sig]); return true },
  }
  registerDocumentIpc({ ipcMain: { handle(key, handler) { handlers.set(key, handler) } }, roles, repository, watchManager })
  const identity = { filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: {} }
  const result = handlers.get('document-write')({ sender: main.webContents }, { identity, text: 'new' })
  assert.deepEqual(result, { ok: false, reason: 'conflict' })
  assert.deepEqual(selfWrites, [])
})
