import { i18n } from '@/i18n'
<template>
  <div
    class="doc-viewer"
    :data-path-context-cwd="currentContextDir"
    :data-path-context-workspace-root="currentContextDir"
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
import { computed, onMounted, ref } from 'vue'

defineOptions({ name: 'mdViewer' })
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

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) || null)
const currentViewer = computed(() => VIEWER_MAP[currentTab.value?.viewerType || 'unsupported'] || UnsupportedViewer)
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

function saveRecentDoc(payload = {}) {
  if (!payload.filePath) return
  try {
    const key = 'mindcraft_agent_recent_docs'
    const docs = JSON.parse(localStorage.getItem(key) || '[]')
    const entry = {
      name: payload.name || '',
      filePath: payload.filePath,
      ext: (payload.name || '').split('.').pop() || '',
      openedAt: Date.now(),
    }
    // 去重 + 最大5条
    const filtered = docs.filter(d => d.filePath !== entry.filePath)
    filtered.unshift(entry)
    localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)))
  } catch (_) {}
}

async function addPayload(payload = {}) {
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
    return
  }

  if (existing && !existing.isLoading) {
    activeTabId.value = existing.id
    return
  }

  const pendingTab = existing?.isLoading
    ? existing
    : createPendingDocumentTab({
      ...payload,
      id: existing?.id || payload.id,
    })

  upsertTab(pendingTab)
  activeTabId.value = pendingTab.id

  try {
    const ready = await ensurePayloadContent(payload)
    const completedTab = finalizeDocumentTab(pendingTab, ready)
    upsertTab(completedTab)
    activeTabId.value = completedTab.id
    saveRecentDoc(payload)
  } catch (error) {
    upsertTab({
      ...pendingTab,
      isLoading: false,
    })
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
    await addPayload({
      name: file.name,
      filePath: file.path,
      data: file.data,
      type: file.type,
      size: file.size,
    })
  }
}

async function onDrop(event) {
  const files = [...(event.dataTransfer?.files || [])]
  for (const file of files) {
    if (file.path) {
      await addPayload({ name: file.name, filePath: file.path })
      continue
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer()
      await addPayload({ name: file.name, data: new Uint8Array(arrayBuffer) })
    } else {
      const text = await file.text()
      await addPayload({ name: file.name, content: text })
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
      `暂不支持预览该文件类型。是否使用系统默认程序打开？\n${tab.filePath}`,
      i18n.global.t('home.browseDocs'),
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

onMounted(async () => {
  const dispose = window.electronAPI?.onMdContent?.((payload) => {
    void addPayload(payload || {})
  })
  try {
    const payloads = await window.electronAPI?.getPendingMdContent?.()
    if (Array.isArray(payloads)) {
      for (const payload of payloads) {
        await addPayload(payload || {})
      }
    }
  } catch (_) {}
  if (typeof dispose === 'function') {
    // no-op
  }
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
  --doc-inline-code-bg: var(--cc-bg-hover, #eff6ff);
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
