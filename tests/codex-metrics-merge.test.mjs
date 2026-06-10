import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeCodexMetrics } from '../packages/agent/src/components/codeX/utils/codexMetricsMerge.mjs'

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

console.log('codex metrics merge test passed')
