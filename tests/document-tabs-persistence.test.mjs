import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DOC_TABS_PERSIST_VERSION,
  migrateDocTabsPayload,
  serializeDocTabs,
} from '../src/components/mdViewer/documentTabsPersistence.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function tab(id, filePath = `D:/repo/${id}.md`, extra = {}) {
  return { id, filePath, name: `${id}.md`, ext: 'md', viewerType: 'markdown', ...extra }
}

test('serialize stamps the version and keeps only whitelisted bounded fields', () => {
  const out = serializeDocTabs({
    tabs: [tab('a'), { ...tab('b'), isLoading: true, text: 'x'.repeat(5000), binary: {} }],
    activeTabId: 'a',
    scrollTops: { a: 120 },
  })
  assert.equal(out.version, DOC_TABS_PERSIST_VERSION)
  assert.deepEqual(out.tabs, [tab('a'), tab('b')])
  assert.equal(out.activeTabId, 'a')
  assert.deepEqual(out.scrollTops, { a: 120 })
})

test('serialize drops tabs without id or filePath (inline docs stay unpersisted)', () => {
  const out = serializeDocTabs({
    tabs: [tab('a'), { id: 'inline', name: 'chat.md' }, { filePath: 'D:/repo/no-id.md' }, null, 'junk'],
    activeTabId: 'inline',
    scrollTops: { inline: 50, a: 10 },
  })
  assert.deepEqual(out.tabs.map(t => t.id), ['a'])
  // activeTabId / scrollTops 指向未持久化 tab 时归一丢弃
  assert.equal(out.activeTabId, '')
  assert.deepEqual(out.scrollTops, { a: 10 })
})

test('serialize bounds tab count and scroll entries', () => {
  const tabs = Array.from({ length: 60 }, (_, i) => tab(`t${i}`))
  const scrollTops = Object.fromEntries(tabs.map(t => [t.id, 1]))
  const out = serializeDocTabs({ tabs, scrollTops })
  assert.equal(out.tabs.length, 50)
  assert.equal(Object.keys(out.scrollTops).length, 50)
})

test('migrate upgrades legacy v0 payloads (no version field)', () => {
  const legacy = {
    tabs: [tab('a'), { id: 'bad' }],
    activeTabId: 'a',
    scrollTops: { a: 33, ghost: 1 },
  }
  const migrated = migrateDocTabsPayload(legacy)
  assert.equal(migrated.version, DOC_TABS_PERSIST_VERSION)
  assert.deepEqual(migrated.tabs, [tab('a')])
  assert.equal(migrated.activeTabId, 'a')
  // ghost 不在持久化 tab 集合中，迁移时清掉
  assert.deepEqual(migrated.scrollTops, { a: 33 })
})

test('migrate refuses future versions and unusable structures', () => {
  assert.equal(migrateDocTabsPayload({ version: DOC_TABS_PERSIST_VERSION + 1, tabs: [tab('a')] }), null)
  assert.equal(migrateDocTabsPayload(null), null)
  assert.equal(migrateDocTabsPayload('openDocTabs'), null)
  assert.equal(migrateDocTabsPayload([tab('a')]), null)
  assert.equal(migrateDocTabsPayload({ version: 1, tabs: 'nope' }), null)
  // 全部条目非法时视为无可恢复状态
  assert.equal(migrateDocTabsPayload({ tabs: [{ id: 'x' }] }), null)
})

test('migrate filters non-numeric and negative scroll positions', () => {
  const migrated = migrateDocTabsPayload({
    tabs: [tab('a')],
    scrollTops: { a: -5, b: '10' },
  })
  assert.deepEqual(migrated.scrollTops, {})
})

test('mdViewer wires both persist and restore through the contract module', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/mdViewer/index.vue'), 'utf8')
  assert.ok(source.includes("from './documentTabsPersistence.mjs'"), 'index.vue must import the persistence contract')
  assert.ok(source.includes('serializeDocTabs({'), 'persist path must serialize via the contract')
  assert.ok(source.includes('migrateDocTabsPayload('), 'restore path must migrate via the contract')
  assert.ok(!source.includes('tabsToSave'), 'legacy inline serializer must be gone')
})
