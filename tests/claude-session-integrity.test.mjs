import test from 'node:test'
import assert from 'node:assert/strict'

import {
  analyzeClaudeSessionIntegrity,
  markDanglingClaudeToolsInterrupted,
} from '../packages/agent/src/components/claudeCode/utils/sessionIntegrity.mjs'

test('detects assistant tool_use without tool_result or result as interrupted', () => {
  const entries = [
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'run tests' }],
      },
    },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Bash',
            input: { command: 'pytest test/integration/ --run-integration -v --tb=short' },
          },
        ],
      },
    },
  ]

  const integrity = analyzeClaudeSessionIntegrity(entries)

  assert.equal(integrity.hasDanglingToolUse, true)
  assert.deepEqual(integrity.danglingToolUseIds, ['toolu_1'])
  assert.equal(integrity.lastToolUse.id, 'toolu_1')
  assert.equal(integrity.lastToolUse.name, 'Bash')
  assert.equal(integrity.hasResult, false)
  assert.equal(integrity.recommendedDoneReason, 'interrupted')
})

test('detects raw message assistant wrapper dangling tool_use', () => {
  const entries = [
    {
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_wrapped',
            name: 'Bash',
            input: { command: 'npm test' },
          },
        ],
      },
    },
  ]

  const integrity = analyzeClaudeSessionIntegrity(entries)

  assert.equal(integrity.hasDanglingToolUse, true)
  assert.deepEqual(integrity.danglingToolUseIds, ['toolu_wrapped'])
  assert.equal(integrity.lastToolUse.name, 'Bash')
  assert.equal(integrity.recommendedDoneReason, 'interrupted')
})

test('does not flag tool_use when matching tool_result and result exist', () => {
  const entries = [
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'pwd' } }],
      },
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
      },
    },
    {
      type: 'result',
      subtype: 'success',
      session_id: '11111111-1111-1111-1111-111111111111',
    },
  ]

  const integrity = analyzeClaudeSessionIntegrity(entries)

  assert.equal(integrity.hasDanglingToolUse, false)
  assert.deepEqual(integrity.danglingToolUseIds, [])
  assert.equal(integrity.hasResult, true)
  assert.equal(integrity.recommendedDoneReason, 'completed')
})

test('plain assistant text without result is not treated as dangling tool', () => {
  const entries = [
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      },
    },
  ]

  const integrity = analyzeClaudeSessionIntegrity(entries)

  assert.equal(integrity.hasDanglingToolUse, false)
  assert.deepEqual(integrity.danglingToolUseIds, [])
  assert.equal(integrity.recommendedDoneReason, 'completed')
})

test('marks matching UI tool messages as interrupted once', () => {
  const messages = [
    { id: 1, role: 'assistant', text: 'I will run tests' },
    {
      id: 2,
      role: 'tool',
      toolName: 'Bash',
      toolUseId: 'toolu_1',
      status: 'running',
      text: '{"command":"pytest"}',
      expanded: true,
    },
  ]

  const integrity = {
    hasDanglingToolUse: true,
    danglingToolUseIds: ['toolu_1'],
  }

  const changed = markDanglingClaudeToolsInterrupted(messages, integrity, {
    nextId: () => 99,
  })
  const changedAgain = markDanglingClaudeToolsInterrupted(messages, integrity, {
    nextId: () => 100,
  })

  assert.equal(changed, true)
  assert.equal(changedAgain, false)
  assert.equal(messages[1].status, 'error')
  assert.equal(messages[1]._interruptedToolUse, true)
  assert.match(messages[1].toolError, /未返回结果/)
  assert.equal(messages.filter(m => m._isDanglingToolRecoveryNotice).length, 1)
})

test('ignores already completed tool messages when no dangling ids remain', () => {
  const messages = [
    { id: 1, role: 'tool', toolName: 'Bash', toolUseId: 'toolu_1', status: 'done', text: 'ok' },
  ]

  const changed = markDanglingClaudeToolsInterrupted(messages, {
    hasDanglingToolUse: false,
    danglingToolUseIds: [],
  })

  assert.equal(changed, false)
  assert.equal(messages[0].status, 'done')
  assert.equal(messages.some(m => m._isDanglingToolRecoveryNotice), false)
})
