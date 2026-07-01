<template>
  <div class="ss-panel">
    <div class="ss-section">
      <div class="ss-section-title">{{ $t('settings.importConfig') }}</div>
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

  </div>

  <Teleport to="body">
    <!-- Import Preview Dialog -->
    <div v-if="showImportPreview" class="settings-overlay" :class="themeClass" @click.self="cancelImportPreview">
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
          <div class="import-footer-spacer"></div>
          <button class="import-footer-cancel" @click="cancelImportPreview">{{ $t('common.cancel') }}</button>
          <button class="import-footer-commit" :disabled="!hasImportActions" @click="commitImport">{{ $t('settings.importCommit') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClaudeThemeStore } from '../../../stores/claudeTheme.js'

const { t } = useI18n()
const themeStore = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${themeStore.theme}`)

defineProps({
  embedded: { type: Boolean, default: false },
})

// ---- Import state (T163: CC Switch system-level import) ----
const showImportPreview = ref(false)
const importAllProviders = ref([])
const importWarnings = ref([])
const importSkippedRows = ref([])
const importFilePath = ref('')

const codexProviders = computed(() => importAllProviders.value.filter((p) => p.agentType === 'codex'))
const claudeProviders = computed(() => importAllProviders.value.filter((p) => p.agentType === 'claude'))
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
}

async function commitImport() {
  const decisions = importAllProviders.value
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
    })

    if (!result?.ok) {
      importWarnings.value = [...(importWarnings.value || []), ...(result?.warnings || []), 'Import failed']
      return
    }

    const { ElMessage } = await import('element-plus')
    ElMessage.success(
      t('settings.importSuccessSummary', {
        codex: result.details?.codex?.imported || 0,
        claude: result.details?.claude?.imported || 0,
        skipped: result.skipped || 0,
      }),
    )

    cancelImportPreview()
  } catch (e) {
    importWarnings.value = [...(importWarnings.value || []), e.message || String(e)]
  }
}
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

.ss-hint-text {
  font-size: 12px;
  color: var(--cc-text-muted);
  margin: 0 0 6px;
  line-height: 1.5;
}

/* ---- Import Dialog (T163) ---- */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: var(--cc-overlay-bg-strong, rgba(0, 0, 0, 0.68));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 2000;
}

.import-preview-dialog {
  background: var(--cc-bg-secondary, #1e1e1e);
  border: 1px solid var(--cc-border);
  border-radius: 12px;
  width: 560px;
  max-width: min(92vw, 720px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 18px 56px rgba(0, 0, 0, 0.56);
}

.import-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary, #1e1e1e);
  color: var(--cc-text, #e0e0e0);
  font-size: 15px;
  font-weight: 600;
}

.settings-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--cc-text-dim, #888);
  padding: 0 4px;
}
.settings-close:hover { color: var(--cc-text, #e0e0e0); }

.import-warnings {
  padding: 8px 20px;
  background: var(--cc-warning-bg, #fff8e1);
  border-bottom: 1px solid var(--cc-border);
}
.import-warning-item {
  font-size: 12px;
  color: var(--cc-warning, #f59e0b);
  line-height: 1.5;
}

.import-preview-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px;
  background: var(--cc-bg-secondary, #1e1e1e);
}

.import-group-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--cc-text-dim, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 10px 0 6px;
  border-bottom: 1px solid var(--cc-border);
  margin-bottom: 6px;
}
.import-group-header--skip {
  color: var(--cc-error, #ef4444);
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
  color: var(--cc-text-dim, #888);
  flex-shrink: 0;
}

.import-preview-info {
  flex: 1;
  min-width: 0;
}
.import-preview-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--cc-text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.import-preview-detail {
  font-size: 11px;
  color: var(--cc-text-muted, #bbb);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.import-preview-url {
  color: var(--cc-text-dim, #888);
}

.import-conflict-badge {
  display: inline-block;
  font-size: 10px;
  color: var(--cc-warning, #f59e0b);
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
  color: var(--cc-text, #e0e0e0);
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
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text, #e0e0e0);
  width: 100px;
}
.import-rename-input:focus {
  outline: none;
  border-color: var(--cc-primary);
}

.import-empty {
  text-align: center;
  padding: 32px 0;
  color: var(--cc-text-muted, #bbb);
  font-size: 13px;
}

.import-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary, #1e1e1e);
}

.import-footer-spacer {
  margin-right: auto;
}

.import-footer-cancel {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-tertiary, #ccc);
  font-size: 13px;
  cursor: pointer;
}
.import-footer-cancel:hover {
  background: var(--cc-bg-elevated);
  color: var(--cc-text, #e0e0e0);
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
</style>
