<template>
  <div ref="editorHost" class="cm-editor-host" :class="{ 'cm-readonly': readOnly }"></div>
</template>

<script setup>
import { ref, onActivated, onDeactivated, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { EditorView, keymap, lineNumbers, highlightSpecialChars, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history, redo, undo } from '@codemirror/commands'
import { closeBracketsKeymap, closeBrackets } from '@codemirror/autocomplete'
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { highlightSelectionMatches, openSearchPanel, findNext, findPrevious, closeSearchPanel, search } from '@codemirror/search'
import { getLanguageExtension } from '../codeMirrorHelper.mjs'

// ── VSCode Dark+ 风格高亮（通过 CSS 变量自动适配 4 套主题） ──
const customHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--cc-hljs-keyword)', fontWeight: '600' },
  { tag: tags.atom, color: 'var(--cc-hljs-literal, var(--cc-hljs-tag))' },
  { tag: tags.string, color: 'var(--cc-hljs-string)' },
  { tag: tags.number, color: 'var(--cc-hljs-number)' },
  { tag: tags.comment, color: 'var(--cc-hljs-comment)', fontStyle: 'italic' },
  { tag: tags.typeName, color: 'var(--cc-hljs-type)', fontWeight: '600' },
  { tag: tags.variableName, color: 'var(--cc-hljs-params, var(--cc-hljs-text))' },
  { tag: tags.propertyName, color: 'var(--cc-hljs-attr, var(--cc-hljs-params))' },
  { tag: tags.function(tags.variableName), color: 'var(--cc-hljs-function)' },
  { tag: tags.definition(tags.variableName), color: 'var(--cc-hljs-function)', fontWeight: '600' },
  { tag: tags.operator, color: 'var(--cc-hljs-operator, var(--cc-hljs-text))' },
  { tag: tags.tagName, color: 'var(--cc-hljs-tag)', fontWeight: '600' },
  { tag: tags.attributeName, color: 'var(--cc-hljs-attr, var(--cc-hljs-params))' },
  { tag: tags.standard(tags.variableName), color: 'var(--cc-hljs-built-in)' },
  { tag: tags.literal, color: 'var(--cc-hljs-tag)' },
  { tag: tags.meta, color: 'var(--cc-hljs-meta, var(--cc-hljs-comment))' },
  { tag: tags.regexp, color: 'var(--cc-hljs-string)' },
  { tag: tags.escape, color: 'var(--cc-hljs-number)' },
  { tag: tags.special(tags.string), color: 'var(--cc-hljs-string)' },
  { tag: tags.labelName, color: 'var(--cc-hljs-function)' },
  { tag: tags.namespace, color: 'var(--cc-hljs-type)' },
  { tag: tags.modifier, color: 'var(--cc-hljs-keyword)' },
  { tag: tags.heading, color: 'var(--cc-hljs-function)', fontWeight: '700' },
  { tag: tags.link, color: 'var(--cc-hljs-tag)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--cc-hljs-string)', textDecoration: 'underline' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
])

const props = defineProps({
  modelValue: { type: String, default: '' },
  ext: { type: String, default: '' },
  filePath: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
  autoFocus: { type: Boolean, default: false },
  wrapLines: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change'])

const editorHost = ref(null)
let editorView = null

function buildExtensions() {
  const exts = [
    lineNumbers(),
    foldGutter({ openText: '▾', closedText: '▸' }),
    highlightSpecialChars(),
    drawSelection(),
    history(),
    props.wrapLines ? EditorView.lineWrapping : [],
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    syntaxHighlighting(customHighlightStyle),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...foldKeymap,
      { key: 'Mod-f', run: openSearchPanel, preventDefault: true },
      { key: 'Mod-h', run: openSearchPanel, preventDefault: true },
      { key: 'F3', run: findNext, preventDefault: true },
      { key: 'Shift-F3', run: findPrevious, preventDefault: true },
      { key: 'Escape', run: closeSearchPanel, preventDefault: true },
      { key: 'Mod-z', run: undo },
      { key: 'Mod-Shift-z', run: redo },
      { key: 'Mod-y', run: redo },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString()
        emit('update:modelValue', text)
        emit('change', text)
      }
    }),
    EditorState.readOnly.of(props.readOnly),
    EditorView.editable.of(!props.readOnly),
  ]

  // 语言扩展
  const langExt = getLanguageExtension(props.ext)
  if (langExt) exts.push(langExt)

  return exts
}

