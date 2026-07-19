'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { createDocumentWatchManager } = require('../electron/documents/documentWatchManager')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function sig(mtimeMs, size = 10, ino = 1) {
  return { mtimeMs, size, ino }
}

function identity(key, filePath = 'D:/repo/a.md', signature = sig(1)) {
  return { filePath, canonicalDocumentKey: key, signature }
}

function createHarness({ describeImpl } = {}) {
  const listeners = new Map()
  const closed = []
  const sent = []
  let current = { ok: true, filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: sig(2) }
  const describe = describeImpl || (() => current)
  const manager = createDocumentWatchManager({
    watch: (filePath, listener) => {
      listeners.set(filePath, listener)
      const watcher = { close() { closed.push(filePath) }, on() {} }
      return watcher
    },
    describe,
    send: payload => sent.push(payload),
    debounceMs: 5,
  })
  return {
    manager,
    sent,
    closed,
    fire(filePath = 'D:/repo/a.md') { listeners.get(filePath)?.('change') },
    setCurrent(next) { current = next },
  }
}

test('watchDocument dedups by canonical key and validates identity', () => {
  const { manager } = createHarness()
  assert.equal(manager.size, 0)
  assert.deepEqual(manager.watchDocument(null), { ok: false, reason: 'invalid-identity' })
  assert.deepEqual(manager.watchDocument({ filePath: 'x' }), { ok: false, reason: 'invalid-identity' })
  assert.deepEqual(manager.watchDocument(identity('k1')), { ok: true, alreadyWatching: false })
  assert.equal(manager.size, 1)
  assert.deepEqual(manager.watchDocument(identity('k1')), { ok: true, alreadyWatching: true })
  assert.equal(manager.size, 1)
})

test('watchDocument reports watch-failed and does not track the entry', () => {
  const manager = createDocumentWatchManager({
    watch: () => { throw new Error('ENOENT') },
    describe: () => ({ ok: true }),
    send: () => {},
    debounceMs: 5,
  })
  assert.deepEqual(manager.watchDocument(identity('k1')), { ok: false, reason: 'watch-failed' })
  assert.equal(manager.size, 0)
})

test('external change sends one debounced notification with the fresh identity', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  h.fire(); h.fire(); h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].reason, 'changed')
  assert.equal(h.sent[0].canonicalDocumentKey, 'k1')
  assert.deepEqual(h.sent[0].identity.signature, sig(2))
})

test('unchanged signature does not notify', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(2)))
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 0)
})

test('self-write token swallows the next matching event only', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  h.setCurrent({ ok: true, filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: sig(9) })
  assert.equal(h.manager.noteSelfWrite('k1', sig(9)), true)
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 0)
  // token 已消费：之后的真实外部变更照常通知
  h.setCurrent({ ok: true, filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: sig(10) })
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].reason, 'changed')
})

test('self-write does not mask a different external signature', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  h.manager.noteSelfWrite('k1', sig(9))
  h.setCurrent({ ok: true, filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: sig(7) })
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 1)
  assert.deepEqual(h.sent[0].identity.signature, sig(7))
})

test('describe failure notifies with null identity and reason', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1'))
  h.setCurrent({ ok: false, reason: 'stat-failed' })
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].identity, null)
  assert.equal(h.sent[0].reason, 'stat-failed')
})

test('persistent describe failure notifies once per state transition', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  h.setCurrent({ ok: false, reason: 'stat-failed' })
  // 同一失败状态下的后续 fs 事件不重复通知
  h.fire(); h.fire(); h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].identity, null)
  // 状态恢复（文件重建）→ 正常 changed 通知，并清零失败记录
  h.setCurrent({ ok: true, filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: sig(5) })
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 2)
  assert.equal(h.sent[1].reason, 'changed')
  // 再次失败 → 重新通知一次
  h.setCurrent({ ok: false, reason: 'stat-failed' })
  h.fire()
  await sleep(40)
  assert.equal(h.sent.length, 3)
  assert.equal(h.sent[2].identity, null)
  assert.equal(h.sent[2].reason, 'stat-failed')
})

test('every handled event rearms the watcher (atomic rename replaces inode)', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  assert.equal(h.closed.length, 0)
  h.fire()
  await sleep(40)
  assert.deepEqual(h.closed, ['D:/repo/a.md'])
  h.setCurrent({ ok: true, filePath: 'D:/repo/a.md', canonicalDocumentKey: 'k1', signature: sig(3) })
  h.fire()
  await sleep(40)
  assert.deepEqual(h.closed, ['D:/repo/a.md', 'D:/repo/a.md'])
  assert.equal(h.sent.length, 2)
})

test('unwatch closes the watcher and stops pending notifications', async () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  assert.equal(h.manager.unwatchDocument('nope'), false)
  h.fire()
  assert.equal(h.manager.unwatchDocument('k1'), true)
  assert.equal(h.manager.size, 0)
  await sleep(40)
  assert.equal(h.sent.length, 0)
  assert.deepEqual(h.closed, ['D:/repo/a.md'])
})

test('dispose closes every watcher', () => {
  const h = createHarness()
  h.manager.watchDocument(identity('k1', 'D:/repo/a.md', sig(1)))
  h.manager.watchDocument(identity('k2', 'D:/repo/b.md', sig(1)))
  assert.equal(h.manager.size, 2)
  h.manager.dispose()
  assert.equal(h.manager.size, 0)
  assert.deepEqual(h.closed.sort(), ['D:/repo/a.md', 'D:/repo/b.md'])
})
