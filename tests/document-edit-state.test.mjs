// Contract: HTML 文档是可编辑文档，默认源码模式（设计 4.6）。
// 预览仍是 sandbox iframe；sanitizer/CSP 属 2B 子门槛。

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

test('HtmlViewer keeps the sandbox iframe and gains a CodeMirror source mode', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/mdViewer/viewers/HtmlViewer.vue'), 'utf8')
  assert.ok(source.includes('sandbox=""'), 'html preview must stay sandboxed')
  assert.ok(source.includes('srcdoc'), 'preview must render via srcdoc, not a navigable URL')
  assert.ok(source.includes('CodeMirrorEditor'), 'source mode must use the shared CodeMirror editor')
  assert.ok(source.includes("update:editorText"), 'editor input must flow to the mdViewer edit state')
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
})
