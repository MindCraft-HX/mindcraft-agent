<template>
  <div class="viewer-code">
    <div class="code-meta">
      <div class="code-meta-main">
        <span class="code-badge">{{ viewModel.extLabel }}</span>
        <span class="code-path" :title="filePath || name">{{ filePath || name }}</span>
        <span class="code-stat">{{ viewModel.lineCount }} lines</span>
        <span class="code-stat">{{ formatBytes(viewModel.byteSize) }}</span>
      </div>
      <div class="code-actions">
        <button class="code-action-btn" type="button" @click="toggleWrap">
          {{ wrapLines ? $t('doc.closeWrap') : $t('doc.autoWrap') }}
        </button>
        <button class="code-action-btn" type="button" @click="copyAll">
          {{ $t('doc.copyFull') }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="code-loading-panel">
      <div class="code-loading-spinner"></div>
      <div class="code-loading-text">{{ $t('doc.loadingCode') }}</div>
      <div class="code-loading-subtext">{{ $t('doc.loadingCodeHint') }}</div>
    </div>

    <div v-else-if="isEditable" class="code-surface code-surface--editor" :class="{ 'wrap-lines': wrapLines }">
      <CodeMirrorEditor
        ref="editorRef"
        :model-value="editorText"
        :ext="ext"
        :file-path="filePath"
        :wrap-lines="wrapLines"
        @update:model-value="onEditorInput"
      />
    </div>

    <div v-else class="code-surface" :class="{ 'wrap-lines': wrapLines }">
      <div class="code-surface-toolbar">
        <div class="code-surface-hints">
          <span v-if="pendingHighlight" class="code-hint is-busy">{{ $t('doc.highlightBusy') }}</span>
          <span v-if="enableVirtualization" class="code-hint is-warn">{{ $t('doc.virtualScroll') }}</span>
          <span v-else-if="viewModel.isLargeFile" class="code-hint is-warn">{{ $t('doc.largeFile') }}</span>
          <span v-if="foldRanges.length" class="code-hint">{{ $t('doc.foldable') }}</span>
        </div>
        <div class="code-surface-summary">
          <span>{{ viewModel.charCount }} chars</span>
        </div>
      </div>

      <div class="code-searchbar">
        <input
          v-model.trim="searchQuery"
          class="code-input search-input"
          type="text"
          :placeholder="$t('doc.searchCode')"
        >
        <span class="code-match-summary">
          {{ matches.length ? `${currentMatchDisplay}/${matches.length}` : '0 matches' }}
        </span>
        <button class="code-action-btn compact" type="button" :disabled="!matches.length" @click="goPrevMatch">
          {{ $t('doc.prev') }}
        </button>
        <button class="code-action-btn compact" type="button" :disabled="!matches.length" @click="goNextMatch">
          {{ $t('doc.next') }}
        </button>

        <div class="code-jump">
          <input
            v-model.trim="jumpLineInput"
            class="code-input jump-input"
            type="number"
            min="1"
            :max="viewModel.lineCount || 1"
            :placeholder="$t('doc.jumpLine')"
            @keydown.enter.prevent="jumpToLine"
          >
          <button class="code-action-btn compact" type="button" @click="jumpToLine">
            {{ $t('doc.jump') }}
          </button>
        </div>
      </div>

      <div
        ref="scrollContainer"
        class="code-scroll"
        @scroll="handleScroll"
      >
        <div v-if="enableVirtualization" class="code-virtual" :style="{ height: `${totalVirtualHeight}px` }">
          <div class="code-virtual-window" :style="{ transform: `translateY(${visibleWindow.offsetTop}px)` }">
            <div
              v-for="row in visibleWindow.items"
              :key="row.line.number"
              class="code-line"
              :class="lineClass(row)"
              @click="focusedLineNumber = row.line.number"
            >
              <span class="code-line-number">
                <button
                  v-if="foldRangeByStart.has(row.line.number)"
                  class="code-fold-btn"
                  type="button"
                  @click.stop="toggleFold(row.line.number)"
                >
                  {{ isCollapsedStart(row.line.number) ? '▸' : '▾' }}
                </button>
                <span class="code-line-index">{{ row.line.numberText }}</span>
              </span>

              <code v-if="row.kind === 'line'" class="code-line-text" v-html="row.line.html"></code>
              <div v-else class="code-fold-placeholder">
                <span class="code-fold-summary">{{ row.line.text }}</span>
                <span class="code-fold-summary-meta">... {{ row.hiddenCount }} lines</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="code-lines">
          <div
            v-for="row in displayItems"
            :key="row.line.number"
            class="code-line"
            :class="lineClass(row)"
            @click="focusedLineNumber = row.line.number"
          >
            <span class="code-line-number">
              <button
                v-if="foldRangeByStart.has(row.line.number)"
                class="code-fold-btn"
                type="button"
                @click.stop="toggleFold(row.line.number)"
              >
                {{ isCollapsedStart(row.line.number) ? '▸' : '▾' }}
              </button>
              <span class="code-line-index">{{ row.line.numberText }}</span>
            </span>

            <code v-if="row.kind === 'line'" class="code-line-text" v-html="row.line.html"></code>
            <div v-else class="code-fold-placeholder">
              <span class="code-fold-summary">{{ row.line.text }}</span>
              <span class="code-fold-summary-meta">... {{ row.hiddenCount }} lines</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="pendingHighlight" class="code-progress">
        <span class="code-progress-dot"></span>
        <span>{{ $t('doc.highlighting') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const CodeMirrorEditor = defineAsyncComponent(() => import('../editors/CodeMirrorEditor.vue'))

const { t } = useI18n()
import { highlight } from '@mindcraft/agent/render'
import { buildCodeViewModel } from '../codeViewModel.mjs'
import {
  applyCollapsedRanges,
  buildIndentFoldRanges,
  findEnclosingFoldStarts,
  highlightHtmlMatches,
} from '../codeViewerDecorations.mjs'
import {
  clampLineNumber,
  findCodeMatches,
  getInitialViewport,
  getVisibleWindow,
} from '../codeViewerState.mjs'

const props = defineProps({
  text: { type: String, default: '' },
  filePath: { type: String, default: '' },
  name: { type: String, default: '' },
  ext: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isEditable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change'])

const ROW_HEIGHT = 22
const VIRTUAL_SCROLL_LINE_THRESHOLD = 800

const editorRef = ref(null)
const editorText = ref(props.text || '')
const wrapLines = ref(false)
const pendingHighlight = ref(false)
const searchQuery = ref('')
const jumpLineInput = ref('')
const currentMatchIndex = ref(0)
const focusedLineNumber = ref(0)
const collapsedStarts = ref(new Set())
const scrollContainer = ref(null)
const viewportState = ref({
  scrollTop: 0,
  viewportHeight: 440,
  overscan: 8,
})
const viewModel = ref(buildCodeViewModel({
  text: '',
  filePath: props.filePath || props.name || '',
  ext: props.ext,
}))

let highlightTimer = null
let resizeObserver = null

function buildModel(highlightedText = '') {
  return buildCodeViewModel({
    text: props.text || '',
    filePath: props.filePath || props.name || '',
    ext: props.ext,
    highlightedText,
  })
}

function clearHighlightTimer() {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
}

function refreshViewModel() {
  clearHighlightTimer()

  if (props.isLoading) {
    pendingHighlight.value = false
    viewModel.value = buildCodeViewModel({
      text: '',
      filePath: props.filePath || props.name || '',
      ext: props.ext,
    })
    return
  }

  const baseModel = buildModel()
  viewModel.value = baseModel

  if (!baseModel.shouldDeferHighlight || !props.text) {
    pendingHighlight.value = false
    return
  }

  pendingHighlight.value = true
  highlightTimer = setTimeout(() => {
    const highlightedText = highlight(props.text || '', props.filePath || props.name || '')
    viewModel.value = buildModel(highlightedText)
    pendingHighlight.value = false
    highlightTimer = null
  }, 16)
}

function updateViewport() {
  const element = scrollContainer.value
  const metrics = getInitialViewport({
    lineCount: displayItems.value.length,
    rowHeight: ROW_HEIGHT,
    viewportHeight: element?.clientHeight || 440,
  })

  viewportState.value = {
    scrollTop: element?.scrollTop || 0,
    viewportHeight: metrics.viewportHeight,
    overscan: metrics.overscan,
  }
}

function handleScroll() {
  if (!scrollContainer.value) return
  viewportState.value = {
    ...viewportState.value,
    scrollTop: scrollContainer.value.scrollTop,
  }
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function onEditorInput(newText) {
  editorText.value = newText
  emit('update:modelValue', newText)
  emit('change', newText)
}

function toggleWrap() {
  if (displayItems.value.length >= VIRTUAL_SCROLL_LINE_THRESHOLD && !wrapLines.value) {
    ElMessage.info(t('doc.noWrapInLarge'))
    return
  }
  wrapLines.value = !wrapLines.value
  nextTick(updateViewport)
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(props.text || '')
    ElMessage.success(t('doc.codeCopied'))
  } catch (_) {
    ElMessage.warning(t('doc.copyFailed'))
  }
}

function isCollapsedStart(lineNumber) {
  return collapsedStarts.value.has(lineNumber)
}

function toggleFold(lineNumber) {
  const nextSet = new Set(collapsedStarts.value)
  if (nextSet.has(lineNumber)) nextSet.delete(lineNumber)
  else nextSet.add(lineNumber)
  collapsedStarts.value = nextSet
  nextTick(updateViewport)
}

function ensureLineVisible(lineNumber) {
  const foldStarts = findEnclosingFoldStarts(foldRanges.value, lineNumber)
  if (!foldStarts.length) return false

  let changed = false
  const nextSet = new Set(collapsedStarts.value)
  for (const startLineNumber of foldStarts) {
    if (nextSet.has(startLineNumber)) {
      nextSet.delete(startLineNumber)
      changed = true
    }
  }

  if (changed) {
    collapsedStarts.value = nextSet
  }
  return changed
}

function scrollToLine(lineNumber, align = 'center') {
  const targetLine = clampLineNumber(lineNumber, viewModel.value.lineCount)
  if (ensureLineVisible(targetLine)) {
    nextTick(() => scrollToLine(targetLine, align))
    return
  }

  const element = scrollContainer.value
  if (!element) return
  const viewportHeight = element.clientHeight || viewportState.value.viewportHeight || 440
  const displayIndex = displayIndexByLine.value.get(targetLine) ?? Math.max(0, targetLine - 1)
  const top = displayIndex * ROW_HEIGHT
  const nextTop = align === 'start'
    ? top
    : Math.max(0, top - Math.max(0, (viewportHeight / 2) - ROW_HEIGHT))
  element.scrollTop = nextTop
  focusedLineNumber.value = targetLine
  handleScroll()
}

function goPrevMatch() {
  if (!matches.value.length) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length
}

function goNextMatch() {
  if (!matches.value.length) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length
}

function jumpToLine() {
  const targetLine = clampLineNumber(jumpLineInput.value, viewModel.value.lineCount)
  jumpLineInput.value = String(targetLine)
  scrollToLine(targetLine)
}

function lineClass(row) {
  return {
    'is-focused': focusedLineNumber.value === row.line.number,
    'is-match-line': matchLineNumbers.value.has(row.line.number),
    'is-fold-line': row.kind === 'fold',
  }
}

const matches = computed(() => findCodeMatches(viewModel.value.lines, searchQuery.value))
const activeMatch = computed(() => matches.value[currentMatchIndex.value] || null)
const currentMatchDisplay = computed(() => matches.value.length ? currentMatchIndex.value + 1 : 0)
const matchLineNumbers = computed(() => new Set(matches.value.map(match => match.lineNumber)))
const matchesByLine = computed(() => {
  const map = new Map()
  for (const match of matches.value) {
    const list = map.get(match.lineNumber) || []
    list.push({ start: match.start, end: match.end })
    map.set(match.lineNumber, list)
  }
  return map
})
const highlightedLines = computed(() => viewModel.value.lines.map((line) => ({
  ...line,
  html: highlightHtmlMatches(line.html, matchesByLine.value.get(line.number) || []),
})))
const foldRanges = computed(() => buildIndentFoldRanges(highlightedLines.value))
const foldRangeByStart = computed(() => new Map(foldRanges.value.map(range => [range.startLineNumber, range])))
const displayItems = computed(() => applyCollapsedRanges(highlightedLines.value, foldRanges.value, collapsedStarts.value))
const displayIndexByLine = computed(() => {
  const map = new Map()
  displayItems.value.forEach((row, index) => {
    map.set(row.line.number, index)
  })
  return map
})
const enableVirtualization = computed(() => !wrapLines.value && displayItems.value.length >= VIRTUAL_SCROLL_LINE_THRESHOLD)
const visibleWindow = computed(() => getVisibleWindow({
  lines: displayItems.value,
  scrollTop: viewportState.value.scrollTop,
  rowHeight: ROW_HEIGHT,
  viewportHeight: viewportState.value.viewportHeight,
  overscan: viewportState.value.overscan,
}))
const totalVirtualHeight = computed(() => displayItems.value.length * ROW_HEIGHT)

watch(
  () => [props.text, props.filePath, props.name, props.ext, props.isLoading],
  () => {
    refreshViewModel()
    collapsedStarts.value = new Set()
    currentMatchIndex.value = 0
    focusedLineNumber.value = 0
    nextTick(updateViewport)
  },
  { immediate: true }
)

watch(searchQuery, () => {
  currentMatchIndex.value = 0
})

watch(activeMatch, (match) => {
  if (!match) return
  scrollToLine(match.lineNumber)
})

watch(displayItems, () => {
  nextTick(updateViewport)
})

onMounted(() => {
  nextTick(updateViewport)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => updateViewport())
    if (scrollContainer.value) {
      resizeObserver.observe(scrollContainer.value)
    }
  }
})

onBeforeUnmount(() => {
  clearHighlightTimer()
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped>
.viewer-code {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.code-meta {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--doc-code-meta-border, #d9e3f0);
  border-radius: 16px;
  background: var(--doc-code-meta-bg, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(10px);
}

.code-meta-main,
.code-actions,
.code-surface-toolbar,
.code-surface-hints,
.code-surface-summary,
.code-searchbar,
.code-jump {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.code-meta-main {
  flex: 1;
}

.code-badge,
.code-hint {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.code-badge {
  background: #e0f2fe;
  color: #0369a1;
}

.code-hint {
  background: #e2e8f0;
  color: #334155;
}

.code-hint.is-busy {
  background: #dbeafe;
  color: #1d4ed8;
}

.code-hint.is-warn {
  background: #fef3c7;
  color: #92400e;
}

.code-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  color: var(--doc-code-path, #475569);
}
.code-stat,
.code-surface-summary,
.code-match-summary {
  color: var(--doc-muted, #64748b);
  font-size: 12px;
}

.code-action-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--doc-source-btn-border, #d4deea);
  border-radius: 10px;
  background: var(--doc-source-btn-bg, #f8fafc);
  color: var(--doc-source-btn-text, #334155);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.code-action-btn.compact {
  height: 28px;
  padding: 0 10px;
}

.code-action-btn:hover:not(:disabled) {
  border-color: var(--doc-source-btn-hover-border, #93c5fd);
  background: var(--doc-source-btn-hover-bg, #eff6ff);
  color: var(--doc-source-btn-hover-text, #1d4ed8);
}

.code-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.code-input {
  height: 30px;
  border: 1px solid var(--doc-code-input-border, #d4deea);
  border-radius: 10px;
  background: var(--doc-code-input-bg, #ffffff);
  color: var(--doc-code-input-text, #0f172a);
  font-size: 12px;
  outline: none;
  padding: 0 10px;
}

.code-input:focus {
  border-color: var(--doc-code-input-focus-border, #60a5fa);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
}

.search-input {
  width: 220px;
}

.jump-input {
  width: 96px;
}

.code-loading-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 300px;
  border: 1px solid var(--doc-line, #dbe4f0);
  border-radius: 18px;
  background: var(--doc-code-loading-gradient, linear-gradient(135deg, rgba(219,234,254,0.45), rgba(255,255,255,0.95)));
}

.code-loading-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid var(--doc-code-spinner-border, #dbeafe);
  border-top-color: var(--doc-code-spinner-accent, #2563eb);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.code-loading-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--doc-code-loading-text, #1e293b);
}

.code-loading-subtext {
  font-size: 12px;
  color: var(--doc-code-loading-subtext, #64748b);
}

.code-surface {
  border: 1px solid var(--doc-code-surface-border, #dbe4f0);
  border-radius: 18px;
  background: var(--doc-code-surface-bg, #0b1220);
  color: var(--doc-code-surface-text, #e2e8f0);
  overflow: hidden;
  box-shadow: 0 24px 48px var(--doc-code-surface-shadow, rgba(15, 23, 42, 0.14));
}

.code-surface--editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 18px;
  overflow: hidden;
}

.code-surface--editor > :deep(.cm-editor-host) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

.code-surface--editor > :deep(.cm-editor-host) .cm-editor {
  background: transparent;
}

.code-surface--editor > :deep(.cm-editor-host) .cm-gutters {
  background: var(--doc-code-gutter-bg, rgba(2, 6, 23, 0.96));
  border-right: 1px solid var(--doc-code-gutter-border, rgba(148, 163, 184, 0.14));
}

.code-surface--editor > :deep(.cm-editor-host) .cm-activeLineGutter,
.code-surface--editor > :deep(.cm-editor-host) .cm-activeLine {
  background: var(--doc-code-line-active-bg, rgba(96, 165, 250, 0.14));
}

.code-surface-toolbar,
.code-searchbar {
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--doc-code-toolbar-border, rgba(148, 163, 184, 0.18));
  background: var(--doc-code-toolbar-bg, rgba(15, 23, 42, 0.92));
}

.code-searchbar {
  flex-wrap: wrap;
  justify-content: flex-start;
}

.code-scroll {
  overflow: auto;
  max-height: calc(100vh - 300px);
}

.code-lines,
.code-virtual-window {
  width: max-content;
  min-width: 100%;
}

.code-lines {
  padding: 10px 0;
}

.code-virtual {
  position: relative;
  width: 100%;
}

.code-virtual-window {
  position: absolute;
  left: 0;
  top: 0;
  padding: 10px 0;
}

.code-line {
  display: grid;
  grid-template-columns: minmax(72px, auto) 1fr;
  align-items: stretch;
  min-width: 100%;
}

.code-line:hover,
.code-line.is-focused,
.code-line.is-match-line {
  background: var(--doc-code-line-hover-bg, rgba(148, 163, 184, 0.08));
}

.code-line.is-focused {
  background: var(--doc-code-line-active-bg, rgba(96, 165, 250, 0.14));
}

.code-line.is-match-line {
  background: var(--doc-code-line-match-bg, rgba(250, 204, 21, 0.12));
}

.code-line.is-fold-line {
  background: var(--doc-code-fold-bg, rgba(59, 130, 246, 0.08));
}

.code-line-number {
  position: sticky;
  left: 0;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 8px;
  user-select: none;
  color: var(--doc-code-gutter-text, #64748b);
  background: var(--doc-code-gutter-bg, rgba(2, 6, 23, 0.96));
  border-right: 1px solid var(--doc-code-gutter-border, rgba(148, 163, 184, 0.14));
  font: 12px/1.7 'Cascadia Code', Consolas, monospace;
}

.code-fold-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--doc-code-gutter-text, #94a3b8);
  font: inherit;
  cursor: pointer;
}

.code-fold-btn:hover {
  color: var(--doc-code-surface-text, #e2e8f0);
}

.code-line-index {
  text-align: right;
  min-width: 36px;
}

.code-line-text,
.code-fold-placeholder {
  display: block;
  padding: 0 18px;
  color: var(--doc-code-surface-text, #e2e8f0);
  font: 13px/1.7 'Cascadia Code', Consolas, monospace;
}

.code-line-text {
  white-space: pre;
}

.wrap-lines .code-line-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.code-fold-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--doc-code-fold-text, #cbd5e1);
}

.code-fold-summary {
  opacity: 0.95;
}

.code-fold-summary-meta {
  color: var(--doc-code-fold-meta, #60a5fa);
  font-size: 12px;
}

.code-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 12px;
  color: var(--doc-code-progress-text, #93c5fd);
  font-size: 12px;
  border-top: 1px solid var(--doc-code-toolbar-border, rgba(148, 163, 184, 0.12));
  background: var(--doc-code-progress-bg, rgba(15, 23, 42, 0.92));
}

.code-progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--doc-code-progress-text, #60a5fa);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--doc-code-progress-text, #60a5fa) 18%, transparent);
  animation: pulse 1.2s ease-in-out infinite;
}

:deep(.code-search-hit) {
  padding: 0 1px;
  border-radius: 3px;
  background: rgba(250, 204, 21, 0.88);
  color: #111827;
}

:deep(.hljs-comment),
:deep(.hljs-quote) {
  color: var(--cc-hljs-comment);
  font-style: italic;
}

:deep(.hljs-keyword),
:deep(.hljs-selector-tag),
:deep(.hljs-subst) {
  color: var(--cc-hljs-keyword);
}

:deep(.hljs-string),
:deep(.hljs-template-tag),
:deep(.hljs-template-variable) {
  color: var(--cc-hljs-string);
}

:deep(.hljs-attr),
:deep(.hljs-variable) {
  color: var(--cc-hljs-params);
}

:deep(.hljs-number),
:deep(.hljs-symbol),
:deep(.hljs-bullet) {
  color: var(--cc-hljs-number);
}

:deep(.hljs-literal) {
  color: var(--cc-hljs-tag);
}

:deep(.hljs-title),
:deep(.hljs-section) {
  color: var(--cc-hljs-function);
}

:deep(.hljs-tag) {
  color: var(--cc-hljs-tag);
}

:deep(.hljs-built_in) {
  color: var(--cc-hljs-built-in);
}

:deep(.hljs-type),
:deep(.hljs-class .hljs-title) {
  color: var(--cc-hljs-type);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(0.92);
    opacity: 0.7;
  }

  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .code-meta {
    flex-direction: column;
    align-items: stretch;
  }

  .code-actions {
    justify-content: flex-end;
  }

  .search-input {
    width: 100%;
  }

  .code-scroll {
    max-height: calc(100vh - 380px);
  }
}
</style>
