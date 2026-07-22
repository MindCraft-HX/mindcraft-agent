const test = require('node:test')
const assert = require('node:assert/strict')

const {
  canStreamInputToClaudeRun,
  deleteClaudeRunIfOwned,
  ownsClaudeRun,
} = require('../packages/agent/electron/claude/runOwnership')

test('stale Claude cleanup cannot delete a replacement run', () => {
  const sessions = new Map([['chat-1', { runId: 'run-new' }]])

  assert.equal(ownsClaudeRun(sessions, 'chat-1', 'run-old'), false)
  assert.equal(deleteClaudeRunIfOwned(sessions, 'chat-1', 'run-old'), false)
  assert.deepEqual(sessions.get('chat-1'), { runId: 'run-new' })
})

test('current Claude run can release only its own session entry', () => {
  const sessions = new Map([['chat-1', { runId: 'run-current' }]])

  assert.equal(ownsClaudeRun(sessions, 'chat-1', 'run-current'), true)
  assert.equal(deleteClaudeRunIfOwned(sessions, 'chat-1', 'run-current'), true)
  assert.equal(sessions.has('chat-1'), false)
})

test('streamInput is limited to a Query whose main turn has not produced result', () => {
  assert.equal(canStreamInputToClaudeRun({ query: {}, abortRequested: false, resultReceived: false }), true)
  assert.equal(canStreamInputToClaudeRun({ query: {}, abortRequested: false, resultReceived: true }), false)
  assert.equal(canStreamInputToClaudeRun({ query: {}, abortRequested: true, resultReceived: false }), false)
  assert.equal(canStreamInputToClaudeRun({ query: null, abortRequested: false, resultReceived: false }), false)
})
