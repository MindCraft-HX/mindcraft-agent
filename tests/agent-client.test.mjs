/**
 * Agent Client 测试
 *
 * 覆盖：createAgentClient 接口、Mock transport、abortRun 使用 builder
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAgentClient, createMockAgentTransport } from '../packages/agent/src/components/agentCommon/runtime/agentClient.mjs'
import { AgentCommand, validateAgentCommandEnvelope } from '../packages/agent/src/components/agentCommon/runtime/agentProtocol.mjs'

// ── createAgentClient ──

describe('createAgentClient', () => {
  it('rejects invalid transport', () => {
    assert.throws(() => createAgentClient(null), /AgentClient requires/)
    assert.throws(() => createAgentClient({}), /AgentClient requires/)
    assert.throws(() => createAgentClient({ send: 'not-a-function' }), /AgentClient requires/)
  })

  it('returns client with sendCommand / onEvent / abortRun', () => {
    const { transport } = createMockAgentTransport()
    const client = createAgentClient(transport)
    assert.equal(typeof client.sendCommand, 'function')
    assert.equal(typeof client.onEvent, 'function')
    assert.equal(typeof client.abortRun, 'function')
  })
})

// ── sendCommand ──

describe('sendCommand', () => {
  it('forwards command to transport.send', async () => {
    const { transport, sentCommands } = createMockAgentTransport()
    const client = createAgentClient(transport)
    const cmd = { version: 1, command: AgentCommand.RUN_START, agent: 'codex', chatKey: 'k1' }
    const result = await client.sendCommand(cmd)
    assert.deepEqual(result, { accepted: true })
    assert.equal(sentCommands.length, 1)
    assert.equal(sentCommands[0], cmd)
  })
})

// ── onEvent ──

describe('onEvent', () => {
  it('receives emitted events', () => {
    const { transport, emit } = createMockAgentTransport()
    const client = createAgentClient(transport)
    const received = []
    const unsub = client.onEvent((evt) => received.push(evt))
    emit({ domain: 'agent.turn.terminal', agent: 'codex' })
    assert.equal(received.length, 1)
    unsub()
    emit({ domain: 'agent.run.done', agent: 'codex' })
    assert.equal(received.length, 1, 'unsubscribe should stop receiving')
  })
})

// ── abortRun ──

describe('abortRun', () => {
  it('sends valid RUN_ABORT command via buildAgentCommand', async () => {
    const { transport, sentCommands } = createMockAgentTransport()
    const client = createAgentClient(transport)
    await client.abortRun({ agent: 'claudeCode', chatKey: 'k1', runId: 'run_1' })

    assert.equal(sentCommands.length, 1)
    const cmd = sentCommands[0]

    // 验证使用 builder 构造
    assert.equal(cmd.version, 1)
    assert.ok(typeof cmd.commandId === 'string' && cmd.commandId.startsWith('cmd_'))
    assert.equal(cmd.agent, 'claudeCode')
    assert.equal(cmd.command, AgentCommand.RUN_ABORT)
    assert.equal(cmd.chatKey, 'k1')
    assert.equal(cmd.runId, 'run_1')
    assert.deepEqual(cmd.payload, {})

    // 验证通过 envelope 校验
    const vr = validateAgentCommandEnvelope(cmd)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })

  it('abortRun for codex without runId', async () => {
    const { transport, sentCommands } = createMockAgentTransport()
    const client = createAgentClient(transport)
    await client.abortRun({ agent: 'codex', chatKey: 'k2' })

    assert.equal(sentCommands.length, 1)
    const cmd = sentCommands[0]
    assert.equal(cmd.agent, 'codex')
    assert.equal(cmd.chatKey, 'k2')
    assert.equal(cmd.runId, undefined)
    const vr = validateAgentCommandEnvelope(cmd)
    assert.equal(vr.valid, true, vr.errors.join(', '))
  })
})

// ── Mock Transport ──

describe('createMockAgentTransport', () => {
  it('exposes transport, emit, sentCommands', () => {
    const { transport, emit, sentCommands } = createMockAgentTransport()
    assert.equal(typeof transport.send, 'function')
    assert.equal(typeof transport.onEvent, 'function')
    assert.equal(typeof emit, 'function')
    assert.ok(Array.isArray(sentCommands))
    assert.equal(sentCommands.length, 0)
  })

  it('emit tolerates listener errors', () => {
    const { transport, emit } = createMockAgentTransport()
    transport.onEvent(() => { throw new Error('boom') })
    // Should not throw
    emit({ test: true })
  })
})
