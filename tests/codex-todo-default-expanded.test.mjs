import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.requestIdleCallback = globalThis.requestIdleCallback || ((cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0))
globalThis.window = globalThis.window || { electronAPI: {} }

import { useCodexAgentStream } from '../packages/agent/src/components/codeX/composables/useCodexAgentStream.js'

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
  const nextMsgId = () => `msg-${++msgId}`

  const stream = useCodexAgentStream({
    tabs,
    projects,
    getActiveProjectId: () => 'proj-1',
    isPanelActive: ref(true),
    onTaskDone: () => {},
    scrollBottom: () => {},
    saveHistory: () => {},
    nextMsgId,
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
    inferToolFailureFromText: () => false,
    createToolMessage: (opts) => ({ id: nextMsgId(), role: 'tool', ...opts }),
    onNewMessage: () => {},
    trimMessages: () => {},
    onCompactBoundary: () => {},
  })

  return { tab, stream }
}

test('todo_list tool message defaults to expanded', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'todo-1',
        type: 'todo_list',
        status: 'in_progress',
        items: [
          { id: 'a', content: 'Investigate diff rendering', status: 'completed' },
          { id: 'b', content: 'Fix planning default expansion', status: 'in_progress' },
        ],
      },
    },
  })

  const toolMessage = tab.messages.find(msg => msg.role === 'tool')
  assert.ok(toolMessage)
  assert.equal(toolMessage.toolName, 'todo_list')
  assert.equal(toolMessage.expanded, true)
  assert.equal(toolMessage.status, 'running')
})
