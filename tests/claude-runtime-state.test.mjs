import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyClaudeMetrics,
  buildPersistableClaudeChat,
  isClaudeTurnLocked,
  markClaudeAborted,
  markClaudeAbortRequested,
  markClaudeDone,
  markClaudeIdle,
  markClaudeSessionCleared,
  markClaudeStreamActivity,
  markClaudeTurnStarting,
} from '../packages/agent/src/components/claudeCode/utils/claudeRuntimeState.mjs'

test('Claude runtime starting to done clears lifecycle fields and binds session identity', () => {
  const tab = {
    thinking: false,
    _thinkingStart: null,
    currentAssistantId: 'assistant-1',
    metrics: { thinking: false },
  }

  markClaudeTurnStarting(tab, 1000)
  assert.equal(tab.thinking, true)
  assert.equal(tab._thinkingStart, 1000)
  assert.equal(tab._pendingSessionBinding, true)
  assert.equal(isClaudeTurnLocked(tab), true)

  markClaudeDone(tab, {
    cliSessionId: 'cli-1',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    reason: 'completed',
  })

  assert.equal(tab.cliSessionId, 'cli-1')
  assert.equal(tab.filePath, 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl')
  assert.equal(tab.thinking, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.currentAssistantId, null)
  assert.equal(tab.metrics.thinking, false)
  assert.equal(tab._claudeRuntimeState, 'done')
})

test('late stream activity after done does not revive thinking', () => {
  const tab = { thinking: true, _thinkingStart: 1000, metrics: { thinking: true } }

  markClaudeDone(tab, { reason: 'completed' })
  markClaudeStreamActivity(tab, { type: 'assistant' }, 2000)

  assert.equal(tab.thinking, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.metrics.thinking, false)
})

test('late stream activity after explicit idle does not revive thinking', () => {
  const tab = { thinking: true, _thinkingStart: 1000, metrics: { thinking: true } }

  markClaudeIdle(tab)
  markClaudeStreamActivity(tab, { type: 'assistant' }, 2000)

  assert.equal(tab.thinking, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.metrics.thinking, false)
  assert.equal(tab._claudeRuntimeState, 'idle')
})

test('late metrics thinking does not own runtime state after done', () => {
  const tab = { thinking: true, _thinkingStart: 1000, metrics: { thinking: true } }

  markClaudeDone(tab, { reason: 'completed' })
  applyClaudeMetrics(tab, { thinking: true, durationMs: 5000 })

  assert.equal(tab.thinking, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.metrics.thinking, false)
})

test('abort requested clears UI running and aborted unlocks runtime', () => {
  const tab = { thinking: true, _thinkingStart: 1000, currentAssistantId: 'a1' }

  markClaudeAbortRequested(tab)

  assert.equal(tab.thinking, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.currentAssistantId, null)
  assert.equal(isClaudeTurnLocked(tab), true)

  markClaudeAborted(tab)

  assert.equal(tab.thinking, false)
  assert.equal(isClaudeTurnLocked(tab), false)
  assert.equal(tab._claudeRuntimeState, 'aborted')
})

test('persistable Claude chat strips memory-only runtime state', () => {
  const persistable = buildPersistableClaudeChat({
    id: 'chat-1',
    thinking: true,
    _thinkingStart: 12345,
    currentAssistantId: 'a1',
    _claudeRuntimeState: 'streaming',
    metrics: { thinking: true, model: 'claude-sonnet' },
  })

  assert.equal(persistable.thinking, false)
  assert.equal(persistable._thinkingStart, null)
  assert.equal(persistable.currentAssistantId, null)
  assert.equal(persistable.metrics.thinking, false)
  assert.equal(persistable.metrics.model, 'claude-sonnet')
  assert.equal(Object.hasOwn(persistable, '_claudeRuntimeState'), false)
})

test('clearing Claude session drops old transcript binding', () => {
  const tab = {
    cliSessionId: 'cli-old',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-old.jsonl',
    fileSize: 12345,
    _messagesLoaded: false,
    _pendingSessionBinding: false,
    _expectedCliSessionId: 'cli-old',
    thinking: true,
    _thinkingStart: 1000,
    currentAssistantId: 'assistant-1',
  }

  markClaudeSessionCleared(tab)

  assert.equal(tab.cliSessionId, null)
  assert.equal(tab.filePath, '')
  assert.equal(tab.fileSize, null)
  assert.equal(tab._messagesLoaded, true)
  assert.equal(tab._pendingSessionBinding, false)
  assert.equal(Object.hasOwn(tab, '_expectedCliSessionId'), false)
  assert.equal(tab.thinking, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.currentAssistantId, null)
  assert.equal(tab._claudeRuntimeState, 'idle')
})

test('cleared Claude session only becomes pending after the next send starts', () => {
  const tab = {
    cliSessionId: 'cli-old',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-old.jsonl',
    _pendingSessionBinding: false,
  }

  markClaudeSessionCleared(tab)
  assert.equal(tab._pendingSessionBinding, false)

  markClaudeTurnStarting(tab, 2000)
  assert.equal(tab._pendingSessionBinding, true)
  assert.equal(tab.thinking, true)
})

console.log('claude runtime state test passed')
