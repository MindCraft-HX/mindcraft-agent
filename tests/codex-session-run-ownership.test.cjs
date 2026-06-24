const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')

function runOldTurnCannotDeleteNewTurnTest() {
  const sessions = new Map()
  sessions.set('sid-1', { runId: 'run-new' })

  const deleted = __test__.deleteCodexSessionRunIfCurrent(sessions, 'sid-1', 'run-old')

  assert.equal(deleted, false)
  assert.deepEqual(sessions.get('sid-1'), { runId: 'run-new' })
}

function runCurrentTurnDeletesItselfTest() {
  const sessions = new Map()
  sessions.set('sid-1', { runId: 'run-current' })

  const deleted = __test__.deleteCodexSessionRunIfCurrent(sessions, 'sid-1', 'run-current')

  assert.equal(deleted, true)
  assert.equal(sessions.has('sid-1'), false)
}

function runCompletedTurnCanBeReplacedTest() {
  assert.equal(__test__.canStartCodexSessionRun(null), true)
  assert.equal(__test__.canStartCodexSessionRun({ doneSent: true, streamClosed: true }), true)
  assert.equal(__test__.canStartCodexSessionRun({ resultReceived: true, streamClosed: true }), true)
  assert.equal(__test__.canStartCodexSessionRun({ doneSent: true, resultReceived: true, streamClosed: false }), false)
  assert.equal(__test__.canStartCodexSessionRun({ doneSent: false, resultReceived: false, streamClosed: false }), false)
}

async function runTerminalTurnWaitsForCloseTest() {
  let resolveCompletion = null
  const completionPromise = new Promise((resolve) => { resolveCompletion = resolve })
  const existing = { streamClosed: false, completionPromise }

  const pending = __test__.waitForCodexSessionRunToClose(existing, 20)
  existing.streamClosed = true
  resolveCompletion()

  const closed = await pending
  assert.equal(closed, true)
}

function runFinalizeSilentFailureStateTest() {
  assert.deepEqual(
    __test__.finalizeCodexSessionDoneState({ resultReceived: false, doneReason: 'completed' }),
    { doneReason: 'failed', shouldSendSilentFailureMessage: true }
  )
  assert.deepEqual(
    __test__.finalizeCodexSessionDoneState({ resultReceived: true, doneReason: 'completed' }),
    { doneReason: 'completed', shouldSendSilentFailureMessage: false }
  )
}

async function runCloseSessionRunMarksClosedAndResolvesCompletionTest() {
  let resolved = false
  let resolveCompletion = null
  const completionPromise = new Promise((resolve) => {
    resolveCompletion = () => {
      resolved = true
      resolve()
    }
  })
  const session = {
    streamClosed: false,
    resultReceived: false,
    doneSent: false,
    __turnTimeout: setTimeout(() => {}, 1000),
    __bootWatch: setTimeout(() => {}, 1000),
    resolveCompletion,
  }

  __test__.closeCodexSessionRun(session, {
    resultReceived: true,
    doneSent: true,
  })
  await completionPromise

  assert.equal(session.streamClosed, true)
  assert.equal(session.resultReceived, true)
  assert.equal(session.doneSent, true)
  assert.equal(session.__turnTimeout, null)
  assert.equal(session.__bootWatch, null)
  assert.equal(resolved, true)
}

function runDoneSentDoesNotMarkStreamClosedTest() {
  const session = { doneSent: false, streamClosed: false }

  __test__.markCodexSessionDoneSent(session)

  assert.equal(session.doneSent, true)
  assert.equal(session.streamClosed, false)
  assert.equal(__test__.canStartCodexSessionRun(session), false)
}

function runFindSlashCommandSessionByCliIdTest() {
  const sessions = new Map([
    ['sid-1', { runId: 'run-1', thread: { id: 'cli-1' }, streamClosed: false }],
  ])
  const cliSessionIds = new Map([['sid-1', 'cli-1']])

  assert.equal(__test__.findCodexSessionForSlashCommands(sessions, cliSessionIds, 'cli-1')?.runId, 'run-1')
  assert.equal(__test__.findCodexSessionForSlashCommands(sessions, cliSessionIds, 'missing'), null)
}

function runCodexResumeFingerprintTest() {
  const same = __test__.buildCodexSessionFingerprint({
    model: 'deepseek-v4-pro',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    apiFormat: 'chat',
    reasoningEffort: 'high',
  })
  const sameAgain = __test__.buildCodexSessionFingerprint({
    model: 'deepseek-v4-pro',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    apiFormat: 'chat',
    reasoningEffort: 'high',
  })
  const changedModel = __test__.buildCodexSessionFingerprint({
    model: 'kimi-k2.7-code',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    apiFormat: 'chat',
    reasoningEffort: 'high',
  })
  const changedFormat = __test__.buildCodexSessionFingerprint({
    model: 'deepseek-v4-pro',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    apiFormat: 'responses',
    reasoningEffort: 'high',
  })

  assert.equal(__test__.shouldResumeCodexSession({
    previousFingerprint: same,
    nextFingerprint: sameAgain,
    previousCliId: 'cli-1',
  }), true)

  assert.equal(__test__.shouldResumeCodexSession({
    previousFingerprint: same,
    nextFingerprint: changedModel,
    previousCliId: 'cli-1',
  }), false)

  assert.equal(__test__.shouldResumeCodexSession({
    previousFingerprint: same,
    nextFingerprint: changedFormat,
    previousCliId: 'cli-1',
  }), false)

  assert.equal(__test__.shouldResumeCodexSession({
    previousFingerprint: same,
    nextFingerprint: sameAgain,
    previousCliId: '',
  }), false)
}

function runEmptyUpstreamFailureDetectionTest() {
  assert.equal(__test__.isEmptyUpstreamCodexFailure({
    type: 'turn.failed',
    error: { type: 'empty_upstream_response', message: 'Empty response from upstream chat API' },
  }), true)
  assert.equal(__test__.isEmptyUpstreamCodexFailure({
    type: 'turn.failed',
    payload: { error: { type: 'empty_upstream_response' } },
  }), true)
  assert.equal(__test__.isEmptyUpstreamCodexFailure({
    type: 'turn.failed',
    error: { type: 'upstream_connection_error' },
  }), false)
}

async function run() {
  runOldTurnCannotDeleteNewTurnTest()
  runCurrentTurnDeletesItselfTest()
  runCompletedTurnCanBeReplacedTest()
  await runTerminalTurnWaitsForCloseTest()
  runFinalizeSilentFailureStateTest()
  await runCloseSessionRunMarksClosedAndResolvesCompletionTest()
  runDoneSentDoesNotMarkStreamClosedTest()
  runFindSlashCommandSessionByCliIdTest()
  runCodexResumeFingerprintTest()
  runEmptyUpstreamFailureDetectionTest()
  console.log('codex session run ownership tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
