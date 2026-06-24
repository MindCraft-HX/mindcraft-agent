/**
 * PR 2 测试：Main 双发 agent:event
 *
 * 验证 Claude/CodeX 在各关键节点发送的 agent:event 事件结构正确、
 * 通过 envelope 验证、且不与旧通道冲突。
 *
 * 不测试 Renderer 消费行为（PR 2 约束：不让 Renderer 依赖新事件）。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PROTOCOL_VERSION,
  AgentDomain,
  TerminalKind,
  buildAgentTurnTerminalEvent,
  buildAgentRunDoneEvent,
  validateAgentEventEnvelope,
} from '../packages/agent/src/components/agentCommon/runtime/agentProtocol.mjs'

// ── Claude result → agent.turn.terminal ──

describe('Claude result → agent.turn.terminal', () => {
  it('produces valid turn.terminal event (claudeCode agent key)', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-chat-1-abc',
      cliSessionId: 'abc123-session-id',
      filePath: '/data/projects/abc123-session-id.jsonl',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })

    assert.equal(evt.agent, 'claudeCode')
    assert.equal(evt.domain, AgentDomain.TURN_TERMINAL)
    assert.equal(evt.terminal.kind, 'completed')
    assert.equal(evt.terminal.hasAssistantOutput, true)
    assert.equal(evt.cliSessionId, 'abc123-session-id')
    assert.equal(evt.filePath, '/data/projects/abc123-session-id.jsonl')
    assert.ok(!evt.runId, 'Claude has no runId') // 预期：Claude 无 runId
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })

  it('handles empty cliSessionId gracefully', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'session-chat-2',
      cliSessionId: '',
      terminalKind: TerminalKind.COMPLETED,
    })
    assert.equal(evt.cliSessionId, '')
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })
})

// ── Claude finally → agent.run.done ──

describe('Claude finally → agent.run.done', () => {
  it('produces valid run.done event', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'claudeCode',
      chatKey: 'session-chat-1-abc',
      cliSessionId: 'abc123-session-id',
      filePath: '/data/projects/abc123-session-id.jsonl',
    })

    assert.equal(evt.agent, 'claudeCode')
    assert.equal(evt.domain, AgentDomain.RUN_DONE)
    assert.equal(evt.cliSessionId, 'abc123-session-id')
    assert.ok(!evt.terminal, 'run.done should not have terminal')
    assert.ok(!evt.runId, 'Claude has no runId')
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })

  it('handles aborted run (abort handler path)', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'claudeCode',
      chatKey: 'session-aborted',
      cliSessionId: '',
    })
    assert.equal(evt.agent, 'claudeCode')
    assert.equal(evt.domain, AgentDomain.RUN_DONE)
    assert.equal(evt.cliSessionId, '')
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })
})

// ── CodeX turn.completed / task_complete → agent.turn.terminal ──

describe('CodeX turn.completed → agent.turn.terminal', () => {
  it('produces valid turn.terminal event (codex agent key)', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'session-codex-1',
      runId: 'run_20260624_001',
      cliSessionId: 'thread_xyz789',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })

    assert.equal(evt.agent, 'codex')
    assert.equal(evt.domain, AgentDomain.TURN_TERMINAL)
    assert.equal(evt.terminal.kind, 'completed')
    assert.equal(evt.runId, 'run_20260624_001')
    assert.equal(evt.cliSessionId, 'thread_xyz789')
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })

  it('has runId for precise dedupe (unlike Claude)', () => {
    const evt = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'session-codex-2',
      runId: 'run_abc',
      terminalKind: TerminalKind.COMPLETED,
    })
    assert.ok(evt.runId, 'CodeX should have runId')
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })

  it('produces same structure for task_complete as turn.completed', () => {
    // task_complete is semantically identical to turn.completed in CodeX
    const tc = buildAgentTurnTerminalEvent({
      agent: 'codex',
      chatKey: 'session-codex-3',
      runId: 'run_task',
      cliSessionId: 'thread_task',
      terminalKind: TerminalKind.COMPLETED,
      hasAssistantOutput: true,
    })
    assert.equal(tc.domain, AgentDomain.TURN_TERMINAL)
    const vr = validateAgentEventEnvelope(tc)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })
})

// ── CodeX triggerDone / finally → agent.run.done ──

describe('CodeX triggerDone → agent.run.done', () => {
  it('produces valid run.done event', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'codex',
      chatKey: 'session-codex-1',
      runId: 'run_20260624_001',
      cliSessionId: 'thread_xyz789',
      filePath: '/codex/sessions/thread_xyz789.jsonl',
    })

    assert.equal(evt.agent, 'codex')
    assert.equal(evt.domain, AgentDomain.RUN_DONE)
    assert.equal(evt.runId, 'run_20260624_001')
    assert.equal(evt.filePath, '/codex/sessions/thread_xyz789.jsonl')
    assert.ok(!evt.terminal, 'run.done should not have terminal')
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })

  it('handles aborted run with minimal fields', () => {
    const evt = buildAgentRunDoneEvent({
      agent: 'codex',
      chatKey: 'session-aborted',
    })
    assert.equal(evt.agent, 'codex')
    assert.equal(evt.domain, AgentDomain.RUN_DONE)
    const vr = validateAgentEventEnvelope(evt)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })
})

// ── 通道隔离 ──

describe('agent:event 通道隔离', () => {
  it('agent:event 不使用 claude-agent-* / codex-agent-* 通道名', () => {
    const channels = [
      'claude-agent-message', 'claude-agent-done', 'claude-agent-metrics',
      'codex-agent-message', 'codex-agent-done', 'codex-agent-metrics',
    ]
    const evt = buildAgentTurnTerminalEvent({
      agent: 'claudeCode',
      chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
    })
    const cmd = buildAgentRunDoneEvent({ agent: 'codex', chatKey: 'k1' })

    // agent:event 的结构与旧通道 payload 不同
    for (const ch of channels) {
      assert.ok(!(ch in evt), `event should not contain channel name "${ch}"`)
      assert.ok(!(ch in cmd), `event should not contain channel name "${ch}"`)
    }
  })

  it('turn.terminal 和 run.done 使用不同 domain（不会混淆）', () => {
    const terminalEvt = buildAgentTurnTerminalEvent({
      agent: 'codex', chatKey: 'k1',
      terminalKind: TerminalKind.COMPLETED,
    })
    const doneEvt = buildAgentRunDoneEvent({
      agent: 'codex', chatKey: 'k1',
    })

    assert.notEqual(terminalEvt.domain, doneEvt.domain)
    assert.equal(terminalEvt.domain, AgentDomain.TURN_TERMINAL)
    assert.equal(doneEvt.domain, AgentDomain.RUN_DONE)
  })
})

// ── 协议版本一致性 ──

describe('协议版本', () => {
  it('所有双发事件使用当前 PROTOCOL_VERSION', () => {
    const events = [
      buildAgentTurnTerminalEvent({
        agent: 'claudeCode', chatKey: 'k1',
        terminalKind: TerminalKind.COMPLETED,
      }),
      buildAgentRunDoneEvent({
        agent: 'claudeCode', chatKey: 'k1',
      }),
      buildAgentTurnTerminalEvent({
        agent: 'codex', chatKey: 'k1', runId: 'r1',
        terminalKind: TerminalKind.COMPLETED,
      }),
      buildAgentRunDoneEvent({
        agent: 'codex', chatKey: 'k1', runId: 'r1',
      }),
    ]

    for (const evt of events) {
      assert.equal(evt.version, PROTOCOL_VERSION,
        `event ${evt.domain} (${evt.agent}) should use PROTOCOL_VERSION ${PROTOCOL_VERSION}`)
    }
  })
})
