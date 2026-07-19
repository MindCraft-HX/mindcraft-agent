import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.window = globalThis.window || { electronAPI: {} }

import { useClaudeAgentStream } from '../packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js'
import { getTaskDebugSnapshot } from '../packages/agent/src/components/claudeCode/composables/useClaudeTaskState.mjs'

function createHarness() {
  let msgId = 0
  const tab = {
    id: 'chat-1',
    sessionId: 'sess-1',
    cwd: 'D:/repo',
    messages: [],
    thinking: false,
    currentAssistantId: null,
  }
  const projects = ref([{ id: 'proj-1', chats: [tab] }])
  const tabs = ref([tab])
  const saveCalls = []

  const stream = useClaudeAgentStream({
    tabs,
    projects,
    getActiveProjectId: () => 'proj-1',
    isPanelActive: ref(true),
    scrollBottom: () => {},
    saveHistory: (opts) => { saveCalls.push(opts || {}) },
    nextMsgId: () => `msg-${++msgId}`,
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
    inferToolFailureFromText: () => false,
    createToolMessage: (opts) => ({ id: `msg-${++msgId}`, role: 'tool', ...opts }),
    onCompactBoundary: () => {},
    onNewMessage: () => {},
    trimMessages: () => {},
    onBackgroundTaskDone: () => {},
    onPendingApproval: () => {},
  })

  return { tab, stream, saveCalls }
}

test('Claude task_notification completion closes runtime task and linked tool card', () => {
  const { tab, stream, saveCalls } = createHarness()

  tab.messages.push({
    id: 'tool-1',
    role: 'tool',
    toolName: 'Task',
    toolUseId: 'toolu-task-1',
    status: 'running',
    text: '{"description":"Investigate delete session freeze"}',
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-1',
      tool_use_id: 'toolu-task-1',
      description: 'Investigate delete session freeze',
    },
  })

  assert.equal(getTaskDebugSnapshot(tab).phase, 'running')
  assert.equal(tab._activeBackgroundTasks.length, 1)

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-1',
      tool_use_id: 'toolu-task-1',
      status: 'completed',
      summary: 'Finished investigation.',
    },
  })

  const snapshot = getTaskDebugSnapshot(tab)
  assert.equal(snapshot.phase, 'done')
  assert.equal(snapshot.runtimeSteps[0].status, 'completed')
  assert.equal(snapshot.runtimeSteps[0].description, 'Investigate delete session freeze')
  assert.equal(tab.messages[0].status, 'done')
  assert.equal(tab._activeBackgroundTasks.length, 0)
  assert.ok(saveCalls.some(call => call.immediate === true))
})

test('Claude task_notification stopped is terminal', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-2',
      description: 'Investigate input typing lag',
    },
  })
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-2',
      status: 'stopped',
      summary: 'Stopped by host.',
    },
  })

  const snapshot = getTaskDebugSnapshot(tab)
  assert.equal(snapshot.phase, 'done')
  assert.equal(snapshot.runtimeSteps[0].status, 'deleted')
  assert.equal(tab._activeBackgroundTasks.length, 0)
})

test('Claude background_tasks_changed replaces the current-session running snapshot', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [
        { task_id: 'background-1', description: 'Run tests' },
        { task_id: 'background-2', description: 'Inspect output' },
      ],
    },
  })

  assert.deepEqual(tab._activeBackgroundTasks, [
    { taskId: 'background-1', description: 'Run tests' },
    { taskId: 'background-2', description: 'Inspect output' },
  ])

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [],
    },
  })

  assert.deepEqual(tab._activeBackgroundTasks, [])
})
