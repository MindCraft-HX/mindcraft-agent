/**
 * PR 3 测试：Agent 通知闸门
 *
 * 验证 shouldPlayNotificationSound 在各种事件下的行为：
 * - completed 播放一次
 * - failed/aborted/interrupted 不播放
 * - dedup key 防重
 * - run.done 不播放
 * - 去重窗口 FIFO 淘汰
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  DEDUPE_TTL_MS,
  shouldPlayNotificationSound,
  _resetDedupeWindow,
  _getDedupeWindowSize,
} from '../packages/agent/src/components/agentCommon/runtime/agentNotificationGate.mjs'
import {
  AgentDomain,
  TerminalKind,
  buildAgentTurnTerminalEvent,
  buildAgentRunDoneEvent,
} from '../packages/agent/src/components/agentCommon/runtime/agentProtocol.mjs'

beforeEach(() => _resetDedupeWindow())

// ── completed 播放 ──

describe('completed → should play', () => {
  it('Claude turn.terminal completed', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-1',
      cliSessionId: 'abc123',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, true, `expected shouldPlay=true, got ${result.reason}`)
  })

  it('CodeX turn.terminal completed', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'session-codex-1',
      runId: 'run_001',
      cliSessionId: 'thread_xyz',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, true, `expected shouldPlay=true, got ${result.reason}`)
  })
})

// ── failed/aborted/interrupted 不播放 ──

describe('failed/aborted/interrupted → should NOT play', () => {
  it('failed terminal', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-fail',
      cliSessionId: 'fail-1',
      terminalKind: TerminalKind.FAILED,
      hasAssistantOutput: true,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, false)
    assert.equal(result.reason, 'not-eligible')
  })

  it('aborted terminal', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'session-abort',
      runId: 'run_abort',
      cliSessionId: 'thread_abort',
      terminalKind: TerminalKind.ABORTED,
      hasAssistantOutput: true,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, false)
    assert.equal(result.reason, 'not-eligible')
  })

  it('completed but no assistant output', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-noout',
      cliSessionId: 'no-out',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: false,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, false)
    assert.equal(result.reason, 'not-eligible')
  })

  it('completed but hasAssistantOutput is undefined → defaults to eligible', () => {
    // isSoundEligible uses !== false, not === true — undefined means "we don't know",
    // so we default to playing the sound. Only explicit false suppresses it.
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'session-null',
      runId: 'run_null',
      terminalKind: TerminalKind.COMPLETED,
      // hasAssistantOutput not set → undefined → eligible (safe default)
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, true)
    assert.equal(result.reason, 'ok')
  })
})

// ── run.done 不播放 ──

describe('run.done → should NOT play', () => {
  it('Claude run.done', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'claudeCode',
      chatKey: 'session-1',
      cliSessionId: 'abc123',
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, false)
    assert.equal(result.reason, 'not-eligible')
  })

  it('CodeX run.done', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'codex',
      chatKey: 'session-codex-1',
      runId: 'run_001',
      cliSessionId: 'thread_xyz',
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, false)
    assert.equal(result.reason, 'not-eligible')
  })
})

// ── dedup key 防重 ──

describe('dedup key prevents duplicates', () => {
  it('same session+cliSessionId plays only once', () => {
    const evt1 = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-dup',
      cliSessionId: 'dup-1',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const evt2 = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-dup',
      cliSessionId: 'dup-1',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })

    const r1 = shouldPlayNotificationSound(evt1, { now: 1000 })
    assert.equal(r1.shouldPlay, true, `first should play, got ${r1.reason}`)

    const r2 = shouldPlayNotificationSound(evt2, { now: 1000 })
    assert.equal(r2.shouldPlay, false, `second should be duplicate, got ${r2.reason}`)
    assert.equal(r2.reason, 'duplicate')
  })

  it('same Claude session+cliSessionId can play again after the dedupe TTL', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-repeat-turns',
      cliSessionId: 'same-claude-session',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })

    const r1 = shouldPlayNotificationSound(evt, { now: 1000 })
    assert.equal(r1.shouldPlay, true, `first turn should play, got ${r1.reason}`)

    const r2 = shouldPlayNotificationSound(evt, { now: 1000 + DEDUPE_TTL_MS + 1 })
    assert.equal(r2.shouldPlay, true, `later turn should play again, got ${r2.reason}`)
  })

  it('CodeX duplicate (same session+runId) blocked', () => {
    const evt1 = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'codex-dup',
      runId: 'run_dup',
      cliSessionId: 'thread_dup',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const evt2 = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'codex-dup',
      runId: 'run_dup',
      cliSessionId: 'thread_dup',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })

    const r1 = shouldPlayNotificationSound(evt1, { now: 2000 })
    assert.equal(r1.shouldPlay, true, `first should play, got ${r1.reason}`)

    const r2 = shouldPlayNotificationSound(evt2, { now: 2000 })
    assert.equal(r2.shouldPlay, false, `second should be duplicate, got ${r2.reason}`)
    assert.equal(r2.reason, 'duplicate')
  })

  it('same session but different kind (completed vs failed) → failed not eligible anyway', () => {
    // First: completed (plays)
    const good = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-kind',
      cliSessionId: 'kind-1',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const r1 = shouldPlayNotificationSound(good)
    assert.equal(r1.shouldPlay, true)

    // Second: not eligible because failed
    const bad = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-kind',
      cliSessionId: 'kind-1',
      terminalKind: TerminalKind.FAILED,
      hasAssistantOutput: true,
    })
    const r2 = shouldPlayNotificationSound(bad)
    assert.equal(r2.shouldPlay, false)
    assert.equal(r2.reason, 'not-eligible')
  })
})

// ── 去重窗口 FIFO ──

describe('dedup window FIFO eviction', () => {
  it('window stays bounded at ~32 entries', () => {
    for (let i = 0; i < 50; i++) {
      const evt = buildAgentTurnTerminalEvent({
        agent: 'claudeCode',
        chatKey: `session-${i}`,
        cliSessionId: `sid-${i}`,
        terminalKind: TerminalKind.COMPLETED,
        hasAssistantOutput: true,
      })
      shouldPlayNotificationSound(evt)
    }

    const size = _getDedupeWindowSize()
    assert.ok(size <= 32, `window size ${size} should be <= 32`)

    // Oldest entries (session-0..session-17) should have been evicted
    const oldEvt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-0',
      cliSessionId: 'sid-0',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const result = shouldPlayNotificationSound(oldEvt)
    assert.equal(result.shouldPlay, true, `evicted entry should play again`)
  })
})

// ── hasAssistantOutput 边界 ──

describe('hasAssistantOutput guard', () => {
  it('explicitly false does not play', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-no',
      cliSessionId: 'no-out',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: false,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, false)
    assert.equal(result.reason, 'not-eligible')
  })

  it('explicitly true completes eligibility', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-yes',
      cliSessionId: 'yes-out',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    const result = shouldPlayNotificationSound(evt)
    assert.equal(result.shouldPlay, true)
  })
})
