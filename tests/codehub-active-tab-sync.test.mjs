import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveCodeHubSyncedTabId } from '../packages/agent/src/components/codeHub/activeTabSync.mjs'

const tabs = [
  { id: 'claudeCode:proj-drf', agentType: 'claudeCode' },
  { id: 'claudeCode:proj-api', agentType: 'claudeCode' },
  { id: 'codex:proj-1', agentType: 'codex' },
]

test('syncs stale unified tab highlight to active claude project', () => {
  const nextId = resolveCodeHubSyncedTabId({
    tabs,
    agentType: 'claudeCode',
    activeProjectId: 'proj-api',
    currentActiveTabId: 'claudeCode:proj-drf',
  })

  assert.equal(nextId, 'claudeCode:proj-api')
})

test('keeps current tab when active project is missing', () => {
  const nextId = resolveCodeHubSyncedTabId({
    tabs,
    agentType: 'claudeCode',
    activeProjectId: null,
    currentActiveTabId: 'claudeCode:proj-drf',
  })

  assert.equal(nextId, 'claudeCode:proj-drf')
})

test('keeps current tab when target project does not exist in unified tabs', () => {
  const nextId = resolveCodeHubSyncedTabId({
    tabs,
    agentType: 'claudeCode',
    activeProjectId: 'proj-missing',
    currentActiveTabId: 'claudeCode:proj-drf',
  })

  assert.equal(nextId, 'claudeCode:proj-drf')
})
