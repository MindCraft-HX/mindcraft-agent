<template>
  <div>
    <ProviderForm
      :visible="showProviderForm"
      :provider="currentProvider"
      :is-new="editingNewProvider"
      :selected-tier="settingsSelectedTierKey"
      :tier-models="settingsTierModels"
      :permission-policy="settingsPermissionPolicy"
      :language="settingsLanguage"
      :effort-level="settingsEffortLevel"
      :config-json="formInitialConfigJson"
      @save="handleProviderFormSave"
      @close="handleProviderFormClose"
    />
    <ConfirmDialog ref="confirmDialogRef" />
    <div v-if="embedded || showSettings" class="settings-overlay" :class="{ 'settings-overlay--embedded': embedded }">
      <div class="settings-panel">
        <div v-if="!embedded" class="settings-header">
          <span>{{ $t('nav.settings') }}</span>
          <button class="settings-close" @click="closeSettings">×</button>
        </div>

        <!-- WebFetch 预检 -->
        <div class="theme-row">
          <span class="theme-label">{{ $t('settings.webFetch') }}</span>
          <div class="theme-options">
            <button type="button" class="mini-toggle"
              :class="{ active: settingsSkipWebFetchPreflight }"
              @click="toggleSkipWebFetchPreflight()"
              :title="settingsSkipWebFetchPreflight ? $t('settings.skipVerifyHint') : $t('settings.execVerifyHint')">
              <span class="mini-toggle-knob"></span>
            </button>
            <span class="toggle-hint">{{ settingsSkipWebFetchPreflight ? $t('settings.skipVerify') : $t('settings.execVerify') }}</span>
          </div>
        </div>

        <!-- 自动压缩窗口（仅 Claude Code，全局设置） -->
        <div class="theme-row">
          <span class="theme-label">{{ $t('settings.autoCompact') }}</span>
          <div class="theme-options">
            <input type="number"
              class="compact-window-input"
              v-model="compactWindowLocal"
              :placeholder="$t('settings.defaultSdk')"
              :min="compactWindowMin" :max="compactWindowMax" step="1000"
              :title="$t('settings.compactThresholdHint')" />
            <button type="button" class="compact-save-btn"
              @click="saveCompactWindow" :title="$t('settings.saveThreshold')">{{ $t('common.save') }}</button>
            <button type="button" class="compact-reset-btn"
              @click="resetCompactWindow" :title="$t('settings.restoreDefault')">{{ $t('settings.reset') }}</button>
          </div>
        </div>

        <!-- 环境状态栏 -->
        <div class="env-status-bar">
          <template v-if="envChecking">
            <div class="env-row env-row-loading">
              <span class="env-item checking"><span class="env-spinner"></span>{{ $t('settings.nodeCheck') }}</span>
              <span class="env-item checking"><span class="env-spinner"></span>{{ $t('settings.claudeCheck') }}</span>
            </div>
          </template>
          <template v-else-if="envStatus">
            <div class="env-row">
              <span class="env-item" :class="envStatus.node?.compatible ? 'ok' : 'warn'">
                <span class="env-dot"></span>
                Node {{ envStatus.node?.installed ? envStatus.node.version : $t('settings.notInstalled') }}
                <span v-if="envStatus.node?.installed && !envStatus.node?.compatible" class="env-tip">{{ $t('settings.needNode') }}</span>
              </span>
              <span v-if="!envStatus.node?.installed || !envStatus.node?.compatible" class="env-divider">|</span>
              <a v-if="!envStatus.node?.installed || !envStatus.node?.compatible"
                class="env-node-link" @click="openNodeJsDownload">{{ $t('settings.downloadNode') }}</a>
              <span class="env-item" :class="envStatus.claude?.installed ? 'ok' : 'err'">
                <span class="env-dot"></span>
                Claude Code {{ envStatus.claude?.installed ? (envStatus.claude.version ? `v${envStatus.claude.version.split(/\s/)[0].replace(/^v/, '')}` : $t('settings.installed')) : $t('settings.notInstalled') }}
              </span>
              <button v-if="envStatus.claude?.installed"
                class="env-update-btn" :class="{ updating: envCheckingUpdate }"
                :disabled="envInstalling || envCheckingUpdate"
                @click="checkForUpdate"
                :title="$t('settings.checkUpdate')">{{ envInstalling ? $t('settings.installing') : envCheckingUpdate ? $t('settings.checking') : envUpdateAvailable ? `${$t('settings.updateTo')} v${envLatestVersion}` : $t('settings.checkUpdate') }}</button>
              <span v-if="envUpdateAvailable" class="env-update-badge">{{ $t('settings.newVersion') }}</span>
              <button v-if="!envStatus.claude?.installed"
                class="env-install-btn"
                :disabled="envInstalling || !envStatus.npm?.installed || !envStatus.node?.compatible"
                @click="installClaudeCode"
                :title="!envStatus.node?.compatible ? $t('settings.needNodeHint') : !envStatus.npm?.installed ? $t('settings.needNpmHint') : ''"
              >{{ envInstalling ? $t('settings.installing') : $t('settings.oneClickInstall') }}</button>
              <button v-if="envStatus.claude?.installed && !envStatus.claude?.path"
                class="env-config-btn" @click="showExePath = !showExePath"
                :title="$t('settings.configClaudePath')">{{ $t('settings.configPath') }}</button>
              <button class="env-refresh-btn" @click="checkEnvironment" :title="$t('settings.redetect')">↻</button>
            </div>

            <div v-if="!envStatus.claude?.installed" class="env-path-row">
              <input class="env-path-input" v-model="customExePath"
                :placeholder="$t('settings.manualPath')"
                @keyup.enter="saveExecutablePath" />
              <button class="env-path-btn" @click="browseExecutable" :title="$t('settings.browse')">{{ $t('settings.browse') }}</button>
              <button class="env-path-btn save" @click="saveExecutablePath" :title="$t('common.save')">{{ $t('common.save') }}</button>
            </div>
          </template>
          <template v-else>
            <span class="env-item err">{{ $t('settings.detectFailed') }}</span>
            <button class="env-refresh-btn" @click="checkEnvironment" :title="$t('settings.redetect')">↻</button>
          </template>
        </div>

        <div class="exe-path-bar" v-if="showExePath">
          <span class="exe-path-label">{{ $t('settings.claudePath') }}</span>
          <input class="exe-path-input" v-model="customExePath"
            :placeholder="envStatus?.claude?.path || $t('settings.manualPath')"
            :title="envStatus?.claude?.path || ''"
            @keyup.enter="saveExecutablePath" />
          <button class="exe-path-btn" @click="browseExecutable" :title="$t('settings.browse')">{{ $t('settings.browse') }}</button>
          <button class="exe-path-btn save" @click="saveExecutablePath" :title="$t('common.save')">{{ $t('common.save') }}</button>
        </div>

        <div class="settings-main">
          <div class="sp-left">
            <div class="sp-list-header">{{ $t('settings.configList') }}<button class="import-legacy-btn" @click="importFromLegacy" :title="$t('settings.importFromMindCraftHint')">
                  <svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1 L6 9 M3 6 L6 9 L9 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9 L1 11 L11 11 L11 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>{{ $t('settings.importFromMindCraft') }}</button>
              </div>
            <div class="sp-list">
              <div v-for="(p, i) in settingsForm.providers" :key="i"
                class="sp-item" :class="{ active: settingsForm.selectedIdx === i, inuse: settingsForm.activeIdx === i }"
                @click="selectProvider(i)">
                <div class="sp-item-avatar">{{ providerAvatar(p) }}</div>
                <div class="sp-item-info">
                  <div class="sp-item-name">{{ p.name || providerDefaultName(p) }}</div>
                  <div class="sp-item-url">{{ p.url || $t('settings.defaultAddress') }}</div>
                </div>
                <div class="sp-item-actions">
                  <span v-if="settingsForm.activeIdx === i" class="sp-inuse-badge" :title="$t('settings.currentInUse')">{{ $t('settings.inUse') }}</span>
                  <button v-else class="sp-item-btn use" @click.stop="activateProviderByIdx(i)" :title="$t('settings.useThisConfig')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><polygon points="3,2 10,6 3,10" fill="currentColor"/></svg>{{ $t('settings.enable') }}</button>
                  <button class="sp-item-btn edit" @click.stop="editProviderByIdx(i)" :title="$t('settings.edit')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 10 L2 8 L8 2 L10 4 L4 10 Z" stroke="currentColor" stroke-width="1" fill="none"/></svg>{{ $t('settings.edit') }}</button>
                  <button class="sp-item-btn copy" @click.stop="copyProvider(i)" :title="$t('settings.copy')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><rect x="4" y="4" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none" rx="1"/><path d="M2 8 L2 2 L8 2" stroke="currentColor" stroke-width="1" fill="none"/></svg>{{ $t('settings.copy') }}</button>
                  <button class="sp-item-btn import" @click.stop="importFromFile(i)" :title="$t('settings.overwriteWithFile')">
                    <svg width="10" height="10" viewBox="0 0 12 12"><path d="M6 1 L6 9 M3 6 L6 9 L9 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9 L1 11 L11 11 L11 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>{{ $t('settings.import') }}</button>
                  <button class="sp-item-btn validate" @click.stop="validateProviderByIdx(i)" :disabled="validatingIdx === i" :title="$t('settings.validateKey')">
                    <svg v-if="validatingIdx !== i" width="10" height="10" viewBox="0 0 12 12"><path d="M2 6 L5 9 L10 3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
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
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import ProviderForm from './ProviderForm.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const { t } = useI18n()

