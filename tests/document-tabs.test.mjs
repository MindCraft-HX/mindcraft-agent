import assert from 'node:assert/strict'
import {
  createPendingDocumentTab,
  finalizeDocumentTab,
} from '../src/components/mdViewer/documentTabs.mjs'

const pending = createPendingDocumentTab({
  filePath: 'D:/repo/src/App.vue',
})

assert.equal(pending.filePath, 'D:/repo/src/App.vue')
assert.equal(pending.name, 'App.vue')
assert.equal(pending.ext, 'vue')
assert.equal(pending.viewerType, 'code')
assert.equal(pending.isLoading, true)
assert.equal(pending.text, '')
assert.equal(pending.binary, null)

const completed = finalizeDocumentTab(pending, {
  filePath: 'D:/repo/src/App.vue',
  data: new TextEncoder().encode('<template>\n  <div />\n</template>\n'),
  type: 'application/octet-stream',
})

assert.equal(completed.id, pending.id)
assert.equal(completed.isLoading, false)
assert.equal(completed.ext, 'vue')
assert.equal(completed.viewerType, 'code')
assert.match(completed.text, /<template>/)

const markdownPending = createPendingDocumentTab({
  name: 'README.md',
  content: '# title',
})

const markdownReady = finalizeDocumentTab(markdownPending, {
  name: 'README.md',
  content: '# title',
})

assert.equal(markdownReady.viewerType, 'markdown')
assert.equal(markdownReady.text, '# title')
assert.equal(markdownReady.isLoading, false)

console.log('document tabs test passed')
