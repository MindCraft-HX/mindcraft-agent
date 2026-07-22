const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CANCELLED_INTERACTIVE_REQUEST,
  createClaudeInteractiveRequestRegistry,
} = require('../packages/agent/electron/claude/interactiveRequestRegistry')

test('Claude interactive request resolves only for its live run and sender', () => {
  const liveRuns = new Map([['chat-1', 'run-1']])
  const registry = createClaudeInteractiveRequestRegistry({
    ownsRun: (chatKey, runId) => liveRuns.get(chatKey) === runId,
  })
  let resolved
  registry.register({
    requestId: 'request-1',
    chatKey: 'chat-1',
    runId: 'run-1',
    kind: 'ask-question',
    senderId: 7,
    resolve: value => { resolved = value },
  })

  assert.deepEqual(registry.respond({
    requestId: 'request-1',
    chatKey: 'chat-1',
    kind: 'ask-question',
    senderId: 8,
    value: { q: 'wrong window' },
  }), { ok: false, error: 'stale-request' })
  assert.equal(resolved, undefined)

  assert.deepEqual(registry.respond({
    requestId: 'request-1',
    chatKey: 'chat-1',
    kind: 'ask-question',
    senderId: 7,
    value: { q: 'accepted' },
  }), { ok: true })
  assert.deepEqual(resolved, { q: 'accepted' })
  assert.equal(registry.size(), 0)
})

test('replacement run makes an old response stale and owned cleanup cancels it', () => {
  const liveRuns = new Map([['chat-1', 'run-1']])
  const registry = createClaudeInteractiveRequestRegistry({
    ownsRun: (chatKey, runId) => liveRuns.get(chatKey) === runId,
  })
  let resolved
  registry.register({
    requestId: 'request-old',
    chatKey: 'chat-1',
    runId: 'run-1',
    kind: 'ask-question',
    senderId: 7,
    resolve: value => { resolved = value },
  })
  liveRuns.set('chat-1', 'run-2')

  assert.deepEqual(registry.respond({
    requestId: 'request-old',
    chatKey: 'chat-1',
    kind: 'ask-question',
    senderId: 7,
    value: {},
  }), { ok: false, error: 'stale-request' })
  assert.equal(registry.cancelRun('chat-1', 'run-1'), 1)
  assert.equal(resolved, CANCELLED_INTERACTIVE_REQUEST)
})

test('duplicate request ids fail closed instead of leaving the second waiter hanging', () => {
  const registry = createClaudeInteractiveRequestRegistry({ ownsRun: () => true })
  registry.register({
    requestId: 'request-1',
    chatKey: 'chat-1',
    runId: 'run-1',
    kind: 'ask-question',
    senderId: 7,
    resolve: () => {},
  })
  let duplicateResult

  assert.equal(registry.register({
    requestId: 'request-1',
    chatKey: 'chat-1',
    runId: 'run-1',
    kind: 'ask-question',
    senderId: 7,
    resolve: value => { duplicateResult = value },
  }), false)
  assert.equal(duplicateResult, CANCELLED_INTERACTIVE_REQUEST)
})
