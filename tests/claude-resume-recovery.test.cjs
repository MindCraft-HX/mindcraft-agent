const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  analyzeClaudeResumeRecoveryEntries,
  inspectClaudeResumeRecovery,
} = require('../packages/agent/electron/claude/resumeRecovery')

function assistant(uuid, parentUuid, content, model = 'kimi-k3', stopReason = '') {
  return {
    type: 'assistant',
    uuid,
    parentUuid,
    message: { role: 'assistant', model, content, ...(stopReason ? { stop_reason: stopReason } : {}) },
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

function taskNotification(uuid, parentUuid, taskId, status) {
  return {
    type: 'user',
    uuid,
    parentUuid,
    origin: { kind: 'task-notification' },
    message: {
      role: 'user',
      content: `<task-notification><task-id>${taskId}</task-id><status>${status}</status></task-notification>`,
    },
  }
}

function lastPrompt(leafUuid) {
  return { type: 'last-prompt', lastPrompt: 'previous prompt', leafUuid }
}

function buildInterruptedBackgroundEntries() {
  return [
    assistant('stable-answer', 'previous-user', [{ type: 'text', text: 'Background checks started.' }], 'kimi-k3', 'end_turn'),
    assistant('unsafe-thinking', 'stable-answer', [{ type: 'thinking', thinking: 'Waiting for output.' }], 'kimi-k3', 'tool_use'),
    assistant('background-command', 'unsafe-thinking', [{
      type: 'tool_use',
      id: 'tool-background',
      name: 'Bash',
      input: { command: 'npm test' },
    }], 'kimi-k3', 'tool_use'),
    toolResult('backgrounded-result', 'background-command', 'tool-background', {
      sourceToolAssistantUUID: 'background-command',
      toolUseResult: { backgroundTaskId: 'task-1' },
    }),
    assistant('wait-thinking', 'backgrounded-result', [{ type: 'thinking', thinking: '' }], 'kimi-k3', 'tool_use'),
    assistant('dangling-task-output', 'wait-thinking', [{
      type: 'tool_use',
      id: 'tool-task-output',
      name: 'TaskOutput',
      input: { task_id: 'task-1', block: true },
    }], 'kimi-k3', 'tool_use'),
  ]
}

function runInterruptedBackgroundCheckpointTest() {
  const analysis = analyzeClaudeResumeRecoveryEntries(buildInterruptedBackgroundEntries())
  assert.deepEqual(analysis, {
    checkpoint: {
      resumeSessionAt: 'stable-answer',
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

  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'stable-answer')
}

function runCompletedAnswerAfterBackgroundCommandRemainsTheCheckpointTest() {
  const entries = buildInterruptedBackgroundEntries()
  entries.push(assistant('later-response', 'backgrounded-result', [{ type: 'text', text: 'Recovered normally.' }], 'kimi-k3', 'end_turn'))
  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'later-response',
      interruptedToolName: 'Bash',
    },
    needsMoreHistory: false,
  })
}

function runCompletedToolDoesNotRecoverTest() {
  const entries = [
    assistant('safe', 'user-1', [{ type: 'text', text: 'Starting.' }], 'kimi-k3', 'end_turn'),
    assistant('tool', 'safe', [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }]),
    toolResult('tool-result', 'tool', 'tool-1'),
    assistant('answer', 'tool-result', [{ type: 'text', text: 'done' }], 'kimi-k3', 'end_turn'),
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
  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'stable-answer')
}

function runIncompleteTextDoesNotBecomeCheckpointTest() {
  const entries = [
    assistant('stable-answer', 'user-1', [{ type: 'text', text: 'Stable response.' }], 'kimi-k3', 'end_turn'),
    { type: 'user', uuid: 'user-2', parentUuid: 'stable-answer', message: { role: 'user', content: 'Inspect this.' } },
    assistant('thinking-fragment', 'user-2', [{ type: 'thinking', thinking: 'Working.' }], 'kimi-k3', 'tool_use'),
    assistant('incomplete-text', 'thinking-fragment', [{ type: 'text', text: 'I will inspect this.' }], 'kimi-k3', 'tool_use'),
    assistant('grep-call', 'incomplete-text', [{ type: 'tool_use', id: 'grep-1', name: 'Grep', input: {} }], 'kimi-k3', 'tool_use'),
    toolResult('grep-result', 'grep-call', 'grep-1'),
  ]

  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'stable-answer')
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
  }, assistant('later-answer', 'old-notification', [{ type: 'text', text: 'recovered' }], 'kimi-k3', 'end_turn')]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'later-answer',
      interruptedToolName: '',
    },
    needsMoreHistory: false,
  })
}

