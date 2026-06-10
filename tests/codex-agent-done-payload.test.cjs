const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')

function runDonePayloadDefaultReasonTest() {
  const payload = __test__.buildCodexAgentDonePayload({
    sessionId: 'sess-1',
    cliSessionId: 'cli-1',
    filePath: 'D:/sessions/cli-1.jsonl',
  })

  assert.deepEqual(payload, {
    sessionId: 'sess-1',
    cliSessionId: 'cli-1',
    filePath: 'D:/sessions/cli-1.jsonl',
    reason: 'completed',
  })
}

function runDonePayloadExplicitReasonTest() {
  const payload = __test__.buildCodexAgentDonePayload({
    sessionId: 'sess-2',
    reason: 'aborted',
  })

  assert.deepEqual(payload, {
    sessionId: 'sess-2',
    cliSessionId: '',
    filePath: '',
    reason: 'aborted',
  })
}

function runDoneReasonResolutionTest() {
  assert.equal(__test__.resolveCodexDoneReasonFromError(new Error('Unable to locate Codex CLI')), 'failed')
  assert.equal(__test__.resolveCodexDoneReasonFromError(new Error('Missing optional dependency: codex')), 'failed')

  const abortErr = new Error('The operation was aborted')
  abortErr.name = 'AbortError'
  assert.equal(__test__.resolveCodexDoneReasonFromError(abortErr), 'aborted')

  assert.equal(__test__.resolveCodexDoneReasonFromError(new Error('unexpected failure')), 'failed')
}

function run() {
  runDonePayloadDefaultReasonTest()
  runDonePayloadExplicitReasonTest()
  runDoneReasonResolutionTest()
  console.log('codex agent done payload tests passed')
}

run()
