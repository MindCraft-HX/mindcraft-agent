<template>
  <div class="ss-panel">
    <div class="ss-section">
      <div class="ss-section-title">{{ L('公司信息', 'Company') }}</div>
      <div class="ss-section-body">
        <div class="ss-item">
          <span class="ss-item-label">{{ $t('settings.company') }}</span>
        </div>
        <div class="ss-item ss-item-meta">
          <span class="ss-item-value ss-mono">2019 - {{ currentYear }}</span>
        </div>
      </div>
    </div>

    <div class="ss-section">
      <div class="ss-section-title">{{ L('版本信息', 'Version') }}</div>
      <div class="ss-section-body">
        <div class="ss-item">
          <span class="ss-item-label">{{ $t('settings.appVersion') }}</span>
          <span class="ss-item-value ss-mono">v{{ appVersion || '…' }}</span>
        </div>
      </div>
    </div>

    <div class="ss-section">
      <div class="ss-section-title">{{ L('更新检测', 'Updates') }}</div>
      <div class="ss-section-body">
        <div class="ss-item ss-item-update">
          <button
            v-if="updateState !== 'downloaded'"
            class="ss-update-btn"
            :class="updateBtnClass"
            :disabled="updateState === 'checking' || updateState === 'downloading'"
            @click="handleCheckUpdate"
          >
            <span v-if="updateState === 'checking'" class="ss-spinner"></span>
            {{ updateBtnText }}
          </button>

          <button
            v-if="updateState === 'available' && !forceUpdate"
            class="ss-action-btn ss-action-btn--primary"
            @click="handleDownloadUpdate"
          >
            {{ $t('settings.downloadUpdate') }}
          </button>

          <span v-if="updateState === 'available' && forceUpdate" class="ss-status ss-status--force">
            {{ $t('settings.forceUpdateRequired') }}
          </span>

          <span v-if="updateState === 'available'" class="ss-status ss-status--warn">
            {{ $t('settings.appUpdateAvailable', { version: newVersion }) }}
          </span>
          <span v-else-if="updateState === 'not-available'" class="ss-status ss-status--ok">
            {{ isDevMode ? L('开发模式', 'Dev Mode') : $t('settings.appUpToDate') }}
          </span>
          <span v-else-if="updateState === 'error'" class="ss-status ss-status--err">
            {{ $t('settings.appUpdateFailed') }}
          </span>
          <span v-else-if="updateState === 'downloaded'" class="ss-status ss-status--ok">
            {{ $t('settings.appUpdateDownloaded') }}
          </span>
        </div>

        <div v-if="updateState === 'available' && releaseNotes" class="ss-item ss-release-notes">
          <pre class="ss-release-notes-text">{{ releaseNotes }}</pre>
        </div>

        <div v-if="updateState === 'downloaded'" class="ss-item">
          <button
            class="ss-action-btn ss-action-btn--primary"
            @click="handleInstallUpdate"
          >
            {{ $t('settings.restartToInstall') }}
          </button>
        </div>

        <div v-if="updateState === 'downloading'" class="ss-item ss-progress">
          <div class="ss-progress-bar">
            <div
              class="ss-progress-fill"
              :class="{ 'ss-progress-indeterminate': downloadProgress === 0 }"
              :style="{ width: downloadProgress > 0 ? Math.round(downloadProgress) + '%' : '30%' }"
            ></div>
          </div>
          <span class="ss-progress-text">
            {{ downloadProgress > 0 ? $t('settings.appUpdateDownloading', { progress: Math.round(downloadProgress) }) : $t('settings.downloading') }}
          </span>
        </div>
      </div>
    </div>

    <div class="ss-section">
      <div class="ss-section-title">{{ L('导入配置', 'Import Config') }}</div>
      <div class="ss-section-body">
        <p class="ss-hint-text">{{ $t('settings.importCcSwitchDesc') }}</p>
        <div class="ss-item">
          <button class="ss-update-btn" @click="pickCcSwitchFile">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>
            {{ $t('settings.importCcSwitchConfig') }}
          </button>
        </div>
      </div>
    </div>

    <div class="ss-section">
      <div class="ss-section-title">{{ L('开机启动', 'Auto Start') }}</div>
      <div class="ss-section-body">
        <div class="ss-item ss-item-update">
          <span class="ss-item-label">{{ L('开机自启动', 'Auto-start on boot') }}</span>
          <label class="ss-switch">
            <input
              type="checkbox"
              :checked="autoStartEnabled"
              @change="handleAutoStartToggle"
            />
            <span class="ss-switch-slider"></span>
          </label>
          <span class="ss-status" :class="autoStartEnabled ? 'ss-status--ok' : 'ss-status--dim'">
            {{ autoStartEnabled ? L('已开启', 'Enabled') : L('已关闭', 'Disabled') }}
          </span>
        </div>
      </div>
    </div>

    <div class="ss-section">
      <div class="ss-section-title">{{ L('诊断日志', 'Diagnostics') }}</div>
      <div class="ss-section-body">
        <div class="ss-item ss-item-update">
          <span class="ss-item-label">{{ L('启用排查日志', 'Enable diagnostics') }}</span>
          <label class="ss-switch">
            <input
              type="checkbox"
              :checked="diagnosticsEnabled"
              @change="handleDiagnosticsToggle"
            />
            <span class="ss-switch-slider"></span>
          </label>
          <span class="ss-status" :class="diagnosticsEnabled ? 'ss-status--warn' : 'ss-status--ok'">
            {{ diagnosticsEnabled ? L('已开启，仅排查时建议开启', 'Enabled, turn on only when debugging') : L('默认关闭', 'Disabled by default') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Import Preview Dialog -->
    <div v-if="showImportPreview" class="settings-overlay" @click.self="cancelImportPreview">
      <div class="import-preview-dialog">
        <div class="import-dialog-header">
          <span>{{ $t('settings.importPreviewTitle', { source: 'CC Switch' }) }}</span>
          <button class="settings-close" @click="cancelImportPreview">×</button>
        </div>
        <div v-if="importWarnings.length" class="import-warnings">
          <div v-for="(w, i) in importWarnings" :key="i" class="import-warning-item">⚠ {{ w }}</div>
        </div>
        <div class="import-preview-scroll">
          <!-- CodeX group -->
          <template v-if="codexProviders.length">
            <div class="import-group-header">{{ $t('settings.importAgentTypeCodex') }} ({{ codexProviders.length }})</div>
            <div v-for="p in codexProviders" :key="p.tempId" class="import-preview-item" :class="{ conflict: p.conflict }">
              <div class="import-preview-avatar">{{ (p.name || '?')[0].toUpperCase() }}</div>
              <div class="import-preview-info">
                <div class="import-preview-name">{{ p.name || '?' }}</div>
                <div class="import-preview-detail">{{ p.config?.model || '' }} <span v-if="p.config?.url" class="import-preview-url">— {{ p.config.url }}</span></div>
                <div v-if="p.conflict" class="import-conflict-badge">{{ $t('settings.importConflictName') }}</div>
              </div>
              <select v-model="p._action" class="import-action-select">
                <option value="add">{{ $t('settings.importActionAdd') }}</option>
                <option v-if="p.conflict" value="overwrite">{{ $t('settings.importActionOverwrite') }}</option>
                <option v-if="p.conflict" value="rename">{{ $t('settings.importRename') }}</option>
                <option value="skip">{{ $t('settings.importActionSkip') }}</option>
              </select>
              <input v-if="p._action === 'rename'" v-model="p._finalName" class="import-rename-input" :placeholder="p.name" />
            </div>
          </template>
          <!-- ClaudeCode group -->
          <template v-if="claudeProviders.length">
            <div class="import-group-header">{{ $t('settings.importAgentTypeClaude') }} ({{ claudeProviders.length }})</div>
            <div v-for="p in claudeProviders" :key="p.tempId" class="import-preview-item" :class="{ conflict: p.conflict }">
              <div class="import-preview-avatar">{{ (p.name || '?')[0].toUpperCase() }}</div>
              <div class="import-preview-info">
                <div class="import-preview-name">{{ p.name || '?' }}</div>
                <div class="import-preview-detail">{{ p.config?.model || '' }} <span v-if="p.config?.url" class="import-preview-url">— {{ p.config.url }}</span></div>
                <div v-if="p.conflict" class="import-conflict-badge">{{ $t('settings.importConflictName') }}</div>
              </div>
              <select v-model="p._action" class="import-action-select">
                <option value="add">{{ $t('settings.importActionAdd') }}</option>
                <option v-if="p.conflict" value="overwrite">{{ $t('settings.importActionOverwrite') }}</option>
                <option v-if="p.conflict" value="rename">{{ $t('settings.importRename') }}</option>
                <option value="skip">{{ $t('settings.importActionSkip') }}</option>
              </select>
              <input v-if="p._action === 'rename'" v-model="p._finalName" class="import-rename-input" :placeholder="p.name" />
            </div>
          </template>
          <!-- Skipped group -->
          <template v-if="importSkippedRows.length">
            <div class="import-group-header import-group-header--skip">{{ $t('settings.importAgentTypeSkipped') }} ({{ importSkippedRows.length }})</div>
            <div v-for="(s, i) in importSkippedRows" :key="'sk-' + i" class="import-preview-item skipped">
              <div class="import-preview-avatar">!</div>
              <div class="import-preview-info">
                <div class="import-preview-name">{{ s.name || s.appType || '?' }}</div>
                <div class="import-preview-detail">{{ s.reason }}</div>
              </div>
            </div>
          </template>
          <div v-if="!importAllProviders.length" class="import-empty">{{ $t('settings.importNoProvidersFound') }}</div>
        </div>
        <div class="import-dialog-footer">
          <label class="import-active-check">
            <input type="checkbox" v-model="applyCcSwitchActive" />
            <span>{{ $t('settings.importUseCcSwitchActive') }}</span>
          </label>
          <button class="import-footer-cancel" @click="cancelImportPreview">{{ $t('common.cancel') }}</button>
          <button class="import-footer-commit" :disabled="!hasImportActions" @click="commitImport">{{ $t('settings.importCommit') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

function L(zh, en) {
  return locale.value === 'zh' ? zh : en
}

const currentYear = computed(() => new Date().getFullYear())

const appVersion = ref('')
const updateState = ref('idle')
const newVersion = ref('')
const downloadProgress = ref(0)
const isDevMode = ref(false)
const releaseNotes = ref('')
const forceUpdate = ref(false)
const initialized = ref(false)
const diagnosticsEnabled = ref(false)
const autoStartEnabled = ref(false)
const pendingManualCheckId = ref(0)

let cleanupListener = null

const updateBtnText = computed(() => {
  switch (updateState.value) {
    case 'checking': return t('settings.checking')
    case 'downloading': return t('settings.appUpdateDownloading', { progress: Math.round(downloadProgress.value) })
    case 'downloaded': return t('settings.appUpdateDownloaded')
    case 'error': return t('common.retry')
    default: return t('settings.checkAppUpdate')
  }
})

const updateBtnClass = computed(() => ({
  checking: updateState.value === 'checking',
  downloading: updateState.value === 'downloading',
}))

async function handleCheckUpdate() {
  updateState.value = 'checking'
  try {
    const result = await window.electronAPI?.checkForUpdates?.()
    pendingManualCheckId.value = Number(result?.checkId || 0)
  } catch (_) {
    pendingManualCheckId.value = 0
    updateState.value = 'error'
  }
}

async function handleDownloadUpdate() {
  const result = await window.electronAPI?.downloadUpdate?.()
  if (!result?.success) {
    updateState.value = 'error'
  }
}

function handleInstallUpdate() {
  window.electronAPI?.installUpdate?.()
}

async function handleDiagnosticsToggle(event) {
  const enabled = Boolean(event?.target?.checked)
  diagnosticsEnabled.value = enabled
  try {
    const result = await window.electronAPI?.setDiagnosticsEnabled?.(enabled)
    diagnosticsEnabled.value = Boolean(result?.enabled)
  } catch (_) {
    diagnosticsEnabled.value = !enabled
  }
}

async function handleAutoStartToggle(event) {
  const enabled = Boolean(event?.target?.checked)
  autoStartEnabled.value = enabled
  try {
    const v = await window.electronAPI?.setLoginItemSettings?.(enabled)
    if (v !== undefined) autoStartEnabled.value = Boolean(v)
  } catch (_) {
    autoStartEnabled.value = !enabled
  }
}

async function openSettings() {
  if (initialized.value) return
  initialized.value = true

  try {
    const v = await window.electronAPI?.getAppVersion()
    if (v) appVersion.value = v
  } catch (_) {
    appVersion.value = 'N/A'
  }

  try {
    const result = await window.electronAPI?.getDiagnosticsEnabled?.()
    diagnosticsEnabled.value = Boolean(result?.enabled)
  } catch (_) {}

  try {
    const v = await window.electronAPI?.getLoginItemSettings?.()
    autoStartEnabled.value = Boolean(v)
  } catch (_) {}

  try {
    const status = await window.electronAPI?.getAppUpdateStatus()
    if (status?.state) applyUpdateStatus(status, { fromSnapshot: true })
  } catch (_) {}

  cleanupListener = window.electronAPI?.onAppUpdateStatus?.((data) => {
    if (!data) return
    applyUpdateStatus(data)
  })
}

function applyUpdateStatus(data, options = {}) {
  const nextState = data.error ? 'error' : (data.state || 'idle')
  const fromSnapshot = Boolean(options.fromSnapshot)
  const checkId = Number(data.checkId || 0)

  if (nextState === 'checking' && checkId > 0) {
    pendingManualCheckId.value = checkId
  }
  if (!fromSnapshot && pendingManualCheckId.value > 0 && checkId > 0 && checkId < pendingManualCheckId.value) {
    return
  }

  updateState.value = nextState
  if (checkId > 0 && checkId === pendingManualCheckId.value && nextState !== 'checking') {
    pendingManualCheckId.value = 0
  }
  if (data.version !== undefined) newVersion.value = data.version || ''
  if (data.progress != null) downloadProgress.value = data.progress
  if (data.dev != null) isDevMode.value = Boolean(data.dev)
  if (data.releaseNotes !== undefined) releaseNotes.value = data.releaseNotes || ''
  if (data.force != null) forceUpdate.value = Boolean(data.force)
}

onMounted(() => {})

onUnmounted(() => {
  if (typeof cleanupListener === 'function') cleanupListener()
})

// ---- Import state (T163: CC Switch system-level import) ----
const showImportPreview = ref(false)
const importAllProviders = ref([])
const importWarnings = ref([])
const importSkippedRows = ref([])
const importFilePath = ref('')
const applyCcSwitchActive = ref(false)

const codexProviders = computed(() => importAllProviders.value.filter((p) => p.agentType === 'codex'))
const claudeProviders = computed(() => importAllProviders.value.filter((p) => p.agentType === 'claude'))
const skippedProviderNames = computed(() => new Set(importSkippedRows.value.map((s) => (s.name || '').toLowerCase())))
const hasImportActions = computed(() =>
  importAllProviders.value.some((p) => p._action !== 'skip'),
)

async function pickCcSwitchFile() {
  try {
    const result = await window.electronAPI?.configImportPickFile?.()
    if (!result?.ok || !result.filePath) return

    importFilePath.value = result.filePath

    const preview = await window.electronAPI?.configImportPreview?.({
      source: 'cc-switch',
      filePath: result.filePath,
    })

    if (!preview?.ok) {
      importWarnings.value = preview?.warnings || ['Preview failed']
      importAllProviders.value = []
      importSkippedRows.value = []
      showImportPreview.value = true
      return
    }

    // Assign default actions: skip conflicts, add non-conflicts
    importAllProviders.value = (preview.providers || []).map((p) => ({
      ...p,
      _action: p.conflict ? 'skip' : 'add',
      _finalName: '',
    }))
    importWarnings.value = preview.warnings || []
    importSkippedRows.value = preview.skippedRows || []
    showImportPreview.value = true
  } catch (e) {
    importWarnings.value = [e.message || String(e)]
    importAllProviders.value = []
    importSkippedRows.value = []
    showImportPreview.value = true
  }
}

function cancelImportPreview() {
  showImportPreview.value = false
  importAllProviders.value = []
  importWarnings.value = []
  importSkippedRows.value = []
  importFilePath.value = ''
  applyCcSwitchActive.value = false
}

async function commitImport() {
  const decisions = importAllProviders.value
    .filter((p) => p._action !== 'skip')
    .map((p) => ({
      tempId: p.tempId,
      action: p._action,
      finalName: p._action === 'rename' ? (p._finalName || p.name) : undefined,
    }))

  try {
    const result = await window.electronAPI?.configImportCommit?.({
      source: 'cc-switch',
      filePath: importFilePath.value,
      providers: decisions,
      applyActiveFromCcSwitch: applyCcSwitchActive.value,
    })

    if (!result?.ok) {
      importWarnings.value = [...(importWarnings.value || []), ...(result?.warnings || []), 'Import failed']
      return
    }

    const { ElMessage } = await import('element-plus')
    ElMessage.success(
      `导入完成：CodeX ${result.details?.codex?.imported || 0} 项，Claude Code ${result.details?.claude?.imported || 0} 项，跳过 ${result.skipped || 0} 项`,
    )

    cancelImportPreview()
  } catch (e) {
    importWarnings.value = [...(importWarnings.value || []), e.message || String(e)]
  }
}

defineExpose({ openSettings })
</script>

<style scoped>
.ss-panel {
  padding: 24px 28px;
}

.ss-section {
  margin-bottom: 24px;
}
.ss-section:last-child {
  margin-bottom: 0;
}

.ss-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cc-text-dim);
  letter-spacing: 0.3px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--cc-border);
}

.ss-section-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-item {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 32px;
}

.ss-item-meta {
  min-height: auto;
  padding-left: 4px;
}

.ss-item-label {
  font-size: 13px;
  color: var(--cc-text);
  font-weight: 500;
}

.ss-item-value {
  font-size: 13px;
  color: var(--cc-text-dim);
  margin-left: auto;
}

.ss-mono {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
}

.ss-item-update {
  flex-wrap: wrap;
  gap: 10px;
}

.ss-update-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-tertiary);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.ss-update-btn:hover:not(:disabled) {
  background: var(--cc-bg-elevated);
  color: var(--cc-primary);
  border-color: var(--cc-primary);
}
.ss-update-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ss-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--cc-border);
  border-top-color: var(--cc-primary);
  border-radius: 50%;
  animation: ss-spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes ss-spin {
  to { transform: rotate(360deg); }
}

