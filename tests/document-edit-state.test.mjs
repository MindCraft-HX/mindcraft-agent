// Contract: HTML 文档是可编辑文档，默认源码模式（设计 4.6）。
// 预览是可交互但非同源的 sandbox iframe；HTML 不提供低价值分屏。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EDIT_MODE,
  EDITABLE_VIEWER_TYPES,
  defaultEditMode,
  isEditableFile,
} from '../src/components/mdViewer/editState.mjs'
import {
  buildHtmlPreviewDocument,
  HTML_PREVIEW_CSP,
  HTML_PREVIEW_SANDBOX,
} from '../src/components/mdViewer/htmlPreview.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('html is an editable viewer type', () => {
  assert.ok(EDITABLE_VIEWER_TYPES.has('html'))
  assert.ok(EDITABLE_VIEWER_TYPES.has('markdown'))
  assert.ok(EDITABLE_VIEWER_TYPES.has('code'))
})

test('html tab with filePath is editable; size cap still applies', () => {
  assert.equal(isEditableFile({ filePath: 'D:/repo/a.html', viewerType: 'html', size: 100 }), true)
  assert.equal(isEditableFile({ filePath: 'D:/repo/a.html', viewerType: 'html', size: 2_000_000 }), false)
  assert.equal(isEditableFile({ viewerType: 'html', size: 100 }), false)
})

test('default edit mode: html opens in source, markdown/code open in preview', () => {
  assert.equal(defaultEditMode('html'), EDIT_MODE.EDIT_ONLY)
  assert.equal(defaultEditMode('markdown'), EDIT_MODE.PREVIEW_ONLY)
  assert.equal(defaultEditMode('code'), EDIT_MODE.PREVIEW_ONLY)
  assert.equal(defaultEditMode(undefined), EDIT_MODE.PREVIEW_ONLY)
})

test('HtmlViewer provides isolated interactive preview and CodeMirror source modes only', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/mdViewer/viewers/HtmlViewer.vue'), 'utf8')
  assert.ok(source.includes(':sandbox="HTML_PREVIEW_SANDBOX"'), 'html preview must stay sandboxed')
  assert.ok(source.includes('srcdoc'), 'preview must render via srcdoc, not a navigable URL')
  assert.ok(source.includes('CodeMirrorEditor'), 'source mode must use the shared CodeMirror editor')
  assert.ok(source.includes("update:editorText"), 'editor input must flow to the mdViewer edit state')
  assert.equal(source.includes('html-split-pane'), false, 'html viewer must not retain its own split layout')
})

test('HtmlViewer keeps an empty dirty draft instead of falling back to the file text', () => {
  const viewer = fs.readFileSync(path.join(root, 'src/components/mdViewer/viewers/HtmlViewer.vue'), 'utf8')
  // 用户删空内容后 editorText=''（falsy）：draft 必须以 dirty 草稿为准，
  // 否则 remount 恢复原文、保存却写出空文件（显示与落盘不一致）。
  assert.ok(viewer.includes('props.dirty ? props.editorText'), 'dirty draft (even empty) must be authoritative')
  assert.ok(viewer.includes('!props.dirty && draft.value'), 'async-load refill must not clobber a dirty draft')
  const host = fs.readFileSync(path.join(root, 'src/components/mdViewer/index.vue'), 'utf8')
  assert.ok(host.includes('dirty: Boolean(state?.isDirty)'), 'mdViewer must pass the dirty flag down to viewers')
})

test('mdViewer exposes a source-labeled mode segment for html tabs', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/mdViewer/index.vue'), 'utf8')
  assert.ok(source.includes('modeSegmentButtons'), 'mode segment must be data-driven per viewer type')
  assert.ok(source.includes("label: 'doc.source'"), 'html mode segment must label edit-only as source')
  assert.ok(source.includes('defaultEditMode'), 'mdViewer must derive per-type default modes from editState')
  const htmlBranch = source.match(/if \(viewerType === 'html'\) \{([\s\S]*?)\n  \}/)?.[1] || ''
  assert.ok(htmlBranch.includes("label: 'doc.preview'"), 'html mode segment must include preview')
  assert.equal(htmlBranch.includes('EDIT_MODE.SPLIT'), false, 'html mode segment must not include split')
})

test('html preview allows isolated inline interaction without same-origin privileges', () => {
  assert.equal(HTML_PREVIEW_SANDBOX, 'allow-scripts')
  assert.equal(HTML_PREVIEW_SANDBOX.includes('allow-same-origin'), false)
  assert.equal(HTML_PREVIEW_SANDBOX.includes('allow-top-navigation'), false)
  assert.equal(HTML_PREVIEW_SANDBOX.includes('allow-popups'), false)
  assert.equal(HTML_PREVIEW_SANDBOX.includes('allow-downloads'), false)
})

test('html preview CSP is offline-first and blocks privileged document capabilities', () => {
  assert.match(HTML_PREVIEW_CSP, /default-src 'none'/)
  assert.match(HTML_PREVIEW_CSP, /script-src 'unsafe-inline'/)
  assert.match(HTML_PREVIEW_CSP, /connect-src 'none'/)
  assert.match(HTML_PREVIEW_CSP, /object-src 'none'/)
  assert.match(HTML_PREVIEW_CSP, /frame-src 'none'/)
  assert.match(HTML_PREVIEW_CSP, /worker-src 'none'/)
  assert.match(HTML_PREVIEW_CSP, /base-uri 'none'/)
  assert.match(HTML_PREVIEW_CSP, /form-action 'none'/)
})

test('html preview injects its CSP before user content', () => {
  const withHead = buildHtmlPreviewDocument('<!doctype html><html><head><title>Demo</title></head><body><button>Go</button></body></html>')
  assert.ok(withHead.indexOf('Content-Security-Policy') < withHead.indexOf('<title>Demo</title>'))

  const withoutHead = buildHtmlPreviewDocument('<html><body><script>document.body.dataset.ready = "yes"</script></body></html>')
  assert.ok(withoutHead.indexOf('<head>') < withoutHead.indexOf('<body>'))
  assert.equal(withoutHead.includes('allow-scripts'), false, 'sandbox capabilities belong on the iframe, not in user HTML')

  const fragment = buildHtmlPreviewDocument('<button id="demo">Demo</button>')
  assert.match(fragment, /^<!doctype html><html><head>/)
  assert.ok(fragment.includes('<body><button id="demo">Demo</button></body>'))
})
