const test = require('node:test')
const assert = require('node:assert/strict')

const {
  armCodexTerminalCloseWatchdog,
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

test('terminal close watchdog force-closes only after logical completion grace expires', () => {
  let callback = null
  let forced = 0
  const session = { runId: 'run-1', streamClosed: false, terminalSeen: true }

  armCodexTerminalCloseWatchdog(session, {
    delayMs: 5000,
    onTimeout: () => { forced += 1 },
    setTimeoutImpl(fn, delayMs) {
      assert.equal(delayMs, 5000)
      callback = fn
      return 42
    },
    clearTimeoutImpl() {},
  })

  assert.equal(session.terminalCloseForced, undefined)
  assert.equal(canStartCodexSessionRun(session), false)

  callback()

  assert.equal(session.terminalCloseForced, true)
  assert.equal(forced, 1)
  assert.equal(canStartCodexSessionRun(session), false)
})

test('transport closure cancels a pending terminal close watchdog', () => {
  let callback = null
  let clearedTimer = null
  let forced = 0
  const session = { streamClosed: false, terminalSeen: true }

  armCodexTerminalCloseWatchdog(session, {
    delayMs: 5000,
    onTimeout: () => { forced += 1 },
    setTimeoutImpl(fn) {
      callback = fn
      return 84
    },
    clearTimeoutImpl(timer) { clearedTimer = timer },
  })

  markCodexTransportClosed(session)
  callback()

  assert.equal(clearedTimer, 84)
  assert.equal(forced, 0)
  assert.equal(session.terminalCloseForced, undefined)
})
