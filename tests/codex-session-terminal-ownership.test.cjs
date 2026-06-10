const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')

function runCurrentRunCanEmitTerminalSignalsTest() {
  const sessions = new Map()
  sessions.set('sid-1', { runId: 'run-current' })

  assert.equal(
    __test__.shouldEmitCodexSessionTerminalSignals(sessions, 'sid-1', 'run-current'),
    true
  )
}

function runOldRunCannotEmitTerminalSignalsAfterReplacementTest() {
  const sessions = new Map()
  sessions.set('sid-1', { runId: 'run-new' })

  assert.equal(
    __test__.shouldEmitCodexSessionTerminalSignals(sessions, 'sid-1', 'run-old'),
    false
  )
}

function runMissingSessionCannotEmitTerminalSignalsTest() {
  const sessions = new Map()

  assert.equal(
    __test__.shouldEmitCodexSessionTerminalSignals(sessions, 'sid-1', 'run-missing'),
    false
  )
}

function run() {
  runCurrentRunCanEmitTerminalSignalsTest()
  runOldRunCannotEmitTerminalSignalsAfterReplacementTest()
  runMissingSessionCannotEmitTerminalSignalsTest()
  console.log('codex session terminal ownership tests passed')
}

run()
