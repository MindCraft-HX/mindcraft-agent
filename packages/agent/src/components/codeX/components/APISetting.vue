<template>
  <div>
    <ConfirmDialog ref="confirmDialogRef" />
    <ProviderForm
      :visible="showProviderForm"
      :provider="currentProvider"
      :is-new="editingNewProvider"
      @save="handleProviderFormSave"
      @close="handleProviderFormClose"
    />
    <div v-if="embedded || showSettings" class="settings-overlay" :class="{ 'settings-overlay--embedded': embedded }">
      <div class="settings-panel">
        <div v-if="!embedded" class="settings-header">
          <span>{{ $t('nav.settings') }}</span>
          <button class="settings-close" @click="closeSettings">×</button>
        </div>

        <!-- 默认文件权限 -->
        <div class="theme-row">
          <span class="theme-label">{{ $t('settings.defaultFileAccess') }}</span>
          <div class="theme-options">
            <button
              v-for="s in codexConfigStore.sandboxLevels"
              :key="s.value"
              class="theme-option permission-option"
              :class="{ active: codexConfigStore.sandboxMode === s.value }"
              :title="$t(s.descKey)"
              @click="codexConfigStore.setSandboxMode(s.value); showSandboxToast(s)"
            >
              <span class="theme-text">{{ $t(s.labelKey) }}</span>
            </button>
          </div>
        </div>

        <!-- 默认网络访问 -->
        <div class="theme-row">
          <span class="theme-label">{{ $t('settings.network') }}</span>
          <div class="theme-options">
            <button
              type="button"
              class="mini-toggle"
              :class="{ active: codexConfigStore.defaultNetworkAccess }"
              @click="codexConfigStore.setDefaultNetworkAccess(!codexConfigStore.defaultNetworkAccess)"
              :title="$t('settings.networkAccessHint')"
            >
              <span class="mini-toggle-knob"></span>
            </button>
            <span class="toggle-hint">{{ codexConfigStore.defaultNetworkAccess ? $t('settings.allowNetwork') : $t('settings.denyNetwork') }}</span>
          </div>
        </div>

        <!-- 默认网页搜索 -->
        <div class="theme-row">
          <span class="theme-label">{{ $t('settings.defaultSearch') }}</span>
          <div class="theme-options">
            <select
              :value="codexConfigStore.defaultWebSearch"
              class="mode-select"
              @change="codexConfigStore.setDefaultWebSearch($event.target.value)"
            >
              <option v-for="o in codexConfigStore.webSearchOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>

        <!-- 环境状态栏 -->
        <div class="env-status-bar">
          <template v-if="envChecking">
            <div class="env-row env-row-loading">
              <span class="env-item checking"><span class="env-spinner"></span>{{ $t('settings.nodeCheck') }}</span>
              <span class="env-item checking"><span class="env-spinner"></span>{{ $t('settings.npmCheck') }}</span>
              <span class="env-item checking"><span class="env-spinner"></span>{{ $t('settings.codexCheck') }}</span>
            </div>
          </template>
          <template v-else-if="envStatus">
            <div class="env-row">
              <span class="env-item" :class="envStatus.node?.compatible ? 'ok' : (envStatus.node?.installed ? 'warn' : 'err')">
                <span class="env-dot"></span>
                Node {{ envStatus.node?.installed ? envStatus.node.version : $t('settings.notInstalled') }}
                <span v-if="envStatus.node?.installed && !envStatus.node?.compatible" class="env-tip">{{ $t('settings.needNode') }}</span>
              </span>
              <span v-if="!envStatus.node?.installed || !envStatus.node?.compatible" class="env-divider">|</span>
              <a v-if="!envStatus.node?.installed || !envStatus.node?.compatible"
                class="env-node-link" @click="openNodeJsDownload">{{ $t('settings.downloadNode') }}</a>
              <span class="env-item" :class="envStatus.npm?.installed ? 'ok' : 'warn'">
                <span class="env-dot"></span>
                npm {{ envStatus.npm?.installed ? envStatus.npm.version : $t('settings.notInstalled') }}
              </span>
              <span class="env-item" :class="envStatus.codex?.installed ? 'ok' : 'err'">
                <span class="env-dot"></span>
                Codex {{ envStatus.codex?.installed ? (envStatus.codex.version ? `v${envStatus.codex.version.split(/\s/)[0].replace(/^v/, '')}` : $t('settings.installed')) : $t('settings.notInstalled') }}
              </span>
              <button v-if="envStatus.codex?.installed"
                class="env-update-btn" :class="{ updating: envCheckingUpdate }"
                :disabled="envInstalling || envCheckingUpdate"
                @click="checkForUpdate"
                :title="$t('settings.checkUpdate')">{{ envInstalling ? $t('settings.installing') : envCheckingUpdate ? $t('settings.checking') : envUpdateAvailable ? `${$t('settings.updateTo')} v${envLatestVersion}` : $t('settings.checkUpdate') }}</button>
              <span v-if="envUpdateAvailable" class="env-update-badge">{{ $t('settings.newVersion') }}</span>
              <button v-if="!envStatus.codex?.installed"
                class="env-install-btn"
                :disabled="envInstalling || !envStatus.npm?.installed || !envStatus.node?.compatible"
                @click="installCodex"
                :title="!envStatus.node?.compatible ? $t('settings.needNodeHint') : !envStatus.npm?.installed ? $t('settings.needNpmHint') : ''"
              >{{ envInstalling ? $t('settings.installing') : $t('settings.oneClickInstall') }}</button>
              <span v-if="!envStatus.codex?.installed && !envStatus.node?.compatible" class="env-hint-inline">{{ $t('settings.needNodeHint') }}</span>
              <span v-else-if="!envStatus.codex?.installed && !envStatus.npm?.installed" class="env-hint-inline">{{ $t('settings.needNpmHint') }}</span>
              <button class="env-refresh-btn" @click="checkEnvironment" :title="$t('settings.redetect')">↻</button>
            </div>
            <div v-if="envStatus.codex?.installed && envStatus.codex.path" class="env-path-hint">
              {{ $t('agent.path') }}{{ envStatus.codex.path }}
            </div>
          </template>
          <template v-else>
            <span class="env-item err">{{ $t('settings.detectFailed') }}</span>
            <button class="env-refresh-btn" @click="checkEnvironment" :title="$t('settings.redetect')">↻</button>
          </template>
        </div>

        <!-- 主题 -->
        <!-- 配置列表 -->
        <div class="settings-main">
          <div class="sp-left">
            <div class="sp-list-header">{{ $t('settings.configList') }}
                  <button class="import-legacy-btn repair" @click="repairCodexCliConfig" :title="$t('settings.codexRepairConfigHint')">
                    <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 7 A4 4 0 1 0 4 2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M4 2 H1 V5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 7 L5.5 8.5 L8.5 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>{{ $t('settings.codexRepairConfig') }}</button>
              </div>
            <div class="sp-list">
              <div v-for="(p, i) in settingsForm.providers" :key="i"
                class="sp-item" :class="{ active: settingsForm.selectedIdx === i, inuse: settingsForm.activeIdx === i }"
                @click="selectProvider(i)">
                <div class="sp-item-avatar">{{ providerAvatar(p) }}</div>
                <div class="sp-item-info">
                  <div class="sp-item-name">{{ p.name || 'default' }}</div>
                  <div class="sp-item-url">{{ p.model || '' }}</div>
                </div>
                <div class="sp-item-actions">
                  <span v-if="settingsForm.activeIdx === i" class="sp-inuse-badge">{{ $t('settings.inUse') }}</span>
                  <button v-else class="sp-item-btn use" @click.stop="activateProviderByIdx(i)" :title="$t('settings.useThisConfig')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><polygon points="3,2 10,6 3,10" fill="currentColor"/></svg>{{ $t('settings.enable') }}</button>
                  <button class="sp-item-btn edit" @click.stop="editProviderByIdx(i)" :title="$t('settings.edit')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 10 L2 8 L8 2 L10 4 L4 10 Z" stroke="currentColor" stroke-width="1" fill="none"/></svg>{{ $t('settings.edit') }}</button>
                  <button class="sp-item-btn copy" @click.stop="copyProvider(i)" :title="$t('settings.copy')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><rect x="4" y="4" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none" rx="1"/><path d="M2 8 L2 2 L8 2" stroke="currentColor" stroke-width="1" fill="none"/></svg>{{ $t('settings.copy') }}</button>
                  <button class="sp-item-btn import" @click.stop="importFromFile(i)" :title="$t('settings.overwriteFromLocalConfigHint')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1 L6 9 M3 6 L6 9 L9 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9 L1 11 L11 11 L11 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>{{ $t('settings.overwriteFromLocalConfig') }}</button>
                  <button class="sp-item-btn validate" @click.stop="validateProviderByIdx(i)" :disabled="validatingIdx === i" :title="$t('settings.validateKey')">
                    <svg v-if="validatingIdx !== i" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <span v-else class="sp-validating-dot"></span>
                    {{ validatingIdx === i ? $t('settings.validating') : $t('settings.validate') }}
                  </button>
                  <button class="sp-item-btn del" @click.stop="removeProvider(i)" :title="$t('settings.delete')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.5"/></svg>{{ $t('settings.delete') }}</button>
                </div>
              </div>
            </div>
            <button class="sp-add-btn" @click="addProvider">{{ $t('agent.addProvider') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useCodexConfigStore } from '../../../stores/codexConfig.js'
import ProviderForm from './ProviderForm.vue'
import ConfirmDialog from '../../agentCommon/components/ConfirmDialog.vue'
import {
  buildManagedProviderToml,
  extractProviderDraftFromToml,
  mergeManagedProviderToml,
  normalizeCodexReasoningEffort,
} from '../utils/providerToml.mjs'

const { t } = useI18n()

const confirmDialogRef = ref(null)
const codexConfigStore = useCodexConfigStore()

const showSettings = ref(false)
const showProviderForm = ref(false)
const editingNewProvider = ref(false)
const envStatus = ref(null)
const envChecking = ref(false)
const envInstalling = ref(false)
const envCheckingUpdate = ref(false)
const envUpdateAvailable = ref(false)
const envLatestVersion = ref('')
const validatingIdx = ref(-1)
const settingsForm = ref({ providers: [], selectedIdx: -1, activeIdx: -1 })
const currentProvider = ref(null)
const envInitialized = ref(false)

// Import dialog state (local CLI only — CC Switch moved to SystemSettings)

defineProps({ embedded: { type: Boolean, default: false } })
const emit = defineEmits(['providerActivated'])

async function checkEnvironment() {
  envInitialized.value = true
  envChecking.value = true
  try {
    const res = await window.electronAPI?.codexCheckEnvironment?.()
    envStatus.value = res || null
  } catch (e) {
    envStatus.value = { node: { installed: false, version: null, compatible: false }, npm: { installed: false, version: null }, codex: { installed: false, path: null } }
  } finally { envChecking.value = false }
}

async function installCodex() {
  envInstalling.value = true
  try {
    const result = await window.electronAPI?.codexInstallCodex?.()
    if (result?.success) {
      await checkEnvironment()
      const ver = envStatus.value?.codex?.version
      if (ver) {
        ElMessage.success(t('settings.codexInstallSuccess', { version: ver.replace(/^v/, '').split(/\s/)[0] }))
      } else {
        ElMessage.success(t('settings.codexInstallSuccessRefresh'))
      }
    } else {
      ElMessage.error(result?.message || t('system.installFail'))
    }
  } catch (e) {
    ElMessage.error(t('settings.installFailed') + (e?.message || e))
  } finally { envInstalling.value = false }
}

async function checkForUpdate() {
  envCheckingUpdate.value = true
  try {
    const env = await window.electronAPI?.codexCheckEnvironment?.()
    if (!env?.codex?.installed || !env?.codex?.version) {
      ElMessage.warning(t('system.installCodexFirst'))
      return
    }
    const res = await window.electronAPI?.codexCheckLatestVersion?.()
    if (!res?.ok || !res.version) {
      ElMessage.error(t('system.versionCheckFail') + ': ' + (res?.error || ''))
      return
    }
    const localVer = env.codex.version.replace(/^v/, '').split(/\s/)[0].trim()
    const latestVer = res.version
    if (localVer === latestVer) {
      ElMessage.success(t('system.alreadyLatest', { version: latestVer }))
      envUpdateAvailable.value = false
    } else {
      envUpdateAvailable.value = true
      envLatestVersion.value = latestVer
      const ok = await confirmDialogRef.value?.open({
        message: t('settings.codexNewVersionMsg', { latest: latestVer, local: localVer }),
        okText: t('settings.updateNow'),
        cancelText: t('settings.later'),
      })
      if (ok) {
        envInstalling.value = true
        try {
          const result = await window.electronAPI?.codexInstallCodex?.()
          if (result?.success) {
            await checkEnvironment()
            envUpdateAvailable.value = false
            envLatestVersion.value = ''
            const newVer = envStatus.value?.codex?.version
            if (newVer) {
              const shortVer = newVer.replace(/^v/, '').split(/\s/)[0]
              ElMessage.success(t('settings.codexUpdatedTo', { version: shortVer }))
            } else {
              ElMessage.success(t('settings.codexUpdateCompleteRefresh'))
            }
          } else {
            ElMessage.error(t('settings.updateFailed') + (result?.message || t('system.unknownError')))
          }
        } finally {
          envInstalling.value = false
        }
      }
    }
  } catch (e) {
    ElMessage.error(t('settings.checkUpdateFailed') + (e?.message || e))
  } finally {
    envCheckingUpdate.value = false
  }
}

function openNodeJsDownload() {
  window.electronAPI?.openExternalWindow?.('https://nodejs.org')
}

function openSettings() {
  editingNewProvider.value = false
  showSettings.value = true
  loadProviders()
  codexConfigStore.loadSandboxMode()
  codexConfigStore.loadDefaultNetworkAccess()
  codexConfigStore.loadDefaultWebSearch()
  if (!envInitialized.value) {
    checkEnvironment()
  }
}

function showSandboxToast(s) {
  ElMessage.success(t('settings.sandbox.modeChanged', { label: t(s.labelKey) }))
}

defineExpose({ openSettings })

async function loadProviders() {
  try {
    const stored = await window.electronAPI?.codexGetProviders?.()
    if (stored && stored.providers?.length) {
      settingsForm.value.providers = stored.providers
      settingsForm.value.activeIdx = stored.activeIdx >= 0 ? stored.activeIdx : 0
      settingsForm.value.selectedIdx = settingsForm.value.activeIdx
    } else {
      // 默认从 runtime config 读取
      const key = await window.electronAPI?.codexGetKey?.() || ''
      const url = await window.electronAPI?.codexGetBaseURL?.() || ''
      const model = await window.electronAPI?.codexGetModel?.() || ''
      const reasoningEffort = await window.electronAPI?.codexGetReasoningEffort?.() || ''
      const apiFormat = await window.electronAPI?.codexGetApiFormat?.() || 'responses'
      settingsForm.value.providers = [{
        id: crypto.randomUUID(),
        name: 'default',
        key, url, model, reasoningEffort: normalizeCodexReasoningEffort(reasoningEffort),
        apiFormat,
        authJson: key ? { OPENAI_API_KEY: key } : {},
        tomlText: buildManagedProviderToml({ name: 'default', model, url, reasoningEffort, apiFormat, apiKey: key }),
      }]
      settingsForm.value.activeIdx = 0
      settingsForm.value.selectedIdx = 0
    }
  } catch (e) {
    settingsForm.value.providers = []
    settingsForm.value.activeIdx = -1
    settingsForm.value.selectedIdx = -1
  }
}

function selectProvider(i) {
  if (settingsForm.value.selectedIdx === i) return
  settingsForm.value.selectedIdx = i
  editingNewProvider.value = false
}

function providerAvatar(p) {
  return (p?.name || 'D')[0].toUpperCase()
}

function normalizeProviderRecord(provider = {}) {
  const draft = extractProviderDraftFromToml(provider.tomlText || '')
  const key = String(provider.key || draft.apiKey || '').trim()
  return {
    ...provider,
    name: provider.name || draft.name || '',
    key,
    url: provider.url || draft.url || '',
    model: provider.model || draft.model || '',
    reasoningEffort: normalizeCodexReasoningEffort(provider.reasoningEffort || draft.reasoningEffort),
    apiFormat: provider.apiFormat || draft.apiFormat || 'responses',
    alternativeModels: Array.isArray(provider.alternativeModels) ? provider.alternativeModels.map(s => (s || '').trim()) : [],
    authJson: provider.authJson || (key ? { OPENAI_API_KEY: key } : {}),
  }
}

async function repairCodexCliConfig() {
  const idx = settingsForm.value.activeIdx >= 0 ? settingsForm.value.activeIdx : settingsForm.value.selectedIdx
  if (idx < 0 || idx >= settingsForm.value.providers.length) {
    ElMessage.warning(t('settings.codexRepairNoKey'))
    return
  }
  const p = normalizeProviderRecord(settingsForm.value.providers[idx] || {})
  if (!p.key) {
    ElMessage.warning(t('settings.codexRepairNoKey'))
    return
  }

  const ok = await confirmDialogRef.value?.open({
    message: t('settings.codexRepairConfigMsg'),
    okText: t('settings.codexRepairConfig'),
    cancelText: t('common.cancel'),
  })
  if (!ok) return

  try {
    const currentToml = await window.electronAPI?.codexReadConfigToml?.() || ''
    const freshToml = buildManagedProviderToml({
      name: p.name,
      model: p.model,
      url: p.url,
      reasoningEffort: p.reasoningEffort,
      apiFormat: p.apiFormat || 'responses',
      apiKey: p.key,
    })
    const mergedToml = mergeManagedProviderToml(currentToml, freshToml)
    const res = await window.electronAPI?.codexRepairConfigToml?.(mergedToml)
    if (!res?.ok) {
      ElMessage.error(t('settings.codexRepairFailed') + (res?.message || t('system.unknownError')))
      return
    }
    p.tomlText = mergedToml
    settingsForm.value.providers.splice(idx, 1, p)
    await persistProviders()
    ElMessage.success(res.changed ? t('settings.codexRepairDone') : t('settings.codexRepairNoChange'))
  } catch (e) {
    ElMessage.error(t('settings.codexRepairFailed') + (e?.message || e || t('system.unknownError')))
  }
}

async function applyProvider(idx) {
  const provider = settingsForm.value.providers[idx]
  if (!provider) return false
  const p = normalizeProviderRecord(provider)
  try {
    // 仅写入 config.toml（不再写 auth.json — 第三方 provider 认证通过
    // experimental_bearer_token 内嵌于 toml，参照 cc-switch 标准做法）
    // 注意：必须从 provider 字段重新生成 TOML，而非使用存储的 tomlText
    // （存储的 tomlText 可能仍是旧 env_key 格式，直接写入会污染 CLI 配置）
    const freshToml = buildManagedProviderToml({
      name: p.name,
      model: p.model,
      url: p.url,
      reasoningEffort: normalizeCodexReasoningEffort(p.reasoningEffort),
      apiFormat: p.apiFormat || 'responses',
      apiKey: p.key,
    })
    const currentToml = await window.electronAPI?.codexReadConfigToml?.() || ''
    const mergedToml = mergeManagedProviderToml(currentToml, freshToml)
    await window.electronAPI?.codexWriteConfigToml?.(mergedToml)
    // 同步更新内存中的 tomlText，确保后续 persistProviders 存入正确格式
    p.tomlText = mergedToml
    // 更新 runtime config
    await window.electronAPI?.codexSetKey?.(p.key || '')
    await window.electronAPI?.codexSetBaseURL?.(p.url || '')
    await window.electronAPI?.codexSetModel?.(p.model || '')
    await window.electronAPI?.codexSetReasoningEffort?.(normalizeCodexReasoningEffort(p.reasoningEffort))
    await window.electronAPI?.codexSetApiFormat?.(p.apiFormat || 'responses')
    return true
  } catch (e) {
    ElMessage.error(t('settings.saveConfigFailed') + (e?.message || t('system.unknownError')))
    return false
  }
}

async function activateProviderByIdx(i) {
  selectProvider(i)
  settingsForm.value.activeIdx = i
  const ok = await applyProvider(i)
  if (ok) {
    await persistProviders()
    emit('providerActivated')
    ElMessage.success(t('settings.switchedConfig'))
  }
}

async function validateProviderByIdx(i) {
  selectProvider(i)
  const p = settingsForm.value.providers[i]
  if (!p) return
  validatingIdx.value = i
  const start = Date.now()
  try {
    const res = await window.electronAPI?.codexValidateKey?.(p.key || '', p.url || '', p.model || '')
    const elapsed = Date.now() - start
    if (res?.valid) {
      ElMessage.success(t('settings.validOk', { name: p.name || t('settings.unnamed'), elapsed }))
    } else {
      ElMessage.error(res?.error || t('settings.validationFailed'))
    }
  } catch (e) {
    ElMessage.error(t('settings.validFailedSimple', { error: e?.message || t('system.unknownError') }))
  } finally {
    validatingIdx.value = -1
  }
}

async function persistProviders() {
  try {
    await window.electronAPI?.codexSetProviders?.({
      providers: JSON.parse(JSON.stringify(settingsForm.value.providers)),
      activeIdx: settingsForm.value.activeIdx,
    })
  } catch (e) { console.warn('[codexSetProviders]', e) }
}

async function editProviderByIdx(i) {
  selectProvider(i)
  editingNewProvider.value = false
  const p = settingsForm.value.providers[i]
  // 从磁盘读取最新 config.toml，避免覆盖 CLI/SDK 写入的 trust 等条目
  if (p) {
    try {
      const latest = await window.electronAPI?.codexReadConfigToml?.()
      if (latest) p.tomlText = latest
    } catch (_) {}
  }
  currentProvider.value = p ?? null
  showProviderForm.value = true
}

async function addProvider() {
  // 从磁盘读取当前 config.toml 作为初始模板，保留已有配置（trust 等）
  let latestToml = ''
  try { latestToml = await window.electronAPI?.codexReadConfigToml?.() || '' } catch (_) {}
  const p = { name: '', key: '', url: '', model: '', reasoningEffort: '', apiFormat: 'responses', authJson: {}, tomlText: latestToml || buildManagedProviderToml({}) }
  settingsForm.value.providers.push(p)
  settingsForm.value.selectedIdx = settingsForm.value.providers.length - 1
  editingNewProvider.value = true
  currentProvider.value = p
  showProviderForm.value = true
}

async function copyProvider(i) {
  const src = settingsForm.value.providers[i]
  const copy = JSON.parse(JSON.stringify(src))
  copy.name = (copy.name || t('settings.unnamed')) + t('settings.copySuffix')
  settingsForm.value.providers.splice(i + 1, 0, copy)
  await persistProviders()
}

/** 简易 TOML key=value 提取（仅解析 CodeX config.toml 所需字段） */
function extractTomlFields(tomlText) {
  const result = { auth_token: '', base_url: '', model: '', reasoning_effort: '', api_format: '' }
  if (!tomlText) return result
  const draft = extractProviderDraftFromToml(tomlText)
  result.auth_token = draft.apiKey || ''
  result.base_url = draft.url || ''
  result.model = draft.model || ''
  result.reasoning_effort = draft.reasoningEffort || ''
  result.api_format = draft.apiFormat || ''
  let inSection = false
  for (const rawLine of tomlText.split('\n')) {
    const line = rawLine.replace(/\r$/, '').trim()
    if (!line || line.startsWith('#')) continue
    if (/^\[.*\]$/.test(line)) { inSection = true; continue }
    const m = line.match(/^([a-z_]+)\s*=\s*"([^"]*)"\s*$/i)
    if (!m) continue
    const key = m[1].toLowerCase()
    const val = m[2]
    if (!inSection) {
      if (key === 'auth_token' && !result.auth_token) result.auth_token = val
      else if (key === 'model' && !result.model) result.model = val
      else if ((key === 'model_reasoning_effort' || key === 'reasoning_effort') && !result.reasoning_effort) result.reasoning_effort = normalizeCodexReasoningEffort(val)
    }
    if (key === 'base_url' && !result.base_url) result.base_url = val
  }
  return result
}

