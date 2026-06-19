import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyCodexMetrics,
  buildPersistableCodexChat,
  markCodexAborted,
  markCodexAbortRequested,
  markCodexDone,
  markCodexQueued,
  markCodexStreamActivity,
  markCodexTerminalSeen,
  markCodexTurnStarting,
} from '../packages/agent/src/components/codeX/utils/codexRuntimeState.mjs'

test('terminal_seen keeps send lock but late metrics thinking=true cannot revive UI thinking', () => {
  const tab = { thinking: false, _awaitingDone: false, _thinkingStart: null, metrics: {} }

  markCodexTurnStarting(tab, 1000)
  markCodexTerminalSeen(tab)

  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, true)

  applyCodexMetrics(tab, { thinking: true, durationMs: 5000 })

  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, true)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.metrics.thinking, false)
})

test('done payload binds cli session and filepath then clears runtime fields', () => {
  const tab = {
    thinking: true,
    _awaitingDone: true,
    _thinkingStart: 1000,
    currentAssistantId: 'assistant-1',
    metrics: { thinking: true },
  }

  markCodexDone(tab, {
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/rollout-thread-1.jsonl',
    reason: 'completed',
  })

  assert.equal(tab.cliSessionId, 'thread-1')
  assert.equal(tab.filePath, 'C:/Users/demo/.codex/sessions/rollout-thread-1.jsonl')
  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, false)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.currentAssistantId, null)
  assert.equal(tab.metrics.thinking, false)
  assert.equal(Object.hasOwn(tab, '_codexRuntimeState'), false)
})

test('stream activity after terminal_seen does not reopen running state', () => {
  const tab = { thinking: true, _awaitingDone: true, _thinkingStart: 1000, metrics: { thinking: true } }

  markCodexTerminalSeen(tab)
  markCodexStreamActivity(tab, { type: 'item.updated' }, 2000)

  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, true)
  assert.equal(tab._thinkingStart, null)
})

test('abort requested keeps send lock until aborted clears it', () => {
  const tab = { thinking: true, _awaitingDone: true, _thinkingStart: 1000, currentAssistantId: 'a1' }

  markCodexAbortRequested(tab)

  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, true)
  assert.equal(tab._thinkingStart, null)
  assert.equal(tab.currentAssistantId, null)

  markCodexAborted(tab)

  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, false)
  assert.equal(Object.hasOwn(tab, '_codexRuntimeState'), false)
})

test('queued state keeps runtime lock and persistable cleanup removes memory-only state', () => {
  const tab = {
    sessionId: 'sid-1',
    thinking: false,
    _awaitingDone: false,
    _thinkingStart: null,
    metrics: { thinking: false },
  }

  markCodexQueued(tab, { text: 'retry me', messageId: 42, now: 3000 })

  assert.equal(tab.thinking, true)
  assert.equal(tab._awaitingDone, true)
  assert.equal(tab._queuedInput, 'retry me')
  assert.equal(tab._queuedInputMessageId, 42)

  const persistable = buildPersistableCodexChat({
    ...tab,
    filePath: 'C:/Users/demo/.codex/sessions/rollout-thread-1.jsonl',
  })

  assert.equal(persistable.thinking, false)
  assert.equal(persistable._awaitingDone, false)
  assert.equal(persistable._thinkingStart, null)
  assert.equal(persistable.currentAssistantId, null)
  assert.equal(Object.hasOwn(persistable, '_codexRuntimeState'), false)
})

console.log('codex runtime state test passed')