function runFileOrderBranchDoesNotOverrideCanonicalParentChainTest() {
  const entries = [
    assistant('stable-answer', 'user-1', [{ type: 'text', text: 'Stable response.' }], 'kimi-k3', 'end_turn'),
    assistant('tool-call', 'stable-answer', [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }], 'kimi-k3', 'tool_use'),
    toolResult('tool-result', 'tool-call', 'tool-1'),
    { type: 'attachment', uuid: 'canonical-attachment', parentUuid: 'tool-result' },
    { type: 'user', uuid: 'branch-user', parentUuid: 'stable-answer', message: { role: 'user', content: 'continue' } },
    assistant('branch-thinking', 'branch-user', [{ type: 'thinking', thinking: 'Working.' }], 'kimi-k3', 'tool_use'),
    assistant('branch-fragment', 'branch-thinking', [{ type: 'text', text: 'Partial response.' }], 'kimi-k3', 'tool_use'),
    { type: 'user', uuid: 'latest-user', parentUuid: 'canonical-attachment', message: { role: 'user', content: 'retry' } },
  ]

  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'stable-answer')
}

function runMissingParentRequestsMoreTailHistoryTest() {
  const entries = [{
    type: 'user',
    uuid: 'tail-user',
    parentUuid: 'outside-current-tail',
    message: { role: 'user', content: 'continue' },
  }]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: null,
    needsMoreHistory: true,
  })
}

function runUnresolvedAsyncAgentRollsBackBeforeLaunchTest() {
  const entries = [
    assistant('stable-answer', 'user-1', [{ type: 'text', text: 'Stable response.' }], 'kimi-k3', 'end_turn'),
    { type: 'user', uuid: 'review-user', parentUuid: 'stable-answer', message: { role: 'user', content: 'Review this.' } },
    assistant('launch-thinking', 'review-user', [{ type: 'thinking', thinking: 'Launching.' }], 'kimi-k3', 'tool_use'),
    assistant('agent-launch', 'launch-thinking', [{ type: 'tool_use', id: 'agent-tool', name: 'Agent', input: {} }], 'kimi-k3', 'tool_use'),
    toolResult('agent-result', 'agent-launch', 'agent-tool', {
      sourceToolAssistantUUID: 'agent-launch',
      toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'agent-1' },
    }),
    assistant('running-answer', 'agent-result', [{ type: 'text', text: 'Agent is running.' }], 'kimi-k3', 'end_turn'),
    { type: 'user', uuid: 'retry-user', parentUuid: 'running-answer', message: { role: 'user', content: 'continue' } },
  ]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'stable-answer',
      interruptedToolName: 'Agent',
    },
    needsMoreHistory: false,
  })
}

function runCompletedLeafOverridesOldUnresolvedAgentTest() {
  const entries = [
    assistant('stable-answer', 'user-1', [{ type: 'text', text: 'Stable response.' }], 'kimi-k3', 'end_turn'),
    { type: 'user', uuid: 'review-user', parentUuid: 'stable-answer', message: { role: 'user', content: 'Review this.' } },
    assistant('agent-launch', 'review-user', [{ type: 'tool_use', id: 'agent-tool', name: 'Agent', input: {} }], 'kimi-k3', 'tool_use'),
    toolResult('agent-result', 'agent-launch', 'agent-tool', {
      sourceToolAssistantUUID: 'agent-launch',
      toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'agent-1' },
    }),
    assistant('complete-review', 'agent-result', [{ type: 'text', text: 'Here are all review findings.' }], 'kimi-k3', 'end_turn'),
    lastPrompt('complete-review'),
  ]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: null,
    needsMoreHistory: false,
  })
}

function runStaleCompletedLeafDoesNotHideNewInterruptedTurnTest() {
  const entries = [
    assistant('complete-answer', 'user-1', [{ type: 'text', text: 'Previous turn complete.' }], 'kimi-k3', 'end_turn'),
    lastPrompt('complete-answer'),
    { type: 'user', uuid: 'new-user', parentUuid: 'complete-answer', message: { role: 'user', content: 'Continue.' } },
    assistant('new-tool', 'new-user', [{ type: 'tool_use', id: 'new-tool-use', name: 'Read', input: {} }], 'kimi-k3', 'tool_use'),
  ]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'complete-answer',
      interruptedToolName: 'Read',
    },
    needsMoreHistory: false,
  })
}

