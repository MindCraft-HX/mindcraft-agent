import test from 'node:test'
import assert from 'node:assert/strict'

import { areCodexMetricsEquivalent, mergeCodexMetrics } from '../packages/agent/src/components/codeX/utils/codexMetricsMerge.mjs'

test('mergeCodexMetrics preserves git fields from metrics result', () => {
  const merged = mergeCodexMetrics(
    { gitBranch: '', gitChanges: 0, model: '' },
    { model: 'gpt-5', gitBranch: 'main', gitChanges: 3 },
    { sessionId: 'sid-1' },
  )

  assert.equal(merged.gitBranch, 'main')
  assert.equal(merged.gitChanges, 3)
  assert.equal(merged.model, 'gpt-5')
  assert.equal(merged.sessionId, 'sid-1')
})

test('mergeCodexMetrics falls back to base git fields when result omits them', () => {
  const merged = mergeCodexMetrics(
    { gitBranch: 'feature/test', gitChanges: 2 },
    { model: 'gpt-5' },
    {},
  )

  assert.equal(merged.gitBranch, 'feature/test')
  assert.equal(merged.gitChanges, 2)
})

test('areCodexMetricsEquivalent ignores identical repeated payloads', () => {
  const current = {
    sessionId: 'sid-1',
    model: 'gpt-5',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    contextUsage: 111622,
    contextWindow: 258400,
    durationMs: 1009685,
    gitBranch: 'main',
    gitChanges: 3,
    thinking: false,
  }
  const merged = mergeCodexMetrics(current, {
    sessionId: 'sid-1',
    model: 'gpt-5',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    contextUsage: 111622,
    contextWindow: 258400,
    durationMs: 1009685,
    gitBranch: 'main',
    gitChanges: 3,
    thinking: false,
  })

  assert.equal(areCodexMetricsEquivalent(current, merged), true)
})

console.log('codex metrics merge test passed')
