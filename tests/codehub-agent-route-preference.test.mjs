import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeRequestedAgent,
  pickInitialCodeHubTab,
} from '../packages/agent/src/components/codeHub/agentRoutePreference.mjs'

const tabs = [
  { id: 'claudeCode:proj-1', agentType: 'claudeCode' },
  { id: 'codex:proj-1', agentType: 'codex' },
  { id: 'codex:proj-2', agentType: 'codex' },
]

test('normalizes supported codeHub agent route preference', () => {
  assert.equal(normalizeRequestedAgent('codex'), 'codex')
  assert.equal(normalizeRequestedAgent(['claudeCode']), 'claudeCode')
  assert.equal(normalizeRequestedAgent('unknown'), '')
  assert.equal(normalizeRequestedAgent(undefined), '')
})

test('agent-only route preference does not override an existing saved active tab', () => {
  const picked = pickInitialCodeHubTab({
    tabs,
    savedTabId: 'claudeCode:proj-1',
    requestedAgent: 'codex',
  })

  assert.equal(picked.id, 'claudeCode:proj-1')
})

test('saved tab is preserved when it belongs to requested agent', () => {
  const picked = pickInitialCodeHubTab({
    tabs,
    savedTabId: 'codex:proj-1',
    requestedAgent: 'codex',
  })

  assert.equal(picked.id, 'codex:proj-1')
})

test('falls back to previous behavior without route preference', () => {
  const picked = pickInitialCodeHubTab({
    tabs,
    savedTabId: 'claudeCode:proj-1',
    requestedAgent: '',
  })

  assert.equal(picked.id, 'claudeCode:proj-1')
})

test('agent-only route preference picks provider tab when saved active tab is missing', () => {
  const picked = pickInitialCodeHubTab({
    tabs,
    savedTabId: 'claudeCode:missing',
    requestedAgent: 'codex',
  })

  assert.equal(picked.id, 'codex:proj-2')
})