.ss-status {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.ss-status--ok {
  color: var(--cc-success, #4caf50);
}
.ss-status--warn {
  color: var(--cc-warning);
}
.ss-status--err {
  color: var(--cc-error);
}
.ss-status--dim {
  color: var(--cc-text-muted);
}

.ss-progress {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.ss-progress-bar {
  width: 100%;
  max-width: 320px;
  height: 4px;
  background: var(--cc-border);
  border-radius: 2px;
  overflow: hidden;
}

.ss-progress-fill {
  height: 100%;
  background: var(--cc-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}
.ss-progress-indeterminate {
  animation: ss-progress-pulse 1.2s ease-in-out infinite;
  opacity: 0.6;
}
@keyframes ss-progress-pulse {
  0%   { opacity: 0.3; }
  50%  { opacity: 0.8; }
  100% { opacity: 0.3; }
}

.ss-progress-text {
  font-size: 11px;
  color: var(--cc-text-muted);
}

.ss-action-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--cc-primary);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.12s, color 0.12s;
}
.ss-action-btn--primary {
  background: var(--cc-primary);
  color: #fff;
}
.ss-action-btn--primary:hover {
  filter: brightness(1.1);
}

.ss-status--force {
  color: var(--cc-error);
  font-weight: 600;
}

.ss-release-notes {
  max-height: 120px;
  overflow-y: auto;
}
.ss-release-notes-text {
  margin: 0;
  font-size: 11px;
  color: var(--cc-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.ss-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 40px;
  height: 22px;
}

.ss-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ss-switch-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--cc-border);
  transition: background 0.15s ease;
}

.ss-switch-slider::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}

