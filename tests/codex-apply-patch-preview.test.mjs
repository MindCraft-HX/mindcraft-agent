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
    isWriteTool: (name) => ['write', 'write_file'].includes(String(name || '').toLowerCase()),
    isEditTool: (name) => ['edit', 'str_replace', 'str_replace_editor'].includes(String(name || '').toLowerCase()),
    isBashTool: (name) => ['shell', 'bash', 'execute'].includes(String(name || '').toLowerCase()),
    isReadTool: (name) => ['read', 'read_file'].includes(String(name || '').toLowerCase()),
    inferToolFailureFromText: () => false,
    createToolMessage: (opts) => ({ id: nextMsgId(), role: 'tool', ...opts }),
    onNewMessage: () => {},
    trimMessages: () => {},
    onCompactBoundary: () => {},
  })

  return { tab, stream }
}

test('apply_patch preview remains visible after file_change completion arrives', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-apply-1',
        type: 'custom_tool_call',
        call_id: 'call-apply-1',
        name: 'apply_patch',
        input: [
          '*** Begin Patch',
          '*** Update File: docs/TODO.md',
          '@@',
          '-old line',
          '+new line',
          '*** End Patch',
        ].join('\n'),
        status: 'in_progress',
      },
    },
  })

  let toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolUseId, 'call-apply-1')
  assert.equal(toolMessages[0].rawType, 'apply_patch')
  assert.equal(toolMessages[0]._fileChanges?.[0]?.path, 'docs/TODO.md')
  assert.equal(toolMessages[0]._fileChanges?.[0]?._diffHunks?.length, 1)

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'tool-file-change-1',
        type: 'file_change',
        call_id: 'call-apply-1',
        status: 'completed',
        changes: [
          {
            path: 'docs/TODO.md',
            kind: 'update',
          },
        ],
      },
    },
  })

  toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolUseId, 'call-apply-1')
  assert.equal(toolMessages[0].filePath, 'docs/TODO.md')
  assert.equal(toolMessages[0]._fileChanges?.[0]?.path, 'docs/TODO.md')
  assert.equal(toolMessages[0]._fileChanges?.[0]?._diffHunks?.length, 1)
  assert.equal(toolMessages[0].status, 'done')
})

test('apply_patch add-file preview is preserved after weak file_change arrives', () => {
  const { tab, stream } = createHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-apply-add-1',
        type: 'custom_tool_call',
        call_id: 'call-apply-add-1',
        name: 'apply_patch',
        input: [
          '*** Begin Patch',
          '*** Add File: docs/NEW-FEATURE.md',
          '+# New Feature',
          '+Added from patch',
          '*** End Patch',
        ].join('\n'),
        status: 'in_progress',
      },
    },
  })

  let toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolUseId, 'call-apply-add-1')
  assert.equal(toolMessages[0]._fileChanges?.[0]?.path, 'docs/NEW-FEATURE.md')
  assert.equal(toolMessages[0]._fileChanges?.[0]?.operation, 'add')
  assert.equal(toolMessages[0]._fileChanges?.[0]?._diffHunks?.length, 1)

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'tool-file-change-add-1',
        type: 'file_change',
        call_id: 'call-apply-add-1',
        status: 'completed',
        changes: [
          {
            path: 'docs/NEW-FEATURE.md',
            kind: 'add',
          },
        ],
      },
    },
  })

  toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].filePath, 'docs/NEW-FEATURE.md')
  assert.equal(toolMessages[0]._fileChanges?.[0]?.path, 'docs/NEW-FEATURE.md')
  assert.equal(toolMessages[0]._fileChanges?.[0]?.operation, 'add')
  assert.equal(toolMessages[0]._fileChanges?.[0]?._diffHunks?.length, 1)
  assert.equal(toolMessages[0].status, 'done')
})
