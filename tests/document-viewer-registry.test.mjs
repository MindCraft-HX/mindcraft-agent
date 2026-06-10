import assert from 'node:assert/strict'
import {
  inferDocumentExtension,
  resolveDocumentViewerType,
  isPreviewableDocument,
} from '../src/components/mdViewer/viewerRegistry.mjs'

assert.equal(inferDocumentExtension('README.MD'), 'md')
assert.equal(inferDocumentExtension('D:/work/src/App.vue'), 'vue')
assert.equal(inferDocumentExtension('archive.tar.gz'), 'gz')
assert.equal(inferDocumentExtension('no-extension'), '')

assert.equal(resolveDocumentViewerType({ filePath: 'README.md' }), 'markdown')
assert.equal(resolveDocumentViewerType({ filePath: 'demo.vue' }), 'code')
assert.equal(resolveDocumentViewerType({ filePath: 'index.html' }), 'html')
assert.equal(resolveDocumentViewerType({ filePath: 'manual.pdf' }), 'pdf')
assert.equal(resolveDocumentViewerType({ filePath: 'slides.pptx' }), 'unsupported')

assert.equal(isPreviewableDocument({ filePath: 'note.md' }), true)
assert.equal(isPreviewableDocument({ filePath: 'component.ts' }), true)
assert.equal(isPreviewableDocument({ filePath: 'page.html' }), true)
assert.equal(isPreviewableDocument({ filePath: 'file.pdf' }), true)
assert.equal(isPreviewableDocument({ filePath: 'sheet.xlsx' }), false)

console.log('document viewer registry test passed')