.ss-switch input:checked + .ss-switch-slider {
  background: var(--cc-warning);
}

.ss-switch input:checked + .ss-switch-slider::before {
  transform: translateX(18px);
}

/* ---- Import Dialog (T163) ---- */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.import-preview-dialog {
  background: var(--cc-bg-primary);
  border-radius: 12px;
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
}

.import-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cc-border);
  font-size: 15px;
  font-weight: 600;
}

.settings-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--cc-text-dim);
  padding: 0 4px;
}
.settings-close:hover { color: var(--cc-text); }

.import-warnings {
  padding: 8px 20px;
  background: var(--cc-warning-bg, #fff8e1);
  border-bottom: 1px solid var(--cc-border);
}
.import-warning-item {
  font-size: 12px;
  color: var(--cc-warning);
  line-height: 1.5;
}

.import-preview-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px;
}

.import-group-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--cc-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 10px 0 6px;
  border-bottom: 1px solid var(--cc-border);
  margin-bottom: 6px;
}
.import-group-header--skip {
  color: var(--cc-error);
}

.import-preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--cc-border-subtle, rgba(128,128,128,0.1));
}
.import-preview-item.conflict {
  background: var(--cc-warning-bg, #fff8e1);
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 4px;
}
.import-preview-item.skipped {
  opacity: 0.6;
}

.import-preview-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--cc-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--cc-text-dim);
  flex-shrink: 0;
}

