import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.window = globalThis.window || { electronAPI: {} }

import { useClaudeAgentStream } from '../packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js'

const questionInput = {
  questions: [{ question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }],
}

function createHarness() {
  let msgId = 0
  const runModeChanges = []
  const tab = {
    id: 'chat-1',
    sessionId: 'chat-1',
    cwd: 'D:/repo',
    messages: [],
    thinking: true,
    currentAssistantId: null,
  }
  const stream = useClaudeAgentStream({
    tabs: ref([tab]),
    projects: ref([{ id: 'project-1', chats: [tab] }]),
    getActiveProjectId: () => 'project-1',
    isPanelActive: ref(true),
    scrollBottom: () => {},
    saveHistory: () => {},
    nextMsgId: () => `msg-${++msgId}`,
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
    inferToolFailureFromText: () => false,
    createToolMessage: opts => ({ id: `msg-${++msgId}`, role: 'tool', ...opts }),
    onNewMessage: () => {},
    trimMessages: () => {},
    onRunModeChanged: (changedTab, runMode) => runModeChanges.push({ changedTab, runMode }),
  })
  return { tab, stream, runModeChanges }
}

function streamAskTool(stream) {
  stream.onAgentMessage({
    sessionId: 'chat-1',
    msg: {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 'tool-1',
          name: 'AskUserQuestion',
          input: questionInput,
        }],
      },
    },
  })
}

function receiveAskRequest(stream) {
  return stream.onAgentAskQuestion({
    sessionId: 'chat-1',
    requestId: 'request-1',
    toolUseId: 'tool-1',
    questions: questionInput.questions,
  })
}

test('AskUserQuestion merges into the streamed tool card when tool stream arrives first', () => {
  const { tab, stream } = createHarness()
  streamAskTool(stream)

  const interactiveMessage = receiveAskRequest(stream)

  assert.equal(tab.messages.length, 1)
  assert.equal(interactiveMessage.id, tab.messages[0].id)
  assert.equal(interactiveMessage.toolUseId, 'tool-1')
  assert.equal(interactiveMessage.requestId, 'request-1')
  assert.equal(interactiveMessage.status, 'pending')
})

test('AskUserQuestion keeps one interactive card when request IPC arrives first', () => {
  const { tab, stream } = createHarness()
  const interactiveMessage = receiveAskRequest(stream)

  streamAskTool(stream)

  assert.equal(tab.messages.length, 1)
  assert.equal(tab.messages[0].id, interactiveMessage.id)
  assert.equal(interactiveMessage.requestId, 'request-1')
  assert.deepEqual(JSON.parse(interactiveMessage.text), questionInput)
})

test('SDK-reported native Plan mode synchronizes the app run mode', () => {
  const { tab, stream, runModeChanges } = createHarness()
  tab.runMode = 'edit_automatically'

  stream.onAgentMessage({
    sessionId: 'chat-1',
    msg: { type: 'system', subtype: 'status', status: 'requesting', permissionMode: 'plan' },
  })

  assert.equal(tab.runMode, 'plan_mode')
  assert.equal(runModeChanges.length, 1)
  assert.equal(runModeChanges[0].changedTab.sessionId, tab.sessionId)
  assert.equal(runModeChanges[0].runMode, 'plan_mode')
})

test('SDK default mode does not collapse distinct app permission modes', () => {
  const { tab, stream, runModeChanges } = createHarness()
  tab.runMode = 'ask_before_edits'

  stream.onAgentMessage({
    sessionId: 'chat-1',
    msg: { type: 'system', subtype: 'status', status: 'requesting', permissionMode: 'default' },
  })

  assert.equal(tab.runMode, 'ask_before_edits')
  assert.equal(runModeChanges.length, 0)
})
