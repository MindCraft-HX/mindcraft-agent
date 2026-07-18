const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'mdViewer', 'index.vue'),
  'utf8',
)

test('document tab switch saves the old scroll position without discarding a draft', () => {
  const watcherStart = source.indexOf('watch(activeTabId')
  const restoreStart = source.indexOf('function restoreDocTabScroll')
  const watcher = source.slice(watcherStart, restoreStart)
  const saveIndex = watcher.indexOf('saveCurrentTabScroll(oldId)')
  const persistIndex = watcher.indexOf('persistDocTabs()')

  assert.ok(watcherStart >= 0 && restoreStart > watcherStart)
  assert.ok(saveIndex >= 0)
  assert.ok(persistIndex >= 0)
  assert.equal(watcher.includes('confirmDiscardEdits(oldId)'), false)
})
