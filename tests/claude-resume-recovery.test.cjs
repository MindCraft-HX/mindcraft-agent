const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  analyzeClaudeResumeRecoveryEntries,
  inspectClaudeResumeRecovery,
} = require('../packages/agent/electron/claude/resumeRecovery')

function assistant(uuid, parentUuid, content, model = 'kimi-k3') {
  return {
    type: 'assistant',
    uuid,
    parentUuid,
    message: { role: 'assistant', model, content },
  }
}

function toolResult(uuid, parentUuid, toolUseId, extra = {}) {
  return {
    type: 'user',
    uuid,
    parentUuid,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
    },
    ...extra,
  }
}

function buildInterruptedBackgroundEntries() {
  return [
    assistant('safe-thinking', 'previous-user', [{ type: 'thinking', thinking: '' }]),
    assistant('background-command', 'safe-thinking', [{
      type: 'tool_use',
      id: 'tool-background',
      name: 'Bash',
      input: { command: 'npm test' },
    }]),
    toolResult('backgrounded-result', 'background-command', 'tool-background', {
      sourceToolAssistantUUID: 'background-command',
      toolUseResult: { backgroundTaskId: 'task-1' },
    }),
    assistant('wait-thinking', 'backgrounded-result', [{ type: 'thinking', thinking: '' }]),
    assistant('dangling-task-output', 'wait-thinking', [{
      type: 'tool_use',
      id: 'tool-task-output',
      name: 'TaskOutput',
      input: { task_id: 'task-1', block: true },
    }]),
  ]
}

function runInterruptedBackgroundCheckpointTest() {
  const analysis = analyzeClaudeResumeRecoveryEntries(buildInterruptedBackgroundEntries())
  assert.deepEqual(analysis, {
    checkpoint: {
      resumeSessionAt: 'safe-thinking',
      interruptedToolName: 'TaskOutput',
    },
    needsMoreHistory: false,
  })
}

function runSyntheticResumeLoopStillRecoversTest() {
  const entries = buildInterruptedBackgroundEntries()
  entries.push(
    {
      type: 'user',
      uuid: 'auto-continue',
      parentUuid: 'backgrounded-result',
      isMeta: true,
      message: { role: 'user', content: 'Continue from where you left off.' },
    },
    assistant('synthetic-no-response', 'auto-continue', [{ type: 'text', text: 'No response requested.' }], '<synthetic>'),
    {
      type: 'user',
      uuid: 'stopped-notification',
      parentUuid: 'synthetic-no-response',
      origin: { kind: 'task-notification' },
      message: {
        role: 'user',
        content: '<task-notification><status>stopped</status><summary>No completion record was found for this background shell command from the previous session.</summary></task-notification>',
      },
    },
    {
      type: 'user',
      uuid: 'unanswered-human',
      parentUuid: 'stopped-notification',
      message: { role: 'user', content: 'continue' },
    },
  )

  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'safe-thinking')
}

function runCompletedLaterAssistantStabilizesRecoveredBranchTest() {
  const entries = buildInterruptedBackgroundEntries()
  entries.push(assistant('later-response', 'backgrounded-result', [{ type: 'text', text: 'Recovered normally.' }]))
  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'later-response',
      interruptedToolName: 'TaskOutput',
    },
    needsMoreHistory: false,
  })
}

function runCompletedToolDoesNotRecoverTest() {
  const entries = [
    assistant('safe', 'user-1', [{ type: 'thinking', thinking: '' }]),
    assistant('tool', 'safe', [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }]),
    toolResult('tool-result', 'tool', 'tool-1'),
    assistant('answer', 'tool-result', [{ type: 'text', text: 'done' }]),
  ]
  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'answer',
      interruptedToolName: '',
    },
    needsMoreHistory: false,
  })
}

function runWrappedMessageEntriesRecoverTest() {
  const entries = buildInterruptedBackgroundEntries().map(entry => ({
    ...entry,
    type: 'message',
  }))
  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'safe-thinking')
}

function runOldOrphanNotificationDoesNotExpandAfterRecoveryTest() {
  const entries = [{
    type: 'user',
    uuid: 'old-notification',
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: 'No completion record was found for this background shell command from the previous session.',
    },
  }, assistant('later-answer', 'old-notification', [{ type: 'text', text: 'recovered' }])]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'later-answer',
      interruptedToolName: '',
    },
    needsMoreHistory: false,
  })
}

function runRuntimeWiringContractTest() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'packages', 'agent', 'electron', 'claudeAgent.js'),
    'utf8',
  )
  const start = source.indexOf('const resumeRecovery = resumedSessionId')
  const end = source.indexOf('const runQuery = async (rid)', start)
  const queryStart = source.indexOf('const q = query({', end)
  const queryEnd = source.indexOf('canUseTool:', queryStart)
  const recoverySetup = source.slice(start, end)
  const queryOptions = source.slice(queryStart, queryEnd)

  assert.ok(start >= 0 && end > start, 'resume recovery must run before query creation')
  assert.match(recoverySetup, /inspectClaudeResumeRecovery/)
  assert.match(queryOptions, /resumeSessionAt/)
  assert.doesNotMatch(queryOptions, /forkSession/, 'recovery must keep the existing provider session identity')
}

async function runFileInspectionTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-resume-recovery-'))
  const filePath = path.join(dir, 'session.jsonl')
  fs.writeFileSync(filePath, buildInterruptedBackgroundEntries().map(entry => JSON.stringify(entry)).join('\n') + '\n', 'utf8')

  assert.deepEqual(await inspectClaudeResumeRecovery(filePath), {
    resumeSessionAt: 'safe-thinking',
    interruptedToolName: 'TaskOutput',
  })

  fs.rmSync(dir, { recursive: true, force: true })
}

async function run() {
  runInterruptedBackgroundCheckpointTest()
  runSyntheticResumeLoopStillRecoversTest()
  runCompletedLaterAssistantStabilizesRecoveredBranchTest()
  runCompletedToolDoesNotRecoverTest()
  runWrappedMessageEntriesRecoverTest()
  runOldOrphanNotificationDoesNotExpandAfterRecoveryTest()
  runRuntimeWiringContractTest()
  await runFileInspectionTest()
  console.log('claude resume recovery tests passed')
}

run()
