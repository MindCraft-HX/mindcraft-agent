import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CODEX_RUNTIME_STATES,
  claimCodexSessionForSend,
  isCodexTurnLocked,
  markCodexAbortRequested,
  markCodexDone,
  mergeCodexUpdatedAt,
  mergeScannedChatsPreservingRuntime,
  restoreCodexActiveRuns,
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
  assert.equal(shouldSyncThinkingFromMetrics({
    currentThinking: false,
    awaitingDone: true,
    nextThinking: true,
    runtimeState: CODEX_RUNTIME_STATES.TERMINAL_SEEN,
  }), false)
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

test('renderer reload restores only main-owned active Codex runs', () => {
  const running = { sessionId: 'chat-running', thinking: false, _awaitingDone: false, cliSessionId: 'thread-old' }
  const idle = { sessionId: 'chat-idle', thinking: false, _awaitingDone: false }

  const restored = restoreCodexActiveRuns([running, idle], [{
    chatKey: 'chat-running',
    runId: 'run-1',
    cliSessionId: 'thread-live',
    startedAt: 1234,
  }])

  assert.equal(restored, 1)
  assert.equal(isCodexTurnLocked(running), true)
  assert.equal(running._thinkingStart, 1234)
  assert.equal(running.cliSessionId, 'thread-live')
  assert.equal(isCodexTurnLocked(idle), false)
})

test('sending from a scanned transcript claims it without a blocking confirmation', async () => {
  const tab = {
    sessionId: 'codex::scan-1',
    cliSessionId: 'thread-1',
    filePath: 'C:/thread-1.jsonl',
    _resumeAllowed: false,
  }
  let payload = null

  const result = await claimCodexSessionForSend(tab, async (nextPayload) => {
    payload = nextPayload
    return { ok: true }
  })

  assert.deepEqual(payload, {
    sessionId: 'codex::scan-1',
    cliSessionId: 'thread-1',
    filePath: 'C:/thread-1.jsonl',
  })
  assert.deepEqual(result, { ok: true, claimed: true })
  assert.equal(tab._resumeAllowed, true)
  assert.equal(tab._resumeClaimed, true)
})

test('failed scanned-transcript claim leaves the composer session retryable', async () => {
  const tab = { sessionId: 'codex::scan-1', cliSessionId: 'thread-1', _resumeAllowed: false }

  const result = await claimCodexSessionForSend(tab, async () => ({ ok: false, error: 'claim failed' }))

  assert.deepEqual(result, { ok: false, error: 'claim failed' })
  assert.equal(tab._resumeAllowed, false)
  assert.notEqual(tab._resumeClaimed, true)
})

test('abort request keeps the Codex send lock until authoritative done', () => {
  const tab = { thinking: true, _awaitingDone: true, metrics: { thinking: true } }

  markCodexAbortRequested(tab)

  assert.equal(isCodexTurnLocked(tab), true)
  assert.equal(shouldHydrateHistoryFromDisk(tab), false)
  markCodexDone(tab, { reason: 'aborted' })
  assert.equal(isCodexTurnLocked(tab), false)
})

test('scan metadata must not roll back newer local Codex updatedAt', () => {
  assert.equal(
    mergeCodexUpdatedAt('2026-07-06T10:00:00.000Z', '2026-07-06T09:00:00.000Z'),
    '2026-07-06T10:00:00.000Z',
  )
  assert.equal(
    mergeCodexUpdatedAt('2026-07-06T10:00:00.000Z', '2026-07-06T11:00:00.000Z'),
    '2026-07-06T11:00:00.000Z',
  )
  assert.equal(mergeCodexUpdatedAt(null, '2026-07-06T09:00:00.000Z'), '2026-07-06T09:00:00.000Z')
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

test('scan merge preserves restored unbound local chat during startup refresh', () => {
  const restoredLocalChat = {
    id: 'chat-local',
    sessionId: 'codex-session-chat-32-1781778199275',
    thinking: false,
    _awaitingDone: false,
    _restoredFromPanelState: true,
    cliSessionId: '',
    filePath: '',
  }
  const scanned = { id: 'chat-scanned', cliSessionId: 'thread-1', filePath: 'rollout-thread-1.jsonl' }

  const merged = mergeScannedChatsPreservingRuntime([restoredLocalChat], [scanned], {})

  assert.deepEqual(merged.map(chat => chat.id), ['chat-scanned', 'chat-local'])
})

test('scan merge preserves restored non-resumable history tab omitted by transcript scan', () => {
  const restoredMetadataOnlyChat = {
    id: 'chat-metadata-only',
    sessionId: 'codex-session-1781832434153-3vxyu0ci',
    thinking: false,
    _awaitingDone: false,
    _restoredFromPanelState: true,
    _resumeAllowed: false,
    cliSessionId: '019ed433-9e89-7331-b062-c3487fd90af1',
    filePath: 'C:/Users/demo/.codex/sessions/missing.jsonl',
  }
  const scanned = { id: 'chat-scanned', cliSessionId: 'thread-1', filePath: 'rollout-thread-1.jsonl' }

  const merged = mergeScannedChatsPreservingRuntime([restoredMetadataOnlyChat], [scanned], {})

  assert.deepEqual(merged.map(chat => chat.id), ['chat-scanned', 'chat-metadata-only'])
})

test('scan merge drops restored resumable history tab when transcript scan no longer returns it', () => {
  const staleRestoredChat = {
    id: 'chat-stale',
    sessionId: 'codex-session-stale',
    thinking: false,
    _awaitingDone: false,
    _restoredFromPanelState: true,
    _resumeAllowed: true,
    cliSessionId: 'thread-stale',
    filePath: 'C:/Users/demo/.codex/sessions/missing.jsonl',
  }

  const merged = mergeScannedChatsPreservingRuntime([staleRestoredChat], [], {})

  assert.deepEqual(merged.map(chat => chat.id), [])
})

test('scan merge drops active bound stale chat omitted by transcript scan', () => {
  const staleActiveChat = {
    id: 'chat-stale-active',
    sessionId: 'codex-session-stale-active',
    thinking: false,
    _awaitingDone: false,
    cliSessionId: 'thread-stale',
    filePath: 'C:/Users/demo/.codex/sessions/missing.jsonl',
  }

  const merged = mergeScannedChatsPreservingRuntime([staleActiveChat], [], {
    activeChatId: 'chat-stale-active',
  })

  assert.deepEqual(merged.map(chat => chat.id), [])
})

test('scan merge preserves active local draft omitted by transcript scan', () => {
  const activeDraft = {
    id: 'chat-active-draft',
    sessionId: 'codex-session-chat-1-1781832434153',
    thinking: false,
    _awaitingDone: false,
    cliSessionId: '',
    filePath: '',
  }

  const merged = mergeScannedChatsPreservingRuntime([activeDraft], [], {
    activeChatId: 'chat-active-draft',
  })

  assert.deepEqual(merged.map(chat => chat.id), ['chat-active-draft'])
})