const confirmDialogRef = ref(null)

defineProps({ embedded: { type: Boolean, default: false } })
const emit = defineEmits(['providerActivated'])

// 模型上下文窗口映射（与 electron/mainModules/claudeMetrics.js 保持同步）
const MODEL_CONTEXT_MAP = [
  ['opus-4-6', 200000], ['opus-4', 200000], ['opus', 200000],
  ['sonnet-4-6', 200000], ['sonnet-4', 200000], ['sonnet-3-5', 200000], ['sonnet-3', 200000], ['sonnet', 200000],
  ['haiku-4-5', 200000], ['haiku-4', 200000], ['haiku-3', 200000], ['haiku', 200000],
]
function getModelContextWindow(model) {
  if (!model) return 200000
  const lower = model.toLowerCase()
  for (const [key, size] of MODEL_CONTEXT_MAP) {
    if (lower.includes(key)) return size
  }
  return 200000
}
const compactWindowMin = 10000
const compactWindowMax = computed(() => getModelContextWindow(currentGlobalModel.value))

const showSettings = ref(false)
const showExePath = ref(false)
const showProviderForm = ref(false)
const editingNewProvider = ref(false)
const validatingIdx = ref(-1)

const envStatus = ref(null)
const envChecking = ref(false)
const envInstalling = ref(false)
const customExePath = ref('')
const envCheckingUpdate = ref(false)
const envUpdateAvailable = ref(false)
const envLatestVersion = ref('')

const settingsForm = ref({ providers: [], selectedIdx: -1, activeIdx: -1 })
const currentProvider = ref(null)
const settingsTierModels = ref({ haiku: '', sonnet: '', opus: '', reasoning: '' })
const settingsSelectedTierKey = ref('sonnet')
const settingsPermissionPolicy = ref('ask')
const settingsSkipWebFetchPreflight = ref(true)
const settingsAutoCompactWindow = ref(null)
const compactWindowLocal = ref(null)
const settingsLanguage = ref('zh-CN')
const settingsEffortLevel = ref('medium')
const currentGlobalModel = ref('')
const fullSettingsJson = ref(null)
const formInitialConfigJson = ref(null)

