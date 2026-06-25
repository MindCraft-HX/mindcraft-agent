<template>
  <div
    class="doc-viewer"
    :data-path-context-cwd="currentContextDir"
    :data-path-context-workspace-root="currentContextDir"
    data-path-context-source="document-viewer"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <div class="doc-toolbar">
      <div class="doc-toolbar-left">
        <el-button :icon="FolderOpened" type="primary" size="small" @click="openFile">{{ $t('doc.openFile') }}</el-button>
      </div>
      <div class="doc-toolbar-right" v-if="currentTab">
        <span class="doc-type">{{ currentTab.ext ? `.${currentTab.ext}` : 'file' }}</span>
        <span class="doc-path" :title="currentTab.filePath || currentTab.name">{{ currentTab.filePath || currentTab.name }}</span>
      </div>
    </div>

    <el-tabs
      v-if="tabs.length"
      v-model="activeTabId"
      type="card"
      closable
      class="doc-tabs"
      @tab-remove="removeTab"
    >
      <el-tab-pane
        v-for="tab in tabs"
        :key="tab.id"
        :name="tab.id"
      >
        <template #label>
          <span class="doc-tab-label">
            <el-icon v-if="tab.isLoading" class="doc-tab-loading"><Loading /></el-icon>
            <span class="doc-tab-text">{{ tab.name }}</span>
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <div v-if="currentTab" class="doc-body" :class="{ 'is-loading': currentTab.isLoading }">
      <component
        :is="currentViewer"
        :key="currentViewerKey"
        v-bind="currentViewerProps"
        @openExternal="confirmOpenExternal(currentTab)"
      />
      <div v-if="currentTab.isLoading" class="doc-loading-mask">
        <div class="doc-loading-card">
          <el-icon class="doc-loading-icon"><Loading /></el-icon>
          <div class="doc-loading-title">{{ $t('doc.opening') }}</div>
          <div class="doc-loading-desc">{{ $t('doc.openingDesc') }}</div>
        </div>
      </div>
    </div>

    <el-empty
      v-else
      :description="$t('doc.emptyHint')"
      class="doc-empty"
    />
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'

defineOptions({ name: 'mdViewer' })
import { i18n } from '@/i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FolderOpened, Loading } from '@element-plus/icons-vue'
import MarkdownViewer from './viewers/MarkdownViewer.vue'
import CodeTextViewer from './viewers/CodeTextViewer.vue'
import HtmlViewer from './viewers/HtmlViewer.vue'
import PdfViewer from './viewers/PdfViewer.vue'
import UnsupportedViewer from './viewers/UnsupportedViewer.vue'
import { createDocumentTab } from './documentPayload.mjs'
import { createPendingDocumentTab, finalizeDocumentTab } from './documentTabs.mjs'

const VIEWER_MAP = {
  markdown: MarkdownViewer,
  code: CodeTextViewer,
  html: HtmlViewer,
  pdf: PdfViewer,
  unsupported: UnsupportedViewer,
}

const tabs = ref([])
const activeTabId = ref('')
const seenPayloadKeys = new Map()
const MAX_SEEN_PAYLOAD_KEYS = 200

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) || null)
const currentViewer = computed(() => VIEWER_MAP[currentTab.value?.viewerType || 'unsupported'] || UnsupportedViewer)
const currentViewerKey = computed(() => currentTab.value
  ? `${currentTab.value.id}:${currentTab.value.viewerType}:${currentTab.value.filePath || currentTab.value.name}`
  : '')
const currentViewerProps = computed(() => currentTab.value ? {
  text: currentTab.value.text,
  binary: currentTab.value.binary,
  filePath: currentTab.value.filePath,
  name: currentTab.value.name,
  ext: currentTab.value.ext,
  isLoading: currentTab.value.isLoading,
} : {})
const currentContextDir = computed(() => {
  const filePath = currentTab.value?.filePath || ''
  if (!filePath || typeof window === 'undefined' || !window.electronAPI?.pathDirname) return ''
  return window.electronAPI.pathDirname(filePath) || ''
})

