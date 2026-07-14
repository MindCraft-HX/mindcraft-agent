import assert from 'node:assert/strict'
import test from 'node:test'
import { EDIT_MODE } from '../src/components/mdViewer/editState.mjs'
import { usesDocumentBodyScroll } from '../src/components/mdViewer/documentScrollPolicy.mjs'

const markdownTab = { viewerType: 'markdown', filePath: 'D:/docs/a.md', size: 100 }
const codeTab = { viewerType: 'code', filePath: 'D:/src/a.js', size: 100 }
const pdfTab = { viewerType: 'pdf', filePath: 'D:/docs/a.pdf', size: 100 }

test('only markdown preview owns the document-body scroll position', () => {
  assert.equal(usesDocumentBodyScroll(markdownTab, EDIT_MODE.PREVIEW_ONLY), true)
  assert.equal(usesDocumentBodyScroll(markdownTab, EDIT_MODE.EDIT_ONLY), false)
  assert.equal(usesDocumentBodyScroll(markdownTab, EDIT_MODE.SPLIT), false)
})

test('editor surfaces do not overwrite document-body scroll state', () => {
  assert.equal(usesDocumentBodyScroll(codeTab), false)
  assert.equal(usesDocumentBodyScroll(pdfTab), true)
})
