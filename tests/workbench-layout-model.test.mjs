import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_DOCUMENT_ITEMS,
  PRIMARY_GROUP_ID,
  SECONDARY_GROUP_ID,
  closeItem,
  createDefaultLayout,
  mergeSecondaryGroup,
  moveItem,
  normalizeLayout,
  openItem,
  resolveSurfaceStates,
} from '../src/workbench/layoutModel.mjs'

test('default layout owns one agent surface in the primary group', () => {
  const layout = createDefaultLayout()
  assert.equal(layout.groups.length, 1)
  assert.deepEqual(layout.groups[0].itemIds, ['agent:codehub'])
  assert.equal(layout.activeGroupId, PRIMARY_GROUP_ID)
})

test('opening beside creates one secondary group and deduplicates existing item', () => {
  const document = { type: 'document', resourceId: 'D:/repo/README.md' }
  let layout = openItem(createDefaultLayout(), 'document:readme', document, { target: 'beside' })
  assert.equal(layout.groups.length, 2)
  assert.deepEqual(layout.groups[1].itemIds, ['document:readme'])

  layout = openItem(layout, 'document:readme', document, { target: 'active' })
  assert.equal(layout.groups.flatMap(group => group.itemIds).filter(id => id === 'document:readme').length, 1)
  assert.equal(layout.activeGroupId, SECONDARY_GROUP_ID)
})

test('moving a dirty-capable item changes placement without copying or closing it', () => {
  const document = { type: 'document', resourceId: 'D:/repo/README.md' }
  const layout = openItem(createDefaultLayout(), 'document:readme', document, { target: 'beside' })
  const moved = moveItem(layout, 'document:readme', PRIMARY_GROUP_ID)
  assert.equal(moved.groups.length, 1)
  assert.deepEqual(moved.groups[0].itemIds, ['agent:codehub', 'document:readme'])
  assert.equal(moved.items['document:readme'].resourceId, 'D:/repo/README.md')
})

test('primary group cannot become empty and singleton items cannot be closed', () => {
  const layout = createDefaultLayout()
  assert.deepEqual(closeItem(layout, 'agent:codehub'), layout)
})

test('merging secondary keeps all item identities and does not destroy resources', () => {
  let layout = openItem(createDefaultLayout(), 'chat:simple', { type: 'chat', singleton: true }, { target: 'beside' })
  layout = mergeSecondaryGroup(layout)
  assert.equal(layout.groups.length, 1)
  assert.deepEqual(layout.groups[0].itemIds, ['agent:codehub', 'chat:simple'])
})

test('parked secondary item is retained but cannot be active or visible', () => {
  const layout = openItem(createDefaultLayout(), 'chat:simple', { type: 'chat', singleton: true }, { target: 'beside' })
  const surfaces = resolveSurfaceStates(layout, { isParked: true })
  assert.equal(surfaces['chat:simple'].groupId, SECONDARY_GROUP_ID)
  assert.equal(surfaces['chat:simple'].visible, false)
  assert.equal(surfaces['chat:simple'].active, false)
})

test('normalization strips invalid layout payloads and caps document descriptors', () => {
  const items = JSON.parse('{"agent:codehub":{"type":"agent","singleton":true},"__proto__":{"type":"chat"}}')
  for (let index = 0; index < MAX_DOCUMENT_ITEMS + 4; index += 1) {
    items[`document:${index}`] = { type: 'document', resourceId: `D:/repo/${index}.md` }
  }
  const layout = normalizeLayout({
    version: 1,
    revision: 3,
    activeGroupId: SECONDARY_GROUP_ID,
    groups: [{ id: PRIMARY_GROUP_ID, itemIds: ['agent:codehub', 'document:0', 'unknown'] }],
    items,
    inputDock: { expandedSizePx: 99999 },
  })
  assert.equal(Object.values(layout.items).filter(item => item.type === 'document').length, MAX_DOCUMENT_ITEMS)
  assert.equal(layout.groups.length, 1)
  assert.equal(layout.inputDock.expandedSizePx, 900)
  assert.equal(Object.hasOwn(layout.items, '__proto__'), false)
  assert.equal(Object.prototype.polluted, undefined)
})
