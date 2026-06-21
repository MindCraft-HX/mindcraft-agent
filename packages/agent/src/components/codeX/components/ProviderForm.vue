<template>
  <div v-if="visible" class="pf-overlay">
    <div class="pf-panel" @click.stop>
      <div class="pf-header">
        <span class="pf-title">{{ isNew ? $t('settings.addProvider') : $t('settings.editProvider') }}</span>
        <button class="pf-close" @click="onClose">×</button>
      </div>
      <div class="pf-body">
        <div class="avatar-row">
          <div class="pf-avatar">{{ avatarLetter }}</div>
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.providerName') }}</label>
          <input class="setting-input" v-model="form.name" placeholder="default" />
        </div>

        <div class="setting-group">
          <label class="setting-label">API Key</label>
          <div class="setting-tip">{{ $t('settings.apiKeyHintOpenAI') }}<a class="setting-link" @click="openKeyApply">{{ $t('settings.applyApiKeyShort') }}</a>
          </div>
          <div class="setting-row">
            <input
              class="setting-input"
              :type="showKey ? 'text' : 'password'"
              v-model="form.key"
              placeholder="sk-..."
            />
            <button class="setting-eye" @click="showKey = !showKey">{{ showKey ? $t('common.hide') : $t('common.show') }}</button>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.apiUrl') }}</label>
          <input class="setting-input" v-model="form.url" placeholder="https://api.mindcraft.com.cn/v1" />
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ $t('settings.modelName') }}</label>
          <input class="setting-input" v-model="form.model" :placeholder="$t('settings.modelNamePlaceholder')" />
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ $t('agent.altModel1') }}</label>
          <input class="setting-input" v-model="altModels[0]" :placeholder="$t('agent.altModelPlaceholder')" />
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('agent.altModel2') }}</label>
          <input class="setting-input" v-model="altModels[1]" :placeholder="$t('agent.altModelPlaceholder')" />
        </div>
        <div class="setting-group">
          <label class="setting-label">{{ $t('agent.altModel3') }}</label>
          <input class="setting-input" v-model="altModels[2]" :placeholder="$t('agent.altModelPlaceholder')" />
        </div>

        <div class="setting-group">
          <label class="setting-label">Reasoning Effort</label>
          <select class="setting-input" v-model="reasoningEffort">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="xhigh">xhigh</option>
          </select>
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ $t('agent.apiFormat') }}</label>
          <div class="setting-tip">{{ $t('agent.proxyHint') }}</div>
          <select class="setting-input" v-model="apiFormat">
            <option value="responses">{{ $t('agent.apiFormatResponses') }}</option>
            <option value="chat">{{ $t('agent.apiFormatChat') }}</option>
          </select>
        </div>

        <div class="setting-group">
          <label class="setting-label">auth.json <span class="required">*</span></label>
          <textarea class="json-editor" v-model="authJsonText" spellcheck="false"></textarea>
          <button class="fmt-btn" @click="formatAuthJson">{{ $t('settings.format') }}</button>
        </div>

        <div class="setting-group">
          <label class="setting-label">config.toml</label>
          <div class="setting-tip">{{ $t('settings.configPreviewHint') }}</div>
          <textarea class="json-editor toml-editor" v-model="tomlText" spellcheck="false"></textarea>
          <button class="fmt-btn" @click="formatToml">{{ $t('settings.format') }}</button>
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
import {
  buildManagedProviderToml,
  extractProviderDraftFromToml,
  mergeManagedProviderToml,
  normalizeCodexReasoningEffort,
} from '../utils/providerToml.mjs'

const props = defineProps({
  visible: { type: Boolean, default: false },
  provider: { type: Object, default: null },
  isNew: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'close'])

const showKey = ref(false)
const hydratingFromProps = ref(false)
const form = reactive({ name: '', key: '', url: '', model: '' })
const reasoningEffort = ref('')
const apiFormat = ref('responses')
const altModels = ref(['', '', ''])
const authJsonText = ref('')
const tomlText = ref('')

const avatarLetter = computed(() => {
  const n = form.name.trim()
  return n ? n[0].toUpperCase() : 'D'
})

watch(() => props.visible, (visible) => {
  if (visible) initFromProps()
}, { immediate: true })

watch(() => form.key, (key) => {
  try {
    const parsed = JSON.parse(authJsonText.value)
    if (parsed.OPENAI_API_KEY !== key) {
      parsed.OPENAI_API_KEY = key
      authJsonText.value = JSON.stringify(parsed, null, 2)
    }
  } catch {}
})

watch(
  () => [form.name, form.url, form.model, reasoningEffort.value, apiFormat.value, altModels.value[0], altModels.value[1], altModels.value[2]],
  () => {
    if (hydratingFromProps.value) return
    syncManagedTomlFromForm()
  },
)