async function importFromLegacy() {
  try {
    const result = await window.electronAPI?.codexImportLegacyConfig?.()
    if (!result) { ElMessage.error(t('settings.importFailedNoConn')); return }
    if (result.notFound) {
      ElMessage.warning(t('settings.importNoDataDir'))
      return
    }
    if (!result.success) { ElMessage.error(t('settings.importFailedGeneric') + (result.error || t('system.unknownError'))); return }
    const { imported } = result
    const parts = []
    if (imported.key) parts.push('API Key')
    if (imported.url) parts.push('Base URL')
    if (imported.model) parts.push('Model')
    if (imported.reasoningEffort) parts.push('Reasoning Effort')
    await loadProviders()
    if (parts.length) {
      ElMessage.success(t('settings.importedResult', { items: parts.join('、') }))
    } else {
      ElMessage.warning(t('settings.importNoConfigCodex'))
    }
  } catch (e) {
    ElMessage.error(t('settings.importFailedGeneric') + (e?.message || e))
  }
}

async function importFromFile(i) {
  const name = settingsForm.value.providers[i]?.name || t('settings.unnamed')
  const ok = await confirmDialogRef.value?.open({
    message: t('settings.codexImportOverwriteMsg', { name }),
  })
  if (!ok) return
  try {
    const tomlText = await window.electronAPI?.codexReadConfigToml?.()
    if (!tomlText) { ElMessage.warning(t('settings.importNoConfigToml')); return }
    const fields = extractTomlFields(tomlText)
    if (!fields.auth_token && !fields.base_url) { ElMessage.warning(t('settings.importNoAuthToken')); return }
    const p = settingsForm.value.providers[i]
    p.key = fields.auth_token
    p.url = fields.base_url
    p.model = fields.model
    p.reasoningEffort = normalizeCodexReasoningEffort(fields.reasoning_effort)
    p.apiFormat = fields.api_format || 'responses'
    p.authJson = fields.auth_token ? { OPENAI_API_KEY: fields.auth_token } : {}
    p.tomlText = tomlText
    await persistProviders()
    ElMessage.success(t('settings.importOverwritten', { name: p.name || t('settings.unnamed') }))
  } catch (e) {
    ElMessage.error(t('settings.importFailedGeneric') + (e?.message || e))
  }
}

