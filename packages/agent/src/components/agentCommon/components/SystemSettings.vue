<template>
  <div class="ss-panel">
    <!-- 公司信息 -->
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

    <!-- 版本信息 -->
    <div class="ss-section">
      <div class="ss-section-title">{{ L('版本信息', 'Version') }}</div>
      <div class="ss-section-body">
        <div class="ss-item">
          <span class="ss-item-label">{{ $t('settings.appVersion') }}</span>
          <span class="ss-item-value ss-mono">v{{ appVersion || '…' }}</span>
        </div>
      </div>
    </div>

    <!-- 更新检测 -->
    <div class="ss-section">
      <div class="ss-section-title">{{ L('更新检测', 'Updates') }}</div>
      <div class="ss-section-body">
        <div class="ss-item ss-item-update">
          <button
            class="ss-update-btn"
            :class="updateBtnClass"
            :disabled="updateState === 'checking' || updateState === 'downloading'"
            @click="handleCheckUpdate"
          >
            <span v-if="updateState === 'checking'" class="ss-spinner"></span>
            {{ updateBtnText }}
          </button>

          <!-- 下载按钮 -->
          <button
            v-if="updateState === 'available' && !forceUpdate"
            class="ss-action-btn ss-action-btn--primary"
            @click="handleDownloadUpdate"
          >
            {{ $t('settings.downloadUpdate') }}
          </button>

          <!-- 强制更新提示 -->
          <span v-if="updateState === 'available' && forceUpdate" class="ss-status ss-status--force">
            {{ $t('settings.forceUpdateRequired') }}
          </span>

          <!-- 状态指示 -->
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

        <!-- 更新日志 -->
        <div v-if="updateState === 'available' && releaseNotes" class="ss-item ss-release-notes">
          <pre class="ss-release-notes-text">{{ releaseNotes }}</pre>
        </div>

        <!-- 重启安装按钮 -->
        <div v-if="updateState === 'downloaded'" class="ss-item">
          <button
            class="ss-action-btn ss-action-btn--primary"
            @click="handleInstallUpdate"
          >
            {{ $t('settings.restartToInstall') }}
          </button>
        </div>

        <!-- 下载进度 -->
        <div v-if="updateState === 'downloading' && downloadProgress != null" class="ss-item ss-progress">
          <div class="ss-progress-bar">
            <div class="ss-progress-fill" :style="{ width: Math.round(downloadProgress) + '%' }"></div>
          </div>
          <span class="ss-progress-text">{{ $t('settings.appUpdateDownloading', { progress: Math.round(downloadProgress) }) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

// 中/英双语文案切换，不依赖 i18n key，杜绝 "SETTINGS.COMPANY INFO" 裸奔
function L(zh, en) {
  return locale.value === 'zh' ? zh : en
}

const currentYear = computed(() => new Date().getFullYear())

const appVersion = ref('')
const updateState = ref('idle') // idle | checking | not-available | available | downloading | downloaded | error
const newVersion = ref('')
const downloadProgress = ref(0)
const isDevMode = ref(false)
const releaseNotes = ref('')
const forceUpdate = ref(false)

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

function handleCheckUpdate() {
  window.electronAPI?.checkForUpdates()
}

async function handleDownloadUpdate() {
  const ok = await window.electronAPI?.downloadUpdate?.()
  if (ok) {
    updateState.value = 'downloading'
    downloadProgress.value = 0
  }
}

function handleInstallUpdate() {
  window.electronAPI?.installUpdate?.()
}

onMounted(async () => {
  // 获取应用版本号
  try {
    const v = await window.electronAPI?.getAppVersion()
    if (v) appVersion.value = v
  } catch (_) {
    appVersion.value = 'N/A'
  }

  // 获取当前更新状态
  try {
    const status = await window.electronAPI?.getAppUpdateStatus()
    if (status && status.state) {
      updateState.value = status.state
      if (status.version) newVersion.value = status.version
      if (status.progress != null) downloadProgress.value = status.progress
      if (status.dev) isDevMode.value = true
      if (status.releaseNotes) releaseNotes.value = status.releaseNotes
      if (status.force) forceUpdate.value = true
    }
  } catch (_) { /* ignore */ }

  // 监听更新状态变化
  cleanupListener = window.electronAPI?.onAppUpdateStatus?.((data) => {
    if (!data) return
    updateState.value = data.state || 'idle'
    if (data.version) newVersion.value = data.version
    if (data.progress != null) downloadProgress.value = data.progress
    if (data.dev) isDevMode.value = true
    if (data.error) updateState.value = 'error'
    if (data.releaseNotes) releaseNotes.value = data.releaseNotes
    if (data.force) forceUpdate.value = true
  })
})

onUnmounted(() => {
  if (typeof cleanupListener === 'function') cleanupListener()
})
</script>

<style scoped>
.ss-panel {
  padding: 24px 28px;
}

/* ── Section ── */
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

/* ── Item Row ── */
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

/* ── Update Button ── */
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

/* ── Status Badge ── */
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

/* ── Progress ── */
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

.ss-progress-text {
  font-size: 11px;
  color: var(--cc-text-muted);
}

/* ── Action Button ── */
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

/* ── Force Update ── */
.ss-status--force {
  color: var(--cc-error);
  font-weight: 600;
}

/* ── Release Notes ── */
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
</style>
