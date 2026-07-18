import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkbenchStore } from '../src/workbench/workbenchStore.mjs'

test('workbench store persists one stable layout and delegates document close to its adapter', async () => {
  const saves = []
  const closed = []
  const store = createWorkbenchStore({
    async loadLayout() { return { ok: true, windowInstanceId: 'renderer-1', layout: null } },
    async saveLayout(payload) { saves.push(payload); return { saved: true } },
  })
  store.registerAdapter('document', {
    requestClose(itemId) { closed.push(itemId); return { status: 'ready' } },
  })
  await store.hydrate()
  await store.open('document:readme', { type: 'document', resourceId: 'file:d:/repo/readme.md' }, { target: 'beside' })
  const afterOpen = store.getSnapshot()
  assert.equal(afterOpen.layout.groups.length, 1)
  assert.equal(Object.hasOwn(afterOpen.layout.items['document:readme'], 'text'), false)

  assert.deepEqual(await store.close('document:readme'), { status: 'ready' })
  assert.deepEqual(closed, ['document:readme'])
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(saves.length >= 1)
  assert.equal(saves.at(-1).windowInstanceId, 'renderer-1')
})

test('workbench store migrates persisted split layouts into one surface', async () => {
  const saves = []
  const store = createWorkbenchStore({
    async loadLayout() {
      return {
        ok: true,
        windowInstanceId: 'renderer-1',
        layout: {
          version: 1,
          revision: 4,
          orientation: 'horizontal',
          activeGroupId: 'group-secondary',
          groups: [
            { id: 'group-primary', size: 0.62, activeItemId: 'agent:codehub', itemIds: ['agent:codehub'] },
            { id: 'group-secondary', size: 0.38, activeItemId: 'chat:simple', itemIds: ['chat:simple'] },
          ],
          items: {
            'agent:codehub': { type: 'agent', singleton: true },
            'chat:simple': { type: 'chat', singleton: true },
          },
          inputDock: { expandedSizePx: 420 },
        },
      }
    },
    async saveLayout(payload) { saves.push(payload); return { saved: true } },
  })

  await store.hydrate()
  const layout = store.getSnapshot().layout
  assert.equal(layout.groups.length, 1)
  assert.deepEqual(layout.groups[0].itemIds, ['agent:codehub', 'chat:simple'])
  assert.equal(layout.activeGroupId, 'group-primary')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saves.at(-1).layout.groups.length, 1)
})

test('workbench store routes typed intents through the host resolver and never provider internals', async () => {
  const activated = []
  const store = createWorkbenchStore({
    resolveIntent(intent) {
      return { itemId: 'document:guide', item: { type: 'document', resourceId: intent.resourceId } }
    },
  })
  store.registerAdapter('agent:codehub', { activate: context => activated.push(context.itemId) })
  store.enqueueIntent({ requestId: 'agent', type: 'focus-agent' })
  store.enqueueIntent({ requestId: 'document', type: 'open-document', resourceId: 'D:/repo/guide.md', target: 'beside' })
  const results = await store.drainIntents()
  assert.deepEqual(results.map(result => result.ok), [true, true])
  assert.deepEqual(activated, ['agent:codehub'])
  assert.equal(store.getSnapshot().layout.items['document:guide'].resourceId, 'D:/repo/guide.md')
})
