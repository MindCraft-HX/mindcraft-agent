import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.window = globalThis.window || { electronAPI: { flashTaskbar: () => {} } }

import { useClaudeAgentStream } from '../packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js'

function createHarness() {
  let msgId = 0
  let pendingApprovalCount = 0
  const tab = {
    id: 'chat-1',
    sessionId: 'sess-1',
    cwd: 'D:/repo',
    messages: [],
    thinking: false,
    currentAssistantId: null,
  }
  const tabs = ref([tab])
  const nextMsgId = () => `msg-${++msgId}`

  const stream = useClaudeAgentStream({
    tabs,
    projects: ref([{ id: 'proj-1', chats: [tab] }]),
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
    onPendingApproval: () => { pendingApprovalCount++ },
  })

  return { tab, stream, getPendingApprovalCount: () => pendingApprovalCount }
}

test('Claude permission pending triggers pending approval notification hook', () => {
  const { tab, stream, getPendingApprovalCount } = createHarness()

  stream.onAgentPermission({
    sessionId: 'sess-1',
    msg: {
      id: 'req-1',
      tool_name: 'Edit',
      description: 'Allow Claude to edit src/app.js?',
      input: { path: 'src/app.js' },
    },
  })

  assert.equal(getPendingApprovalCount(), 1)
  assert.equal(tab.thinking, true)
  assert.equal(tab.messages.length, 1)
  assert.equal(tab.messages[0].status, 'pending')
  assert.equal(tab.messages[0].requestId, 'req-1')
  assert.equal(tab.messages[0].toolName, 'Edit')
})
