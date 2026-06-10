import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isCodexTurnLocked,
  shouldHydrateHistoryFromDisk,
  shouldSyncThinkingFromMetrics,
} from '../packages/agent/src/components/codeX/utils/sessionLifecycle.mjs'

test('Codex session remains locked while awaiting terminal done signal', () => {
  assert.equal(isCodexTurnLocked({ thinking: false, _awaitingDone: true }), true)
  assert.equal(isCodexTurnLocked({ thinking: true, _awaitingDone: false }), true)
  assert.equal(isCodexTurnLocked({ thinking: false, _awaitingDone: false }), false)
})

test('metrics thinking=false must not unlock session before done arrives', () => {
  assert.equal(shouldSyncThinkingFromMetrics({ awaitingDone: true, nextThinking: false }), false)
  assert.equal(shouldSyncThinkingFromMetrics({ awaitingDone: true, nextThinking: true }), true)
  assert.equal(shouldSyncThinkingFromMetrics({ awaitingDone: false, nextThinking: false }), true)
})

test('streaming session should keep in-memory messages instead of reloading disk history', () => {
  assert.equal(shouldHydrateHistoryFromDisk({ thinking: true, _awaitingDone: false }), false)
  assert.equal(shouldHydrateHistoryFromDisk({ thinking: false, _awaitingDone: true }), false)
  assert.equal(shouldHydrateHistoryFromDisk({ thinking: false, _awaitingDone: false }), true)
})

test('cold-restored session must not stay locked by stale awaitingDone flag', () => {
  const restored = { thinking: false, _awaitingDone: false }
  assert.equal(isCodexTurnLocked(restored), false)
  assert.equal(shouldHydrateHistoryFromDisk(restored), true)
})
