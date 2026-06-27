import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CURRENT_TURN_METRIC_FIELDS,
  sanitizePersistedMetrics,
} from '../packages/agent/src/components/agentCommon/utils/persistedMetrics.mjs'

test('sanitizePersistedMetrics strips current-turn token fields', () => {
  const metrics = {
    model: 'm',
    contextUsage: 1000,
    contextWindow: 200000,
    gitBranch: 'main',
    gitChanges: 1,
    thinking: true,
  }
  for (const field of CURRENT_TURN_METRIC_FIELDS) {
    metrics[field] = 123
  }

  const sanitized = sanitizePersistedMetrics(metrics)

  for (const field of CURRENT_TURN_METRIC_FIELDS) {
    assert.equal(sanitized[field], undefined)
  }
  assert.equal(sanitized.model, 'm')
  assert.equal(sanitized.contextUsage, 1000)
  assert.equal(sanitized.contextWindow, 200000)
  assert.equal(sanitized.gitBranch, 'main')
  assert.equal(sanitized.gitChanges, 1)
  assert.equal(sanitized.thinking, false)
})

test('sanitizePersistedMetrics returns null for empty input', () => {
  assert.equal(sanitizePersistedMetrics(null), null)
  assert.equal(sanitizePersistedMetrics(undefined), null)
})
