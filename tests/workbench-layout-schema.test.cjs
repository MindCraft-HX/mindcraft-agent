'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { validateWorkbenchLayout } = require('../electron/workbench/layoutSchema')

function layout() {
  return {
    version: 1,
    revision: 1,
    orientation: 'horizontal',
    activeGroupId: 'group-primary',
    groups: [{ id: 'group-primary', size: 1, activeItemId: 'agent:codehub', itemIds: ['agent:codehub'] }],
    items: { 'agent:codehub': { type: 'agent', singleton: true } },
    inputDock: { expandedSizePx: 420 },
  }
}

test('accepts the minimal versioned Workbench descriptor', () => {
  assert.deepEqual(validateWorkbenchLayout(layout()), layout())
})

test('rejects unassigned, duplicate, and unsafe item descriptors', () => {
  const orphan = layout()
  orphan.items['document:orphan'] = { type: 'document' }
  assert.equal(validateWorkbenchLayout(orphan), null)

  const duplicate = layout()
  duplicate.groups.push({ id: 'group-secondary', size: 0.4, activeItemId: 'agent:codehub', itemIds: ['agent:codehub'] })
  assert.equal(validateWorkbenchLayout(duplicate), null)

  const unsafe = layout()
  unsafe.items.constructor = { type: 'document' }
  assert.equal(validateWorkbenchLayout(unsafe), null)
})
