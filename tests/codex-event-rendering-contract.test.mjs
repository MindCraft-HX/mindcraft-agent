import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { useCodexAgentStream } from '../packages/agent/src/components/codeX/composables/useCodexAgentStream.js'

/**
 * CodeX 事件渲染契约 — characterization tests
 *
 * 锁定 live stream 中 custom_tool_call、agent_message、thinking 标签
 * 的当前行为（含已知 bug），为 Phase 1-3 修复提供回归护栏。
 *
 * 场景覆盖：
 *   - live custom_tool_call 非 apply_patch 生成 tool message
 *   - 空 agent_message 不覆盖已有 assistant 文本
 *   - 空 agent_message 不创建 assistant bubble
 *   - <thinking> 标签不进入 final assistant bubble
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

test('BUG: live custom_tool_call (non-apply_patch) is silently dropped', () => {
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

  // BUG: custom_tool_call not in ITEM_TOOL_HANDLERS → silently dropped.
  // Expected (after fix): at least 1 tool message for web_search.
  const toolMessages = tab.messages.filter(m => m.role === 'tool')
  assert.equal(toolMessages.length, 0,
    'BUG: custom_tool_call should create a tool message but is currently dropped')
})

test('custom_tool_call apply_patch creates a tool message (baseline)', () => {
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

test('non-apply_patch custom_tool_call falls through to ITEM_TOOL_HANDLERS (currently undefined)', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'tool-generic-1',
        type: 'custom_tool_call',
        call_id: 'call-gen-1',
        name: 'read_file',
        input: '{"path":"src/demo.ts"}',
        status: 'completed',
      },
    },
  })

  // No tool message created — falls into ITEM_TOOL_HANDLERS lookup which is undefined.
  const toolMessages = tab.messages.filter(m => m.role === 'tool')
  assert.equal(toolMessages.length, 0,
    'custom_tool_call read_file is not in ITEM_TOOL_HANDLERS → dropped')
})

// ── agent_message 空覆盖 ───────────────────────────────────────────

test('BUG: empty agent_message overwrites existing assistant text', () => {
  const { tab, stream } = createStreamHarness()

  // First: send real assistant text
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] },
    },
  })

  const assistantMsg = tab.messages.find(m => m.role === 'assistant')
  assert.ok(assistantMsg, 'assistant message should exist')
  assert.equal(assistantMsg.text, 'Hello world')

  // Then: empty agent_message comes in
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.updated',
      item: {
        id: 'agent-msg-1',
        type: 'agent_message',
        message: '',
        text: '',
      },
    },
  })

  // BUG: agent_message overwrites with empty string
  const am = tab.messages.find(m => m.role === 'assistant')
  assert.equal(am.text, '',
    'BUG: empty agent_message should NOT overwrite existing assistant text')
})

test('BUG: empty agent_message creates assistant bubble when none exists', () => {
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

  // BUG: ensureAssistantMessage creates a bubble even for empty text
  const assistantMessages = tab.messages.filter(m => m.role === 'assistant')
  assert.equal(assistantMessages.length, 1,
    'BUG: empty agent_message should NOT create an assistant bubble but currently does')
  assert.equal(assistantMessages[0].text, '')
})

test('agent_message with real text creates assistant bubble and sets text (baseline)', () => {
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

// ── <thinking> 标签归类 ────────────────────────────────────────────

test('agent_message with <thinking> content appears as assistant text (current behavior)', () => {
  const { tab, stream } = createStreamHarness()

  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'item.completed',
      item: {
        id: 'agent-thinking-1',
        type: 'agent_message',
        message: '<thinking>tool call</thinking>',
        text: '<thinking>tool call</thinking>',
      },
    },
  })

  const am = tab.messages.find(m => m.role === 'assistant')
  assert.ok(am)
  // Current behavior: <thinking> tags appear raw in assistant text.
  // After fix: should be stripped or classified as progress/reasoning.
  assert.ok(am.text.includes('<thinking>'),
    'current behavior: <thinking> appears raw in assistant text')
})

test('agent_message with mixed thinking and real content', () => {
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
  assert.ok(am)
  assert.ok(am.text.includes('<thinking>'),
    'current: thinking tags mixed with real content in assistant text')
  assert.ok(am.text.includes('I found the following'),
    'real content still present')
})

// ── agent_message 覆盖保护 ─────────────────────────────────────────

test('non-empty agent_message appends to existing assistant text (current: overwrites)', () => {
  const { tab, stream } = createStreamHarness()

  // Build up text via assistant type chunks
  stream.onAgentMessage({
    sessionId: 'sess-1',
    msg: {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Part 1. ' }] },
    },
  })

  // Then agent_message comes with more text
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

  // Current behavior: agent_message OVERWRITES, does not append
  const am = tab.messages.find(m => m.role === 'assistant')
  assert.ok(am)
  // BUG: text should ideally be 'Part 1. Part 2. Final.' but is just 'Part 2. Final.'
  assert.equal(am.text, 'Part 2. Final.',
    'current: agent_message overwrites instead of appending')
})

// ── turn 边界 ──────────────────────────────────────────────────────

test('turn.completed does not clear existing tool messages', () => {
  const { tab, stream } = createStreamHarness()

  // Create a tool message first
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
