const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

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

function runDoneReasonFinalizationTest() {
  assert.equal(__test__.finalizeClaudeDoneReason({
    resultReceived: true,
    exitCode: 0,
    fallbackReason: 'interrupted',
  }), 'completed')

  assert.equal(__test__.finalizeClaudeDoneReason({
    resultReceived: false,
    exitCode: 0,
    sessionFileIntegrity: { hasDanglingToolUse: true },
  }), 'interrupted')

  assert.equal(__test__.finalizeClaudeDoneReason({
    resultReceived: false,
    exitCode: 0,
  }), 'interrupted')

  assert.equal(__test__.finalizeClaudeDoneReason({
    resultReceived: false,
    exitCode: -1,
  }), 'failed')

  assert.equal(__test__.finalizeClaudeDoneReason({
    resultReceived: false,
    exitCode: -1,
    fallbackReason: 'aborted',
  }), 'aborted')

  assert.equal(__test__.finalizeClaudeDoneReason({
    resultReceived: false,
    exitCode: 0,
    sessionFileIntegrity: { hasDanglingToolUse: true },
    fallbackReason: 'completed',
  }), 'interrupted')
}

function runJsonlIntegrityFileTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-jsonl-integrity-'))
  const filePath = path.join(dir, 'session.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'pwd' } }],
      },
    }),
    '',
  ].join('\n'), 'utf8')

  const integrity = __test__.analyzeClaudeJsonlFileIntegrity(filePath)

  assert.deepEqual(integrity, {
    hasResult: false,
    hasDanglingToolUse: true,
  })

  fs.rmSync(dir, { recursive: true, force: true })
}

function runJsonlIntegrityMultipleToolUseTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-jsonl-integrity-multi-'))
  const filePath = path.join(dir, 'session.jsonl')
  fs.writeFileSync(filePath, [
    JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_done', name: 'Read', input: { file_path: 'a.txt' } },
          { type: 'tool_use', id: 'toolu_open', name: 'Bash', input: { command: 'pytest' } },
        ],
      },
    }),
    JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_done', content: 'ok' }],
      },
    }),
    '',
  ].join('\n'), 'utf8')

  const integrity = __test__.analyzeClaudeJsonlFileIntegrity(filePath)

  assert.deepEqual(integrity, {
    hasResult: false,
    hasDanglingToolUse: true,
  })

  fs.rmSync(dir, { recursive: true, force: true })
}

function runDeleteSessionArtifactsDeletesMetaSidecarTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-session-artifacts-'))
  const filePath = path.join(dir, '11111111-1111-1111-1111-111111111111.jsonl')
  const metaPath = path.join(dir, '11111111-1111-1111-1111-111111111111.meta.json')
  fs.writeFileSync(filePath, '{}\n', 'utf8')
  fs.writeFileSync(metaPath, '{"model":"claude-sonnet"}\n', 'utf8')

  assert.equal(__test__.deleteClaudeSessionArtifacts(filePath), true)
  assert.equal(fs.existsSync(filePath), false)
  assert.equal(fs.existsSync(metaPath), false)

  fs.rmSync(dir, { recursive: true, force: true })
}

function runSessionMetaReadWriteTest() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-claude-meta-cwd-'))
  const cliSessionId = '22222222-2222-2222-2222-222222222222'

  assert.equal(__test__.writeClaudeSessionMeta(cwd, cliSessionId, {
    model: 'claude-sonnet-4-20250514',
    effort: 'max',
  }), true)

  assert.deepEqual(__test__.readClaudeSessionMeta(cwd, cliSessionId), {
    model: 'claude-sonnet-4-20250514',
    effort: 'xhigh',
  })

  const projectDir = path.dirname(__test__.buildClaudeAgentDonePayload({ cwd, cliSessionId }).filePath)
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(cwd, { recursive: true, force: true })
}

function runScanSessionsIncludesMetaTest() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-claude-scan-cwd-'))
  const cliSessionId = '33333333-3333-3333-3333-333333333333'
  const payload = __test__.buildClaudeAgentDonePayload({ cwd, cliSessionId })
  const projectDir = path.dirname(payload.filePath)
  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(payload.filePath, JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'hello' },
  }) + '\n', 'utf8')
  assert.equal(__test__.writeClaudeSessionMeta(cwd, cliSessionId, {
    model: 'claude-opus-4-20250514',
    effort: 'high',
  }), true)

  const sessions = __test__.scanCliSessionsForProject(cwd)
  const session = sessions.find(s => s.cliSessionId === cliSessionId)

  assert.equal(session.model, 'claude-opus-4-20250514')
  assert.equal(session.effort, 'high')

  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(cwd, { recursive: true, force: true })
}

function run() {
  runDonePayloadDefaultReasonTest()
  runDonePayloadFallbackPathTest()
  runDonePayloadExplicitReasonTest()
  runDoneReasonResolutionTest()
  runDoneReasonFinalizationTest()
  runJsonlIntegrityFileTest()
  runJsonlIntegrityMultipleToolUseTest()
  runDeleteSessionArtifactsDeletesMetaSidecarTest()
  runSessionMetaReadWriteTest()
  runScanSessionsIncludesMetaTest()
  console.log('claude agent done payload tests passed')
}

run()