function findTabByFilePath(filePath = '') {
  if (!filePath) return null
  return tabs.value.find(tab => tab.filePath && tab.filePath === filePath) || null
}

function upsertTab(nextTab) {
  const idx = tabs.value.findIndex(tab =>
    tab.id === nextTab.id ||
    (nextTab.filePath && tab.filePath === nextTab.filePath)
  )
  if (idx < 0) {
    tabs.value.push(nextTab)
    return
  }
  tabs.value.splice(idx, 1, {
    ...tabs.value[idx],
    ...nextTab,
  })
}

function getPayloadKey(payload = {}) {
  if (payload.__mdRequestId) return `request:${payload.__mdRequestId}`
  if (payload.filePath || payload.path) return `path:${payload.filePath || payload.path}`
  if (payload.id) return `id:${payload.id}`
  const dataSize = payload.data
    ? (payload.data.byteLength || payload.data.length || payload.data.data?.length || 0)
    : 0
  return `inline:${payload.name || ''}:${payload.size || dataSize}:${payload.type || ''}:${payload.content ? String(payload.content).length : ''}`
}

function rememberPayload(payload = {}) {
  const key = getPayloadKey(payload)
  const now = Date.now()
  const previous = seenPayloadKeys.get(key)
  seenPayloadKeys.set(key, now)
  if (seenPayloadKeys.size > MAX_SEEN_PAYLOAD_KEYS) {
    const oldest = [...seenPayloadKeys.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, seenPayloadKeys.size - MAX_SEEN_PAYLOAD_KEYS)
    for (const [oldKey] of oldest) seenPayloadKeys.delete(oldKey)
  }
  if (key.startsWith('request:')) return Boolean(previous)
  return Boolean(previous && now - previous < 1000)
}
async function ensurePayloadContent(payload = {}) {
  if (!payload?.filePath || payload.content || payload.data) return payload
  const file = await window.electronAPI?.readFileByPath?.(payload.filePath)
  if (!file) {
    ElMessage.error(i18n.global.t('error.fileReadMsg', { path: payload.filePath || i18n.global.t('home.unnamedFile') }))
    return { ...payload, content: '', isLoading: false }
  }
  return {
    ...payload,
    name: payload.name || file.name,
    filePath: payload.filePath || file.path,
    data: file.data,
    type: file.type,
    size: file.size,
  }
}

async function saveRecentDoc(payload = {}) {
  if (!payload.filePath) return
  try {
    const docs = await window.electronAPI?.getSetting?.('recentDocs') || []
    const name = payload.name || payload.filePath.split(/[\\/]/).pop() || ''
    const entry = {
      name,
      filePath: payload.filePath,
      ext: name.split('.').pop() || '',
      openedAt: Date.now(),
    }
    const filtered = Array.isArray(docs) ? docs.filter(d => d.filePath !== entry.filePath) : []
    filtered.unshift(entry)
    await window.electronAPI?.setSetting?.('recentDocs', filtered.slice(0, 5))
    try { localStorage.removeItem('mindcraft_agent_recent_docs') } catch (_) {}
  } catch (_) {}
}

// 鍚屾搴旂敤 payload锛氱珛鍗冲垱寤?tab銆佹洿鏂?UI銆傝繑鍥為渶瑕佸紓姝ヨ鍙栫殑 pendingTab锛堟垨 null锛?
function applyPayloadSync(payload = {}) {
  const existing = findTabByFilePath(payload.filePath)
  const requiresRead = Boolean(payload?.filePath && !payload.content && !payload.data)

  if (!requiresRead) {
    const readyTab = createDocumentTab({
      ...payload,
      id: existing?.id || payload.id,
    })
    upsertTab(readyTab)
    activeTabId.value = readyTab.id
    saveRecentDoc(payload)
    return null
  }

  // 宸叉湁闈炲姞杞戒腑鐨?tab锛氱洿鎺ュ垏鎹€備絾澶辫触 tab 闇€閲嶈瘯璇诲彇
  if (existing && !existing.isLoading && !existing.isLoadError) {
    activeTabId.value = existing.id
    return null
  }

  const pendingTab = existing?.isLoading
    ? existing
    : createPendingDocumentTab({
      ...payload,
      id: existing?.id || payload.id,
    })

  upsertTab(pendingTab)
  activeTabId.value = pendingTab.id
  return pendingTab
}

