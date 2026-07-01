import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { useCodexAgentStream } from '../packages/agent/src/components/codeX/composables/useCodexAgentStream.js'

/**
 * CodeX 事件渲染契约测试
 *
 * 覆盖 live stream 中 custom_tool_call、agent_message、thinking 标签的
 * 期望行为，确保 live 和 history 路径渲染一致。
 */

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

  return { tab, stream, nextMsgId }
}

// ── custom_tool_call ──────────────────────────────────────────────

test('custom_tool_call (non-apply_patch) creates a generic tool message', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-web-search-1',
        type: 'custom_tool_call',
        call_id: 'call-ws-1',
        name: 'web_search',
        input: '{"query":"codex"}',
        status: 'in_progress',
      },
    },
  })

  const toolMessages = tab.messages.filter(m => m.role === 'tool')
  assert.equal(toolMessages.length, 1,
    'custom_tool_call should create a tool message')
  assert.equal(toolMessages[0].toolName, 'web_search')
  assert.equal(toolMessages[0].rawType, 'custom_tool_call')
  assert.equal(toolMessages[0].toolUseId, 'call-ws-1')
  assert.equal(toolMessages[0].status, 'running')
})

test('custom_tool_call apply_patch creates apply_patch tool message (baseline)', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-patch-1',
        type: 'custom_tool_call',
        call_id: 'call-patch-1',
        name: 'apply_patch',
        input: '*** Update File: src/demo.ts\n---\n@@ -2,1 +2,1 @@\n-old\n+new',
        status: 'in_progress',
      },
    },
  })

  const toolMessages = tab.messages.filter(m => m.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolName, 'apply_patch')
})

test('custom_tool_call receives toolResultContent from custom_tool_call_output', () => {
  const { tab, stream } = createStreamHarness()

  // Start a custom_tool_call
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-read-1',
        type: 'custom_tool_call',
        call_id: 'call-read-1',
        name: 'read_file',
        input: '{"path":"src/demo.ts"}',
        status: 'in_progress',
      },
    },
  })

  // Output arrives
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'tool-read-output-1',
        type: 'custom_tool_call_output',
        call_id: 'call-read-1',
        output: 'file content here',
      },
    },
  })

  const toolMessages = tab.messages.filter(m => m.role === 'tool')
  assert.equal(toolMessages.length, 1, 'upsert should not create duplicate')
  // Output should be attached to the same tool message
  assert.ok(toolMessages[0].toolResultContent, 'output should be attached')
})

test('custom_tool_call completed sets status to done', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-1',
        type: 'custom_tool_call',
        call_id: 'call-1',
        name: 'some_tool',
        input: '{}',
        status: 'in_progress',
      },
    },
  })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'tool-1',
        type: 'custom_tool_call',
        call_id: 'call-1',
        name: 'some_tool',
        input: '{}',
        status: 'completed',
      },
    },
  })

  const toolMessages = tab.messages.filter(m => m.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].status, 'done')
})

// ── agent_message 覆盖保护 ───────────────────────────────────────────

test('empty agent_message does NOT overwrite existing assistant text', () => {
  const { tab, stream } = createStreamHarness()

  // Build up assistant text via assistant type chunks
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] },
    },
  })

  const a1 = tab.messages.find(m => m.role === 'assistant')
  assert.equal(a1.text, 'Hello world')

  // Empty agent_message comes in — should NOT overwrite
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.updated',
      item: {
        id: 'agent-empty-1',
        type: 'agent_message',
        message: '',
        text: '',
      },
    },
  })

  const a2 = tab.messages.find(m => m.role === 'assistant')
  assert.equal(a2.text, 'Hello world',
    'empty agent_message must not overwrite existing assistant text')
})

test('empty agent_message does NOT create assistant bubble when none exists', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'agent-empty-1',
        type: 'agent_message',
        message: '',
        text: '',
      },
    },
  })

  const assistantMessages = tab.messages.filter(m => m.role === 'assistant')
  assert.equal(assistantMessages.length, 0,
    'empty agent_message must not create an assistant bubble')
})

