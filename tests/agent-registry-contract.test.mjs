/**
 * Agent Registry 契约测试
 *
 * 覆盖：现有 ClaudeCode/CodeX 定义完整性、
 * validateAgentDefinition() 对各种错误输入的检测、
 * validateAllAgentDefinitions() 批量验证。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AGENT_DEFINITIONS,
  agentRegistryMap,
  getAgent,
  getAgentKeys,
  validateAgentDefinition,
  validateAllAgentDefinitions,
} from '../packages/agent/src/registry/agentRegistry.js'

// ── 现有定义完整性 ──

describe('AGENT_DEFINITIONS', () => {
  it('contains exactly 2 agents', () => {
    assert.equal(AGENT_DEFINITIONS.length, 2)
  })

  it('all definitions have unique keys', () => {
    const keys = AGENT_DEFINITIONS.map(a => a.key)
    assert.equal(new Set(keys).size, keys.length)
  })

  it('claudeCode definition has all required fields', () => {
    const d = getAgent('claudeCode')
    assert.ok(d, 'claudeCode not found')
    assert.equal(d.kind, 'coding-agent')
    assert.equal(d.runtime.location, 'local')
    assert.equal(d.runtime.provider, 'claude')
    assert.equal(d.runtime.defaultTransport, 'ipc')
    assert.equal(d.capabilities.projectWorkspace, true)
    assert.equal(d.capabilities.webSearch, false)
    assert.equal(d.protocol.commandVersion, 1)
    assert.equal(d.protocol.eventVersion, 1)
    assert.ok(Array.isArray(d.protocol.domains))
    assert.ok(d.protocol.domains.length >= 5)
  })

  it('codex definition has all required fields', () => {
    const d = getAgent('codex')
    assert.ok(d, 'codex not found')
    assert.equal(d.kind, 'coding-agent')
    assert.equal(d.runtime.location, 'local')
    assert.equal(d.runtime.provider, 'codex')
    assert.equal(d.runtime.defaultTransport, 'ipc')
    assert.equal(d.capabilities.webSearch, true)
    assert.equal(d.capabilities.remote, false)
    assert.equal(d.protocol.commandVersion, 1)
    assert.ok(Array.isArray(d.protocol.domains))
  })

  it('existing UI fields are preserved (backward compat)', () => {
    const d = getAgent('claudeCode')
    assert.ok(d.iconClass)
    assert.ok(d.iconStyle)
    assert.ok(d.descriptionKey)
    assert.equal(d.routeAlias, 'claudeCode')
  })

  it('agentRegistryMap is in sync with AGENT_DEFINITIONS', () => {
    assert.equal(agentRegistryMap.size, AGENT_DEFINITIONS.length)
    for (const def of AGENT_DEFINITIONS) {
      assert.equal(agentRegistryMap.get(def.key), def)
    }
  })

  it('getAgentKeys returns all keys', () => {
    const keys = getAgentKeys()
    assert.ok(keys.includes('claudeCode'))
    assert.ok(keys.includes('codex'))
    assert.equal(keys.length, 2)
  })

  it('getAgent returns undefined for unknown key', () => {
    assert.equal(getAgent('nonexistent'), undefined)
  })
})

// ── helpers ──

function makeCapabilities(overrides = {}) {
  return {
    projectWorkspace: false,
    tools: false,
    fileRead: false,
    fileWrite: false,
    shell: false,
    images: false,
    webSearch: false,
    approvals: false,
    remote: false,
    resumable: false,
    longRunning: false,
    ...overrides,
  }
}

// ── validateAgentDefinition ──

describe('validateAgentDefinition', () => {
  it('passes for valid claudeCode definition', () => {
    const d = getAgent('claudeCode')
    const r = validateAgentDefinition(d)
    assert.equal(r.valid, true, r.errors.join(', '))
  })

  it('passes for valid codex definition', () => {
    const d = getAgent('codex')
    const r = validateAgentDefinition(d)
    assert.equal(r.valid, true, r.errors.join(', '))
  })

  it('rejects null', () => {
    const r = validateAgentDefinition(null)
    assert.equal(r.valid, false)
  })

  it('rejects missing required fields', () => {
    const r = validateAgentDefinition({ key: 'test' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('name')))
    assert.ok(r.errors.some(e => e.includes('kind')))
    assert.ok(r.errors.some(e => e.includes('runtime')))
    assert.ok(r.errors.some(e => e.includes('capabilities')))
    assert.ok(r.errors.some(e => e.includes('protocol')))
  })

  it('rejects invalid kind', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'invalid-kind',
      runtime: { location: 'local', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: makeCapabilities(),
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('kind')))
  })

  it('rejects invalid runtime.location', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'mars', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: makeCapabilities(),
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('runtime.location')))
  })

  it('rejects invalid runtime.provider', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'local', provider: 'unknown', defaultTransport: 'ipc' },
      capabilities: makeCapabilities(),
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('runtime.provider')))
  })

  it('rejects invalid protocol.commandVersion type', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'local', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: makeCapabilities(),
      protocol: { commandVersion: '1', eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('commandVersion')))
  })

  it('rejects unknown domains', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'local', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: makeCapabilities(),
      protocol: { commandVersion: 1, eventVersion: 1, domains: ['agent.unknown'] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('unknown domain')))
  })

  it('rejects non-object capabilities', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'local', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: 'not-an-object',
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('capabilities')))
  })

  it('accepts a minimal valid definition', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test Agent', kind: 'chat-agent',
      runtime: { location: 'remote', provider: 'openai', defaultTransport: 'websocket' },
      capabilities: makeCapabilities(),
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, true, r.errors.join(', '))
  })

  it('rejects empty runtime (missing subfields)', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: {},
      capabilities: makeCapabilities(),
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('runtime.location')))
    assert.ok(r.errors.some(e => e.includes('runtime.provider')))
    assert.ok(r.errors.some(e => e.includes('runtime.defaultTransport')))
  })

  it('rejects capabilities missing required boolean keys', () => {
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'local', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: { projectWorkspace: true },
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('capabilities.tools')))
    assert.ok(r.errors.some(e => e.includes('capabilities.fileRead')))
  })

  it('rejects capability value that is not boolean', () => {
    const caps = makeCapabilities()
    caps.projectWorkspace = 'yes'
    const r = validateAgentDefinition({
      key: 'test', name: 'Test', kind: 'coding-agent',
      runtime: { location: 'local', provider: 'custom', defaultTransport: 'ipc' },
      capabilities: caps,
      protocol: { commandVersion: 1, eventVersion: 1, domains: [] },
    })
    assert.equal(r.valid, false)
    assert.ok(r.errors.some(e => e.includes('projectWorkspace') && e.includes('boolean')))
  })
})

// ── validateAllAgentDefinitions ──

describe('validateAllAgentDefinitions', () => {
  it('all registered agents pass validation', () => {
    const r = validateAllAgentDefinitions()
    assert.equal(r.valid, true, JSON.stringify(r.errors))
  })
})