const tierItems = [
  { key: 'haiku', label: 'Haiku', defaultModel: '' },
  { key: 'sonnet', label: 'Sonnet', defaultModel: '' },
  { key: 'opus', label: 'Opus', defaultModel: '' },
  { key: 'reasoning', label: 'Reasoning', defaultModel: '' },
]

function ensureProviderConfig(provider) {
  if (!provider || typeof provider !== 'object') return
  if (provider.config && typeof provider.config === 'object') return
  const tiers = provider.tierModels || {}
  const env = {}
  if ((provider.key || '').trim()) env.ANTHROPIC_AUTH_TOKEN = provider.key.trim()
  if ((provider.url || '').trim()) env.ANTHROPIC_BASE_URL = provider.url.trim()
  if ((tiers.haiku || '').trim()) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = tiers.haiku.trim()
  if ((tiers.sonnet || '').trim()) env.ANTHROPIC_DEFAULT_SONNET_MODEL = tiers.sonnet.trim()
  if ((tiers.opus || '').trim()) env.ANTHROPIC_DEFAULT_OPUS_MODEL = tiers.opus.trim()
  if ((tiers.reasoning || '').trim()) env.ANTHROPIC_REASONING_MODEL = tiers.reasoning.trim()
  const obj = {}
  if (Object.keys(env).length) obj.env = env
  provider.config = obj
}

async function checkEnvironment() {
  envChecking.value = true
  try {
    const res = await window.electronAPI?.claudeCheckEnvironment?.()
    envStatus.value = res || null
    customExePath.value = envStatus.value?.claude?.customPath || ''
  } catch (e) {
    console.error('[APISetting] checkEnvironment failed:', e?.message || e, e)
    envStatus.value = {
      node: { installed: false, version: null, compatible: false },
      npm: { installed: false, version: null },
      claude: { installed: false, path: null, customPath: '' }
    }
  } finally {
    envChecking.value = false
  }
}

async function browseExecutable() {
  const p = await window.electronAPI?.claudeBrowseExecutable?.()
  if (p) {
    customExePath.value = p
    await window.electronAPI?.claudeSetExecutablePath?.(p)
    await checkEnvironment()
  }
}

async function saveExecutablePath() {
  await window.electronAPI?.claudeSetExecutablePath?.(customExePath.value)
  await checkEnvironment()
}

async function installClaudeCode() {
  envInstalling.value = true
  try {
    const result = await window.electronAPI?.claudeInstallClaudeCode?.()
    if (result?.success) {
      ElMessage.success(t('system.installSuccess'))
      await checkEnvironment()
    } else {
      ElMessage.error(result?.message || t('settings.installFailedManual'))
    }
  } catch (e) {
    ElMessage.error(t('settings.installFailed') + (e?.message || e))
  } finally {
    envInstalling.value = false
  }
}

function openNodeJsDownload() {
  window.electronAPI?.openExternalWindow?.('https://nodejs.org')
}