// 寮傛瀹屾垚 payload锛氳鍙栨枃浠跺唴瀹广€乫inalize tab
async function completePayloadAsync(payload = {}, pendingTab) {
  try {
    const ready = await ensurePayloadContent(payload)
    const completedTab = { ...finalizeDocumentTab(pendingTab, ready), isLoadError: false }
    upsertTab(completedTab)
    // 浠呭綋鐢ㄦ埛鏈垏鎹㈠埌鍏朵粬 tab 鏃舵墠鑷姩鍒囨崲锛堥槻姝㈣鐩栧悗缁搷浣滐級
    if (activeTabId.value === pendingTab.id) {
      activeTabId.value = completedTab.id
    }
    saveRecentDoc(ready)
  } catch (error) {
    const errorTab = {
      ...pendingTab,
      isLoading: false,
      isLoadError: true,
      content: i18n.global.t('error.fileReadMsg', { path: payload.filePath || i18n.global.t('home.unnamedFile') }),
    }
    upsertTab(errorTab)
    ElMessage.error(error?.message || i18n.global.t('error.fileRead'))
  }
}

async function openFile() {
  const files = await window.electronAPI.selectAndReadFile({
    type: 'file',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Documents', extensions: ['*'] }],
  })
  if (!files?.length) return
  for (const file of files) {
    const payload = {
      name: file.name,
      filePath: file.path,
      data: file.data,
      type: file.type,
      size: file.size,
    }
    // selectAndReadFile 閫氬父杩斿洖 data锛屼絾闃插尽鎬у鐞嗙己澶?data 鐨勬儏鍐?
    const pendingTab = applyPayloadSync(payload)
    if (pendingTab) await completePayloadAsync(payload, pendingTab)
  }
}

async function onDrop(event) {
  const files = [...(event.dataTransfer?.files || [])]
  for (const file of files) {
    if (file.path) {
      const payload = { name: file.name, filePath: file.path }
      const pendingTab = applyPayloadSync(payload)
      if (pendingTab) await completePayloadAsync(payload, pendingTab)
      continue
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer()
      applyPayloadSync({ name: file.name, data: new Uint8Array(arrayBuffer) })
    } else {
      const text = await file.text()
      applyPayloadSync({ name: file.name, content: text })
    }
  }
}

function removeTab(id) {
  const idx = tabs.value.findIndex(tab => tab.id === id)
  if (idx < 0) return
  tabs.value.splice(idx, 1)
  if (activeTabId.value === id) {
    activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id || ''
  }
}

async function confirmOpenExternal(tab) {
  if (!tab?.filePath) return
  try {
    await ElMessageBox.confirm(
      `${i18n.global.t('doc.openExternalConfirm')}\n\n${tab.filePath}`,
      i18n.global.t('doc.openExternal'),
      {
        confirmButtonText: i18n.global.t('common.ok'),
        cancelButtonText: i18n.global.t('common.cancel'),
        type: 'warning',
      }
    )
    const result = await window.electronAPI?.openFileWithDefault?.(tab.filePath)
    if (result) {
      ElMessage.warning(result)
    }
  } catch (_) {}
}

// 涓茶鍖?payload 寮傛澶勭悊锛岄槻姝㈠苟鍙戞枃浠惰鍙栫珵鎬?
// 鍚屾閮ㄥ垎锛圲I 鏇存柊锛夌珛鍗虫墽琛岋紝浣?activeTabId 鍦?router.push 涔嬪墠鐢熸晥
// 鎵€鏈?payload锛堝惈鏃犺璺緞锛夊潎鍏ラ槦浠ヤ繚搴忥紝completePayloadAsync 鍐?activeTabId 瀹堝崼闃茶鐩?
let payloadQueue = Promise.resolve()
function enqueuePayload(payload) {
  const p = payload || {}
  if (rememberPayload(p)) return
  const pendingTab = applyPayloadSync(p)
  payloadQueue = payloadQueue
    .then(() => { if (pendingTab) return completePayloadAsync(p, pendingTab) })
    .catch(err => { console.error('[mdViewer] enqueuePayload failed:', err) })
}

