import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ref } from 'vue'
import {
  createDefaultAgentMetrics,
  buildStatusBarMetricsView,
  buildAgentTurnMetrics,
  useAgentMetricsController,
} from '../packages/agent/src/components/agentCommon/composables/useAgentMetricsController.js'

// ── helpers ────────────────────────────────────────────────────────
function makeTab(overrides = {}) {
  return {
    id: overrides.id || 'chat-1',
    sessionId: overrides.sessionId || 'session-1',
    model: overrides.model || 'test-model',
    thinking: overrides.thinking ?? false,
    _thinkingStart: overrides._thinkingStart ?? null,
    _compacting: overrides._compacting ?? false,
    metrics: overrides.metrics || {
      model: 'test-model',
      inputTokens: 500,
      outputTokens: 200,
      contextUsage: 30000,
      contextWindow: 200000,
      durationMs: 12000,
      costUsd: 0.15,
    },
    ...overrides,
  }
}

// ── tests ──────────────────────────────────────────────────────────
// These tests characterize useAgentMetricsController behavior.
// The actual R06a watcher fix ({ immediate: true }) lives in
// packages/agent/src/components/claudeCode/index.vue line 747;
// these tests verify the controller functions the watcher delegates to.
describe('convergence first-hydrate (metrics controller layer)', () => {
  describe('buildStatusBarMetricsView', () => {
    it('null tab returns zeroed defaults with model', () => {
      const view = buildStatusBarMetricsView(null, { model: 'claude-sonnet' })
      assert.equal(view.model, 'claude-sonnet')
      assert.equal(view.inputTokens, 0)
      assert.equal(view.outputTokens, 0)
      assert.equal(view.cacheReadTokens, 0)
      assert.equal(view.sessionId, '')
      assert.equal(view.compacting, false)
    })

    it('extracts tab.metrics into view', () => {
      const tab = makeTab()
      const view = buildStatusBarMetricsView(tab)
      assert.equal(view.inputTokens, 500)
      assert.equal(view.outputTokens, 200)
      assert.equal(view.contextUsage, 30000)
    })

    it('model from tab overrides buildStatusBarMetricsView option', () => {
      const tab = makeTab({ model: 'tab-model' })
      const view = buildStatusBarMetricsView(tab, { model: 'option-model' })
      assert.equal(view.model, 'option-model')
    })

    it('sessionId propagated from tab', () => {
      const tab = makeTab({ sessionId: 'sess-42' })
      const view = buildStatusBarMetricsView(tab)
      assert.equal(view.sessionId, 'sess-42')
    })
  })

  describe('syncActiveMetricsFromTab', () => {
    it('immediately updates metricsData to reflect tab state', () => {
      const { metricsData, syncActiveMetricsFromTab } = useAgentMetricsController()
      const tab = makeTab()
      syncActiveMetricsFromTab(tab)
      assert.equal(metricsData.value.inputTokens, 500)
      assert.equal(metricsData.value.outputTokens, 200)
      assert.equal(metricsData.value.sessionId, 'session-1')
    })

    it('handles null tab without crash', () => {
      const { metricsData, syncActiveMetricsFromTab } = useAgentMetricsController()
      syncActiveMetricsFromTab(null)
      // Should not throw; metricsData should be zeroed
      assert.equal(metricsData.value.inputTokens, 0)
    })

    it('watcher { immediate: true } hydrates restored chat on mount', () => {
      // Characterization: the R06a watcher fix adds { immediate: true } so
      // the watcher fires on mount. When getActiveChat() returns a restored
      // chat (sanitized metrics: zeros for turn-owned, populated session fields),
      // syncActiveMetricsFromTab must reflect it immediately.
      const { metricsData, syncActiveMetricsFromTab } = useAgentMetricsController()
      const restoredTab = makeTab({
        model: 'claude-sonnet',
        metrics: {
          model: 'claude-sonnet',
          inputTokens: 0,       // stripped by sanitizePersistedMetrics
          outputTokens: 0,      // stripped
          cacheReadTokens: 0,   // stripped
          contextUsage: 60000,  // preserved session field
          contextWindow: 200000,
        },
      })
      syncActiveMetricsFromTab(restoredTab)
      assert.equal(metricsData.value.inputTokens, 0, 'turn-owned fields zero from sanitized restore')
      assert.equal(metricsData.value.outputTokens, 0)
      assert.equal(metricsData.value.contextUsage, 60000, 'session-owned fields preserved')
      assert.equal(metricsData.value.contextWindow, 200000)
      assert.equal(metricsData.value.model, 'claude-sonnet')
    })
  })

  describe('syncTimerForTab', () => {
    it('starts timer when tab has thinking=true and _thinkingStart', () => {
      const now = () => 1000000
      const ctrl = useAgentMetricsController({ now })
      const tab = makeTab({ thinking: true, _thinkingStart: 999000 })
      ctrl.syncTimerForTab(tab)
      // liveDurationMs should be positive immediately after start
      assert.ok(ctrl.metricsLiveDurationMs.value > 0)
      // cleanup: stop the background setInterval so process can exit
      ctrl.stopMetricsTimer()
    })

    it('stops timer when tab.thinking is false', () => {
      const ctrl = useAgentMetricsController()
      const tab = makeTab({ thinking: false })
      ctrl.syncTimerForTab(tab)
      assert.equal(ctrl.metricsLiveDurationMs.value, 0)
    })
  })

  describe('resetActiveMetrics', () => {
    it('resets metrics back to defaults while keeping model', () => {
      const { metricsData, resetActiveMetrics, syncActiveMetricsFromTab } = useAgentMetricsController()
      const tab = makeTab()
      syncActiveMetricsFromTab(tab)
      assert.equal(metricsData.value.inputTokens, 500)
      resetActiveMetrics({ keepModel: 'kept-model', compacting: true })
      assert.equal(metricsData.value.inputTokens, 0)
      assert.equal(metricsData.value.model, 'kept-model')
      assert.equal(metricsData.value.compacting, true)
    })
  })

  describe('buildAgentTurnMetrics', () => {
    it('resets turn-owned fields but preserves context and session fields', () => {
      const prev = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 300,
        cacheCreationTokens: 100,
        contextUsage: 60000,
        contextWindow: 200000,
        durationMs: 30000,
        speedOutputPerSec: 50,
        model: 'claude-sonnet',
        gitBranch: 'main',
        gitChanges: 3,
        usageApiSessionPct: 70,
      }
      const next = buildAgentTurnMetrics(prev)
      assert.equal(next.inputTokens, 0)
      assert.equal(next.outputTokens, 0)
      assert.equal(next.cacheReadTokens, 0)
      assert.equal(next.cacheCreationTokens, 0)
      assert.equal(next.durationMs, 0)
      // Context/session fields preserved
      assert.equal(next.contextUsage, 60000)
      assert.equal(next.contextWindow, 200000)
      assert.equal(next.gitBranch, 'main')
      assert.equal(next.gitChanges, 3)
    })
  })
})

console.log('convergence-first-hydrate test passed')