async function checkForUpdate() {
  envCheckingUpdate.value = true
  try {
    const env = await window.electronAPI?.claudeCheckEnvironment?.()
    if (!env?.claude?.installed || !env?.claude?.version) {
      ElMessage.warning(t('system.installClaudeFirst'))
      return
    }
    const res = await window.electronAPI?.claudeCheckLatestVersion?.()
    if (!res?.ok || !res.version) {
      ElMessage.error(t('system.versionCheckFail') + ': ' + (res?.error || ''))
      return
    }
    const localVer = env.claude.version.replace(/^v/, '').split(/\s/)[0].trim()
    const latestVer = res.version
    if (localVer === latestVer) {
      ElMessage.success(t('system.alreadyLatest', { version: latestVer }))
      envUpdateAvailable.value = false
    } else {
      envUpdateAvailable.value = true
      envLatestVersion.value = latestVer
      const ok = await confirmDialogRef.value?.open({
        message: t('settings.newVersionMsg', { latest: latestVer, local: localVer }),
        okText: t('settings.updateNow'),
        cancelText: t('settings.later'),
      })
      if (ok) {
        envInstalling.value = true
        try {
          const result = await window.electronAPI?.claudeInstallClaudeCode?.()
          if (result?.success) {
            ElMessage.success(t('settings.updateSuccessRedetect'))
            await checkEnvironment()
            envUpdateAvailable.value = false
            envLatestVersion.value = ''
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

async function writeSettingsJson(configObj) {
  if (!configObj) return
  try {
    const plain = JSON.parse(JSON.stringify(configObj))
    const result = await window.electronAPI?.claudeWriteSettingsJson?.(plain)
    if (!result?.ok) ElMessage.warning(t('system.writeSettingsFail') + ':' + (result?.message || ''))
  } catch (e) {
    ElMessage.error(t('system.writeSettingsFail') + ':' + (e?.message || ''))
  }
}

async function openSettings() {
  editingNewProvider.value = false
  checkEnvironment()

  let key = ''
  let url = ''
  let tierModels = {}
  let currentModel = ''

  try { key = await window.electronAPI?.claudeGetKey?.() || '' } catch (e) {}
  try { url = await window.electronAPI?.claudeGetBaseURL?.() || '' } catch (e) {}
  try { tierModels = await window.electronAPI?.claudeGetTierModels?.() || {} } catch (e) {}
  try { currentModel = await window.electronAPI?.claudeGetModel?.() || '' } catch (e) {}

  try {
    const policy = await window.electronAPI?.claudeGetPermissionPolicy?.()
    settingsPermissionPolicy.value = ['ask', 'allow_all', 'read_only'].includes(policy) ? policy : 'ask'
  } catch (e) { settingsPermissionPolicy.value = 'ask' }

  try {
    const language = await window.electronAPI?.claudeGetLanguage?.()
    settingsLanguage.value = ['zh-CN', 'en-US'].includes(language) ? language : 'zh-CN'
  } catch (e) { settingsLanguage.value = 'zh-CN' }

  try {
    const effort = await window.electronAPI?.claudeGetEffortLevel?.()
    settingsEffortLevel.value = ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'medium'
  } catch (e) { settingsEffortLevel.value = 'medium' }

  try {
    settingsSkipWebFetchPreflight.value = await window.electronAPI?.claudeGetSkipWebFetchPreflight?.() ?? true
  } catch (e) { settingsSkipWebFetchPreflight.value = true }

  try {
    settingsAutoCompactWindow.value = await window.electronAPI?.claudeGetAutoCompactWindow?.() ?? null
    compactWindowLocal.value = settingsAutoCompactWindow.value
  } catch (e) { settingsAutoCompactWindow.value = null; compactWindowLocal.value = null }

  currentGlobalModel.value = currentModel.trim()
  settingsTierModels.value = {
    haiku: (tierModels.haiku || '').trim(),
    sonnet: (tierModels.sonnet || '').trim(),
    opus: (tierModels.opus || '').trim(),
    reasoning: (tierModels.reasoning || '').trim(),
  }

  let storedTier = ''
  try { storedTier = await window.electronAPI?.claudeGetSelectedTier?.() || '' } catch (e) {}
  let inferred = ['haiku', 'sonnet', 'opus', 'reasoning'].includes(storedTier) ? storedTier : ''
  if (!inferred) {
    inferred = 'sonnet'
    const model = currentModel.trim()
    if (model) {
      for (const item of tierItems) {
        const tierModel = (settingsTierModels.value[item.key] || item.defaultModel).trim()
        if (tierModel === model) {
          inferred = item.key
          break
        }
      }
    }
  }
  settingsSelectedTierKey.value = inferred

  let stored = null
  try { stored = await window.electronAPI?.claudeGetProviders?.() ?? null } catch (e) {}
  if (stored && stored.providers?.length) {
    settingsForm.value.providers = stored.providers.map(p => ({
      ...p,
      config: (p && typeof p === 'object' && p.config && typeof p.config === 'object') ? p.config : null,
      tierModels: p.tierModels || { haiku: '', sonnet: '', opus: '', reasoning: '' }
    }))
    for (const p of settingsForm.value.providers) ensureProviderConfig(p)
    const active = Number.isInteger(stored.activeIdx) ? stored.activeIdx : 0
    settingsForm.value.activeIdx = active >= 0 && active < stored.providers.length ? active : 0
    settingsForm.value.selectedIdx = settingsForm.value.activeIdx
    const activeP = settingsForm.value.providers[settingsForm.value.activeIdx]
    if (activeP?.tierModels) {
      settingsTierModels.value = {
        haiku: (activeP.tierModels.haiku || '').trim(),
        sonnet: (activeP.tierModels.sonnet || '').trim(),
        opus: (activeP.tierModels.opus || '').trim(),
        reasoning: (activeP.tierModels.reasoning || '').trim(),
      }
    }
  } else {
    settingsForm.value.providers = []
    settingsForm.value.activeIdx = -1
    settingsForm.value.selectedIdx = -1

    try {
      const sj = await window.electronAPI?.claudeReadSettingsJson?.()
      if (sj) {
        let sKey = sj.env?.ANTHROPIC_AUTH_TOKEN || ''
        let sUrl = sj.env?.ANTHROPIC_BASE_URL || ''
        let sHaiku = sj.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || ''
        let sSonnet = sj.env?.ANTHROPIC_DEFAULT_SONNET_MODEL || ''
        let sOpus = sj.env?.ANTHROPIC_DEFAULT_OPUS_MODEL || ''
        let sReasoning = sj.env?.ANTHROPIC_REASONING_MODEL || ''

        if (!sKey && sj.primaryApiKey) sKey = sj.primaryApiKey
        if (!sKey && sj.apiKey) sKey = sj.apiKey
        if (!sUrl && sj.baseURL) sUrl = sj.baseURL
        if (!sUrl && sj.apiBaseUrl) sUrl = sj.apiBaseUrl

        let sModel = sj.model || sj.defaultModel || ''
        if (sModel && !sSonnet && sModel.includes('sonnet')) sSonnet = sModel
        if (sModel && !sOpus && sModel.includes('opus')) sOpus = sModel
        if (sModel && !sHaiku && sModel.includes('haiku')) sHaiku = sModel

          if (sKey || sUrl) {
            settingsForm.value.providers = [{
              name: t('settings.defaultProvider'),
              key: sKey,
              url: sUrl,
              config: sj,
              tierModels: {
                haiku: sHaiku,
                sonnet: sSonnet,
                opus: sOpus,
                reasoning: sReasoning,
              },
            }]
            for (const p of settingsForm.value.providers) ensureProviderConfig(p)
            settingsForm.value.activeIdx = 0
            settingsForm.value.selectedIdx = 0
            settingsTierModels.value = { haiku: sHaiku, sonnet: sSonnet, opus: sOpus, reasoning: sReasoning }
          }
      }
    } catch (e) {
      console.warn('[APISetting] read settings.json failed:', e?.message || e)
    }
  }

  try {
    fullSettingsJson.value = await window.electronAPI?.claudeReadSettingsJson?.() || null
  } catch (e) {
    fullSettingsJson.value = null
  }

  showSettings.value = true
}

defineExpose({ openSettings })

async function persistProviders() {
  try {
    await window.electronAPI?.claudeSetProviders?.({
      providers: JSON.parse(JSON.stringify(settingsForm.value.providers)),
      activeIdx: settingsForm.value.activeIdx,
    })
  } catch (e) {
    console.warn('[APISetting] claudeSetProviders failed:', e?.message || e)
  }
}

async function applyAndActivate(activeIdx, opts = {}) {
  const writeSettings = opts.writeSettings !== false
  const activeP = settingsForm.value.providers[activeIdx]
  const tierModels = {
    haiku: activeP?.tierModels?.haiku?.trim() || '',
    sonnet: activeP?.tierModels?.sonnet?.trim() || '',
    opus: activeP?.tierModels?.opus?.trim() || '',
    reasoning: activeP?.tierModels?.reasoning?.trim() || '',
  }
  const targetModel = tierModels[settingsSelectedTierKey.value]?.trim()
    || tierItems.find(t => t.key === settingsSelectedTierKey.value)?.defaultModel
    || ''
  try {
    const res = await window.electronAPI?.claudeActivateProvider?.({
      providers: JSON.parse(JSON.stringify(settingsForm.value.providers)),
      activeIdx,
      selectedTier: settingsSelectedTierKey.value,
      tierModels,
      model: targetModel,
    })
    currentGlobalModel.value = res?.model || targetModel
    await window.electronAPI?.claudeSetPermissionPolicy?.(settingsPermissionPolicy.value)
    await window.electronAPI?.claudeSetLanguage?.(settingsLanguage.value)
    await window.electronAPI?.claudeSetEffortLevel?.(settingsEffortLevel.value)
    if (writeSettings && activeP?.config) {
      // 合并写入：只替换 API 相关字段（env / primaryApiKey / model），
      // 保留 settings.json 中其余内容（plugins / MCP servers / 自定义字段等）
      const patch = { model: settingsSelectedTierKey.value }
      if (activeP.config.env) patch.env = JSON.parse(JSON.stringify(activeP.config.env))
      if (activeP.config.primaryApiKey) patch.primaryApiKey = activeP.config.primaryApiKey
      await window.electronAPI?.claudePatchSettingsJson?.(patch)
      fullSettingsJson.value = { ...fullSettingsJson.value, ...patch }
    }
    return true
  } catch (e) {
    console.warn('[APISetting] applyAndActivate failed:', e?.message || e)
    ElMessage.error(t('settings.saveFailed') + (e?.message || t('system.unknownError')))
    return false
  }
}

async function handleProviderFormSave(payload) {
  const p = payload.provider
  const idx = settingsForm.value.selectedIdx
  const wasNew = editingNewProvider.value

  if (wasNew) {
    if (idx >= 0 && idx < settingsForm.value.providers.length) {
      settingsForm.value.providers.splice(idx, 1, p)
    } else {
      settingsForm.value.providers.push(p)
      settingsForm.value.selectedIdx = settingsForm.value.providers.length - 1
    }
    if (settingsForm.value.activeIdx < 0) {
      settingsForm.value.activeIdx = settingsForm.value.selectedIdx
    }
    editingNewProvider.value = false
  } else if (idx >= 0 && idx < settingsForm.value.providers.length) {
    settingsForm.value.providers.splice(idx, 1, p)
  }

  const isEditingActive = settingsForm.value.selectedIdx === settingsForm.value.activeIdx

  if (isEditingActive) {
    settingsSelectedTierKey.value = payload.selectedTier
    settingsTierModels.value = { ...payload.tierModels }
    settingsPermissionPolicy.value = payload.permissionPolicy
    settingsLanguage.value = payload.language
    settingsEffortLevel.value = payload.effortLevel
    const ok = await applyAndActivate(settingsForm.value.activeIdx, { writeSettings: true })
    if (!ok) return
    emit('providerActivated')
  } else {
    await persistProviders()
  }

  showProviderForm.value = false
  currentProvider.value = null
  formInitialConfigJson.value = null
  ElMessage.success(t('settings.saved'))
}

function handleProviderFormClose() {
  if (editingNewProvider.value) {
    const idx = settingsForm.value.selectedIdx
    if (idx >= 0 && idx < settingsForm.value.providers.length) {
      const target = settingsForm.value.providers[idx]
      const empty = !target?.key && !target?.url && !target?.name
      if (empty) {
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
  formInitialConfigJson.value = null
}

async function toggleSkipWebFetchPreflight() {
  settingsSkipWebFetchPreflight.value = !settingsSkipWebFetchPreflight.value
  try {
    await window.electronAPI?.claudeSetSkipWebFetchPreflight?.(settingsSkipWebFetchPreflight.value)
    ElMessage.success(settingsSkipWebFetchPreflight.value ? t('system.skipWebFetch') : t('settings.webFetchDisabled'))
  } catch (e) {
    ElMessage.error(t('common.saveFailed'))
    settingsSkipWebFetchPreflight.value = !settingsSkipWebFetchPreflight.value
  }
}

async function saveCompactWindow() {
  const raw = compactWindowLocal.value
  if (raw === '' || raw === null || raw === undefined) {
    await resetCompactWindow()
    return
  }
  const num = parseInt(raw, 10)
  const max = compactWindowMax.value
  if (!Number.isFinite(num) || num <= 0) {
    ElMessage.warning(t('settings.invalidThresholdRange', { min: compactWindowMin, max }))
    return
  }
  const clamped = Math.min(max, Math.max(compactWindowMin, num))
  compactWindowLocal.value = clamped
  settingsAutoCompactWindow.value = clamped
  try {
    const res = await window.electronAPI?.claudeSetAutoCompactWindow?.(clamped)
    if (res?.ok) {
      ElMessage.success(t('settings.compactThresholdSet', { n: clamped }))
    } else {
      ElMessage.error(t('settings.saveFailed') + (res?.message || t('system.unknownError')))
    }
  } catch (e) {
    ElMessage.error(t('settings.saveFailed') + (e?.message || e))
  }
}

async function resetCompactWindow() {
  compactWindowLocal.value = null
  settingsAutoCompactWindow.value = null
  try {
    const res = await window.electronAPI?.claudeSetAutoCompactWindow?.(null)
    if (res?.ok) {
      ElMessage.success(t('system.restoredSdk'))
    } else {
      ElMessage.error(t('settings.resetFailed') + (res?.message || t('system.unknownError')))
    }
  } catch (e) {
    ElMessage.error(t('settings.resetFailed') + (e?.message || e))
  }
}

async function closeSettings() {
  editingNewProvider.value = false
  currentProvider.value = null
  showProviderForm.value = false
  showSettings.value = false
}

async function validateProviderByIdx(i) {
  selectProvider(i)
  const p = settingsForm.value.providers[i] ?? null
  if (!p) return
  validatingIdx.value = i
  const start = Date.now()
  try {
    const selectedTier = settingsSelectedTierKey.value || 'sonnet'
    const model = (p.tierModels?.[selectedTier] || '').trim()
      || tierItems.find(t => t.key === selectedTier)?.defaultModel
      || ''
    const res = await window.electronAPI.claudeValidateKey(p.key, p.url, model)
    const elapsed = Date.now() - start
    if (res.valid) {
      ElMessage.success(t('settings.validOk', { name: p.name || t('settings.unnamed'), elapsed }))
    } else {
      ElMessage.error(res.error || t('settings.apiKeyInvalidShort'))
    }
  } catch (e) {
    const elapsed = Date.now() - start
    ElMessage.error(t('settings.validFailed', { name: p.name || t('settings.unnamed'), elapsed, error: e.message }))
  } finally {
    validatingIdx.value = -1
  }
}

function selectProvider(i) {
  if (settingsForm.value.selectedIdx === i) return
  settingsForm.value.selectedIdx = i
  editingNewProvider.value = false
}

function providerAvatar(p) {
  if (p?.name) return p.name[0].toUpperCase()
  const url = p?.url || ''
  if (url) return url[0].toUpperCase()
  return 'A'
}

function providerDefaultName(p) {
  if (!p?.name && !p?.url) return t('settings.defaultProvider')
  if (!p?.name && p?.url) {
    try {
      const host = new URL(p.url).hostname.replace(/^api\./, '')
      return host.replace(/\.[a-z]+$/, '')
    } catch {
      return 'Provider'
    }
  }
  return p.name
}

function editProviderByIdx(i) {
  selectProvider(i)
  editingNewProvider.value = false
  currentProvider.value = settingsForm.value.providers[i] ?? null
  formInitialConfigJson.value = currentProvider.value?.config || fullSettingsJson.value || null
  showProviderForm.value = true
}

async function activateProviderByIdx(i) {
  selectProvider(i)
  settingsForm.value.activeIdx = i
  const activeP = settingsForm.value.providers[i]
  if (activeP?.tierModels) {
    settingsTierModels.value = {
      haiku: (activeP.tierModels.haiku || '').trim(),
      sonnet: (activeP.tierModels.sonnet || '').trim(),
      opus: (activeP.tierModels.opus || '').trim(),
      reasoning: (activeP.tierModels.reasoning || '').trim(),
    }
  }
  if (activeP?.config?.model && ['haiku', 'sonnet', 'opus', 'reasoning'].includes(activeP.config.model)) {
    settingsSelectedTierKey.value = activeP.config.model
  }
  const ok = await applyAndActivate(i, { writeSettings: true })
  if (ok) emit('providerActivated')
}

function addProvider() {
  const p = { name: '', note: '', website: '', key: '', url: '', tierModels: { haiku: '', sonnet: '', opus: '', reasoning: '' } }
  settingsForm.value.providers.push(p)
  settingsForm.value.selectedIdx = settingsForm.value.providers.length - 1
  editingNewProvider.value = true
  currentProvider.value = p
  formInitialConfigJson.value = null
  showProviderForm.value = true
}

async function copyProvider(i) {
  const src = settingsForm.value.providers[i]
  const copy = JSON.parse(JSON.stringify(src))
  copy.name = (copy.name || t('settings.unnamed')) + t('settings.copySuffix')
  if (src?.config && typeof src.config === 'object') {
    copy.config = JSON.parse(JSON.stringify(src.config))
  }
  settingsForm.value.providers.splice(i + 1, 0, copy)
  await persistProviders()
}

async function importFromLegacy() {
  try {
    const result = await window.electronAPI?.claudeImportLegacyConfig?.()
    if (!result) { ElMessage.error(t('settings.importFailedNoConn')); return }
    if (result.notFound) {
      ElMessage.warning(t('settings.importNoDataDir'))
      return
    }
    if (!result.success) { ElMessage.error(t('settings.importFailedGeneric') + (result.error || t('system.unknownError'))); return }
    const { imported } = result
    const parts = []
    if (imported.providers > 0) parts.push(t('settings.importedProviders', { n: imported.providers }))
    if (imported.tierModels) parts.push('Tier Models')
    await openSettings()
    if (parts.length) {
      ElMessage.success(t('settings.importedResult', { items: parts.join('、') }))
    } else {
      ElMessage.warning(t('settings.importNoConfig'))
    }
  } catch (e) {
    ElMessage.error(t('settings.importFailedGeneric') + (e?.message || e))
  }
}

async function importFromFile(i) {
  const name = settingsForm.value.providers[i]?.name || t('settings.unnamed')
  const ok = await confirmDialogRef.value?.open({
    message: t('settings.importOverwriteMsg', { name }),
  })
  if (!ok) return
  try {
    const sj = await window.electronAPI?.claudeReadSettingsJson?.()
    if (!sj) { ElMessage.warning(t('settings.importNoSettingsJson')); return }
    let sKey = sj.env?.ANTHROPIC_AUTH_TOKEN || ''
    let sUrl = sj.env?.ANTHROPIC_BASE_URL || ''
    if (!sKey && sj.primaryApiKey) sKey = sj.primaryApiKey
    if (!sKey && sj.apiKey) sKey = sj.apiKey
    if (!sUrl && sj.baseURL) sUrl = sj.baseURL
    if (!sUrl && sj.apiBaseUrl) sUrl = sj.apiBaseUrl
    let sHaiku = sj.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || ''
    let sSonnet = sj.env?.ANTHROPIC_DEFAULT_SONNET_MODEL || ''
    let sOpus = sj.env?.ANTHROPIC_DEFAULT_OPUS_MODEL || ''
    const sReasoning = sj.env?.ANTHROPIC_REASONING_MODEL || ''
    let sModel = sj.model || sj.defaultModel || ''
    if (sModel && !sSonnet && sModel.includes('sonnet')) sSonnet = sModel
    if (sModel && !sOpus && sModel.includes('opus')) sOpus = sModel
    if (sModel && !sHaiku && sModel.includes('haiku')) sHaiku = sModel
    if (!sKey && !sUrl) { ElMessage.warning(t('settings.importNoApiKey')); return }
    const p = settingsForm.value.providers[i]
    p.key = sKey
    p.url = sUrl
    p.config = sj
    p.tierModels = { haiku: sHaiku, sonnet: sSonnet, opus: sOpus, reasoning: sReasoning }
    await persistProviders()
    ElMessage.success(t('settings.importOverwritten', { name: p.name || t('settings.unnamed') }))
  } catch (e) {
    ElMessage.error(t('settings.importFailedGeneric') + (e?.message || e))
  }
}

async function removeProvider(i) {
  if (i < 0 || i >= settingsForm.value.providers.length) return
  const removedWasActive = settingsForm.value.activeIdx === i
  settingsForm.value.providers.splice(i, 1)
  const last = settingsForm.value.providers.length - 1
  if (!settingsForm.value.providers.length) {
    settingsForm.value.activeIdx = -1
    settingsForm.value.selectedIdx = -1
  } else {
    if (settingsForm.value.activeIdx === i) {
      settingsForm.value.activeIdx = Math.min(i, last)
    } else if (settingsForm.value.activeIdx > i) {
      settingsForm.value.activeIdx -= 1
    }
    settingsForm.value.selectedIdx = Math.min(i, last)
  }
  if (!removedWasActive) {
    await persistProviders()
    return
  }
  if (settingsForm.value.activeIdx >= 0) {
    const ok = await applyAndActivate(settingsForm.value.activeIdx, { writeSettings: true })
    if (ok) emit('providerActivated')
  } else {
    await persistProviders()
  }
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
  border-radius: 10px; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px var(--cc-shadow); overflow: hidden; max-height: 80vh;
}
.settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--cc-border);
  font-size: 13px; font-weight: 600; color: var(--cc-text); flex-shrink: 0;
}
.env-status-bar {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 16px; background: var(--cc-bg-tertiary); border-bottom: 1px solid var(--cc-border);
  font-size: 12px; flex-shrink: 0;
}
.env-row-loading .env-item.checking {
  opacity: 0.7; color: var(--cc-text-dim);
  animation: cc-env-pulse 1.2s ease-in-out infinite;
}
.env-row-loading .env-item.checking:nth-child(2) { animation-delay: 0.15s; }
@keyframes cc-env-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.85; }
}
.env-spinner {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: cc-env-spin 0.7s linear infinite;
  flex-shrink: 0; margin-right: 2px;
}
@keyframes cc-env-spin { to { transform: rotate(360deg); } }
.env-checking { color: var(--cc-text-dim); }
.env-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.env-path-row {
  display: flex; align-items: center; gap: 6px; width: 100%;
}
.env-item {
  display: flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 4px;
  &.ok { color: var(--cc-success); background: var(--cc-success-bg); }
  &.warn { color: var(--cc-warning); background: var(--cc-warning-bg); }
  &.err { color: var(--cc-error); background: var(--cc-error-bg); }
}
.env-dot {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0;
}
.env-tip { color: var(--cc-warning); font-size: 10px; }
.env-install-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cc-info);
  background: transparent; color: var(--cc-info); font-size: 11px; cursor: pointer;
  &:disabled { opacity: .45; cursor: not-allowed; }
  &:not(:disabled):hover { background: var(--cc-info-bg); }
}
.env-config-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cc-border-strong);
  background: transparent; color: var(--cc-text-dim); font-size: 11px; cursor: pointer;
  &:hover { border-color: var(--cc-border-focus); color: var(--cc-text-muted); }
}
.env-node-link {
  color: var(--cc-info); font-size: 11px; cursor: pointer; text-decoration: underline;
}
.env-refresh-btn {
  margin-left: auto; background: none; border: none; color: var(--cc-text-dim);
  font-size: 13px; cursor: pointer; padding: 0 2px;
  &:hover { color: var(--cc-text-muted); }
}
.env-path-input {
  flex: 1; min-width: 100px; background: var(--cc-bg-elevated); border: 1px solid var(--cc-border-strong); border-radius: 4px;
  color: var(--cc-text-secondary); font-size: 11px; padding: 3px 7px; outline: none;
  &:focus { border-color: var(--cc-info); }
  &::placeholder { color: var(--cc-text-dim); }
}
.env-path-btn {
  flex-shrink: 0; padding: 2px 7px; border-radius: 4px; border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-elevated); color: var(--cc-text-muted); font-size: 12px; cursor: pointer;
  &:hover { border-color: var(--cc-border-focus); color: var(--cc-text); }
  &.save { border-color: var(--cc-success-border); color: var(--cc-success); }
  &.save:hover { background: var(--cc-success-bg); }
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
.exe-path-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 16px; background: var(--cc-bg-tertiary); border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}
.exe-path-label {
  font-size: 11px; color: var(--cc-text-dim); white-space: nowrap; flex-shrink: 0;
}
.exe-path-input {
  flex: 1; background: var(--cc-bg-elevated); border: 1px solid var(--cc-border-strong); border-radius: 4px;
  color: var(--cc-text-secondary); font-size: 11px; padding: 3px 7px; outline: none; min-width: 0;
  &:focus { border-color: var(--cc-info); }
  &::placeholder { color: var(--cc-text-dim); }
}
.exe-path-btn {
  flex-shrink: 0; padding: 2px 7px; border-radius: 4px; border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-elevated); color: var(--cc-text-muted); font-size: 12px; cursor: pointer;
  &:hover { border-color: var(--cc-border-focus); color: var(--cc-text); }
  &.save { border-color: var(--cc-success-border); color: var(--cc-success); }
  &.save:hover { background: var(--cc-success-bg); }
}
.settings-close {
  width: 24px; height: 24px; border-radius: 5px; background: none;
  border: none; color: var(--cc-text-dim); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.settings-close:hover { background: var(--cc-bg-hover); color: var(--cc-text); }

.theme-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}
.theme-label {
  font-size: 12px; color: var(--cc-text-dim); font-weight: 500;
  white-space: nowrap; flex-shrink: 0;
}
.theme-options {
  display: flex; gap: 6px;
}
.theme-option {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 6px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-elevated);
  color: var(--cc-text-muted);
  font-size: 12px; cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    border-color: var(--cc-border-hover);
    color: var(--cc-text-secondary);
    background: var(--cc-bg-hover);
  }
  &.active {
    border-color: var(--cc-primary);
    color: var(--cc-text);
    background: var(--cc-primary-bg);
    box-shadow: 0 0 0 1px var(--cc-primary-border);
  }
}
.theme-icon {
  flex-shrink: 0; opacity: 0.7;
}
.theme-option.active .theme-icon { opacity: 1; }
.theme-text { line-height: 1; }

