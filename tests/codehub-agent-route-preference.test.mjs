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

test('requested agent takes precedence over saved active tab on first restore', () => {
  const picked = pickInitialCodeHubTab({
    tabs,
    savedTabId: 'claudeCode:proj-1',
    requestedAgent: 'codex',
  })

  assert.equal(picked.id, 'codex:proj-2')
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