function createEditor() {
  if (!editorHost.value) return

  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: buildExtensions(),
  })

  if (editorView) {
    editorView.destroy()
    editorView = null
  }

  editorView = new EditorView({
    state,
    parent: editorHost.value,
  })

  if (props.autoFocus) {
    editorView.focus()
  }
}

function updateReadOnly() {
  if (!editorView) return
  editorView.dispatch({
    effects: [
      EditorState.readOnly.reconfigure(EditorState.readOnly.of(props.readOnly)),
      EditorView.editable.reconfigure(EditorView.editable.of(!props.readOnly)),
    ],
  })
}

// 外部 modelValue 变化时同步到编辑器（仅在内容不同时更新）
watch(() => props.modelValue, (newVal) => {
  if (!editorView) return
  const current = editorView.state.doc.toString()
  if (newVal !== current) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: newVal || '' },
    })
  }
})

watch(() => props.readOnly, () => {
  updateReadOnly()
})

// ext 变化时重建编辑器（切换了语言）
watch(() => props.ext, () => {
  nextTick(() => createEditor())
})

// wrapLines 变化时重建编辑器（切换 lineWrapping 扩展）
watch(() => props.wrapLines, () => {
  nextTick(() => createEditor())
})

onMounted(() => {
  window.electronAPI?.setEditorSearchEnabled?.(true)
  nextTick(() => createEditor())
})

onActivated(() => {
  window.electronAPI?.setEditorSearchEnabled?.(true)
})

onDeactivated(() => {
  window.electronAPI?.setEditorSearchEnabled?.(false)
})

const removeEditorSearchListener = window.electronAPI?.onEditorOpenSearch?.(() => {
  if (editorView) openSearchPanel(editorView)
})

onBeforeUnmount(() => {
  removeEditorSearchListener?.()
  window.electronAPI?.setEditorSearchEnabled?.(false)
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
})

// 暴露方法给父组件
function focus() {
  editorView?.focus()
}

function getEditorView() {
  return editorView
}

defineExpose({ focus, getEditorView })
</script>

<style scoped>
.cm-editor-host {
  height: 100%;
  overflow: auto;
}

.cm-editor-host.cm-readonly {
  opacity: 0.92;
}

