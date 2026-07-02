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
  markClaudeStreamActivity,
  markClaudeTurnStarting,
  sanitizeClaudePersistedMetrics,
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
    draftText: 'do not persist this',
    metrics: {
      thinking: true,
      model: 'claude-sonnet',
      inputTokens: 25825894,
      outputTokens: 570331,
      cacheReadTokens: 128519552,
      cacheCreationTokens: 123,
      durationMs: 617112,
      costUsd: 42,
      contextUsage: 164130,
      contextWindow: 200000,
    },
  })

  assert.equal(persistable.thinking, false)
  assert.equal(persistable._thinkingStart, null)
  assert.equal(persistable.currentAssistantId, null)
  assert.equal(persistable.metrics.thinking, false)
  assert.equal(persistable.metrics.model, 'claude-sonnet')
  assert.equal(persistable.metrics.inputTokens, undefined)
  assert.equal(persistable.metrics.outputTokens, undefined)
  assert.equal(persistable.metrics.cacheReadTokens, undefined)
  assert.equal(persistable.metrics.cacheCreationTokens, undefined)
  assert.equal(persistable.metrics.durationMs, undefined)
  assert.equal(persistable.metrics.costUsd, undefined)
  assert.equal(persistable.metrics.contextUsage, 164130)
  assert.equal(persistable.metrics.contextWindow, 200000)
  assert.equal(persistable.draftText, '')
  assert.equal(Object.hasOwn(persistable, '_claudeRuntimeState'), false)
})

test('persisted Claude metrics sanitizer preserves session fields only', () => {
  const sanitized = sanitizeClaudePersistedMetrics({
    model: 'claude-sonnet',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 200,
    cacheCreationTokens: 10,
    durationMs: 1234,
    costUsd: 1,
    contextUsage: 9000,
    contextWindow: 200000,
    gitBranch: 'main',
    gitChanges: 2,
    thinking: true,
  })

  assert.equal(sanitized.inputTokens, undefined)
  assert.equal(sanitized.outputTokens, undefined)
  assert.equal(sanitized.cacheReadTokens, undefined)
  assert.equal(sanitized.cacheCreationTokens, undefined)
  assert.equal(sanitized.durationMs, undefined)
  assert.equal(sanitized.costUsd, undefined)
  assert.equal(sanitized.contextUsage, 9000)
  assert.equal(sanitized.contextWindow, 200000)
  assert.equal(sanitized.gitBranch, 'main')
  assert.equal(sanitized.gitChanges, 2)
  assert.equal(sanitized.thinking, false)
})

console.log('claude runtime state test passed')
