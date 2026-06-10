import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.window = globalThis.window || { electronAPI: { flashTaskbar: () => {} } }

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
    taskState: undefined,
  }
  const tabs = ref([tab])
  const projects = ref([{ id: 'proj-1', chats: [tab] }])
  const nextMsgId = () => `msg-${++msgId}`

  const stream = useClaudeAgentStream({
    tabs,
    projects,
    getActiveProjectId: () => 'proj-1',
    isPanelActive: ref(true),
    scrollBottom: () => {},
    saveHistory: () => {},
    nextMsgId,
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
    inferToolFailureFromText: () => false,
    createToolMessage: (opts) => ({ id: nextMsgId(), role: 'tool', ...opts }),
    onCompactBoundary: () => {},
    onNewMessage: () => {},
    trimMessages: () => {},
  })

  return { tab, stream }
}

test('stream sync preserves TaskCreate real ids from toolUseResult for later global TaskUpdate ids', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'TaskCreate',
            input: { description: 'Create cache billing doc' },
          },
          {
            type: 'tool_use',
            id: 'call-2',
            name: 'TaskCreate',
            input: { description: 'Update import-models command' },
          },
        ],
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'user',
      toolUseResult: {
        task: { id: '9', subject: 'Create cache billing doc' },
      },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: 'Task #9 created successfully: Create cache billing doc',
          },
        ],
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'user',
      toolUseResult: {
        task: { id: '10', subject: 'Update import-models command' },
      },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-2',
            content: 'Task #10 created successfully: Update import-models command',
          },
        ],
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'update-9',
            name: 'TaskUpdate',
            input: { taskId: '9', status: 'completed' },
          },
          {
            type: 'tool_use',
            id: 'update-10',
            name: 'TaskUpdate',
            input: { taskId: '10', status: 'completed' },
          },
        ],
      },
    },
  })

  const snapshot = getTaskDebugSnapshot(tab)
  assert.deepEqual(snapshot.todos, [
    { id: '9', description: 'Create cache billing doc', status: 'completed' },
    { id: '10', description: 'Update import-models command', status: 'completed' },
  ])
  assert.equal(snapshot.phase, 'done')
})

test('stream sync keeps TaskUpdate statusChange results completed without replacing descriptions', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'create-1',
            name: 'TaskCreate',
            input: { description: 'Create release note' },
          },
        ],
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'user',
      toolUseResult: {
        task: { id: '1', subject: 'Create release note' },
      },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'create-1',
            content: 'Task #1 created successfully: Create release note',
          },
        ],
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'update-1',
            name: 'TaskUpdate',
            input: { taskId: '1', status: 'completed' },
          },
        ],
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'user',
      toolUseResult: {
        success: true,
        taskId: '1',
        updatedFields: ['status'],
        statusChange: {
          from: 'in_progress',
          to: 'completed',
        },
      },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'update-1',
            content: 'Updated task #1 status',
          },
        ],
      },
    },
  })

  const snapshot = getTaskDebugSnapshot(tab)
  assert.deepEqual(snapshot.todos, [
    { id: '1', description: 'Create release note', status: 'completed' },
  ])
  assert.equal(snapshot.phase, 'done')
})
