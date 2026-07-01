/**
 * CodeX UI Event Mapper — Unit Tests
 *
 * 覆盖 codexUiEventMapper.mjs 和 codexUiEventMapper.cjs 双版本。
 * CJS/ESM parity 测试确保两端分类逻辑完全一致。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// ESM version
import {
  isFileMutationToolName,
  isReadToolName,
  getToolActivityLabel,
  resolveToolCardType,
  classifyItemKind,
  buildToolMessageParts,
  buildHistoryToolMessage,
} from '../packages/agent/src/components/codeX/utils/codexUiEventMapper.mjs'

// CJS version
const require = createRequire(import.meta.url)
const cjs = require('../packages/agent/src/components/codeX/utils/codexUiEventMapper.cjs')

// ---------------------------------------------------------------------------
// resolveToolCardType
// ---------------------------------------------------------------------------

test('resolveToolCardType: structured item types map correctly', () => {
  const cases = [
    [{ type: 'reasoning' }, 'thinking'],
    [{ type: 'command_execution' }, 'shell'],
    [{ type: 'file_change' }, 'file_change'],
    [{ type: 'mcp_tool_call' }, 'mcp_tool'],
    [{ type: 'web_search' }, 'web_search'],
    [{ type: 'todo_list' }, 'todo_list'],
    [{ type: 'error' }, 'error'],
  ]
  for (const [item, expected] of cases) {
    assert.equal(resolveToolCardType(item), expected, `${item.type} → ${expected}`)
  }
})

test('resolveToolCardType: custom_tool_call apply_patch → apply_patch', () => {
  assert.equal(
    resolveToolCardType({ type: 'custom_tool_call', name: 'apply_patch' }),
    'apply_patch'
  )
})

test('resolveToolCardType: custom_tool_call generic → item name', () => {
  assert.equal(
    resolveToolCardType({ type: 'custom_tool_call', name: 'run_tests' }),
    'run_tests'
  )
})

test('resolveToolCardType: custom_tool_call without name → custom_tool_call', () => {
  assert.equal(
    resolveToolCardType({ type: 'custom_tool_call' }),
    'custom_tool_call'
  )
})

test('resolveToolCardType: function_call shell_command → shell', () => {
  assert.equal(
    resolveToolCardType({ type: 'function_call', name: 'shell_command' }),
    'shell'
  )
})

test('resolveToolCardType: function_call generic → name', () => {
  assert.equal(
    resolveToolCardType({ type: 'function_call', name: 'web_search' }),
    'web_search'
  )
})

test('resolveToolCardType: function_call without name → tool', () => {
  assert.equal(
    resolveToolCardType({ type: 'function_call' }),
    'tool'
  )
})

test('resolveToolCardType: patch_apply_end → file_change', () => {
  assert.equal(
    resolveToolCardType({ type: 'patch_apply_end' }),
    'file_change'
  )
})

test('resolveToolCardType: output types return null', () => {
  assert.equal(resolveToolCardType({ type: 'custom_tool_call_output' }), null)
  assert.equal(resolveToolCardType({ type: 'function_call_output' }), null)
})

test('resolveToolCardType: unknown type returns null', () => {
  assert.equal(resolveToolCardType({ type: 'unknown_type' }), null)
})

test('resolveToolCardType: null/undefined item returns null', () => {
  assert.equal(resolveToolCardType(null), null)
  assert.equal(resolveToolCardType(undefined), null)
  assert.equal(resolveToolCardType({}), null)
})

// ---------------------------------------------------------------------------
// classifyItemKind
// ---------------------------------------------------------------------------

test('classifyItemKind: tool items → tool', () => {
  const toolTypes = [
    { type: 'reasoning' },
    { type: 'command_execution' },
    { type: 'file_change' },
    { type: 'mcp_tool_call' },
    { type: 'web_search' },
    { type: 'todo_list' },
    { type: 'error' },
    { type: 'custom_tool_call', name: 'run_tests' },
    { type: 'function_call', name: 'write' },
    { type: 'patch_apply_end' },
  ]
  for (const item of toolTypes) {
    assert.equal(classifyItemKind(item), 'tool', `${item.type} should be 'tool'`)
  }
})

test('classifyItemKind: agent_message → assistant', () => {
  assert.equal(classifyItemKind({ type: 'agent_message' }), 'assistant')
})

test('classifyItemKind: terminal events → terminal', () => {
  assert.equal(classifyItemKind({ type: 'turn_completed' }), 'terminal')
  assert.equal(classifyItemKind({ type: 'turn_failed' }), 'terminal')
  assert.equal(classifyItemKind({ type: 'turn_aborted' }), 'terminal')
})

test('classifyItemKind: unknown type → ignore', () => {
  assert.equal(classifyItemKind({ type: 'unknown' }), 'ignore')
  assert.equal(classifyItemKind({ type: 'custom_tool_call_output' }), 'ignore')
  assert.equal(classifyItemKind(null), 'ignore')
  assert.equal(classifyItemKind(undefined), 'ignore')
})

// ---------------------------------------------------------------------------
// getToolActivityLabel
// ---------------------------------------------------------------------------

test('getToolActivityLabel: known tool names', () => {
  const cases = [
    ['shell', 'Ran'],
    ['bash', 'Ran'],
    ['command_execution', 'Ran'],
    ['file_change', 'Edited'],
    ['apply_patch', 'Edited'],
    ['write_file', 'Edited'],
    ['edit', 'Edited'],
    ['read', 'Read'],
    ['read_file', 'Read'],
    ['web_search', 'Searching'],
    ['thinking', 'Thinking'],
    ['reasoning', 'Thinking'],
    ['todo_list', 'Planning'],
    ['mcp_tool', '插件'],
    ['error', 'Error'],
  ]
  for (const [name, expected] of cases) {
    assert.equal(getToolActivityLabel(name), expected, `${name} → ${expected}`)
  }
})

test('getToolActivityLabel: unknown → Tool', () => {
  assert.equal(getToolActivityLabel('random_tool'), 'Tool')
  assert.equal(getToolActivityLabel(''), 'Tool')
})

// ---------------------------------------------------------------------------
// buildToolMessageParts — per tool type
// ---------------------------------------------------------------------------

test('buildToolMessageParts: reasoning → thinking card, not expanded', () => {
  const parts = buildToolMessageParts({
    type: 'reasoning', id: 'r1', call_id: 'cr1', text: 'Let me think...',
  })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'thinking')
  assert.equal(parts.base.expanded, false)
  assert.equal(parts.merge.text, 'Let me think...')
  assert.equal(parts.status, 'running')
})

test('buildToolMessageParts: reasoning final → done', () => {
  const parts = buildToolMessageParts(
    { type: 'reasoning', id: 'r1', call_id: 'cr1', text: 'Done thinking' },
    { isFinal: true }
  )
  assert.equal(parts.status, 'done')
})

test('buildToolMessageParts: command_execution', () => {
  const parts = buildToolMessageParts({
    type: 'command_execution', id: 'ce1', call_id: 'cce1',
    command: 'npm test', aggregated_output: 'all passed', exit_code: 0,
    status: 'in_progress',
  }, { cwd: '/repo' })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'shell')
  assert.equal(parts.base.bashCmd, 'npm test')
  assert.equal(parts.base.bashCwd, '/repo')
  assert.equal(parts.merge.bashOutput, 'all passed')
  assert.equal(parts.status, 'running')
})

test('buildToolMessageParts: web_search', () => {
  const parts = buildToolMessageParts({
    type: 'web_search', id: 'ws1', call_id: 'cws1', query: 'codex docs',
  })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'web_search')
  const text = JSON.parse(parts.merge.text)
  assert.equal(text.query, 'codex docs')
})

test('buildToolMessageParts: todo_list', () => {
  const parts = buildToolMessageParts({
    type: 'todo_list', id: 'td1', call_id: 'ctd1',
    items: [
      { id: '1', text: 'Task A', status: 'in_progress' },
      { id: '2', text: 'Task B', status: 'pending' },
    ],
  })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'todo_list')
  assert.equal(parts.merge.todoItems.length, 2)
  assert.equal(parts.merge.todoItems[0].text, 'Task A')
  assert.equal(parts.merge.todoItems[0].status, 'in_progress')
})

test('buildToolMessageParts: error → error status', () => {
  const parts = buildToolMessageParts({
    type: 'error', id: 'e1', call_id: 'ce1', message: 'Something broke',
  })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'error')
  assert.equal(parts.status, 'error')
  assert.equal(parts.merge.text, 'Something broke')
})

test('buildToolMessageParts: custom_tool_call generic', () => {
  const parts = buildToolMessageParts({
    type: 'custom_tool_call', id: 'ct1', call_id: 'cct1',
    name: 'run_tests', input: 'npm test', status: 'in_progress',
  })
  assert.ok(parts, 'custom_tool_call should NOT be dropped by mapper')
  assert.equal(parts.base.toolName, 'run_tests')
  assert.equal(parts.status, 'running')
})

test('buildToolMessageParts: custom_tool_call apply_patch', () => {
  const parts = buildToolMessageParts({
    type: 'custom_tool_call', id: 'ap1', call_id: 'cap1',
    name: 'apply_patch', input: '*** Update File: src/a.ts\n@@\n-old\n+new',
    status: 'in_progress',
  })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'apply_patch')
  assert.equal(parts.base.rawType, 'custom_tool_call')
})

test('buildToolMessageParts: function_call write', () => {
  const parts = buildToolMessageParts({
    type: 'function_call', id: 'fc1', call_id: 'cfc1',
    name: 'write', arguments: JSON.stringify({ path: 'src/x.ts', content: 'c' }),
    status: 'in_progress',
  })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'write')
  assert.equal(parts.status, 'running')
})

test('buildToolMessageParts: function_call shell_command extracts bashCmd', () => {
  const parts = buildToolMessageParts({
    type: 'function_call', id: 'fc2', call_id: 'cfc2',
    name: 'shell_command', arguments: JSON.stringify({ command: 'npm test' }),
    status: 'in_progress',
  }, { cwd: '/repo' })
  assert.ok(parts)
  assert.equal(parts.base.toolName, 'shell')
  assert.equal(parts.base.bashCmd, 'npm test')
  assert.equal(parts.base.bashCwd, '/repo')
  assert.equal(parts.base.filePath, '')
  assert.equal(parts.merge.bashCmd, 'npm test')
  assert.equal(parts.merge.bashOutput, '')
  assert.equal(parts.merge.newContent, '')
  assert.equal(parts.status, 'running')
})

test('buildToolMessageParts: unknown item type returns null', () => {
  assert.equal(buildToolMessageParts({ type: 'custom_tool_call_output', id: 'o1' }), null)
  assert.equal(buildToolMessageParts({ type: 'agent_message', text: 'hi' }), null)
})

// ---------------------------------------------------------------------------
// buildHistoryToolMessage
// ---------------------------------------------------------------------------

test('buildHistoryToolMessage: generic custom_tool_call → tool message with result', () => {
  const msg = buildHistoryToolMessage(
    { type: 'custom_tool_call', id: 'ct1', call_id: 'cct1', name: 'run_tests', input: 'npm test', status: 'in_progress' },
    'Tests passed',
    null,
    {}
  )
  assert.ok(msg)
  assert.equal(msg.role, 'tool')
  assert.equal(msg.toolName, 'run_tests')
  assert.equal(msg.toolResultContent, 'Tests passed')
  assert.equal(msg.status, 'done')
})

test('buildHistoryToolMessage: apply_patch + patchEnd → file_change fusion', () => {
  const msg = buildHistoryToolMessage(
    { type: 'custom_tool_call', id: 'ap1', call_id: 'cap1', name: 'apply_patch', input: '...' },
    '',
    {
      success: true,
      status: 'completed',
      changes: {
        'src/demo.ts': { type: 'update', unified_diff: '@@ -1 +1 @@\n-old\n+new' },
      },
    },
    {}
  )
  assert.ok(msg)
  assert.equal(msg.role, 'tool')
  assert.equal(msg.toolName, 'file_change')
  assert.equal(msg.rawType, 'file_change')
  assert.equal(msg.status, 'done')
  assert.equal(msg.filePath, 'src/demo.ts')
  const parsed = JSON.parse(msg.text)
  assert.equal(parsed.changes.length, 1)
  assert.equal(parsed.changes[0].operation, 'modify')
})

test('buildHistoryToolMessage: function_call shell_command → shell tool with bashCmd', () => {
  const msg = buildHistoryToolMessage(
    { type: 'function_call', id: 'fc1', call_id: 'cfc1', name: 'shell_command', arguments: JSON.stringify({ command: 'ls' }) },
    'file1.txt\nfile2.txt',
    null,
    { cwd: '/repo' }
  )
  assert.ok(msg)
  assert.equal(msg.role, 'tool')
  assert.equal(msg.toolName, 'shell')
  assert.equal(msg.toolResultContent, 'file1.txt\nfile2.txt')
  assert.equal(msg.bashCmd, 'ls', 'bashCmd must be extracted from function_call arguments')
  assert.equal(msg.bashCwd, '/repo', 'bashCwd must be propagated from ctx')
  assert.equal(msg.bashOutput, 'file1.txt\nfile2.txt', 'bashOutput must be available for ToolBash.vue')
  assert.equal(msg.newContent, 'file1.txt\nfile2.txt', 'newContent keeps modal/raw fallback consistent')
  assert.equal(msg.filePath, '')
})

test('buildHistoryToolMessage: function_call shell_command prefers arguments.workdir over ctx.cwd', () => {
  const msg = buildHistoryToolMessage(
    { type: 'function_call', id: 'fc2', call_id: 'cfc2', name: 'shell_command', arguments: JSON.stringify({ command: 'pwd', workdir: '/actual' }) },
    '/actual',
    null,
    { cwd: '/fallback' }
  )
  assert.ok(msg)
  assert.equal(msg.bashCwd, '/actual')
})

test('buildHistoryToolMessage: function_call with error output → error status', () => {
  const msg = buildHistoryToolMessage(
    { type: 'function_call', id: 'fc1', call_id: 'cfc1', name: 'build', arguments: '{}' },
    'Error: compilation failed',
    null,
    {}
  )
  assert.ok(msg)
  assert.equal(msg.status, 'error', 'short error output should set status to error')
})

test('buildHistoryToolMessage: unknown call type returns null', () => {
  assert.equal(buildHistoryToolMessage({ type: 'agent_message' }, '', null, {}), null)
})

// ---------------------------------------------------------------------------
// CJS / ESM parity
// ---------------------------------------------------------------------------

test('CJS/ESM parity: resolveToolCardType matches', () => {
  const items = [
    { type: 'reasoning' },
    { type: 'command_execution' },
    { type: 'custom_tool_call', name: 'apply_patch' },
    { type: 'custom_tool_call', name: 'run_tests' },
    { type: 'function_call', name: 'shell_command' },
    { type: 'function_call', name: 'write' },
    { type: 'web_search' },
    { type: 'patch_apply_end' },
    { type: 'custom_tool_call_output' },
    { type: 'unknown' },
  ]
  for (const item of items) {
    assert.equal(
      cjs.resolveToolCardType(item),
      resolveToolCardType(item),
      `CJS/ESM mismatch for ${item.type}${item.name ? '/' + item.name : ''}`
    )
  }
})

test('CJS/ESM parity: getToolActivityLabel matches', () => {
  const names = ['shell', 'apply_patch', 'web_search', 'thinking', 'todo_list', 'read', 'mcp_tool', 'error', 'unknown']
  for (const name of names) {
    assert.equal(
      cjs.getToolActivityLabel(name),
      getToolActivityLabel(name),
      `CJS/ESM mismatch for "${name}"`
    )
  }
})

test('CJS/ESM parity: classifyItemKind matches', () => {
  const items = [
    { type: 'reasoning' },
    { type: 'agent_message' },
    { type: 'turn_completed' },
    { type: 'custom_tool_call_output' },
    { type: 'unknown' },
  ]
  for (const item of items) {
    assert.equal(
      cjs.classifyItemKind(item),
      classifyItemKind(item),
      `CJS/ESM mismatch for ${item.type}`
    )
  }
})

test('CJS/ESM parity: buildToolMessageParts matches', () => {
  const items = [
    { type: 'reasoning', id: 'r1', call_id: 'cr1', text: 'thinking...' },
    { type: 'web_search', id: 'ws1', call_id: 'cws1', query: 'test' },
    { type: 'custom_tool_call', id: 'ct1', call_id: 'cct1', name: 'run_tests', input: 'hi', status: 'in_progress' },
    { type: 'function_call', id: 'fc1', call_id: 'cfc1', name: 'write', arguments: '{}', status: 'in_progress' },
    { type: 'function_call', id: 'fc2', call_id: 'cfc2', name: 'shell_command', arguments: JSON.stringify({ command: 'ls' }), status: 'in_progress' },
    { type: 'error', id: 'e1', call_id: 'ce1', message: 'fail' },
  ]
  for (const item of items) {
    const esm = buildToolMessageParts(item, { cwd: '/repo', isFinal: false })
    const cjsResult = cjs.buildToolMessageParts(item, { cwd: '/repo', isFinal: false })
    assert.ok(esm, `ESM returned null for ${item.type}`)
    assert.ok(cjsResult, `CJS returned null for ${item.type}`)
    assert.deepEqual(cjsResult.base, esm.base, `CJS/ESM base mismatch for ${item.type}`)
    assert.deepEqual(cjsResult.merge, esm.merge, `CJS/ESM merge mismatch for ${item.type}`)
    assert.equal(cjsResult.status, esm.status, `CJS/ESM status mismatch for ${item.type}`)
  }
})

test('CJS/ESM parity: buildHistoryToolMessage matches', () => {
  const call = { type: 'custom_tool_call', id: 'ct1', call_id: 'cct1', name: 'run_tests', input: 'npm test', status: 'in_progress' }
  const esm = buildHistoryToolMessage(call, 'output text', null, {})
  const cjsResult = cjs.buildHistoryToolMessage(call, 'output text', null, {})
  assert.ok(esm)
  assert.ok(cjsResult)
  assert.deepEqual(cjsResult, esm, 'CJS/ESM history message mismatch')
})

// ---------------------------------------------------------------------------
// isFileMutationToolName / isReadToolName
// ---------------------------------------------------------------------------

test('isFileMutationToolName: known mutation tools', () => {
  assert.equal(isFileMutationToolName('write_file'), true)
  assert.equal(isFileMutationToolName('edit'), true)
  assert.equal(isFileMutationToolName('apply_patch'), true)
  assert.equal(isFileMutationToolName('str_replace_editor'), true)
  assert.equal(isFileMutationToolName('web_search'), false)
  assert.equal(isFileMutationToolName('read'), false)
})

test('isReadToolName: known read tools', () => {
  assert.equal(isReadToolName('read'), true)
  assert.equal(isReadToolName('read_file'), true)
  assert.equal(isReadToolName('view'), true)
  assert.equal(isReadToolName('write_file'), false)
  assert.equal(isReadToolName('shell'), false)
})
