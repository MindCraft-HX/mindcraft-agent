const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/claudeAgent.js')

function runDonePayloadDefaultReasonTest() {
  const payload = __test__.buildClaudeAgentDonePayload({
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

function runDonePayloadFallbackPathTest() {
  const payload = __test__.buildClaudeAgentDonePayload({
    sessionId: 'sess-2',
    cliSessionId: '11111111-1111-1111-1111-111111111111',
    cwd: 'D:/repo/demo',
  })

  assert.equal(payload.sessionId, 'sess-2')
  assert.equal(payload.cliSessionId, '11111111-1111-1111-1111-111111111111')
  assert.equal(payload.filePath, 'C:\\Users\\hanso\\.claude\\projects\\D--repo-demo\\11111111-1111-1111-1111-111111111111.jsonl')
  assert.equal(payload.reason, 'completed')
}

function runDonePayloadExplicitReasonTest() {
  const payload = __test__.buildClaudeAgentDonePayload({
    sessionId: 'sess-3',
    reason: 'aborted',
  })

  assert.deepEqual(payload, {
    sessionId: 'sess-3',
    cliSessionId: '',
    filePath: '',
    reason: 'aborted',
  })
}

function runDoneReasonResolutionTest() {
  const abortErr = new Error('The operation was aborted')
  abortErr.name = 'AbortError'
  assert.equal(__test__.resolveClaudeDoneReasonFromError(abortErr), 'aborted')
  assert.equal(__test__.resolveClaudeDoneReasonFromError(new Error('unexpected failure')), 'failed')
}

function run() {
  runDonePayloadDefaultReasonTest()
  runDonePayloadFallbackPathTest()
  runDonePayloadExplicitReasonTest()
  runDoneReasonResolutionTest()
  console.log('claude agent done payload tests passed')
}

run()
