const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-codex-session-path-'))
  try {
    run(dir)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
}

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
    detachResume: false,
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
    detachResume: false,
  })
}

function runDonePayloadDetachResumeTest() {
  const payload = __test__.buildCodexAgentDonePayload({
    sessionId: 'sess-3',
    cliSessionId: 'cli-bad',
    filePath: 'D:/sessions/cli-bad.jsonl',
    reason: 'failed',
    detachResume: true,
  })

  assert.deepEqual(payload, {
    sessionId: 'sess-3',
    cliSessionId: 'cli-bad',
    filePath: 'D:/sessions/cli-bad.jsonl',
    reason: 'failed',
    detachResume: true,
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

function runResolveSessionFilePathTest() {
  withTempDir((dir) => {
    const oldDir = path.join(dir, 'sessions-old')
    const sessionsDir = path.join(dir, 'sessions')
    fs.mkdirSync(path.join(sessionsDir, '2026', '06', '19'), { recursive: true })
    fs.mkdirSync(oldDir, { recursive: true })

    const threadId = '019eddd4-922c-70a2-b0d5-7446c28a1718'
    const fakePath = path.join(sessionsDir, `${threadId}.jsonl`)
    const realPath = path.join(sessionsDir, '2026', '06', '19', `rollout-2026-06-19T11-02-36-${threadId}.jsonl`)
    fs.writeFileSync(realPath, '{}\n', 'utf8')

    __test__.setSessionsDirForTest(sessionsDir)
    try {
      assert.equal(__test__.resolveCodexSessionFilePath({
        sessionId: 'chat-key-1',
        cliSessionId: threadId,
        fallbackFilePath: fakePath,
      }), realPath)
    } finally {
      __test__.setSessionsDirForTest(oldDir)
    }
  })
}

function run() {
  runDonePayloadDefaultReasonTest()
  runDonePayloadExplicitReasonTest()
  runDonePayloadDetachResumeTest()
  runDoneReasonResolutionTest()
  runResolveSessionFilePathTest()
  console.log('codex agent done payload tests passed')
}

run()