.settings-main {
  display: flex; flex: 1; overflow: hidden; min-height: 0;
}
.settings-main .sp-left {
  width: 100%; flex-shrink: 0; border-right: none;
  display: flex; flex-direction: column; overflow: hidden;
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
}
.sp-list {
  flex: 1; overflow-y: auto; padding: 6px;
  display: flex; flex-direction: column; gap: 3px;
}
.sp-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px;
  border-radius: 6px; cursor: pointer; border: 1px solid transparent;
  transition: background 0.12s;
}
.sp-item:hover { background: var(--cc-bg-elevated); }
.sp-item.active { background: var(--cc-bg-elevated); border-color: var(--cc-primary); }
.sp-item.inuse:not(.active) { border-color: transparent; }
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
  font-size: 10px; color: var(--cc-primary); flex-shrink: 0;
  display: flex; align-items: center; gap: 2px;
  height: 20px; padding: 0 4px; border-radius: 3px;
  background: var(--cc-primary-bg); border: 1px solid var(--cc-primary-border);
}
.sp-item-actions {
  display: flex; flex-wrap: wrap; justify-content: flex-end;
  gap: 2px; flex-shrink: 0;
}
.sp-item-btn {
  height: 20px; border-radius: 3px; border: none;
  background: transparent; color: var(--cc-text-dim); cursor: pointer;
  display: flex; align-items: center; gap: 2px;
  padding: 0 4px; font-size: 10px; line-height: 1;
}
.sp-item-btn:hover:not(:disabled) { background: var(--cc-bg-hover); color: var(--cc-text-secondary); }
.sp-item-btn.edit:hover:not(:disabled) { color: var(--cc-primary); }
.sp-item-btn.use:hover:not(:disabled) { color: var(--cc-info); }
.sp-item-btn.validate:hover:not(:disabled) { color: var(--cc-success); }
.sp-item-btn.copy:hover:not(:disabled) { color: var(--cc-hljs-keyword); }
.sp-item-btn.del:hover:not(:disabled) { color: var(--cc-error); }
.sp-item-btn:disabled { opacity: 0.4; cursor: not-allowed; }
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

