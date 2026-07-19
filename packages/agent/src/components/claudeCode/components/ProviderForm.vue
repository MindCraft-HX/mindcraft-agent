<template>
  <div v-if="visible" class="pf-overlay">
    <div class="pf-panel" @click.stop>
      <div class="pf-header">
        <span class="pf-title">{{ isNew ? $t('settings.addConfig') : $t('settings.editConfig') }}</span>
        <button class="pf-close" @click="onClose">×</button>
      </div>
      <div class="pf-body">
        <div class="setting-group">
          <div class="provider-name-row">
            <div class="provider-name-field">
              <label class="setting-label">{{ $t('settings.name') }}</label>
              <input class="setting-input" v-model="form.name" :placeholder="$t('settings.namePlaceholder')" />
            </div>
            <div class="provider-name-field">
              <label class="setting-label">{{ $t('settings.remark') }}</label>
              <input class="setting-input" v-model="form.note" :placeholder="$t('settings.remarkOptional')" />
            </div>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">API Key</label>
          <div class="setting-tip">{{ $t('settings.apiKeyHintExtended') }}<a class="setting-link" @click="openKeyApply">{{ $t('settings.applyApiKey') }}</a>
          </div>
          <div class="setting-row">
            <input class="setting-input" :type="showKey ? 'text' : 'password'" v-model="form.key"
              @change="syncFormToJson" placeholder="sk-ant-..." />
            <button class="setting-eye" @click="showKey = !showKey">{{ showKey ? '🙈' : '👁' }}</button>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">Base URL <span class="setting-hint">{{ $t('settings.optional') }}</span></label>
          <input class="setting-input" v-model="form.url" @change="syncFormToJson"
            placeholder="https://api.mindcraft.com.cn" />
          <div class="setting-tip">{{ $t('settings.baseUrlHintExtended') }}</div>
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.websiteUrl') }}<span class="setting-hint">{{ $t('settings.optional') }}</span></label>
          <input class="setting-input" v-model="form.website" placeholder="https://example.com" />
        </div>
        <div class="setting-group">
          <div class="tier-model-header">
            <label class="setting-label">{{ $t('settings.tierModel') }}</label>
          </div>
          <div class="setting-tip" style="margin-bottom:8px">{{ $t('settings.tierModelHintExtended') }}</div>
          <div class="tier-model-grid">
            <div class="tier-model-card">
              <label class="tier-model-card-label">{{ $t('settings.tierHaikuModel') }}</label>
              <input class="tier-model-card-input" v-model="tier.haiku" @change="syncFormToJson"
                :placeholder="$t('settings.haikuPlaceholder')" />
            </div>
            <div class="tier-model-card">
              <label class="tier-model-card-label">{{ $t('settings.tierSonnetModel') }}</label>
              <input class="tier-model-card-input" v-model="tier.sonnet" @change="syncFormToJson"
                :placeholder="$t('settings.sonnetPlaceholder')" />
            </div>
            <div class="tier-model-card">
              <label class="tier-model-card-label">{{ $t('settings.tierOpusModel') }}</label>
              <input class="tier-model-card-input" v-model="tier.opus" @change="syncFormToJson"
                :placeholder="$t('settings.opusPlaceholder')" />
            </div>
            <div class="tier-model-card">
              <label class="tier-model-card-label">{{ $t('settings.tierReasoningModel') }}</label>
              <input class="tier-model-card-input" v-model="tier.reasoning" @change="syncFormToJson"
                :placeholder="$t('settings.reasoningPlaceholder')" />
            </div>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.mainTier') }}<span class="setting-hint">{{ $t('settings.mainTierHint') }}</span></label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="tierKey" @change="syncFormToJson">
              <option value="haiku">{{ $t('settings.tierHaiku') }}</option>
              <option value="sonnet">{{ $t('settings.tierSonnet') }}</option>
              <option value="opus">{{ $t('settings.tierOpus') }}</option>
              <option value="reasoning">{{ $t('settings.tierReasoning') }}</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.permissionPolicy') }}</label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="policy" @change="syncFormToJson">
              <option value="ask">{{ $t('settings.permAsk') }}</option>
              <option value="allow_all">{{ $t('settings.permAllow') }}</option>
              <option value="read_only">{{ $t('settings.permReadonly') }}</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
          <div class="setting-tip">{{ $t('settings.permissionHint') }}</div>
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.defaultLang') }}</label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="lang" @change="syncFormToJson">
              <option value="zh-CN">{{ $t('settings.simplifiedChinese') }}</option>
              <option value="en-US">English</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.reasoningEffort') }} <span class="setting-tip">{{ $t('settings.reasoningEffortHint') }}</span></label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="effort" @change="syncFormToJson">
              <option value="">{{ $t('settings.reasoningNotSet') }}</option>
              <option value="low">{{ $t('settings.reasoningLow') }}</option>
              <option value="medium">{{ $t('settings.reasoningMid') }}</option>
              <option value="high">{{ $t('settings.reasoningHigh') }}</option>
              <option value="xhigh">{{ $t('settings.reasoningXHigh') }}</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
        </div>
        <div class="setting-group">
          <div class="config-json-header">
            <label class="setting-label">{{ $t('settings.configJson') }}</label>
            <button class="config-json-fmt-btn" @click="formatJson">{{ $t('settings.format') }}</button>
          </div>
          <div class="config-json-toggles">
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleHideAttribution"
                @change="handleToggle('hideAttribution', $event.target.checked)" class="config-json-toggle" />
              <span>{{ $t('settings.hideAiSignature') }}</span>
            </label>
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleTeammates"
                @change="handleToggle('teammates', $event.target.checked)" class="config-json-toggle" />
              <span>{{ $t('settings.teammatesMode') }}</span>
            </label>
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleToolSearch"
                @change="handleToggle('toolSearch', $event.target.checked)" class="config-json-toggle" />
              <span>{{ $t('settings.enableToolSearch') }}</span>
            </label>
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleDisableAutoUpgrade"
                @change="handleToggle('disableAutoUpgrade', $event.target.checked)" class="config-json-toggle" />
              <span>{{ $t('settings.disableAutoUpgrade') }}</span>
            </label>
          </div>
          <textarea class="config-json-editor" v-model="jsonText" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="pf-footer">
        <button class="settings-btn cancel" @click="onClose">{{ $t('common.cancel') }}</button>
        <button class="settings-btn primary" @click="onSave">{{ $t('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()

const props = defineProps({
  visible: { type: Boolean, default: false },
  provider: { type: Object, default: null },
  isNew: { type: Boolean, default: false },
  selectedTier: { type: String, default: 'sonnet' },
  tierModels: { type: Object, default: () => ({ haiku: '', sonnet: '', opus: '', reasoning: '' }) },
  permissionPolicy: { type: String, default: 'ask' },
  language: { type: String, default: 'zh-CN' },
  effortLevel: { type: String, default: 'medium' },
  configJson: { type: [Object, String], default: null },
})

const emit = defineEmits(['save', 'close'])

const showKey = ref(false)
const form = reactive({ name: '', note: '', website: '', key: '', url: '' })
const tier = reactive({ haiku: '', sonnet: '', opus: '', reasoning: '' })
const tierKey = ref('sonnet')
const policy = ref('ask')
const lang = ref('zh-CN')
const effort = ref('medium')
const jsonText = ref('')
const tierKeys = ['haiku', 'sonnet', 'opus', 'reasoning']
const mindCraftAppLocales = ['zh-CN', 'en-US']

watch(() => props.visible, (v) => {
  if (v) initFromProps()
}, { immediate: true })

function initFromProps() {
  showKey.value = false
  const p = props.provider || {}
  form.name = p.name || ''
  form.note = p.note || ''
  form.website = p.website || ''
  form.key = p.key || ''
  form.url = p.url || ''

  const pt = p.tierModels || {}
  tier.haiku = (pt.haiku || '').toString()
  tier.sonnet = (pt.sonnet || '').toString()
  tier.opus = (pt.opus || '').toString()
  tier.reasoning = (pt.reasoning || '').toString()

  tierKey.value = tierKeys.includes(p.selectedTier) ? p.selectedTier : (tierKeys.includes(props.selectedTier) ? props.selectedTier : 'sonnet')
  policy.value = props.permissionPolicy || 'ask'
  lang.value = props.language || 'zh-CN'
  effort.value = props.effortLevel ?? 'medium'

  let initial = null
  if (p.config && typeof p.config === 'object') initial = p.config
  else if (props.configJson && typeof props.configJson === 'object') initial = props.configJson

  if (initial) {
    jsonText.value = JSON.stringify(initial, null, 2)
    applyJsonToForm()
    syncFormToJson()
  } else if (typeof props.configJson === 'string' && props.configJson) {
    jsonText.value = props.configJson
    applyJsonToForm()
    syncFormToJson()
  } else {
    jsonText.value = buildJsonFromForm()
  }
}

function readEnvObject(config) {
  if (config && typeof config.env === 'object' && config.env) return config.env
  return {}
}

function ensureEnvObject(config) {
  if (!config || typeof config !== 'object') return {}
  if (!config.env || typeof config.env !== 'object') config.env = {}
  return config.env
}

function buildJsonFromForm() {
  const env = {}
  if (form.key.trim()) env.ANTHROPIC_AUTH_TOKEN = form.key.trim()
  if (form.url.trim()) env.ANTHROPIC_BASE_URL = form.url.trim()
  const primary = (tier[tierKey.value] || '').trim()
  if (primary) env.ANTHROPIC_MODEL = primary
  if (tier.haiku.trim()) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = tier.haiku.trim()
  if (tier.sonnet.trim()) env.ANTHROPIC_DEFAULT_SONNET_MODEL = tier.sonnet.trim()
  if (tier.opus.trim()) env.ANTHROPIC_DEFAULT_OPUS_MODEL = tier.opus.trim()
  if (tier.reasoning.trim()) env.ANTHROPIC_REASONING_MODEL = tier.reasoning.trim()
  const obj = {}
  if (Object.keys(env).length) obj.env = env
  if (tierKey.value) obj.model = tierKey.value
  // `policy` and `lang` are MindCraft UI/runtime fields. They are emitted as
  // provider fields on save, but intentionally not written into config JSON.
  // Claude's official `language` setting means response language, not app locale.
  if (effort.value) obj.effortLevel = effort.value
  return JSON.stringify(obj, null, 2)
}

function cloneConfigObject(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  try {
    return JSON.parse(JSON.stringify(config))
  } catch (_) {
    return { ...config }
  }
}

function sanitizeClaudeConfig(config) {
  const parsed = cloneConfigObject(config)
  // Keep this editor JSON close to Claude's official settings shape. App-owned
  // provider fields stay on the provider object / repository metadata.
  delete parsed.reasoningEffort
  delete parsed.apiFormat
  delete parsed.key
  delete parsed.url
  delete parsed.apiKey
  delete parsed.primaryApiKey
  delete parsed.baseURL
  delete parsed.apiBaseUrl
  delete parsed.permissionPolicy
  delete parsed.theme
  delete parsed.website
  delete parsed.note
  if (mindCraftAppLocales.includes(parsed.language)) delete parsed.language
  delete parsed.ANTHROPIC_AUTH_TOKEN
  delete parsed.ANTHROPIC_BASE_URL
  delete parsed.ANTHROPIC_MODEL
  delete parsed.ANTHROPIC_DEFAULT_HAIKU_MODEL
  delete parsed.ANTHROPIC_DEFAULT_SONNET_MODEL
  delete parsed.ANTHROPIC_DEFAULT_OPUS_MODEL
  delete parsed.ANTHROPIC_REASONING_MODEL
  return parsed
}

function syncFormToJson() {
  try {
    const parsed = sanitizeClaudeConfig(JSON.parse(jsonText.value || '{}'))
    const env = ensureEnvObject(parsed)

    const keyTrim = form.key.trim()
    const urlTrim = form.url.trim()
    if (keyTrim) env.ANTHROPIC_AUTH_TOKEN = keyTrim
    else delete env.ANTHROPIC_AUTH_TOKEN
    if (urlTrim) env.ANTHROPIC_BASE_URL = urlTrim
    else delete env.ANTHROPIC_BASE_URL

    const primary = (tier[tierKey.value] || '').trim()
    if (primary) env.ANTHROPIC_MODEL = primary
    else delete env.ANTHROPIC_MODEL

    if (tier.haiku.trim()) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = tier.haiku.trim()
    else delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL
    if (tier.sonnet.trim()) env.ANTHROPIC_DEFAULT_SONNET_MODEL = tier.sonnet.trim()
    else delete env.ANTHROPIC_DEFAULT_SONNET_MODEL
    if (tier.opus.trim()) env.ANTHROPIC_DEFAULT_OPUS_MODEL = tier.opus.trim()
    else delete env.ANTHROPIC_DEFAULT_OPUS_MODEL
    if (tier.reasoning.trim()) env.ANTHROPIC_REASONING_MODEL = tier.reasoning.trim()
    else delete env.ANTHROPIC_REASONING_MODEL

    if (parsed.env && Object.keys(parsed.env).length === 0) delete parsed.env

    if (tierKey.value) parsed.model = tierKey.value
    else delete parsed.model
    if (effort.value) parsed.effortLevel = effort.value
    else delete parsed.effortLevel

    jsonText.value = JSON.stringify(parsed, null, 2)
  } catch (e) { console.warn('[syncFormToJson]', e) }
}

function applyJsonToForm() {
  try {
    const raw = JSON.parse(jsonText.value || '{}')
    const parsed = sanitizeClaudeConfig(raw)
    const env = readEnvObject(parsed)

    const k = (env.ANTHROPIC_AUTH_TOKEN || raw.ANTHROPIC_AUTH_TOKEN || raw.primaryApiKey || raw.apiKey || raw.key || '').toString()
    const u = (env.ANTHROPIC_BASE_URL || raw.ANTHROPIC_BASE_URL || raw.baseURL || raw.apiBaseUrl || raw.url || '').toString()
    if (k) form.key = k
    if (u) form.url = u

    const t = (parsed.model || '').toString().trim()
    if (tierKeys.includes(t)) tierKey.value = t

    const tm = {
      haiku: (env.ANTHROPIC_DEFAULT_HAIKU_MODEL || raw.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').toString().trim(),
      sonnet: (env.ANTHROPIC_DEFAULT_SONNET_MODEL || raw.ANTHROPIC_DEFAULT_SONNET_MODEL || '').toString().trim(),
      opus: (env.ANTHROPIC_DEFAULT_OPUS_MODEL || raw.ANTHROPIC_DEFAULT_OPUS_MODEL || '').toString().trim(),
      reasoning: (env.ANTHROPIC_REASONING_MODEL || raw.ANTHROPIC_REASONING_MODEL || '').toString().trim(),
    }
    if (tm.haiku) tier.haiku = tm.haiku
    if (tm.sonnet) tier.sonnet = tm.sonnet
    if (tm.opus) tier.opus = tm.opus
    if (tm.reasoning) tier.reasoning = tm.reasoning
    if (t && !tierKeys.includes(t) && !tier[tierKey.value]) {
      tier[tierKey.value] = t
    }

    const po = (raw.permissionPolicy || '').toString()
    if (['ask', 'allow_all', 'read_only'].includes(po)) policy.value = po
    const la = (raw.language || '').toString()
    if (mindCraftAppLocales.includes(la)) lang.value = la
    const ef = (parsed.effortLevel || '').toString()
    if (['low', 'medium', 'high', 'xhigh'].includes(ef)) effort.value = ef
  } catch (e) { console.warn('[applyJsonToForm]', e) }
}

function formatJson() {
  try {
    const parsed = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(parsed, null, 2)
    applyJsonToForm()
    syncFormToJson()
  } catch (_) {
    ElMessage.error(t('settings.jsonFormatError'))
  }
}

const toggleHideAttribution = computed(() => {
  try {
    const c = JSON.parse(jsonText.value || '{}')
    return c?.attribution?.commit === '' && c?.attribution?.pr === ''
  } catch (e) { console.warn('[toggleHideAttribution]', e); return false }
})
const toggleTeammates = computed(() => {
  try {
    const c = JSON.parse(jsonText.value || '{}')
    const env = readEnvObject(c)
    return env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1' || env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === 1
  } catch (e) { console.warn('[toggleTeammates]', e); return false }
})
const toggleToolSearch = computed(() => {
  try {
    const c = JSON.parse(jsonText.value || '{}')
    const env = readEnvObject(c)
    return env.ENABLE_TOOL_SEARCH === 'true' || env.ENABLE_TOOL_SEARCH === '1'
  } catch (e) { console.warn('[toggleToolSearch]', e); return false }
})
const toggleDisableAutoUpgrade = computed(() => {
  try {
    const c = JSON.parse(jsonText.value || '{}')
    const env = readEnvObject(c)
    return env.DISABLE_AUTOUPDATER === '1' || env.DISABLE_AUTOUPDATER === 1
  } catch (e) { console.warn('[toggleDisableAutoUpgrade]', e); return false }
})

function handleToggle(key, checked) {
  try {
    applyJsonToForm()
    const config = sanitizeClaudeConfig(JSON.parse(jsonText.value || '{}'))
    switch (key) {
      case 'hideAttribution':
        if (checked) config.attribution = { commit: '', pr: '' }
        else delete config.attribution
        break
      case 'teammates': {
        const env = ensureEnvObject(config)
        if (checked) env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
        else delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
        if (config.env && Object.keys(config.env).length === 0) delete config.env
        break
      }
      case 'toolSearch': {
        const env = ensureEnvObject(config)
        if (checked) env.ENABLE_TOOL_SEARCH = 'true'
        else delete env.ENABLE_TOOL_SEARCH
        if (config.env && Object.keys(config.env).length === 0) delete config.env
        break
      }
      case 'disableAutoUpgrade': {
        const env = ensureEnvObject(config)
        if (checked) env.DISABLE_AUTOUPDATER = '1'
        else delete env.DISABLE_AUTOUPDATER
        if (config.env && Object.keys(config.env).length === 0) delete config.env
        break
      }
    }
    jsonText.value = JSON.stringify(config, null, 2)
    syncFormToJson()
  } catch (e) { console.warn('[handleToggle]', e) }
}

function isOfficialKey(key) {
  if (!key) return false
  const k = key.trim().toLowerCase()
  return k.startsWith('sk-ant-') || k.startsWith('sk-sy-')
}

function onSave() {
  applyJsonToForm()
  syncFormToJson()
  const keyTrim = form.key.trim()
  const urlTrim = form.url.trim()
  const nameTrim = form.name.trim()
  const isOfficial = keyTrim ? isOfficialKey(keyTrim) : false

  if (!keyTrim) {
    ElMessage.error(t('settings.pleaseSetApiKey'))
    return
  }
  if (!isOfficial) {
    if (!nameTrim) {
      ElMessage.error(t('settings.pleaseSetName'))
      return
    }
    if (!urlTrim) {
      ElMessage.error(t('settings.pleaseSetBaseUrl'))
      return
    }
  }

  let configObj = null
  try {
    configObj = sanitizeClaudeConfig(JSON.parse(jsonText.value || '{}'))
    jsonText.value = JSON.stringify(configObj, null, 2)
  } catch (e) {
    ElMessage.error(t('settings.configJsonFormatError') + (e?.message || ''))
    return
  }

  const tierModels = {
    haiku: tier.haiku.trim(),
    sonnet: tier.sonnet.trim(),
    opus: tier.opus.trim(),
    reasoning: tier.reasoning.trim(),
  }

  emit('save', {
    provider: {
      ...(props.provider || {}),
      name: form.name,
      note: form.note,
      website: form.website,
      key: form.key,
      url: form.url,
      tierModels,
      selectedTier: tierKey.value,
      effortLevel: effort.value,
      config: configObj,
    },
    selectedTier: tierKey.value,
    tierModels,
    permissionPolicy: policy.value,
    language: lang.value,
    effortLevel: effort.value,
    configJson: configObj,
  })
}

function openKeyApply() {
  window.electronAPI?.openExternalWindow?.('https://www.mindcraft.com.cn/#/apiKeys')
}

function onClose() {
  emit('close')
}
</script>

<style lang="scss" scoped>
.pf-overlay {
  position: fixed; inset: 0; background: var(--cc-overlay-bg);
  z-index: 250; display: flex; align-items: center; justify-content: center;
}
.pf-panel {
  width: 600px; max-height: 85vh; background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border); border-radius: 10px;
  box-shadow: 0 20px 60px var(--cc-shadow);
  display: flex; flex-direction: column; overflow: hidden;
}
.pf-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}
.pf-title { font-size: 13px; font-weight: 600; color: var(--cc-text); }
.pf-close {
  width: 24px; height: 24px; border-radius: 5px; background: none;
  border: none; color: var(--cc-text-dim); font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.pf-close:hover { background: var(--cc-bg-hover); color: var(--cc-text); }
.pf-body {
  flex: 1; padding: 14px 16px; display: flex; flex-direction: column;
  gap: 12px; overflow-y: auto;
}
.pf-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 10px 16px; border-top: 1px solid var(--cc-border); flex-shrink: 0;
}

.setting-group { display: flex; flex-direction: column; gap: 5px; }
.setting-label { font-size: 11px; color: var(--cc-text-dim); font-weight: 500; }
.setting-hint { color: var(--cc-text-dim); font-weight: 400; }
.setting-tip { font-size: 11px; color: var(--cc-text-dim); line-height: 1.4; }
.setting-link { color: var(--cc-primary); cursor: pointer; text-decoration: none; font-size: 11px; white-space: nowrap; }
.setting-link:hover { text-decoration: underline; }
.tier-model-header { margin-bottom: 0; }
.tier-model-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px;
}
.tier-model-card { display: flex; flex-direction: column; gap: 4px; }
.tier-model-card-label { font-size: 12px; color: var(--cc-text-muted); font-weight: 500; }
.tier-model-card-input {
  background: var(--cc-bg-tertiary); border: 1px solid var(--cc-border); border-radius: 6px;
  padding: 6px 10px; color: var(--cc-text); font-size: 12px; outline: none; width: 100%;
  box-sizing: border-box;
}
.tier-model-card-input:focus { border-color: var(--cc-info); }
.tier-model-card-input::placeholder { color: var(--cc-text-dim); }
.setting-row { display: flex; gap: 6px; }
.provider-name-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.provider-name-field { display: flex; flex-direction: column; gap: 4px; }
.setting-input {
  flex: 1; background: var(--cc-bg-tertiary); border: 1px solid var(--cc-border); border-radius: 6px;
  padding: 7px 10px; color: var(--cc-text); font-size: 12px; outline: none;
  font-family: 'Cascadia Code', Consolas, monospace; transition: border-color 0.15s;
}
.setting-input:focus { border-color: var(--cc-primary); }
.setting-input::placeholder { color: var(--cc-border-strong); }
.setting-select-wrap { position: relative; width: 100%; }
.setting-select {
  width: 100%; display: block; appearance: none;
  -webkit-appearance: none; -moz-appearance: none;
  padding-right: 36px; cursor: pointer;
  background: var(--cc-bg-tertiary); font-family: inherit;
}
.setting-select:hover { border-color: var(--cc-border-strong); }
.setting-select-arrow {
  position: absolute; right: 12px; top: 50%;
  transform: translateY(-50%);
  color: var(--cc-text-muted); font-size: 14px; line-height: 1;
  font-weight: 700; pointer-events: none;
}
.setting-select:focus + .setting-select-arrow { color: var(--cc-primary); }
.setting-select option { background: var(--cc-bg-tertiary); color: var(--cc-text); }
.setting-eye {
  width: 32px; border-radius: 6px; background: var(--cc-bg-elevated); border: 1px solid var(--cc-border);
  color: var(--cc-text-dim); cursor: pointer; font-size: 13px; flex-shrink: 0;
}
.setting-eye:hover { background: var(--cc-bg-hover); }
.settings-btn {
  height: 28px; padding: 0 14px; border-radius: 6px;
  font-size: 12px; cursor: pointer; border: 1px solid transparent;
  transition: background 0.15s;
}
.settings-btn.primary { background: var(--cc-primary); color: var(--cc-btn-primary-text); }
.settings-btn.primary:hover { background: var(--cc-primary-hover); }
.settings-btn.cancel {
  background: var(--cc-bg-hover); border-color: var(--cc-border-strong); color: var(--cc-text-muted);
}
.settings-btn.cancel:hover { background: var(--cc-border-strong); color: var(--cc-text); }
.config-json-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
}
.config-json-fmt-btn {
  font-size: 10px; color: var(--cc-text-dim); background: none; border: 1px solid var(--cc-border-strong);
  border-radius: 3px; padding: 1px 6px; cursor: pointer;
}
.config-json-fmt-btn:hover { color: var(--cc-text-muted); border-color: var(--cc-border-focus); }
.config-json-editor {
  width: 100%; min-height: 160px; background: var(--cc-bg-tertiary); border: 1px solid var(--cc-border);
  border-radius: 5px; color: var(--cc-hljs-number); font-family: 'Consolas', monospace; font-size: 12px;
  line-height: 1.6; padding: 10px; resize: vertical; outline: none; box-sizing: border-box;
}
.config-json-editor:focus { border-color: var(--cc-border-strong); }
.config-json-toggles {
  display: flex; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 8px;
}
.config-json-toggle-label {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--cc-text-muted); cursor: pointer;
}
.config-json-toggle-label:hover { color: var(--cc-text-secondary); }
.config-json-toggle {
  width: 14px; height: 14px; accent-color: var(--cc-info); cursor: pointer;
}
</style>