async function drainPendingPayloads() {
  try {
    const payloads = await window.electronAPI?.getPendingMdContent?.()
    if (Array.isArray(payloads)) {
      for (const payload of payloads) {
        enqueuePayload(payload || {})
      }
    }
  } catch (_) {}
}

onMounted(async () => {
  window.electronAPI?.onMdContent?.(enqueuePayload)
  await drainPendingPayloads()
})

onActivated(() => {
  void drainPendingPayloads()
})
</script>

<style scoped>
.doc-viewer {
  --doc-bg: var(--cc-bg, #ffffff);
  --doc-paper: var(--cc-bg-secondary, #ffffff);
  --doc-line: var(--cc-border-medium, #e5e7eb);
  --doc-line-strong: var(--cc-border-strong, #cbd5e1);
  --doc-text: var(--cc-text, #1f2937);
  --doc-muted: var(--cc-text-dim, #64748b);
  --doc-accent: var(--cc-primary, #2563eb);
  --doc-code-bg: var(--cc-bg-code-deep, #111827);
  --doc-code-header-bg: var(--cc-bg-elevated, #f0eee9);
  --doc-code-header-border: var(--doc-line, #e2dfd9);
  --doc-code-label: var(--cc-text-secondary, #222);
  --doc-code-btn-bg: var(--cc-btn-bg, #eceae6);
  --doc-code-btn-border: var(--cc-btn-border, #ddd9d3);
  --doc-code-btn-text: var(--cc-btn-text, #3d3d3d);
  --doc-code-btn-hover-bg: var(--cc-btn-bg-hover, #e2dfd9);
  --doc-code-btn-hover-border: var(--cc-btn-border-hover, #b8b4ae);
  --doc-code-btn-hover-text: var(--cc-btn-text-hover, #2c2c2c);
  --doc-inline-code-bg: var(--cc-bg-hover, #eff6ff);
  /* 浠ｇ爜鏌ョ湅鍣?UI chrome 鍙橀噺锛堜唬鐮佽〃闈㈡湰韬繚鎸佹繁鑹?IDE 椋庢牸锛?*/
  --doc-code-meta-bg: var(--cc-bg-elevated, rgba(255, 255, 255, 0.92));
  --doc-code-meta-border: var(--doc-line, #d9e3f0);
  --doc-code-path: var(--doc-muted, #475569);
  --doc-source-btn-bg: var(--cc-bg-secondary, #f8fafc);
  --doc-source-btn-border: var(--doc-line, #d4deea);
  --doc-source-btn-text: var(--doc-text, #334155);
  --doc-source-btn-hover-bg: var(--cc-primary-bg, #eff6ff);
  --doc-source-btn-hover-border: var(--cc-primary, #93c5fd);
  --doc-source-btn-hover-text: var(--cc-primary, #1d4ed8);
  --doc-code-input-bg: var(--doc-paper, #ffffff);
  --doc-code-input-border: var(--doc-line, #d4deea);
  --doc-code-input-text: var(--doc-text, #0f172a);
  --doc-code-input-focus-border: var(--cc-primary, #60a5fa);
  --doc-code-loading-gradient: linear-gradient(135deg, var(--cc-bg-secondary, rgba(219,234,254,0.45)), var(--cc-bg-elevated, rgba(255,255,255,0.95)));
  --doc-code-loading-text: var(--doc-text, #1e293b);
  --doc-code-loading-subtext: var(--doc-muted, #64748b);
  --doc-code-spinner-border: var(--cc-primary-bg, #dbeafe);
  --doc-code-spinner-accent: var(--cc-primary, #2563eb);
  /* Source file viewer chrome. Keep this layer local to mdViewer. */
  --doc-code-surface-bg: var(--cc-bg-code-deep, #111827);
  --doc-code-surface-text: var(--cc-hljs-text, var(--doc-text, #e2e8f0));
  --doc-code-toolbar-bg: var(--cc-bg-deep, var(--doc-code-surface-bg));
  --doc-code-gutter-bg: var(--cc-bg-deepest, var(--doc-code-surface-bg));
  --doc-code-gutter-text: var(--cc-text-dim, #64748b);
  --doc-code-gutter-border: var(--cc-border-medium, rgba(148, 163, 184, 0.18));
  --doc-code-surface-border: var(--doc-line, #dbe4f0);
  --doc-code-surface-shadow: var(--cc-shadow, rgba(15, 23, 42, 0.14));
  --doc-code-toolbar-border: var(--cc-border-medium, rgba(148, 163, 184, 0.18));
  --doc-code-line-hover-bg: color-mix(in srgb, var(--cc-primary, #60a5fa) 8%, transparent);
  --doc-code-line-active-bg: color-mix(in srgb, var(--cc-primary, #60a5fa) 16%, transparent);
  --doc-code-line-match-bg: color-mix(in srgb, #facc15 18%, transparent);
  --doc-code-fold-bg: color-mix(in srgb, var(--cc-primary, #3b82f6) 10%, transparent);
  --doc-code-fold-text: var(--doc-code-surface-text);
  --doc-code-fold-meta: var(--cc-primary, #60a5fa);
  --doc-code-progress-bg: var(--doc-code-toolbar-bg);
  --doc-code-progress-text: var(--cc-primary, #60a5fa);
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cc-bg, radial-gradient(circle at top left, #f8fbff 0%, #ffffff 42%));
}

.doc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--doc-line);
  background: var(--cc-bg-elevated, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(12px);
  flex-shrink: 0;
}

.doc-toolbar-left,
.doc-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.doc-type {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--cc-primary-bg, #eff6ff);
  color: var(--cc-primary, #1d4ed8);
  font-size: 11px;
  font-weight: 700;
}

.doc-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--doc-muted);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.doc-tabs {
  flex-shrink: 0;
  padding: 0 16px;
  background: var(--cc-bg-secondary, rgba(255, 255, 255, 0.88));
}

.doc-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom-color: var(--doc-line);
}

.doc-tabs :deep(.el-tabs__nav) {
  border-color: var(--doc-line);
}

.doc-tabs :deep(.el-tabs__item) {
  color: var(--doc-muted);
  border-left-color: var(--doc-line);
  background: var(--doc-paper);
}

.doc-tabs :deep(.el-tabs__item:hover),
.doc-tabs :deep(.el-tabs__item.is-active) {
  color: var(--doc-accent);
}

.doc-tabs :deep(.el-tabs__item.is-active) {
  background: var(--doc-bg);
}

.doc-tabs :deep(.el-tabs__item .is-icon-close) {
  color: var(--doc-muted);
}

.doc-tabs :deep(.el-tabs__item .is-icon-close:hover) {
  color: var(--doc-accent);
  background: var(--cc-bg-hover, transparent);
}

.doc-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
}

.doc-tab-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-tab-loading,
.doc-loading-icon {
  animation: doc-spin 0.9s linear infinite;
}

.doc-body {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px 40px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  color: var(--doc-text);
  background: var(--doc-paper);
}

.doc-loading-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--cc-bg-overlay, rgba(255, 255, 255, 0.78));
  backdrop-filter: blur(4px);
}

.doc-loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 280px;
  padding: 22px 24px;
  border: 1px solid var(--cc-border-light, #dbe4f0);
  border-radius: 18px;
  background: var(--cc-bg-elevated, rgba(255, 255, 255, 0.94));
  box-shadow: 0 24px 40px var(--cc-bg-overlay, rgba(15, 23, 42, 0.08));
}

.doc-loading-icon {
  font-size: 22px;
  color: var(--cc-primary, #2563eb);
}

.doc-loading-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--cc-text, #0f172a);
}

.doc-loading-desc {
  font-size: 12px;
  color: var(--cc-text-dim, #64748b);
}

.doc-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.doc-empty :deep(.el-empty__description p) {
  color: var(--doc-muted);
}

@media (max-width: 768px) {
  .doc-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .doc-body {
    margin: 0;
    padding: 18px 14px 28px;
  }
}

@keyframes doc-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
