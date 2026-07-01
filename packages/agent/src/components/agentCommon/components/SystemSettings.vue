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
</style>