async function removeProvider(i) {
  if (i < 0 || i >= settingsForm.value.providers.length) return
  settingsForm.value.providers.splice(i, 1)
  const last = settingsForm.value.providers.length - 1
  if (!settingsForm.value.providers.length) {
    settingsForm.value.activeIdx = -1
    settingsForm.value.selectedIdx = -1
  } else {
    settingsForm.value.selectedIdx = Math.min(i, last)
    if (settingsForm.value.activeIdx === i) {
      settingsForm.value.activeIdx = Math.min(i, last)
      await applyProvider(settingsForm.value.activeIdx)
    } else if (settingsForm.value.activeIdx > i) {
      settingsForm.value.activeIdx -= 1
    }
  }
  await persistProviders()
}

async function handleProviderFormSave(payload) {
  const p = payload.provider
  const idx = settingsForm.value.selectedIdx
  if (editingNewProvider.value) {
    if (idx >= 0 && idx < settingsForm.value.providers.length) {
      settingsForm.value.providers.splice(idx, 1, p)
    } else {
      settingsForm.value.providers.push(p)
      settingsForm.value.selectedIdx = settingsForm.value.providers.length - 1
    }
    if (settingsForm.value.activeIdx < 0) settingsForm.value.activeIdx = settingsForm.value.selectedIdx
    editingNewProvider.value = false
  } else if (idx >= 0 && idx < settingsForm.value.providers.length) {
    settingsForm.value.providers.splice(idx, 1, p)
  }
  if (settingsForm.value.selectedIdx === settingsForm.value.activeIdx) {
    const ok = await applyProvider(settingsForm.value.activeIdx)
    if (ok) emit('providerActivated')
  }
  await persistProviders()
  showProviderForm.value = false
  currentProvider.value = null
  ElMessage.success(t('settings.saved'))
}

