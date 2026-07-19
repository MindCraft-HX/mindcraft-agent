import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { AGENT_DEFINITIONS } from '../packages/agent/src/registry/agentRegistry.js'

test('shared settings maps UI tab keys to runtime provider types', () => {
  const claude = AGENT_DEFINITIONS.find(agent => agent.key === 'claudeCode')
  const codex = AGENT_DEFINITIONS.find(agent => agent.key === 'codex')

  assert.equal(claude?.runtime?.provider, 'claude')
  assert.equal(codex?.runtime?.provider, 'codex')
})

test('embedded Claude panel consumes shared provider activation notifications', () => {
  const source = fs.readFileSync(
    new URL('../packages/agent/src/components/claudeCode/index.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /event\?\.detail\?\.agentType !== 'claude'/)
  assert.match(source, /addEventListener\('mindcraft-provider-activated', onMindCraftProviderActivated\)/)
  assert.match(source, /removeEventListener\('mindcraft-provider-activated', onMindCraftProviderActivated\)/)
})

test('Claude renderer provider refresh never aborts the newly activated runtime', () => {
  const source = fs.readFileSync(
    new URL('../packages/agent/src/components/claudeCode/index.vue', import.meta.url),
    'utf8',
  )
  const start = source.indexOf('async function handleProviderActivated()')
  const end = source.indexOf('\nfunction onMindCraftProviderActivated', start)
  const body = source.slice(start, end)

  assert.ok(start >= 0 && end > start, 'handleProviderActivated must remain inspectable')
  assert.match(body, /await loadClaudeModelDefaults\(\)/)
  assert.doesNotMatch(
    body,
    /claudeAgentAbort/,
    'main-process resetAgentRuntime already stops old queries; a late renderer abort can kill the first new-provider turn',
  )
})