test('agent_message with real text creates assistant bubble and sets text', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'agent-real-1',
        type: 'agent_message',
        message: 'Here is the result',
        text: 'Here is the result',
      },
    },
  })

  const am = tab.messages.find(m => m.role === 'assistant')
  assert.ok(am)
  assert.equal(am.text, 'Here is the result')
})

test('non-empty agent_message preserves existing assistant text (no overwrite)', () => {
  const { tab, stream } = createStreamHarness()

  // Build up text via assistant type chunks
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Part 1. ' }] },
    },
  })

  // agent_message with more text — should not overwrite the already-built text
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.updated',
      item: {
        id: 'agent-append-1',
        type: 'agent_message',
        message: 'Part 2. Final.',
        text: 'Part 2. Final.',
      },
    },
  })

  // The assistant text accumulated via 'assistant' type chunks is preserved.
  // agent_message is a secondary notification, not the primary text source.
  const am = tab.messages.find(m => m.role === 'assistant')
  assert.equal(am.text, 'Part 1. ',
    'agent_message text must not overwrite text accumulated via assistant type chunks')
})

// ── <thinking> 标签归类 ────────────────────────────────────────────

test('agent_message <thinking> tags are stripped from assistant text', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'agent-thinking-1',
        type: 'agent_message',
        message: '<thinking>tool call web_search</thinking>',
        text: '<thinking>tool call web_search</thinking>',
      },
    },
  })

  const am = tab.messages.find(m => m.role === 'assistant')
  // Pure thinking content → stripped to empty → no bubble created
  assert.ok(!am || am.text === '',
    '<thinking> tags should be stripped from assistant text')
})

test('agent_message mixed thinking and real content — thinking stripped, real kept', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'agent-mixed-1',
        type: 'agent_message',
        message: '<thinking>tool call web_search</thinking>\nI found the following results...',
        text: '<thinking>tool call web_search</thinking>\nI found the following results...',
      },
    },
  })

  const am = tab.messages.find(m => m.role === 'assistant')
  assert.ok(am, 'real content should create assistant bubble')
  assert.ok(!am.text.includes('<thinking>'),
    '<thinking> tags must be stripped')
  assert.ok(am.text.includes('I found the following'),
    'real content must be preserved')
})

// ── 多轮 agent_message ────────────────────────────────────────────

test('agent_message in new turn creates new assistant bubble (cross-turn)', () => {
  const { tab, stream } = createStreamHarness()

  // Turn 1: assistant streaming + agent_message complete
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Turn 1 reply' }] },
    },
  })
  // Simulate turn end — currentAssistantId cleared
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: { id: 'agent-1', type: 'agent_message', message: 'Turn 1 reply', text: 'Turn 1 reply' },
    },
  })
  assert.equal(tab.currentAssistantId, null, 'currentAssistantId cleared after turn end')

  // Turn 2: new user message, then agent_message with no prior 'assistant' type event
  tab.messages.push({ id: 'msg-user-2', role: 'user', text: 'Second question' })

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: { id: 'agent-2', type: 'agent_message', message: 'Turn 2 reply', text: 'Turn 2 reply' },
    },
  })

  const assistants = tab.messages.filter(m => m.role === 'assistant')
  assert.equal(assistants.length, 2,
    'new turn agent_message must create its own assistant bubble')
  assert.equal(assistants[1].text, 'Turn 2 reply',
    'Turn 2 agent_message text must be set, not skipped due to Turn 1')
})

// ── turn 边界 ──────────────────────────────────────────────────────

test('turn.completed does not clear existing tool messages', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.started',
      item: {
        id: 'tool-1',
        type: 'function_call',
        call_id: 'call-1',
        name: 'write',
        arguments: JSON.stringify({ path: 'a.ts', content: 'x' }),
        status: 'in_progress',
      },
    },
  })

  const beforeCount = tab.messages.filter(m => m.role === 'tool').length
  assert.equal(beforeCount, 1)

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: { type: 'turn.completed' },
  })

  const afterCount = tab.messages.filter(m => m.role === 'tool').length
  assert.equal(afterCount, 1, 'turn.completed should preserve tool messages')
})
