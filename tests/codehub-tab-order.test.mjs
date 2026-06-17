import test from 'node:test'
import assert from 'node:assert/strict'

import {
  orderCodeHubTabs,
  reconcileCodeHubTabOrder,
} from '../packages/agent/src/components/codeHub/tabOrder.mjs'

test('tab order keeps missing ids before panels are ready', () => {
  const next = reconcileCodeHubTabOrder({
    currentOrder: ['claudeCode:proj-1', 'codex:proj-1'],
    visibleTabIds: ['claudeCode:proj-1'],
    pruneMissing: false,
  })

  assert.deepEqual(next, ['claudeCode:proj-1', 'codex:proj-1'])
})

test('tab order prunes missing ids only when requested', () => {
  const next = reconcileCodeHubTabOrder({
    currentOrder: ['claudeCode:proj-1', 'codex:proj-1'],
    visibleTabIds: ['claudeCode:proj-1', 'codex:proj-2'],
    pruneMissing: true,
  })

  assert.deepEqual(next, ['claudeCode:proj-1', 'codex:proj-2'])
})

test('tab order appends newly visible tabs without duplicating ids', () => {
  const next = reconcileCodeHubTabOrder({
    currentOrder: ['codex:proj-1', 'codex:proj-1'],
    visibleTabIds: ['claudeCode:proj-1', 'codex:proj-1'],
    pruneMissing: true,
  })

  assert.deepEqual(next, ['codex:proj-1', 'claudeCode:proj-1'])
})

test('orders codehub tabs by saved order then creation time', () => {
  const ordered = orderCodeHubTabs([
    { id: 'claudeCode:proj-1', createdAt: 30 },
    { id: 'codex:proj-2', createdAt: 20 },
    { id: 'codex:proj-1', createdAt: 10 },
  ], ['codex:proj-2'])

  assert.deepEqual(ordered.map(tab => tab.id), [
    'codex:proj-2',
    'codex:proj-1',
    'claudeCode:proj-1',
  ])
})
