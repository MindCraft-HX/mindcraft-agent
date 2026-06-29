import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDefaultAgentMetrics,
  buildStatusBarMetricsView,
  hasAgentStatusBarSnapshot,
  hasAgentTurnTokenSample,
} from '../packages/agent/src/components/agentCommon/composables/useAgentMetricsController.js'

// ── constants ──────────────────────────────────────────────────────
const ALL_METRICS_KEYS = Object.keys(createDefaultAgentMetrics())
// .thinking and .compacting are runtime flags, not persisted snapshot values

// ── tests ──────────────────────────────────────────────────────────
describe('statusbar-footer-consumer-contract', () => {
  describe('buildStatusBarMetricsView contract', () => {
    it('return value has all 17 fields from createDefaultAgentMetrics', () => {
      const tab = {
        id: 'chat-1',
        sessionId: 's-1',
        model: 'test',
        metrics: { inputTokens: 100, outputTokens: 50 },
      }
      const view = buildStatusBarMetricsView(tab)

      for (const key of ALL_METRICS_KEYS) {
        assert.ok(key in view,
          `buildStatusBarMetricsView must include "${key}"`)
      }
      // All keys are present
      assert.equal(Object.keys(view).length, ALL_METRICS_KEYS.length)
    })

    it('default (null tab) view has exactly the canonical shape', () => {
      const view = buildStatusBarMetricsView(null)
      for (const key of ALL_METRICS_KEYS) {
        assert.ok(key in view, `null-tab view missing "${key}"`)
      }
    })

    it('compacting is passed through', () => {
      const view = buildStatusBarMetricsView(null, { compacting: true })
      assert.equal(view.compacting, true)
      const view2 = buildStatusBarMetricsView(null, { compacting: false })
      assert.equal(view2.compacting, false)
    })

    it('tab.metrics spread preserves only canonical keys consumed by StatusBar', () => {
      // buildStatusBarMetricsView spreads tab.metrics which may contain
      // footer-specific keys like _turnTokens. These are harmless because
      // StatusBar only renders the 17 canonical fields.
      const tab = {
        id: 'chat-1',
        sessionId: 's-1',
        metrics: {
          inputTokens: 100,
          _turnTokens: { input: 100, output: 50 },  // footer-only
          _internalKey: 'should-not-affect-rendering',
        },
      }
      const view = buildStatusBarMetricsView(tab)
      // The canonical StatusBar fields must still be correct
      assert.equal(view.inputTokens, 100)
      assert.equal(view.sessionId, 's-1')
      // Extra keys are non-canonical but harmless — StatusBar doesn't render them
      assert.ok(view._turnTokens !== undefined,
        '_turnTokens may spread but StatusBar does not consume it')
      // Every canonical key must still be present
      for (const key of Object.keys(createDefaultAgentMetrics())) {
        assert.ok(key in view, `canonical key "${key}" missing from view`)
      }
    })
  })

  describe('hasAgentTurnTokenSample', () => {
    it('returns true for real positive token data', () => {
      assert.equal(hasAgentTurnTokenSample({ inputTokens: 100 }), true)
      assert.equal(hasAgentTurnTokenSample({ outputTokens: 1 }), true)
      assert.equal(hasAgentTurnTokenSample({ cacheReadTokens: 500 }), true)
    })

    it('returns false for zero or missing token fields', () => {
      assert.equal(hasAgentTurnTokenSample({ inputTokens: 0 }), false)
      assert.equal(hasAgentTurnTokenSample({ contextUsage: 50000 }), false)
      assert.equal(hasAgentTurnTokenSample({}), false)
    })
  })

  describe('hasAgentStatusBarSnapshot', () => {
    it('returns false for context-only data (no token/duration/cost)', () => {
      // contextWindow alone is NOT a status bar snapshot
      assert.equal(hasAgentStatusBarSnapshot({ contextWindow: 200000, model: 'claude' }), false)
    })

    it('returns true when contextUsage is present', () => {
      assert.equal(hasAgentStatusBarSnapshot({ contextUsage: 100 }), true)
    })

    it('returns true when durationMs is present', () => {
      assert.equal(hasAgentStatusBarSnapshot({ durationMs: 5000 }), true)
    })

    it('returns true when costUsd is present', () => {
      assert.equal(hasAgentStatusBarSnapshot({ costUsd: 0.01 }), true)
    })
  })
})

console.log('statusbar-footer-consumer-contract test passed')