/* WebFetch 预检开关 */
.mini-toggle {
  position: relative; width: 36px; height: 20px; border-radius: 10px;
  border: none; background: var(--cc-border); cursor: pointer;
  transition: background 0.2s; padding: 0; outline: none;
  flex-shrink: 0;
}
.mini-toggle.active {
  background: var(--cc-primary);
}
.mini-toggle-knob {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: #fff; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.mini-toggle.active .mini-toggle-knob {
  transform: translateX(16px);
}
.toggle-hint {
  font-size: 11px; color: var(--cc-text-dim); white-space: nowrap; margin-left: 4px;
}

/* 自动压缩窗口输入 */
.compact-window-input {
  width: 120px; height: 28px; padding: 0 8px;
  border-radius: 6px; border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-elevated); color: var(--cc-text);
  font-size: 12px; outline: none; text-align: left;
}
.compact-window-input:focus { border-color: var(--cc-primary); }
.compact-window-input::placeholder { color: var(--cc-text-dim); font-size: 11px; }
.compact-save-btn {
  height: 28px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--cc-primary); background: var(--cc-primary);
  color: var(--cc-btn-primary-text); font-size: 11px; cursor: pointer;
  white-space: nowrap;
}
.compact-save-btn:hover { background: var(--cc-primary-hover); }
.compact-reset-btn {
  height: 28px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--cc-border-strong); background: var(--cc-bg-elevated);
  color: var(--cc-text-dim); font-size: 11px; cursor: pointer;
  white-space: nowrap;
}
.compact-reset-btn:hover { border-color: var(--cc-border-focus); color: var(--cc-text); }
</style>