function handleProviderFormClose() {
  if (editingNewProvider.value) {
    const idx = settingsForm.value.selectedIdx
    if (idx >= 0 && idx < settingsForm.value.providers.length) {
      const target = settingsForm.value.providers[idx]
      if (!target?.key && !target?.url && !target?.name) {
        settingsForm.value.providers.splice(idx, 1)
        const last = settingsForm.value.providers.length - 1
        settingsForm.value.selectedIdx = Math.min(idx, last)
        if (settingsForm.value.activeIdx > last) settingsForm.value.activeIdx = last
      }
    }
    editingNewProvider.value = false
  }
  showProviderForm.value = false
  currentProvider.value = null
}

function closeSettings() {
  editingNewProvider.value = false
  currentProvider.value = null
  showProviderForm.value = false
  showSettings.value = false
}


</script>

<style lang="scss" scoped>
.settings-overlay {
  position: fixed; inset: 0; background: var(--cc-overlay-bg);
  z-index: 200; display: flex; align-items: center; justify-content: center;
}
.settings-overlay--embedded {
  position: relative; background: transparent; z-index: auto;
}
.settings-panel {
  width: 650px; background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border);
  border-radius: 12px; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px var(--cc-shadow); overflow: hidden; max-height: 80vh;
}
.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--cc-border);
  font-size: 13px; font-weight: 600; color: var(--cc-text); flex-shrink: 0;
}
.env-status-bar {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 16px; background: var(--cc-bg-tertiary); border-bottom: 1px solid var(--cc-border);
  font-size: 12px; flex-shrink: 0;
}
.env-row-loading .env-item.checking {
  opacity: 0.7; color: var(--cc-text-dim);
  animation: env-pulse 1.2s ease-in-out infinite;
}
.env-row-loading .env-item.checking:nth-child(2) { animation-delay: 0.15s; }
.env-row-loading .env-item.checking:nth-child(3) { animation-delay: 0.3s; }
@keyframes env-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
.env-spinner {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: env-spin 0.7s linear infinite;
  flex-shrink: 0; margin-right: 2px;
}
@keyframes env-spin { to { transform: rotate(360deg); } }
.env-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.env-path-hint { font-size: 11px; color: var(--cc-text-dim); }
.env-item {
  display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px;
  &.ok { color: var(--cc-success); background: var(--cc-success-bg); }
  &.warn { color: var(--cc-warning); background: var(--cc-warning-bg); }
  &.err { color: var(--cc-error); background: var(--cc-error-bg); }
}
.env-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.env-install-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cc-info);
  background: transparent; color: var(--cc-info); font-size: 11px; cursor: pointer;
  &:disabled { opacity: .45; cursor: not-allowed; }
  &:not(:disabled):hover { background: var(--cc-info-bg); }
}
.env-node-link {
  color: var(--cc-info); font-size: 11px; cursor: pointer; text-decoration: underline;
  white-space: nowrap;
}
.env-tip { color: var(--cc-warning); font-size: 10px; }
.env-hint-inline {
  color: var(--cc-warning); font-size: 11px; white-space: nowrap;
}
.env-divider { color: var(--cc-border-strong); }
.env-update-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cc-success-border);
  background: transparent; color: var(--cc-success); font-size: 11px; cursor: pointer;
  &:hover { background: var(--cc-success-bg); }
  &.updating { opacity: .5; cursor: not-allowed; }
}
.env-update-badge {
  padding: 1px 6px; border-radius: 3px; background: var(--cc-warning-bg);
  color: var(--cc-warning); font-size: 10px; font-weight: 600;
}
.env-refresh-btn {
  margin-left: auto; background: none; border: none; color: var(--cc-text-dim);
  font-size: 14px; cursor: pointer; padding: 0 4px;
  &:hover { color: var(--cc-text-muted); }
}
.settings-close {
  width: 24px; height: 24px; border-radius: 50%; background: none;
  border: none; color: var(--cc-text-dim); font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.settings-close:hover { background: var(--cc-bg-hover); color: var(--cc-text); }
.theme-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--cc-border); flex-shrink: 0;
}
.theme-label { font-size: 12px; color: var(--cc-text-dim); font-weight: 500; white-space: nowrap; }
.theme-options { display: flex; gap: 6px; }
.theme-option {
  display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 6px;
  border: 1px solid var(--cc-border-strong); background: var(--cc-bg-elevated);
  color: var(--cc-text-muted); font-size: 12px; cursor: pointer; transition: all 0.15s;
  &:hover {
    border-color: var(--cc-border-hover); color: var(--cc-text-secondary);
    background: var(--cc-bg-hover);
  }
  &.active {
    border-color: var(--cc-primary); color: var(--cc-text);
    background: var(--cc-primary-bg); box-shadow: 0 0 0 1px var(--cc-primary-border);
  }
}
.theme-icon { flex-shrink: 0; opacity: 0.7; }
.theme-option.active .theme-icon { opacity: 1; }
.theme-text { line-height: 1; }
.settings-main {
  display: flex; flex: 1; overflow: hidden; min-height: 0;
}
.sp-left {
  width: 100%; display: flex; flex-direction: column; overflow: hidden;
}
.sp-list-header {
  padding: 12px 12px 6px; font-size: 12px; color: var(--cc-text-dim); font-weight: 600;
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  border-top: 1px solid var(--cc-border-light);
}
.import-legacy-btn {
  margin-left: auto; font-size: 11px; padding: 3px 10px;
  border: 1px solid var(--cc-warning, #e6a23c); border-radius: 4px;
  color: var(--cc-warning, #e6a23c); background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  transition: background .2s, color .2s;
  &:hover { background: var(--cc-warning, #e6a23c); color: #fff; }
  &.repair { margin-left: 0; border-color: var(--cc-primary); color: var(--cc-primary); }
  &.repair:hover { background: var(--cc-primary); color: #fff; }
}
.sp-list {
  flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 3px;
}
.sp-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;
  border-radius: 6px; cursor: pointer; border: 1px solid transparent;
  transition: background 0.12s;
}
.sp-item:hover { background: var(--cc-bg-elevated); }
.sp-item.active { background: var(--cc-bg-elevated); border-color: var(--cc-primary); }
.sp-item-avatar {
  width: 26px; height: 26px; border-radius: 6px; background: var(--cc-bg-hover);
  color: var(--cc-text-muted); font-size: 12px; font-weight: 600; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.sp-item.inuse .sp-item-avatar { background: var(--cc-primary-bg); color: var(--cc-primary); }
.sp-item-info { flex: 1; min-width: 0; }
.sp-item-name { font-size: 12px; color: var(--cc-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-item-url { font-size: 10px; color: var(--cc-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.sp-inuse-badge {
  font-size: 10px; color: var(--cc-primary); flex-shrink: 0; height: 20px; padding: 0 6px;
  border-radius: 3px; background: var(--cc-primary-bg); border: 1px solid var(--cc-primary-border);
  display: flex; align-items: center;
}
.sp-item-actions { display: flex; gap: 2px; flex-shrink: 0; }
.sp-item-btn {
  height: 20px; border-radius: 3px; border: none; background: transparent;
  color: var(--cc-text-dim); cursor: pointer; display: flex; align-items: center; gap: 2px;
  padding: 0 4px; font-size: 10px;
}
.sp-item-btn:hover:not(:disabled) { background: var(--cc-bg-hover); color: var(--cc-text-secondary); }
.sp-item-btn.edit:hover:not(:disabled) { color: var(--cc-primary); }
.sp-item-btn.use:hover:not(:disabled) { color: var(--cc-info); }
.sp-item-btn.del:hover:not(:disabled) { color: var(--cc-error); }
.sp-item-btn.validate:hover:not(:disabled) { color: var(--cc-success); }
.sp-item-btn.validate:disabled { opacity: .5; cursor: not-allowed; }
.sp-validating-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.sp-add-btn {
  margin: 6px; padding: 6px; border-radius: 6px; background: none;
  border: 1px dashed var(--cc-border); color: var(--cc-text-dim); cursor: pointer; font-size: 11px;
  transition: border-color 0.12s, color 0.12s;
}
.sp-add-btn:hover { border-color: var(--cc-primary); color: var(--cc-primary); }
.permission-option.active {
  border-color: var(--cc-primary); background: var(--cc-primary-bg);
  box-shadow: 0 0 0 1px var(--cc-primary-border);
}

/* 默认网络/搜索行 */
.mini-toggle {
  width: 32px; height: 18px; border-radius: 9px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-tertiary);
  cursor: pointer; padding: 0; position: relative;
  transition: background 0.15s, border-color 0.15s; flex-shrink: 0;
}
.mini-toggle.active {
  background: var(--cc-primary); border-color: var(--cc-primary);
}
.mini-toggle-knob {
  position: absolute; top: 1px; left: 1px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; transition: transform 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.mini-toggle.active .mini-toggle-knob { transform: translateX(14px); }
.toggle-hint {
  font-size: 11px; color: var(--cc-text-dim); line-height: 1;
}
.mode-select {
  height: 24px; min-width: 80px; border-radius: 5px;
  border: 1px solid var(--cc-border-strong); background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary); font-size: 11px;
  padding: 0 18px 0 6px; outline: none; cursor: pointer;
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--cc-text-dim) 50%), linear-gradient(135deg, var(--cc-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 8px) calc(50% - 1px), calc(100% - 4px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; flex-shrink: 0;
}
.mode-select:hover { border-color: var(--cc-border-hover); }
.mode-select:focus { border-color: var(--cc-border-focus); }

/* 自动压缩窗口 */
.compact-window-input {
  width: 120px; padding: 4px 8px; background: var(--cc-input-bg); color: var(--cc-text-primary);
  border: 1px solid var(--cc-border-light); border-radius: 4px; font-size: 12px; margin-right: 6px;
}
.compact-window-input:focus { border-color: var(--cc-primary); }
.compact-window-input::placeholder { color: var(--cc-text-dim); font-size: 11px; }
.compact-save-btn {
  padding: 4px 10px; background: var(--cc-primary); color: #fff; border: none;
  border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;
}
.compact-save-btn:hover { background: var(--cc-primary-hover); }
.compact-reset-btn {
  padding: 4px 10px; background: transparent; color: var(--cc-text-dim);
  border: 1px solid var(--cc-border-light); border-radius: 4px; cursor: pointer; font-size: 11px;
}
.compact-reset-btn:hover { border-color: var(--cc-border-focus); color: var(--cc-text); }

/* Import Dialog */
</style>
