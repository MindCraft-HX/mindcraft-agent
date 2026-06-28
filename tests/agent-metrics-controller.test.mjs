import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAgentTurnMetrics,
  buildStatusBarMetricsView,
  createDefaultAgentMetrics,
  hasAgentStatusBarSnapshot,
  hasAgentTurnTokenSample,
  mergeAgentRuntimeMetrics,
} from '../packages/agent/src/components/agentCommon/composables/useAgentMetricsController.js'

test('buildAgentTurnMetrics resets turn-owned token fields but preserves context', () => {
  const next = buildAgentTurnMetrics({
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 30,
    cacheCreationTokens: 5,
    contextUsage: 999,
    contextWindow: 200000,
    gitBranch: 'main',
  })

  assert.equal(next.inputTokens, 0)
  assert.equal(next.outputTokens, 0)
  assert.equal(next.cacheReadTokens, 0)
  assert.equal(next.cacheCreationTokens, 0)
  assert.equal(next.contextUsage, 999)
  assert.equal(next.contextWindow, 200000)
  assert.equal(next.gitBranch, 'main')
})

test('hasAgentTurnTokenSample only returns true for real positive turn token samples', () => {
  assert.equal(hasAgentTurnTokenSample({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }), false)
  assert.equal(hasAgentTurnTokenSample({ contextUsage: 999 }), false)
  assert.equal(hasAgentTurnTokenSample({ outputTokens: 12 }), true)
})

test('hasAgentStatusBarSnapshot detects visible status data, not default window metadata', () => {
  assert.equal(hasAgentStatusBarSnapshot({}), false)
  assert.equal(hasAgentStatusBarSnapshot({ contextWindow: 200000 }), false)
  assert.equal(hasAgentStatusBarSnapshot({ model: 'gpt-5-codex' }), false)
  assert.equal(hasAgentStatusBarSnapshot({ contextUsage: 1000, contextWindow: 200000 }), true)
  assert.equal(hasAgentStatusBarSnapshot({ outputTokens: 12 }), true)
  assert.equal(hasAgentStatusBarSnapshot({ durationMs: 2500 }), true)
})

test('mergeAgentRuntimeMetrics strips turn tokens from context-only updates while thinking', () => {
  const current = {
    inputTokens: 111,
    outputTokens: 222,
    cacheReadTokens: 333,
    contextUsage: 444,
  }
  const merged = mergeAgentRuntimeMetrics(current, {
    contextUsage: 555,
  }, {
    thinking: true,
    sessionId: 'sid-1',
  })

  assert.equal(merged.inputTokens, 111)
  assert.equal(merged.outputTokens, 222)
  assert.equal(merged.cacheReadTokens, 333)
  assert.equal(merged.contextUsage, 555)
  assert.equal(merged.sessionId, 'sid-1')
})

test('mergeAgentRuntimeMetrics allows finalized/live token samples through', () => {
  const merged = mergeAgentRuntimeMetrics(createDefaultAgentMetrics(), {
    inputTokens: 123,
    outputTokens: 45,
    cacheReadTokens: 6,
  }, {
    thinking: true,
    sessionId: 'sid-2',
  })

  assert.equal(merged.inputTokens, 123)
  assert.equal(merged.outputTokens, 45)
  assert.equal(merged.cacheReadTokens, 6)
  assert.equal(merged.sessionId, 'sid-2')
})

test('buildStatusBarMetricsView derives active session view from tab metrics', () => {
  const view = buildStatusBarMetricsView({
    sessionId: 'sid-3',
    model: 'claude-sonnet',
    metrics: {
      inputTokens: 50,
      contextUsage: 1000,
      gitBranch: 'feature/test',
    },
    _compacting: true,
  }, {
    model: 'claude-sonnet',
    compacting: true,
  })

  assert.equal(view.sessionId, 'sid-3')
  assert.equal(view.model, 'claude-sonnet')
  assert.equal(view.inputTokens, 50)
  assert.equal(view.contextUsage, 1000)
  assert.equal(view.gitBranch, 'feature/test')
  assert.equal(view.compacting, true)
})

console.log('agent metrics controller test passed')