function runCompletedLeafOutsideTailRequestsMoreHistoryTest() {
  assert.deepEqual(analyzeClaudeResumeRecoveryEntries([lastPrompt('outside-tail')]), {
    checkpoint: null,
    needsMoreHistory: true,
  })
}

function runCompletedAsyncAgentKeepsLatestStableHeadTest() {
  const entries = [
    assistant('stable-answer', 'user-1', [{ type: 'text', text: 'Stable response.' }], 'kimi-k3', 'end_turn'),
    assistant('agent-launch', 'stable-answer', [{ type: 'tool_use', id: 'agent-tool', name: 'Agent', input: {} }], 'kimi-k3', 'tool_use'),
    toolResult('agent-result', 'agent-launch', 'agent-tool', {
      sourceToolAssistantUUID: 'agent-launch',
      toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'agent-1' },
    }),
    taskNotification('agent-completed', 'agent-result', 'agent-1', 'completed'),
    assistant('latest-answer', 'agent-completed', [{ type: 'text', text: 'Review complete.' }], 'kimi-k3', 'end_turn'),
  ]

  assert.equal(analyzeClaudeResumeRecoveryEntries(entries).checkpoint.resumeSessionAt, 'latest-answer')
}

function runAbandonedAsyncBranchDoesNotRollbackCurrentBranchTest() {
  const entries = [
    assistant('stable-answer', 'user-1', [{ type: 'text', text: 'Stable response.' }], 'kimi-k3', 'end_turn'),
    { type: 'user', uuid: 'abandoned-user', parentUuid: 'stable-answer', message: { role: 'user', content: 'Run a review.' } },
    assistant('abandoned-launch', 'abandoned-user', [{ type: 'tool_use', id: 'agent-tool', name: 'Agent', input: {} }], 'kimi-k3', 'tool_use'),
    toolResult('abandoned-result', 'abandoned-launch', 'agent-tool', {
      sourceToolAssistantUUID: 'abandoned-launch',
      toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'agent-abandoned' },
    }),
    { type: 'user', uuid: 'current-user', parentUuid: 'stable-answer', message: { role: 'user', content: 'Use the current branch.' } },
    assistant('current-answer', 'current-user', [{ type: 'text', text: 'Current branch complete.' }], 'kimi-k3', 'end_turn'),
  ]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: {
      resumeSessionAt: 'current-answer',
      interruptedToolName: '',
    },
    needsMoreHistory: false,
  })
}

function runStoppedNotificationWithoutLaunchRequestsMoreHistoryTest() {
  const entries = [
    taskNotification('agent-stopped', 'outside-current-tail', 'agent-1', 'stopped'),
    { type: 'user', uuid: 'retry-user', parentUuid: 'agent-stopped', message: { role: 'user', content: 'continue' } },
  ]

  assert.deepEqual(analyzeClaudeResumeRecoveryEntries(entries), {
    checkpoint: null,
    needsMoreHistory: true,
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
    resumeSessionAt: 'stable-answer',
    interruptedToolName: 'TaskOutput',
  })

  fs.rmSync(dir, { recursive: true, force: true })
}

async function run() {
  runInterruptedBackgroundCheckpointTest()
  runSyntheticResumeLoopStillRecoversTest()
  runCompletedAnswerAfterBackgroundCommandRemainsTheCheckpointTest()
  runCompletedToolDoesNotRecoverTest()
  runWrappedMessageEntriesRecoverTest()
  runIncompleteTextDoesNotBecomeCheckpointTest()
  runOldOrphanNotificationDoesNotExpandAfterRecoveryTest()
  runFileOrderBranchDoesNotOverrideCanonicalParentChainTest()
  runMissingParentRequestsMoreTailHistoryTest()
  runUnresolvedAsyncAgentRollsBackBeforeLaunchTest()
  runCompletedLeafOverridesOldUnresolvedAgentTest()
  runStaleCompletedLeafDoesNotHideNewInterruptedTurnTest()
  runCompletedLeafOutsideTailRequestsMoreHistoryTest()
  runCompletedAsyncAgentKeepsLatestStableHeadTest()
  runAbandonedAsyncBranchDoesNotRollbackCurrentBranchTest()
  runStoppedNotificationWithoutLaunchRequestsMoreHistoryTest()
  runRuntimeWiringContractTest()
  await runFileInspectionTest()
  console.log('claude resume recovery tests passed')
}

run()
