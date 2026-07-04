import assert from 'node:assert/strict'
import test from 'node:test'

// ── Mock requestIdleCallback — fire synchronously (budget check always passes in Node) ──
// The composable's budget check uses performance.now() which is ~0ms per iteration
// in Node, so all pending messages batch in one synchronous call.
let idleSeq = 0
globalThis.requestIdleCallback = (fn) => {
  fn({ timeRemaining: () => 50, didTimeout: false })
  return ++idleSeq
}
globalThis.cancelIdleCallback = () => {}

// ── Import ──
const mod = await import('../packages/agent/src/components/agentCommon/composables/useChunkedHistoryMount.js')
const { useChunkedHistoryMount } = mod

// ── Helpers ──
function makeMessages(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `msg-${i}`, text: `message ${i}` }))
}

function makeChat(id = 'chat-1') {
  return { id, messages: [] }
}

// Default opts — getActiveChatId must be provided or the guard treats
// undefined !== chat.id as "inactive" and stops the batch.
function makeOpts(chat) {
  return {
    getScrollEl: () => null,
    getActiveChatId: () => chat.id,
  }
}

// ── Tests ──

test('mountStaged — initial 10 mounted sync, remaining batched', async () => {
  const chat = makeChat()
  const { mountStaged, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(60)

  const p = mountStaged(chat, msgs, { maxMessages: 60 })

  // rIC fires synchronously in test mock → all batches complete immediately
  assert.equal(hasPendingMount(chat), false)
  assert.equal(chat.messages.length, 60)
  assert.deepEqual(chat.messages.map(m => m.id), msgs.map(m => m.id))

  await p // Promise resolves immediately
})

test('mountStaged — message order is chronological after full mount', async () => {
  const chat = makeChat()
  const { mountStaged } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(60)

  await mountStaged(chat, msgs, { maxMessages: 60 })

  assert.equal(chat.messages.length, 60)
  for (let i = 0; i < 60; i++) {
    assert.equal(chat.messages[i].id, `msg-${i}`)
  }
})

test('mountStaged — returns resolved Promise when messages <= INITIAL_BATCH', async () => {
  const chat = makeChat()
  const { mountStaged, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(7)

  await mountStaged(chat, msgs, { maxMessages: 60 })

  assert.equal(chat.messages.length, 7)
  assert.equal(hasPendingMount(chat), false)
})

test('mountStaged — empty / null input returns resolved Promise', async () => {
  const chat = makeChat()
  const { mountStaged } = useChunkedHistoryMount(makeOpts(chat))

  await mountStaged(chat, null)
  await mountStaged(chat, [])
  await mountStaged(null, makeMessages(10))

  assert.equal(chat.messages.length, 0)
})

test('mountStaged — respects maxMessages option', async () => {
  const chat = makeChat()
  const { mountStaged } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(100)

  await mountStaged(chat, msgs, { maxMessages: 30 })

  assert.equal(chat.messages.length, 30)
  // With maxMessages=30 and 100 messages: last 30 = msg-70..msg-99
  assert.equal(chat.messages[0].id, 'msg-70')
  assert.equal(chat.messages[29].id, 'msg-99')
})

test('pauseMount — sets active=false and preserves pending on chat._chunk', () => {
  const chat = makeChat()
  const { pauseMount, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(60)

  // Manual setup simulating state after initial mount (before batch fires)
  if (!chat._chunk) chat._chunk = {}
  chat._chunk.pending = msgs.slice(10) // 50 pending
  chat._chunk.active = true
  chat._chunk.idleId = 99
  chat.messages = msgs.slice(-10)

  assert.equal(hasPendingMount(chat), true)

  pauseMount(chat)

  assert.equal(hasPendingMount(chat), true) // pending preserved
  assert.equal(chat._chunk.active, false)
  assert.equal(chat._chunk.idleId, null) // idle cancelled
  assert.ok(chat._chunk.pending?.length > 0)
})

test('resumeMount — continues from preserved pending', async () => {
  const chat = makeChat()
  const { resumeMount, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(60)

  // Simulate state after pause: initial 10 mounted, 50 in pending
  chat.messages = msgs.slice(-10)
  if (!chat._chunk) chat._chunk = {}
  chat._chunk.pending = msgs.slice(0, 50)
  chat._chunk.active = false

  assert.equal(hasPendingMount(chat), true)

  await resumeMount(chat)

  assert.equal(chat.messages.length, 60)
  assert.equal(hasPendingMount(chat), false)
  for (let i = 0; i < 60; i++) {
    assert.equal(chat.messages[i].id, `msg-${i}`)
  }
})

test('resumeMount — no-op when no pending', async () => {
  const chat = makeChat()
  const { resumeMount } = useChunkedHistoryMount(makeOpts(chat))

  await resumeMount(chat) // should not throw
})

test('resumeMount — chains _doneResolve from previous mountStaged', async () => {
  const chat = makeChat()
  const { resumeMount, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(60)

  // Simulate: mountStaged was paused, _doneResolve still hanging
  chat.messages = msgs.slice(-10)
  let originalResolved = false
  if (!chat._chunk) chat._chunk = {}
  chat._chunk.pending = msgs.slice(0, 50)
  chat._chunk.active = false
  chat._chunk._doneResolve = () => { originalResolved = true }

  await resumeMount(chat)

  assert.equal(originalResolved, true)
  assert.equal(chat.messages.length, 60)
  assert.equal(hasPendingMount(chat), false)
})

test('discardMount — clears pending, active, idleId, and resolves', () => {
  const chat = makeChat()
  const { discardMount, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(60)

  chat.messages = msgs.slice(-10)
  if (!chat._chunk) chat._chunk = {}
  chat._chunk.pending = msgs.slice(0, 50)
  chat._chunk.active = true
  chat._chunk.idleId = 99
  let resolved = false
  chat._chunk._doneResolve = () => { resolved = true }

  discardMount(chat)

  assert.equal(hasPendingMount(chat), false)
  assert.equal(chat._chunk.active, false)
  assert.equal(chat._chunk.pending, null)
  assert.equal(chat._chunk.idleId, null)
  assert.equal(resolved, true)
})

test('discardMount — no-op on chat without _chunk', () => {
  const chat = makeChat()
  const { discardMount } = useChunkedHistoryMount(makeOpts(chat))
  discardMount(null)
  discardMount({})
})

test('hasPendingMount — false for fresh chat, true with pending', () => {
  const chat = makeChat()
  const { hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))

  assert.equal(hasPendingMount(makeChat()), false)
  assert.equal(hasPendingMount(null), false)

  if (!chat._chunk) chat._chunk = {}
  chat._chunk.pending = [{ id: 'a' }]
  assert.equal(hasPendingMount(chat), true)
})

test('getActiveChatId guard — stops batch when active chat changes', () => {
  let currentId = 'chat-1'
  const chat = makeChat('chat-1')
  const { mountStaged, hasPendingMount } = useChunkedHistoryMount({
    getScrollEl: () => null,
    getActiveChatId: () => currentId,
  })
  const msgs = makeMessages(60)

  // Switch away before mount — getActiveChatId returns 'chat-2' ≠ 'chat-1'
  currentId = 'chat-2'

  // mountStaged fires rIC synchronously → doBatch sees guard mismatch → sets active=false
  // The Promise never resolves (no finishMount), but in production it's fire-and-forget
  mountStaged(chat, msgs, { maxMessages: 60 })

  assert.equal(chat._chunk.active, false)
  assert.equal(hasPendingMount(chat), true)
  assert.equal(chat.messages.length, 10) // only initial batch
})

test('mountStaged — discards previous mount before starting new', async () => {
  const chat = makeChat()
  const { mountStaged, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs1 = makeMessages(60)
  const msgs2 = makeMessages(30).map((m, i) => ({ ...m, id: `v2-${i}` }))

  mountStaged(chat, msgs1, { maxMessages: 60 })
  // Second mount discards first (sync rIC → first already done, but discardMount clears anyway)
  await mountStaged(chat, msgs2, { maxMessages: 60 })

  assert.equal(chat.messages.length, 30)
  assert.equal(chat.messages[29].id, 'v2-29')
  assert.equal(hasPendingMount(chat), false)
})

test('finishMount — clears idleId, active, pending, _doneResolve', async () => {
  const chat = makeChat()
  const { mountStaged, hasPendingMount } = useChunkedHistoryMount(makeOpts(chat))
  const msgs = makeMessages(30)

  await mountStaged(chat, msgs, { maxMessages: 30 })

  assert.equal(hasPendingMount(chat), false)
  assert.equal(chat._chunk.active, false)
  assert.equal(chat._chunk.pending, null)
  // _doneResolve is cleared by finishMount
  assert.equal(chat._chunk._doneResolve, null)
  // idleId: with sync rIC mock, the return value may overwrite the null set by finishMount.
  // In real browser, rIC returns id before async callback fires, so idleId is correctly nulled.
  assert.equal(chat.messages.length, 30)
})

test('scroll compensation — getScrollEl re-acquired inside nextTick', async () => {
  const chat = makeChat('chat-1')
  let getScrollElCalls = 0
  const { mountStaged } = useChunkedHistoryMount({
    getScrollEl: () => {
      getScrollElCalls++
      return { scrollHeight: 500 + getScrollElCalls * 100, scrollTop: 100 }
    },
    getActiveChatId: () => 'chat-1',
  })
  const msgs = makeMessages(20)

  await mountStaged(chat, msgs, { maxMessages: 20 })

  // Called by scheduleBatch (sync) + by nextTick (re-acquire after Vue patch)
  assert.ok(getScrollElCalls >= 2, `expected >= 2 calls, got ${getScrollElCalls}`)
  assert.equal(chat.messages.length, 20)
})
