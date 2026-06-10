import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { buildFunctionCallToolState } from '../packages/agent/src/components/codeX/utils/functionCallToolPreview.mjs'
import { useCodexAgentStream } from '../packages/agent/src/components/codeX/composables/useCodexAgentStream.js'

test('write function_call exposes filePath and newContent for new file preview', () => {
  const state = buildFunctionCallToolState({
    toolName: 'write',
    args: {
      path: 'src/demo.ts',
      content: 'export const demo = 1\n',
    },
    isWriteTool: (name) => ['write', 'write_file'].includes(String(name || '').toLowerCase()),
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
  })

  assert.equal(state.filePath, 'src/demo.ts')
  assert.equal(state.newContent, 'export const demo = 1\n')
  assert.deepEqual(state.diffLines, [])
  assert.deepEqual(state._diffInput, {
    oldStr: '',
    newStr: 'export const demo = 1\n',
  })
})

test('edit function_call exposes diff input for replacement preview', () => {
  const state = buildFunctionCallToolState({
    toolName: 'edit',
    args: {
      file_path: 'src/demo.ts',
      old_string: 'const demo = 1\n',
      new_string: 'const demo = 2\n',
    },
    isWriteTool: () => false,
    isEditTool: (name) => ['edit', 'str_replace', 'str_replace_editor'].includes(String(name || '').toLowerCase()),
    isBashTool: () => false,
    isReadTool: () => false,
  })

  assert.equal(state.filePath, 'src/demo.ts')
  assert.equal(state.newContent, 'const demo = 2\n')
  assert.deepEqual(state._diffInput, {
    oldStr: 'const demo = 1\n',
    newStr: 'const demo = 2\n',
  })
})

test('create_file function_call is treated as write preview', () => {
  const state = buildFunctionCallToolState({
    toolName: 'create_file',
    args: {
      file_path: 'src/new-file.ts',
      content: 'export const created = true\n',
    },
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
  })

  assert.equal(state.filePath, 'src/new-file.ts')
  assert.equal(state.newContent, 'export const created = true\n')
  assert.deepEqual(state._diffInput, {
    oldStr: '',
    newStr: 'export const created = true\n',
  })
})

test('edit_file function_call is treated as edit preview', () => {
  const state = buildFunctionCallToolState({
    toolName: 'edit_file',
    args: {
      path: 'src/demo.ts',
      old_string: 'const demo = 1\n',
      new_string: 'const demo = 2\n',
    },
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
  })

  assert.equal(state.filePath, 'src/demo.ts')
  assert.equal(state.newContent, 'const demo = 2\n')
  assert.deepEqual(state._diffInput, {
    oldStr: 'const demo = 1\n',
    newStr: 'const demo = 2\n',
  })
})

test('non write tools do not fabricate code preview fields', () => {
  const state = buildFunctionCallToolState({
    toolName: 'web_search',
    args: { query: 'codex' },
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
  })

  assert.equal(state.filePath, '')
  assert.equal(state.newContent, '')
  assert.equal(state._diffInput, null)
})

function createStreamHarness() {
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
    isWriteTool: (name) => ['write', 'write_file', 'create_file'].includes(String(name || '').toLowerCase()),
    isEditTool: (name) => ['edit', 'edit_file', 'str_replace', 'str_replace_editor'].includes(String(name || '').toLowerCase()),
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

test('write preview remains visible when later weak file_change uses a different id', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-write-1',
        type: 'function_call',
        call_id: 'call-write-1',
        name: 'write',
        arguments: JSON.stringify({
          path: 'src/demo.ts',
          content: 'export const demo = 1\n',
        }),
        status: 'in_progress',
      },
    },
  })

  let toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolUseId, 'call-write-1')
  assert.equal(toolMessages[0].filePath, 'src/demo.ts')
  assert.equal(toolMessages[0].newContent, 'export const demo = 1\n')
  assert.deepEqual(toolMessages[0]._diffInput, {
    oldStr: '',
    newStr: 'export const demo = 1\n',
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'tool-file-change-1',
        type: 'file_change',
        status: 'completed',
        changes: [
          {
            path: 'src/demo.ts',
            kind: 'add',
          },
        ],
      },
    },
  })

  toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].filePath, 'src/demo.ts')
  assert.equal(toolMessages[0].newContent, 'export const demo = 1\n')
  assert.deepEqual(toolMessages[0]._diffInput, {
    oldStr: '',
    newStr: 'export const demo = 1\n',
  })
  assert.equal(toolMessages[0].status, 'done')
})