function initFromProps() {
  hydratingFromProps.value = true
  showKey.value = false

  const provider = props.provider || {}
  const draft = extractProviderDraftFromToml(provider.tomlText || '')

  form.name = provider.name || draft.name || ''
  form.key = provider.key || draft.apiKey || ''
  form.url = provider.url || draft.url || ''
  form.model = provider.model || draft.model || ''
  reasoningEffort.value = normalizeCodexReasoningEffort(provider.reasoningEffort || draft.reasoningEffort)
  apiFormat.value = provider.apiFormat || draft.apiFormat || 'responses'
  const alt = provider.alternativeModels || []
  altModels.value = [
    alt[0] || '',
    alt[1] || '',
    alt[2] || '',
  ]
  authJsonText.value = provider.authJson
    ? JSON.stringify(provider.authJson, null, 2)
    : buildDefaultAuthJson()
  tomlText.value = provider.tomlText || buildDefaultToml()

  hydratingFromProps.value = false
  syncManagedTomlFromForm()
}

function buildDefaultAuthJson() {
  return JSON.stringify({ OPENAI_API_KEY: form.key || '' }, null, 2)
}

function buildDefaultToml() {
  return `${buildManagedProviderToml({
    name: form.name,
    model: form.model,
    url: form.url,
    reasoningEffort: reasoningEffort.value,
    apiFormat: apiFormat.value,
    apiKey: form.key,
  })}# [projects.'/absolute/path/to/project']
# trust_level = "trusted"
`
}

function syncManagedTomlFromForm() {
  const managedToml = buildManagedProviderToml({
    name: form.name,
    model: form.model,
    url: form.url,
    reasoningEffort: reasoningEffort.value,
    apiFormat: apiFormat.value,
    apiKey: form.key,
  })
  tomlText.value = mergeManagedProviderToml(tomlText.value, managedToml)
}

function formatAuthJson() {
  try {
    const parsed = JSON.parse(authJsonText.value)
    authJsonText.value = JSON.stringify(parsed, null, 2)
  } catch {
    ElMessage.error(t('settings.authJsonError'))
  }
}

function formatToml() {
  try {
    const lines = tomlText.value.split(/\r?\n/)
    const sections = []
    let current = { header: null, keys: [], comments: [] }

    for (const raw of lines) {
      const line = raw.replace(/\r$/, '')
      const trimmed = line.trim()
      if (/^\[[^\]]+\]$/.test(trimmed)) {
        if (current.header || current.keys.length || current.comments.length) sections.push(current)
        current = { header: line, keys: [], comments: [] }
        continue
      }
      if (!trimmed || trimmed.startsWith('#')) {
        current.comments.push(line)
        continue
      }
      current.keys.push(line)
    }
    sections.push(current)

    const out = []
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index]
      if (section.header) {
        if (index > 0 || out.length > 0) out.push('')
        out.push(section.header)
      }

      const topComments = []
      const restComments = []
      let seenKey = false
      for (const comment of section.comments) {
        if (!seenKey && (!comment.trim() || comment.trim().startsWith('#'))) topComments.push(comment)
        else {
          seenKey = true
          restComments.push(comment)
        }
      }

      for (const comment of topComments) out.push(comment)

      const KEY_ORDER = ['model_reasoning_effort', 'model', 'model_provider', 'wire_api', 'api_format', 'name', 'base_url', 'experimental_bearer_token', 'trust_level']
      section.keys.sort((a, b) => {
        const ka = (a.match(/^([a-z_]+)/)?.[1] || '').toLowerCase()
        const kb = (b.match(/^([a-z_]+)/)?.[1] || '').toLowerCase()
        const oa = KEY_ORDER.indexOf(ka)
        const ob = KEY_ORDER.indexOf(kb)
        if (oa >= 0 && ob >= 0) return oa - ob
        if (oa >= 0) return -1
        if (ob >= 0) return 1
        return ka.localeCompare(kb)
      })

      for (const keyLine of section.keys) out.push(keyLine)
      for (const comment of restComments) out.push(comment)
    }

    tomlText.value = out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
    syncManagedTomlFromForm()
    ElMessage.success(t('settings.tomlFormatted'))
  } catch {
    ElMessage.error(t('settings.tomlFormatFailed'))
  }
}

