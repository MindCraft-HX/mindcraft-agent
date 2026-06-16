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
})
