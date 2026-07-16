import test from 'node:test'
import assert from 'node:assert/strict'

import { AGENT_DEFINITIONS } from '../packages/agent/src/registry/agentRegistry.js'

test('shared settings maps UI tab keys to runtime provider types', () => {
  const claude = AGENT_DEFINITIONS.find(agent => agent.key === 'claudeCode')
  const codex = AGENT_DEFINITIONS.find(agent => agent.key === 'codex')

  assert.equal(claude?.runtime?.provider, 'claude')
  assert.equal(codex?.runtime?.provider, 'codex')
})
