import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isCodexTurnLocked,
  mergeScannedChatsPreservingRuntime,
  shouldHydrateHistoryFromDisk,
  shouldSyncThinkingFromMetrics,
} from '../packages/agent/src/components/codeX/utils/sessionLifecycle.mjs'

test('Codex session remains locked while awaiting terminal done signal', () => {
  assert.equal(isCodexTurnLocked({ thinking: false, _awaitingDone: true }), true)
  assert.equal(isCodexTurnLocked({ thinking: true, _awaitingDone: false }), true)
  assert.equal(isCodexTurnLocked({ thinking: false, _awaitingDone: false }), false)
})

test('metrics thinking=false must not unlock session before done arrives', () => {
  assert.equal(shouldSyncThinkingFromMetrics({ currentThinking: false, awaitingDone: true, nextThinking: false }), false)
  assert.equal(shouldSyncThinkingFromMetrics({ currentThinking: false, awaitingDone: true, nextThinking: true }), true)
  assert.equal(shouldSyncThinkingFromMetrics({ currentThinking: false, awaitingDone: false, nextThinking: false }), true)
})

test('late metrics thinking=true must not revive a completed Codex turn', () => {
  assert.equal(shouldSyncThinkingFromMetrics({
    currentThinking: false,
    awaitingDone: false,
    nextThinking: true,
  }), false)
  assert.equal(shouldSyncThinkingFromMetrics({
    currentThinking: true,
    awaitingDone: false,
    nextThinking: true,
  }), true)
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

test('scan merge preserves unbound running Codex chat omitted by transcript scan', () => {
  const running = { id: 'chat-running', thinking: true, _awaitingDone: true, sessionId: 'codex-session-1' }
  const scanned = { id: 'chat-scanned', cliSessionId: 'thread-1', filePath: 'rollout-thread-1.jsonl' }
  const merged = mergeScannedChatsPreservingRuntime([running], [scanned], {})
  assert.deepEqual(merged.map(chat => chat.id), ['chat-scanned', 'chat-running'])
})

test('scan merge preserves active draft chat but drops inactive idle drafts', () => {
  const activeDraft = { id: 'chat-active', thinking: false, _awaitingDone: false }
  const idleDraft = { id: 'chat-idle', thinking: false, _awaitingDone: false }
  const scanned = { id: 'chat-scanned', cliSessionId: 'thread-1', filePath: 'rollout-thread-1.jsonl' }
  const merged = mergeScannedChatsPreservingRuntime([activeDraft, idleDraft], [scanned], {
    activeChatId: 'chat-active',
  })
  assert.deepEqual(merged.map(chat => chat.id), ['chat-scanned', 'chat-active'])
})
