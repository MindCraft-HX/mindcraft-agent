/**
 * Agent Protocol 测试
 *
 * 覆盖：event/command builder、envelope 验证、去重 key、通知资格判断
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PROTOCOL_VERSION,
  AgentDomain,
  TerminalKind,
  AgentCommand,
  buildAgentEvent,
  buildAgentTurnTerminalEvent,
  buildAgentRunDoneEvent,
  buildAgentMetricsUpdatedEvent,
  buildAgentErrorEvent,
  buildAgentCommand,
  validateAgentEventEnvelope,
  validateAgentCommandEnvelope,
  notificationDedupeKey,
  isSoundEligible,
} from '../packages/agent/src/components/agentCommon/runtime/agentProtocol.mjs'

// ── Event Builder ──

describe('buildAgentEvent', () => {
  it('constructs a minimal valid event', () => {
    const evt = buildAgentEvent({
      agent: 'codex',
      domain: AgentDomain.TURN_TERMINAL,
      chatKey: 'session-chat-1-abc',
      terminal: { kind: TerminalKind.COMPLETED, hasAssistantOutput: true },
    })

    assert.equal(evt.version, PROTOCOL_VERSION)
    assert.ok(typeof evt.eventId === 'string' && evt.eventId.startsWith('evt_'))
    assert.ok(typeof evt.timestamp === 'string')
    assert.equal(evt.agent, 'codex')
    assert.equal(evt.domain, AgentDomain.TURN_TERMINAL)
    assert.equal(evt.chatKey, 'session-chat-1-abc')
  })

  it('removes undefined fields', () => {
    const evt = buildAgentEvent({
      agent: 'claudeCode',
      domain: AgentDomain.TURN_TERMINAL,
      chatKey: 'k1',
      terminal: { kind: 'completed', hasAssistantOutput: true },
    })

    assert.equal('runId' in evt && evt.runId === undefined, false)
    assert.equal('metrics' in evt, false)
  })

  it('accepts external eventId and timestamp', () => {
    const evt = buildAgentEvent({
      agent: 'codex',
      domain: AgentDomain.TURN_TERMINAL,
      chatKey: 'k1',
      eventId: 'evt_custom_123',
      timestamp: '2026-06-24T12:00:00.000Z',
    })

    assert.equal(evt.eventId, 'evt_custom_123')
    assert.equal(evt.timestamp, '2026-06-24T12:00:00.000Z')
  })
})

describe('buildAgentTurnTerminalEvent', () => {
  it('produces a turn.terminal event with correct domain', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'k1',
      runId: 'run_1',
      cliSessionId: 'thread_abc',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
      turn: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200, durationMs: 5000 },
    })

    assert.equal(evt.domain, AgentDomain.TURN_TERMINAL)
    assert.equal(evt.terminal.kind, 'completed')
    assert.equal(evt.terminal.hasAssistantOutput, true)
    assert.equal(evt.turn.inputTokens, 100)
    assert.equal(evt.turn.durationMs, 5000)
  })
})

describe('buildAgentRunDoneEvent', () => {
  it('produces run.done event', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'claudeCode',
      chatKey: 'k1',
      runId: 'run_1',
      cliSessionId: 'cli_123',
    })

    assert.equal(evt.domain, AgentDomain.RUN_DONE)
    assert.equal(evt.terminal, undefined)
    assert.equal(evt.turn, undefined)
  })
})

describe('buildAgentMetricsUpdatedEvent', () => {
  it('produces metrics.updated event', () => {
    const evt = buildAgentMetricsUpdatedEvent({
      agent: 'codex',
      chatKey: 'k1',
      metrics: { inputTokens: 1000, outputTokens: 500 },
    })

    assert.equal(evt.domain, AgentDomain.METRICS_UPDATED)
    assert.equal(evt.metrics.inputTokens, 1000)
    assert.equal(evt.metrics.outputTokens, 500)
  })
})

describe('buildAgentErrorEvent', () => {
  it('produces error event', () => {
    const evt = buildAgentErrorEvent({
      agent: 'codex',
      chatKey: 'k1',
      error: { code: 'SDK_CRASH', message: 'CLI not found' },
    })

    assert.equal(evt.domain, AgentDomain.ERROR)
    assert.equal(evt.error.code, 'SDK_CRASH')
  })
})

// ── Command Builder ──

describe('buildAgentCommand', () => {
  it('constructs valid command', () => {
    const cmd = buildAgentCommand({
      agent: 'codex',
      command: AgentCommand.RUN_START,
      chatKey: 'k1',
      payload: { prompt: 'hello' },
    })

    assert.equal(cmd.version, PROTOCOL_VERSION)
    assert.ok(typeof cmd.commandId === 'string' && cmd.commandId.startsWith('cmd_'))
    assert.equal(cmd.command, AgentCommand.RUN_START)
    assert.deepEqual(cmd.payload, { prompt: 'hello' })
  })

  it('constructs valid command for claudeCode agent key', () => {
    const cmd = buildAgentCommand({
      agent: 'claudeCode',
      command: AgentCommand.RUN_ABORT,
      chatKey: 'k1',
      runId: 'run_1',
    })
    assert.equal(cmd.agent, 'claudeCode')
    assert.equal(cmd.command, AgentCommand.RUN_ABORT)
    const vr = validateAgentCommandEnvelope(cmd)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })
})

// ── Event Validation ──

describe('validateAgentEventEnvelope', () => {
  it('rejects null', () => {
    const r = validateAgentEventEnvelope(null)
    assert.equal(r.valid, false)
    assert.ok(r.errors.length > 0)
  })

  it('rejects missing required fields', () => {
    const r = validateAgentEventEnvelope({})
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('version')))
    assert.ok(r.errors.some(e => e.includes('eventId')))
    assert.ok(r.errors.some(e => e.includes('agent')))
    assert.ok(r.errors.some(e => e.includes('domain')))
    assert.ok(r.errors.some(e => e.includes('chatKey')))
  })

  it('rejects unknown agent', () => {
    const r = validateAgentEventEnvelope({
      version: 1, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'unknown', domain: AgentDomain.TURN_TERMINAL, chatKey: 'k1',
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('agent')))
  })

  it('rejects unknown domain', () => {
    const r = validateAgentEventEnvelope({
      version: 1, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'claudeCode', domain: 'agent.unknown', chatKey: 'k1',
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('domain')))
  })

  it('validates turn.terminal requires terminal object', () => {
    const r = validateAgentEventEnvelope({
      version: 1, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'codex', domain: AgentDomain.TURN_TERMINAL, chatKey: 'k1',
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('terminal')))
  })

  it('validates terminal.kind must be valid', () => {
    const r = validateAgentEventEnvelope({
      version: 1, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'codex', domain: AgentDomain.TURN_TERMINAL, chatKey: 'k1',
      terminal: { kind: 'unknown_status' },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('terminal.kind')))
  })

  it('validates error domain requires error object', () => {
    const r = validateAgentEventEnvelope({
      version: 1, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'claudeCode', domain: AgentDomain.ERROR, chatKey: 'k1',
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('error')))
  })

  it('accepts valid turn.terminal event', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
      turn: { inputTokens: 100, outputTokens: 50, durationMs: 1000 },
    })
    const r = validateAgentEventEnvelope(evt)
    assert.equal(r.valid, true, r.errors.join(', '))
  })

  it('accepts valid run.done event', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'claudeCode', chatKey: 'k1', cliSessionId: 'c1',
    })
    const r = validateAgentEventEnvelope(evt)
    assert.equal(r.valid, true, r.errors.join(', '))
  })

  it('rejects version mismatch', () => {
    const r = validateAgentEventEnvelope({
      version: 999, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'claudeCode', domain: AgentDomain.RUN_DONE, chatKey: 'k1',
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('version')))
  })

  it('rejects functions in event fields', () => {
    const r = validateAgentEventEnvelope({
      version: 1, eventId: 'evt_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'claudeCode', domain: AgentDomain.RUN_DONE, chatKey: 'k1',
      callback: () => {},
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('function')))
  })
})

// ── Command Validation ──

describe('validateAgentCommandEnvelope', () => {
  it('rejects missing fields', () => {
    const r = validateAgentCommandEnvelope({})
    assert.equal(r.valid, false)
    assert.ok(r.errors.length > 0)
  })

  it('rejects unknown command', () => {
    const r = validateAgentCommandEnvelope({
      version: 1, commandId: 'cmd_1', timestamp: '2026-01-01T00:00:00Z',
      agent: 'codex', command: 'agent.unknown', chatKey: 'k1',
    })
    assert.equal(r.valid, false)
  })

  it('accepts valid command', () => {
    const cmd = buildAgentCommand({
      agent: 'codex', command: AgentCommand.RUN_START, chatKey: 'k1',
    })
    const r = validateAgentCommandEnvelope(cmd)
    assert.equal(r.valid, true, r.errors.join(', '))
  })
})

// ── Dedupe Key ──

describe('notificationDedupeKey', () => {
  it('produces different keys for different agents', () => {
    const e1 = buildAgentTurnTerminalEvent({
      agent: 'claudeCode', chatKey: 'k1', terminalKind: TerminalKind.COMPLETED,
    })
    const e2 = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1', terminalKind: TerminalKind.COMPLETED,
    })
    assert.notEqual(notificationDedupeKey(e1), notificationDedupeKey(e2))
  })

  it('produces same key for same runId + terminal kind', () => {
    const e1 = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1', runId: 'run_1',
      terminalKind: TerminalKind.COMPLETED,
    })
    const e2 = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1', runId: 'run_1',
      terminalKind: TerminalKind.COMPLETED,
    })
    // Different eventIds but same dedupe key
    assert.notEqual(e1.eventId, e2.eventId)
    assert.equal(notificationDedupeKey(e1), notificationDedupeKey(e2))
  })

  it('produces different keys for different runIds', () => {
    const e1 = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1', runId: 'run_1',
      terminalKind: TerminalKind.COMPLETED,
    })
    const e2 = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1', runId: 'run_2',
      terminalKind: TerminalKind.COMPLETED,
    })
    assert.notEqual(notificationDedupeKey(e1), notificationDedupeKey(e2))
  })

  it('dedupes Claude double-done via cliSessionId + terminal.kind (no runId)', () => {
    // 模拟 Claude double-done：同一 session 内两次 completed terminal 事件
    const e1 = buildAgentTurnTerminalEvent({
      agent: 'claudeCode', chatKey: 'k1',
      cliSessionId: 'cli_abc',
      terminalKind: TerminalKind.COMPLETED,
    })
    const e2 = buildAgentTurnTerminalEvent({
      agent: 'claudeCode', chatKey: 'k1',
      cliSessionId: 'cli_abc',
      terminalKind: TerminalKind.COMPLETED,
    })
    // eventId 不同（每次生成），但 dedupe key 应相同
    assert.notEqual(e1.eventId, e2.eventId)
    assert.equal(notificationDedupeKey(e1), notificationDedupeKey(e2))
  })

  it('does NOT use eventId in dedupe key', () => {
    const e = buildAgentTurnTerminalEvent({
      agent: 'claudeCode', chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
    })
    const key = notificationDedupeKey(e)
    assert.ok(!key.includes(e.eventId), `key should NOT contain eventId: ${key}`)
  })
})

// ── Sound Eligibility ──

describe('isSoundEligible', () => {
  it('eligible: completed terminal with output', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    assert.equal(isSoundEligible(evt), true)
  })

  it('eligible: completed terminal with hasAssistantOutput omitted (defaults true in builder)', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
    })
    assert.equal(isSoundEligible(evt), true)
  })

  it('not eligible: failed terminal', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.FAILED,
    })
    assert.equal(isSoundEligible(evt), false)
  })

  it('not eligible: aborted terminal', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.ABORTED,
    })
    assert.equal(isSoundEligible(evt), false)
  })

  it('not eligible: interrupted terminal', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.INTERRUPTED,
    })
    assert.equal(isSoundEligible(evt), false)
  })

  it('not eligible: run.done event', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'codex', chatKey: 'k1',
    })
    assert.equal(isSoundEligible(evt), false)
  })

  it('not eligible: explicit hasAssistantOutput=false even if completed', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: false,
    })
    assert.equal(isSoundEligible(evt), false)
  })
})