.import-preview-info {
  flex: 1;
  min-width: 0;
}
.import-preview-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--cc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.import-preview-detail {
  font-size: 11px;
  color: var(--cc-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.import-preview-url {
  color: var(--cc-text-dim);
}

.import-conflict-badge {
  display: inline-block;
  font-size: 10px;
  color: var(--cc-warning);
  background: rgba(255, 152, 0, 0.12);
  padding: 1px 6px;
  border-radius: 3px;
  margin-top: 2px;
}

.import-action-select {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  background: var(--cc-bg-secondary);
  color: var(--cc-text);
  cursor: pointer;
}
.import-action-select:focus {
  outline: none;
  border-color: var(--cc-primary);
}

.import-rename-input {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--cc-border);
  border-radius: 4px;
  background: var(--cc-bg-primary);
  color: var(--cc-text);
  width: 100px;
}
.import-rename-input:focus {
  outline: none;
  border-color: var(--cc-primary);
}

.import-empty {
  text-align: center;
  padding: 32px 0;
  color: var(--cc-text-muted);
  font-size: 13px;
}

.import-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--cc-border);
}

.import-active-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cc-text-dim);
  cursor: pointer;
  margin-right: auto;
}
.import-active-check input[type="checkbox"] {
  accent-color: var(--cc-primary);
}

.import-footer-cancel {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-tertiary);
  font-size: 13px;
  cursor: pointer;
}
.import-footer-cancel:hover {
  background: var(--cc-bg-elevated);
  color: var(--cc-text);
}

.import-footer-commit {
  padding: 6px 20px;
  border-radius: 6px;
  border: none;
  background: var(--cc-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.import-footer-commit:hover:not(:disabled) {
  filter: brightness(1.1);
}
.import-footer-commit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ss-hint-text {
  font-size: 12px;
  color: var(--cc-text-muted);
  margin: 0 0 6px;
  line-height: 1.5;
}
</style>
