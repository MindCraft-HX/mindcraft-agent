/**
 * CodeX Stream Rendering Contract Tests (Phase 1 — FIXED)
 *
 * 目标：验证 live stream 中 custom_tool_call、agent_message、thinking 标签
 * 的修复后正确行为。原 Phase 0 characterization BUG 测试已更新为期望行为。
 *
 * Background: docs/agent-architecture.md and docs/session-pitfalls.md.
 * 关联 TODO：T168
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.requestIdleCallback = globalThis.requestIdleCallback || ((cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0))
globalThis.window = globalThis.window || { electronAPI: {} }

import { useCodexAgentStream } from '../packages/agent/src/components/codeX/composables/useCodexAgentStream.js'

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

  const scrollCalls = []
  const saveCalls = []

  const stream = useCodexAgentStream({
    tabs,
    projects,
    getActiveProjectId: () => 'proj-1',
    isPanelActive: ref(true),
    onBackgroundTaskDone: () => {},
    scrollBottom: (tabId) => { scrollCalls.push(tabId) },
    saveHistory: () => { saveCalls.push(true) },
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

  return { tab, stream, scrollCalls, saveCalls }
}

function sendItemStarted(stream, item, sessionId = 'sess-1') {
  stream.onAgentMessage({ sessionId, msg: { type: 'item.started', item } })
}

function sendItemCompleted(stream, item, sessionId = 'sess-1') {
  stream.onAgentMessage({ sessionId, msg: { type: 'item.completed', item } })
}

function sendAgentMessage(stream, text, { sessionId = 'sess-1', eventType = 'item.started' } = {}) {
  stream.onAgentMessage({
    sessionId,
    msg: { type: eventType, item: { type: 'agent_message', message: text, text } },
  })
}

// ---------------------------------------------------------------------------
// Group 1: custom_tool_call handling
// ---------------------------------------------------------------------------

test('BASELINE: apply_patch custom_tool_call generates tool message', () => {
  const { tab, stream } = createHarness()

  sendItemStarted(stream, {
    id: 'tool-ap-1',
    type: 'custom_tool_call',
    call_id: 'call-ap-1',
    name: 'apply_patch',
    input: [
      '*** Begin Patch',
      '*** Update File: src/demo.ts',
      '@@',
      '-old',
      '+new',
      '*** End Patch',
    ].join('\n'),
    status: 'in_progress',
  })

  const toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1, 'apply_patch should create one tool message')
  assert.equal(toolMessages[0].toolUseId, 'call-ap-1')
  assert.equal(toolMessages[0].toolName, 'apply_patch')
  assert.equal(toolMessages[0].rawType, 'apply_patch')
  assert.ok(toolMessages[0]._fileChanges, 'apply_patch should populate _fileChanges for diff preview')
  assert.equal(toolMessages[0]._fileChanges[0].path, 'src/demo.ts')
})

test('FIXED: non-apply_patch custom_tool_call creates generic tool message', () => {
  const { tab, stream } = createHarness()

  sendItemStarted(stream, {
    id: 'tool-generic-1',
    type: 'custom_tool_call',
    call_id: 'call-generic-1',
    name: 'run_tests',
    input: 'npm test',
    status: 'in_progress',
  })

  const toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1,
    'generic custom_tool_call should create a tool message')
  assert.equal(toolMessages[0].toolName, 'run_tests')
  assert.equal(toolMessages[0].toolUseId, 'call-generic-1')
  assert.equal(toolMessages[0].status, 'running')
})

test('FIXED: custom_tool_call_output updates toolResultContent', () => {
  const { tab, stream } = createHarness()

  // First: a custom_tool_call starts
  sendItemStarted(stream, {
    id: 'tool-generic-2',
    type: 'custom_tool_call',
    call_id: 'call-generic-2',
    name: 'read_file',
    input: '{"path":"src/demo.ts"}',
    status: 'in_progress',
  })

  // Then: output arrives
  sendItemCompleted(stream, {
    id: 'tool-output-2',
    type: 'custom_tool_call_output',
    call_id: 'call-generic-2',
    output: 'file content here',
  })

  const toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1, 'upsert should not create duplicate')
  assert.equal(toolMessages[0].toolResultContent, 'file content here')
})

test('BASELINE: function_call generates tool message with correct fields', () => {
  const { tab, stream } = createHarness()

  sendItemStarted(stream, {
    id: 'tool-fc-2',
    type: 'function_call',
    call_id: 'call-fc-2',
    name: 'write',
    arguments: JSON.stringify({ path: 'src/file.ts', content: 'export const x=1' }),
    status: 'in_progress',
  })

  const toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolUseId, 'call-fc-2')
  assert.equal(toolMessages[0].toolName, 'write')
  assert.equal(toolMessages[0].filePath, 'src/file.ts')
  assert.equal(toolMessages[0].status, 'running')
})

// ---------------------------------------------------------------------------
// Group 2: agent_message handling
// ---------------------------------------------------------------------------

test('FIXED: empty agent_message does NOT create an assistant bubble', () => {
  const { tab, stream } = createHarness()

  sendAgentMessage(stream, '')

  const assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages.length, 0,
    'empty agent_message must not create an assistant bubble')
})

test('FIXED: empty agent_message does NOT overwrite existing assistant text', () => {
  const { tab, stream } = createHarness()

  // First message has real content
  sendAgentMessage(stream, 'Here is the final answer.')

  let assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages.length, 1)
  assert.equal(assistantMessages[0].text, 'Here is the final answer.')

  // Second message is empty — should NOT overwrite
  sendAgentMessage(stream, '')

  assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages[0].text, 'Here is the final answer.',
    'empty agent_message must not overwrite existing assistant text')
})

test('BASELINE: non-empty agent_message text is stored on assistant message', () => {
  const { tab, stream } = createHarness()

  sendAgentMessage(stream, 'Processing step 1...')

  const assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages.length, 1)
  assert.equal(assistantMessages[0].text, 'Processing step 1...')
  assert.equal(assistantMessages[0].role, 'assistant')
})

test('FIXED: agent_message last non-empty wins (replaces prior text in same turn)', () => {
  // Each non-empty agent_message replaces prior text within the same turn.
  // This avoids the "first-wins" risk where an early progress fragment
  // prevents the final reply from being displayed.
  const { tab, stream } = createHarness()

  sendAgentMessage(stream, 'Step 1')
  sendAgentMessage(stream, 'Step 2')
  sendAgentMessage(stream, 'Final answer')

  const assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages.length, 1,
    'All agent_message events should share one assistant bubble')
  // Last non-empty text wins
  assert.equal(assistantMessages[0].text, 'Final answer',
    'Last non-empty agent_message text is displayed')
})

// ---------------------------------------------------------------------------
// Group 3: <thinking> tag handling
// ---------------------------------------------------------------------------

test('FIXED: <thinking> tags in agent_message are stripped from assistant text', () => {
  const { tab, stream } = createHarness()

  const thinkingContent = '<thinking>tool call</thinking>\nActual reply text.'
  sendAgentMessage(stream, thinkingContent)

  // Pure thinking-only content: after stripping, only "Actual reply text." remains.
  // If there were no real content after stripping, no bubble would be created.
  const assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages.length, 1, 'real content should create a bubble')
  assert.ok(!assistantMessages[0].text.includes('<thinking>'),
    '<thinking> tags must be stripped from assistant text')
  assert.ok(assistantMessages[0].text.includes('Actual reply text.'),
    'real content after thinking block must be preserved')
})

test('BASELINE: reasoning item type generates a thinking tool card', () => {
  const { tab, stream } = createHarness()

  sendItemStarted(stream, {
    id: 'reasoning-1',
    type: 'reasoning',
    call_id: 'reasoning-1',
    text: 'Let me think about this step by step...',
  })

  const toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages.length, 1)
  assert.equal(toolMessages[0].toolName, 'thinking')
  assert.equal(toolMessages[0].rawType, 'reasoning')
  assert.equal(toolMessages[0].status, 'running')
})

// ---------------------------------------------------------------------------
// Group 4: intermediate progress visibility
// ---------------------------------------------------------------------------

test('BASELINE: intermediate agent_message text IS visible (not hidden)', () => {
  const { tab, stream } = createHarness()

  sendAgentMessage(stream, 'Running npm install...')
  sendAgentMessage(stream, 'Installing dependencies complete.')
  sendAgentMessage(stream, 'The project has been set up successfully.')

  const assistantMessages = tab.messages.filter(msg => msg.role === 'assistant')
  assert.equal(assistantMessages.length, 1)
  assert.ok(assistantMessages[0].text.length > 0, 'Progress text must be visible to user')
})

// ---------------------------------------------------------------------------
// Group 5: item.completed transitions
// ---------------------------------------------------------------------------

test('BASELINE: item.completed agent_message clears currentAssistantId', () => {
  const { tab, stream } = createHarness()

  sendAgentMessage(stream, 'Hello', { eventType: 'item.started' })
  assert.notEqual(tab.currentAssistantId, null, 'currentAssistantId should be set after started')

  sendAgentMessage(stream, 'Hello World', { eventType: 'item.completed' })
  assert.equal(tab.currentAssistantId, null, 'currentAssistantId should be cleared on completed')
})

test('BASELINE: item.completed transitions tool status to done', () => {
  const { tab, stream } = createHarness()

  sendItemStarted(stream, {
    id: 'tool-1',
    type: 'web_search',
    call_id: 'call-ws-1',
    query: 'test query',
    status: 'in_progress',
  })

  let toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages[0].status, 'running')

  sendItemCompleted(stream, {
    id: 'tool-1',
    type: 'web_search',
    call_id: 'call-ws-1',
    query: 'test query',
  })

  toolMessages = tab.messages.filter(msg => msg.role === 'tool')
  assert.equal(toolMessages[0].status, 'done', 'tool status should transition to done on completed')
})

// ---------------------------------------------------------------------------
// Group 6: No regression on existing behavior
// ---------------------------------------------------------------------------

test('BASELINE: user messages, tool messages, and assistant messages coexist in order', () => {
  const { tab, stream } = createHarness()

  tab.messages.push({ id: 'msg-user-1', role: 'user', text: 'Search for codex docs' })

  sendItemStarted(stream, {
    id: 'tool-ws-2',
    type: 'web_search',
    call_id: 'call-ws-2',
    query: 'codex docs',
    status: 'in_progress',
  })

  sendItemCompleted(stream, {
    id: 'tool-ws-2',
    type: 'web_search',
    call_id: 'call-ws-2',
    query: 'codex docs',
  })

  sendAgentMessage(stream, 'Found the documentation at codex.dev')

  const roles = tab.messages.map(m => m.role)
  assert.deepEqual(roles, ['user', 'tool', 'assistant'],
    'Messages should be ordered: user → tool → assistant')
})

test('BASELINE: non-tool item types handled by ITEM_TOOL_HANDLERS work correctly', () => {
  const { tab, stream } = createHarness()

  const testCases = [
    {
      label: 'todo_list',
      item: { id: 't1', type: 'todo_list', call_id: 'c1', items: [] },
      expectedToolName: 'todo_list',
    },
    {
      label: 'error',
      item: { id: 'e1', type: 'error', call_id: 'c2', message: 'Something failed' },
      expectedToolName: 'error',
      expectedStatus: 'error',
    },
  ]

  for (const { label, item, expectedToolName, expectedStatus } of testCases) {
    const h = createHarness()
    sendItemStarted(h.stream, item)
    const msgs = h.tab.messages.filter(m => m.role === 'tool')
    assert.equal(msgs.length, 1, `${label}: should create one tool message`)
    assert.equal(msgs[0].toolName, expectedToolName, `${label}: wrong toolName`)
    if (expectedStatus) {
      assert.equal(msgs[0].status, expectedStatus, `${label}: wrong status`)
    }
  }
})
