const assert = require('assert')

const {
  createClaudeBackgroundTaskTracker,
} = require('../packages/agent/electron/claude/backgroundTaskTracker')

function runTaskStartedAndNotificationCompletionTest() {
  const tracker = createClaudeBackgroundTaskTracker()

  assert.equal(tracker.updateFromSdkMessage({
    type: 'system',
    subtype: 'task_started',
    task_id: 'task-1',
    tool_use_id: 'toolu-1',
    description: 'Investigate freeze',
  }), 1)
  assert.equal(tracker.hasActiveTasks(), true)

  assert.equal(tracker.updateFromSdkMessage({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task-1',
    status: 'completed',
  }), 0)
  assert.equal(tracker.hasActiveTasks(), false)
}

function runTerminalStatusVariantsTest() {
  for (const status of ['failed', 'stopped']) {
    const tracker = createClaudeBackgroundTaskTracker()
    tracker.updateFromSdkMessage({ type: 'system', subtype: 'task_started', task_id: `task-${status}` })
    tracker.updateFromSdkMessage({ type: 'system', subtype: 'task_notification', task_id: `task-${status}`, status })
    assert.equal(tracker.getActiveCount(), 0)
  }

  for (const status of ['completed', 'failed', 'killed']) {
    const tracker = createClaudeBackgroundTaskTracker()
    tracker.updateFromSdkMessage({ type: 'system', subtype: 'task_started', task_id: `task-${status}` })
    tracker.updateFromSdkMessage({ type: 'system', subtype: 'task_updated', task_id: `task-${status}`, patch: { status } })
    assert.equal(tracker.getActiveCount(), 0)
  }
}

function runNonTerminalStatusDoesNotCompleteTest() {
  const tracker = createClaudeBackgroundTaskTracker()

  tracker.updateFromSdkMessage({ type: 'system', subtype: 'task_started', task_id: 'task-1' })
  tracker.updateFromSdkMessage({ type: 'system', subtype: 'task_notification', task_id: 'task-1', status: 'running' })

  assert.equal(tracker.getActiveCount(), 1)
}

function runPendingDonePayloadTest() {
  const tracker = createClaudeBackgroundTaskTracker()
  const payload = { sessionId: 'sess-1', reason: 'completed' }

  assert.equal(tracker.hasPendingDonePayload(), false)
  tracker.setPendingDonePayload(payload)
  assert.equal(tracker.hasPendingDonePayload(), true)
  assert.equal(tracker.takePendingDonePayload(), payload)
  assert.equal(tracker.hasPendingDonePayload(), false)
  assert.equal(tracker.takePendingDonePayload(), null)
}

runTaskStartedAndNotificationCompletionTest()
runTerminalStatusVariantsTest()
runNonTerminalStatusDoesNotCompleteTest()
runPendingDonePayloadTest()