/* ── 自定义滚动条（跟随主题） ── */
.cm-editor-host::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.cm-editor-host::-webkit-scrollbar-track {
  background: var(--cc-scrollbar-track, transparent);
}
.cm-editor-host::-webkit-scrollbar-thumb {
  background: var(--cc-scrollbar-thumb, #4a4a4a);
  border-radius: 4px;
}
.cm-editor-host::-webkit-scrollbar-thumb:hover {
  background: var(--cc-scrollbar-thumb-hover, #5a5a5a);
}
.cm-editor-host::-webkit-scrollbar-corner {
  background: transparent;
}

/* ── CodeMirror 基础主题 ── */
.cm-editor-host :deep(.cm-editor) {
  background: var(--cc-bg-code-deep, var(--cc-bg, #111827));
  color: var(--cc-hljs-text, var(--cc-text, #e2e8f0));
  font-size: 13px;
  font-family: Consolas, "Courier New", monospace;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.cm-editor-host :deep(.cm-editor.cm-focused) {
  outline: none;
}

/* ── 内容区 ── */
.cm-editor-host :deep(.cm-content) {
  font-family: Consolas, "Courier New", monospace !important;
  caret-color: var(--cc-primary, #60a5fa);
  padding: 0;
}

.cm-editor-host :deep(.cm-line) {
  line-height: 1.55;
}

/* ── 行号栏 ── */
.cm-editor-host :deep(.cm-gutters) {
  background: var(--cc-bg-deepest, var(--cc-bg, #0a0a0a));
  color: var(--cc-text-dim, #64748b);
  border-right: 1px solid var(--cc-border-medium, rgba(148, 163, 184, 0.14));
  font-size: 12px;
  line-height: 1.55;
}

/* ── 当前行高亮（行号 + 内容行） ── */
.cm-editor-host :deep(.cm-activeLineGutter) {
  background: color-mix(in srgb, var(--cc-primary, #60a5fa) 10%, transparent);
  color: var(--cc-text, #e2e8f0);
}
.cm-editor-host :deep(.cm-activeLine) {
  background: color-mix(in srgb, var(--cc-primary, #60a5fa) 8%, transparent);
}

/* ── 折叠 gutter（chevron 图标） ── */
.cm-editor-host :deep(.cm-foldGutter) {
  width: 24px;
}
.cm-editor-host :deep(.cm-foldGutter .cm-gutterElement) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  cursor: pointer;
  border-radius: 3px;
  color: var(--cc-text-dim, #94a3b8);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  opacity: 0.72;
  transition: background-color 0.12s, color 0.12s, opacity 0.12s;
}
.cm-editor-host :deep(.cm-foldGutter .cm-gutterElement:hover) {
  opacity: 1;
  background: color-mix(in srgb, var(--cc-primary, #60a5fa) 14%, transparent) !important;
  outline: none !important;
  color: var(--cc-text, #e2e8f0);
}

/* ── 选区 ── */
.cm-editor-host :deep(.cm-selectionBackground) {
  background: color-mix(in srgb, var(--cc-primary, #60a5fa) 24%, transparent) !important;
}

/* ── 光标 ── */
.cm-editor-host :deep(.cm-cursor) {
  border-left-color: var(--cc-primary, #60a5fa);
}

/* ── 括号对高亮（VSCode 风格） ── */
.cm-editor-host :deep(.cm-matchingBracket) {
  background: color-mix(in srgb, var(--cc-primary, #60a5fa) 18%, transparent);
  outline: 1px solid color-mix(in srgb, var(--cc-primary, #60a5fa) 40%, transparent);
  outline-offset: -1px;
}
.cm-editor-host :deep(.cm-nonmatchingBracket) {
  background: color-mix(in srgb, #ef4444 20%, transparent);
}

/* ── 搜索匹配高亮 ── */
.cm-editor-host :deep(.cm-selectionMatch) {
  background: color-mix(in srgb, var(--cc-primary, #60a5fa) 16%, transparent);
}

/* ── 折叠占位 ── */
.cm-editor-host :deep(.cm-foldPlaceholder) {
  background: var(--cc-border-medium, rgba(148, 163, 184, 0.1));
  color: var(--cc-text-dim, #64748b);
  border-color: var(--cc-border-medium, rgba(148, 163, 184, 0.18));
}

/* ── 搜索/替换面板 ── */
.cm-editor-host :deep(.cm-panels) {
  background: var(--cc-bg-deepest, var(--cc-bg, #0a0a0a));
  color: var(--cc-text, #e2e8f0);
  border-bottom: 1px solid var(--cc-border-medium, rgba(148, 163, 184, 0.14));
}
.cm-editor-host :deep(.cm-panel.cm-search) {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  overflow-x: auto;
  font-size: 11px;
}
.cm-editor-host :deep(.cm-panels .cm-textfield) {
  box-sizing: border-box;
  min-width: 132px;
  height: 24px;
  margin: 0;
  padding: 3px 8px;
  background: var(--cc-bg-code-deep, var(--cc-bg, #111827));
  color: var(--cc-text, #e2e8f0);
  border: 1px solid var(--cc-border-medium, rgba(148, 163, 184, 0.26));
  border-radius: 4px;
  font: inherit;
}
.cm-editor-host :deep(.cm-panels .cm-textfield:focus) {
  outline: none;
  border-color: var(--cc-primary, #60a5fa);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--cc-primary, #60a5fa) 40%, transparent);
}
.cm-editor-host :deep(.cm-panels .cm-button) {
  height: 22px;
  margin: 0;
  padding: 0 8px;
  background: transparent;
  color: var(--cc-text-dim, #94a3b8);
  border: 1px solid var(--cc-border-medium, rgba(148, 163, 184, 0.22));
  border-radius: 4px;
  font-size: 10px;
  line-height: 20px;
  cursor: pointer;
}
.cm-editor-host :deep(.cm-panels .cm-button:hover) {
  color: var(--cc-text, #e2e8f0);
  border-color: var(--cc-primary, #60a5fa);
}
.cm-editor-host :deep(.cm-panel.cm-search label) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--cc-text-dim, #94a3b8);
  white-space: nowrap;
  font-size: 10px;
}
.cm-editor-host :deep(.cm-panel.cm-search input[type='checkbox']) {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--cc-primary, #60a5fa);
}
.cm-editor-host :deep(.cm-panel.cm-search [name='close']) {
  margin-left: auto;
  min-width: 24px;
  padding: 0;
  border: 0;
  font-size: 16px;
  line-height: 18px;
}
</style>
