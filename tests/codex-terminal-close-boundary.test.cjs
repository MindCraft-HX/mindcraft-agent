const test = require('node:test')
const assert = require('node:assert/strict')

const {
  canStartCodexSessionRun,
  didCodexTranscriptAdvance,
  markCodexTerminalSeen,
  markCodexTransportClosed,
} = require('../packages/agent/electron/codex/runLifecycle')

test('logical terminal does not release a Codex run before transport closure', () => {
  const session = { streamClosed: false, terminalSeen: false }

  markCodexTerminalSeen(session)

  assert.equal(session.terminalSeen, true)
  assert.equal(session.streamClosed, false)
  assert.equal(canStartCodexSessionRun(session), false)
})

test('only transport closure releases a Codex run for the next input', () => {
  const session = { streamClosed: false, terminalSeen: true }

  markCodexTransportClosed(session)

  assert.equal(session.streamClosed, true)
  assert.equal(canStartCodexSessionRun(session), true)
})

test('abort requested still keeps a Codex run owned until transport closure', () => {
  const session = { streamClosed: false, abortRequested: true }

  assert.equal(canStartCodexSessionRun(session), false)
  markCodexTransportClosed(session)
  assert.equal(canStartCodexSessionRun(session), true)
})

test('only actual transcript growth counts as post-terminal watchdog activity', () => {
  const baseline = { size: 100, mtimeMs: 1000 }

  assert.equal(didCodexTranscriptAdvance(baseline, { size: 100, mtimeMs: 1000 }), false)
  assert.equal(didCodexTranscriptAdvance(baseline, { size: 120, mtimeMs: 1000 }), true)
  assert.equal(didCodexTranscriptAdvance(baseline, { size: 100, mtimeMs: 1100 }), true)
  assert.equal(didCodexTranscriptAdvance(null, { size: 120, mtimeMs: 1100 }), false)
})
