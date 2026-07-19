const test = require('node:test')
const assert = require('node:assert/strict')

const {
  openMdInMain,
  setMainWindow,
  __test__,
} = require('../electron/mdRouting')

function createFakeWindow() {
  const sent = []
  return {
    sent,
    shown: false,
    focused: false,
    restored: false,
    webContents: {
      on() {},
      send(channel, payload) {
        sent.push({ channel, payload })
      },
    },
    isDestroyed() { return false },
    isMinimized() { return false },
    restore() { this.restored = true },
    show() { this.shown = true },
    focus() { this.focused = true },
    on() {},
  }
}

test('openMdInMain queues payloads before mdViewer is ready', () => {
  __test__.resetForTest()
  const win = createFakeWindow()
  setMainWindow(win)

  openMdInMain({ filePath: 'D:/repo/docs/A.md', name: 'A.md' })

  assert.deepEqual(win.sent.map(item => item.channel), ['open-md-viewer'])
  assert.equal(__test__.getState().pendingPayloads.length, 1)
  assert.equal(__test__.getState().pendingPayloads[0].filePath, 'D:/repo/docs/A.md')
  assert.ok(__test__.getState().pendingPayloads[0].__mdRequestId)
  assert.equal(win.shown, true)
  assert.equal(win.focused, true)
})

test('openMdInMain directly sends ready payloads and keeps a queued fallback', () => {
  __test__.resetForTest()
  const win = createFakeWindow()
  setMainWindow(win)
  __test__.setReady(true)

  openMdInMain({ filePath: 'D:/repo/docs/B.md', name: 'B.md' })

  assert.deepEqual(win.sent.map(item => item.channel), ['md-content', 'open-md-viewer'])
  const sentPayload = win.sent[0].payload
  const pendingPayload = __test__.getState().pendingPayloads[0]
  assert.equal(sentPayload.filePath, 'D:/repo/docs/B.md')
  assert.equal(pendingPayload.filePath, 'D:/repo/docs/B.md')
  assert.equal(sentPayload.__mdRequestId, pendingPayload.__mdRequestId)
  assert.equal(win.sent[1].payload.__mdRequestId, sentPayload.__mdRequestId)
})

test('pending payloads older than TTL are evicted on push and drain', () => {
  __test__.resetForTest()
  const win = createFakeWindow()
  setMainWindow(win)

  const t0 = Date.now()
  // 注入一个已过期（>60s）和一个未过期的 payload
  __test__.pushPendingPayload({ filePath: 'D:/repo/docs/old.md' }, t0 - 61_000)
  __test__.pushPendingPayload({ filePath: 'D:/repo/docs/fresh.md' }, t0 - 1_000)

  // 入队时驱逐过期项：old.md 已被清掉，只剩 fresh.md
  assert.deepEqual(
    __test__.getState().pendingPayloads.map(p => p.filePath),
    ['D:/repo/docs/fresh.md']
  )

  // drain 同样只返回未过期项
  const drained = __test__.drainPendingPayloads()
  assert.deepEqual(drained.map(p => p.filePath), ['D:/repo/docs/fresh.md'])
  assert.equal(__test__.getState().pendingPayloads.length, 0)
})

test('drain evicts payloads that expired while waiting for mdViewer ready', () => {
  __test__.resetForTest()
  const win = createFakeWindow()
  setMainWindow(win)

  // 模拟：payload 入队后 mdViewer 很久才 ready（如窗口长时间未加载完成）
  const t0 = Date.now()
  __test__.pushPendingPayload({ filePath: 'D:/repo/docs/stale.md' }, t0 - 120_000)

  const drained = __test__.drainPendingPayloads()
  assert.equal(drained.length, 0)
  assert.equal(__test__.getState().pendingPayloads.length, 0)
})

test('openMdInMain rejects payloads without a bounded filePath', () => {
  __test__.resetForTest()
  const win = createFakeWindow()
  setMainWindow(win)

  assert.equal(openMdInMain(null), false)
  assert.equal(openMdInMain('D:/repo/docs/A.md'), false)
  assert.equal(openMdInMain({}), false)
  assert.equal(openMdInMain({ filePath: '' }), false)
  assert.equal(openMdInMain({ filePath: 42 }), false)
  assert.equal(openMdInMain({ filePath: 'x'.repeat(1025) }), false)

  assert.equal(win.sent.length, 0)
  assert.equal(__test__.getState().pendingPayloads.length, 0)
  assert.equal(win.shown, false)
})

test('normalizeMdPayload keeps whitelisted fields and drops invalid ones', () => {
  __test__.resetForTest()

  const normalized = __test__.normalizeMdPayload({
    filePath: 'D:/repo/docs/A.md',
    name: 'A.md',
    content: '# hello',
    source: 'agent-file-link',
    openMode: 'mdViewer',
    size: 128,
    evil: 'dropped',
    __mdRequestId: 'spoofed-id',
  })

  assert.deepEqual(normalized, {
    filePath: 'D:/repo/docs/A.md',
    name: 'A.md',
    content: '# hello',
    source: 'agent-file-link',
    openMode: 'mdViewer',
    size: 128,
  })
})

test('normalizeMdPayload drops oversized content and invalid openMode/size', () => {
  __test__.resetForTest()

  const normalized = __test__.normalizeMdPayload({
    filePath: 'D:/repo/docs/big.md',
    content: 'x'.repeat(2_000_001),
    openMode: 'rm-rf',
    size: -1,
  })

  assert.deepEqual(normalized, { filePath: 'D:/repo/docs/big.md' })
})