function onSave() {
  let authJson
  try {
    authJson = JSON.parse(authJsonText.value)
  } catch {
    ElMessage.error(t('settings.authJsonSyntaxError'))
    return
  }

  if (!form.url) {
    ElMessage.warning(t('settings.pleaseFillApiUrl'))
    return
  }
  if (!form.key) {
    ElMessage.warning(t('settings.pleaseFillApiKey'))
    return
  }

  syncManagedTomlFromForm()
  emit('save', {
    provider: {
      ...(props.provider || {}),
      name: form.name,
      key: form.key,
      url: form.url,
      model: form.model,
      reasoningEffort: normalizeCodexReasoningEffort(reasoningEffort.value),
      apiFormat: apiFormat.value,
      alternativeModels: altModels.value.filter(s => s && s.trim()),
      authJson,
      tomlText: tomlText.value,
    },
  })
}

function onClose() {
  emit('close')
}

function openKeyApply() {
  window.electronAPI?.openExternalWindow?.('https://www.mindcraft.com.cn/#/apiKeys')
}
</script>

<style lang="scss" scoped>
.pf-overlay {
  position: fixed; inset: 0; background: var(--cc-overlay-bg);
  z-index: 250; display: flex; align-items: center; justify-content: center;
}
.pf-panel {
  width: 720px; max-height: 90vh; background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border); border-radius: 12px;
  box-shadow: 0 8px 32px var(--cc-shadow);
  display: flex; flex-direction: column; overflow: hidden;
}
.pf-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 14px; border-bottom: 1px solid var(--cc-border); flex-shrink: 0;
}
.pf-title { font-size: 15px; font-weight: 600; color: var(--cc-text); }
.pf-close {
  width: 28px; height: 28px; border-radius: 50%; background: none;
  border: none; color: var(--cc-text-dim); font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.pf-close:hover { background: var(--cc-bg-hover); color: var(--cc-text); }
.pf-body {
  flex: 1; padding: 16px 20px; display: flex; flex-direction: column;
  gap: 14px; overflow-y: auto;
}
.pf-footer {
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 12px 20px; border-top: 1px solid var(--cc-border); flex-shrink: 0;
}
.avatar-row { display: flex; justify-content: center; margin-bottom: 4px; }
.pf-avatar {
  width: 56px; height: 56px; border-radius: 12px; background: var(--cc-bg-hover);
  color: var(--cc-text-muted); font-size: 22px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.setting-group { display: flex; flex-direction: column; gap: 5px; }
.setting-label { font-size: 13px; color: var(--cc-text); font-weight: 500; }
.setting-tip { font-size: 11px; color: var(--cc-text-dim); line-height: 1.4; }
.setting-link { color: var(--cc-primary); cursor: pointer; text-decoration: none; font-size: 11px; white-space: nowrap; }
.setting-link:hover { text-decoration: underline; }
.required { color: var(--cc-error); }
.setting-row { display: flex; gap: 6px; }
.setting-input {
  background: var(--cc-bg-input); border: 1px solid var(--cc-border-strong); border-radius: 6px;
  padding: 8px 12px; color: var(--cc-text); font-size: 13px; outline: none;
  transition: border-color 0.15s; width: 100%; box-sizing: border-box;
}
.setting-input:focus { border-color: var(--cc-primary); background: var(--cc-bg-elevated); }
.setting-input::placeholder { color: var(--cc-text-faint); }
.setting-eye {
  min-width: 52px; border-radius: 6px; background: var(--cc-bg-input); border: 1px solid var(--cc-border-strong);
  color: var(--cc-text-dim); cursor: pointer; font-size: 12px; flex-shrink: 0; padding: 0 8px;
}
.setting-eye:hover { background: var(--cc-bg-hover); }
.json-editor {
  width: 100%; min-height: 80px; background: var(--cc-bg-deep); border: 1px solid var(--cc-border-medium);
  border-radius: 6px; color: var(--cc-hljs-string); font-family: 'Consolas', 'Cascadia Code', monospace;
  font-size: 12px; line-height: 1.6; padding: 10px; resize: vertical; outline: none;
  box-sizing: border-box;
}
.toml-editor {
  min-height: 160px; background: var(--cc-bg-input); border-color: var(--cc-border-strong);
  color: var(--cc-text);
}
.json-editor:focus { border-color: var(--cc-primary); }
.fmt-btn {
  font-size: 11px; color: var(--cc-text-soft); background: none; border: none; cursor: pointer;
  display: flex; align-items: center; gap: 4px; align-self: flex-end;
}
.fmt-btn:hover { color: var(--cc-primary); }
.settings-btn {
  height: 32px; padding: 0 20px; border-radius: 6px;
  font-size: 13px; cursor: pointer; border: none;
  transition: background 0.15s;
}
.settings-btn.primary { background: var(--cc-primary); color: var(--cc-btn-primary-text); }
.settings-btn.primary:hover { background: var(--cc-primary-hover); }
.settings-btn.cancel { background: var(--cc-bg-elevated); border: 1px solid var(--cc-border-strong); color: var(--cc-text-muted); }
.settings-btn.cancel:hover { background: var(--cc-bg-hover); }
</style>
