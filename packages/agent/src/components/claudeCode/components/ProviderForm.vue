<template>
  <div v-if="visible" class="pf-overlay">
    <div class="pf-panel" @click.stop>
      <div class="pf-header">
        <span class="pf-title">{{ isNew ? '新增配置' : '编辑配置' }}</span>
        <button class="pf-close" @click="onClose">×</button>
      </div>
      <div class="pf-body">
        <div class="setting-group">
          <div class="provider-name-row">
            <div class="provider-name-field">
              <label class="setting-label">名称</label>
              <input class="setting-input" v-model="form.name" placeholder="如:mindcraft" />
            </div>
            <div class="provider-name-field">
              <label class="setting-label">备注</label>
              <input class="setting-input" v-model="form.note" placeholder="可选备注" />
            </div>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">API Key</label>
          <div class="setting-tip">用于身份认证，支持 Anthropic 官方 Key、第三方代理 Key 或自建 Key。
            <a class="setting-link" @click="openKeyApply">申请 API Key →</a>
          </div>
          <div class="setting-row">
            <input class="setting-input" :type="showKey ? 'text' : 'password'" v-model="form.key"
              @change="syncFormToJson" placeholder="sk-ant-..." />
            <button class="setting-eye" @click="showKey = !showKey">{{ showKey ? '🙈' : '👁' }}</button>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">Base URL <span class="setting-hint">(可选)</span></label>
          <input class="setting-input" v-model="form.url" @change="syncFormToJson"
            placeholder="https://api.mindcraft.com.cn" />
          <div class="setting-tip">Anthropic 兼容 API 地址，请勿添加 /v1 后缀。留空使用官方默认地址。</div>
        </div>
        <div class="setting-group">
          <label class="setting-label">官网链接 <span class="setting-hint">(可选)</span></label>
          <input class="setting-input" v-model="form.website" placeholder="https://example.com" />
        </div>
        <div class="setting-group">
          <div class="tier-model-header">
            <label class="setting-label">分级模型</label>
          </div>
          <div class="setting-tip" style="margin-bottom:8px">如果供应商原生提供 Claude 系列模型,通常无需配置。仅在需要将请求映射到不同模型名称时填写。</div>
          <div class="tier-model-grid">
            <div class="tier-model-card">
              <label class="tier-model-card-label">Haiku 默认模型</label>
              <input class="tier-model-card-input" v-model="tier.haiku" @change="syncFormToJson"
                placeholder="输入 Haiku 模型名称" />
            </div>
            <div class="tier-model-card">
              <label class="tier-model-card-label">Sonnet 默认模型</label>
              <input class="tier-model-card-input" v-model="tier.sonnet" @change="syncFormToJson"
                placeholder="输入 Sonnet 模型名称" />
            </div>
            <div class="tier-model-card">
              <label class="tier-model-card-label">Opus 默认模型</label>
              <input class="tier-model-card-input" v-model="tier.opus" @change="syncFormToJson"
                placeholder="输入 Opus 模型 ID" />
            </div>
            <div class="tier-model-card">
              <label class="tier-model-card-label">推理模型 (Thinking)</label>
              <input class="tier-model-card-input" v-model="tier.reasoning" @change="syncFormToJson"
                placeholder="输入推理模型名称" />
            </div>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">主模型层级 <span class="setting-hint">(决定 model 字段写入哪个层级的模型)</span></label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="tierKey" @change="syncFormToJson">
              <option value="haiku">Haiku(快速)</option>
              <option value="sonnet">Sonnet(平衡)</option>
              <option value="opus">Opus(强力)</option>
              <option value="reasoning">Reasoning(推理)</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">权限策略</label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="policy" @change="syncFormToJson">
              <option value="ask">默认询问(推荐)</option>
              <option value="allow_all">自动允许(高风险)</option>
              <option value="read_only">只读模式(禁写入/命令)</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
          <div class="setting-tip">控制 Claude 工具调用权限:写文件与执行命令等敏感操作。</div>
        </div>
        <div class="setting-group">
          <label class="setting-label">默认语言</label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="lang" @change="syncFormToJson">
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
        </div>
        <div class="setting-group">
          <label class="setting-label">推理强度 <span class="setting-tip">(控制模型推理强度偏好)</span></label>
          <div class="setting-select-wrap">
            <select class="setting-input setting-select" v-model="effort" @change="syncFormToJson">
              <option value="low">低(更快)</option>
              <option value="medium">中(平衡)</option>
              <option value="high">高(更深思考)</option>
              <option value="max">最大(极限推理)</option>
            </select>
            <span class="setting-select-arrow">▾</span>
          </div>
        </div>
        <div class="setting-group">
          <div class="config-json-header">
            <label class="setting-label">配置 JSON</label>
            <button class="config-json-fmt-btn" @click="formatJson">格式化</button>
          </div>
          <div class="config-json-toggles">
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleHideAttribution"
                @change="handleToggle('hideAttribution', $event.target.checked)" class="config-json-toggle" />
              <span>隐藏 AI 署名</span>
            </label>
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleTeammates"
                @change="handleToggle('teammates', $event.target.checked)" class="config-json-toggle" />
              <span>Teammates 模式</span>
            </label>
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleToolSearch"
                @change="handleToggle('toolSearch', $event.target.checked)" class="config-json-toggle" />
              <span>启用 Tool Search</span>
            </label>
            <label class="config-json-toggle-label">
              <input type="checkbox" :checked="toggleDisableAutoUpgrade"
                @change="handleToggle('disableAutoUpgrade', $event.target.checked)" class="config-json-toggle" />
              <span>禁用自动升级</span>
            </label>
          </div>
          <textarea class="config-json-editor" v-model="jsonText" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="pf-footer">
        <button class="settings-btn cancel" @click="onClose">取消</button>
        <button class="settings-btn primary" @click="onSave">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

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

  tierKey.value = props.selectedTier || 'sonnet'
  policy.value = props.permissionPolicy || 'ask'
  lang.value = props.language || 'zh-CN'
  effort.value = props.effortLevel || 'medium'

  let initial = null
  if (p.config && typeof p.config === 'object') initial = p.config
  else if (props.configJson && typeof props.configJson === 'object') initial = props.configJson

  if (initial) {
    jsonText.value = JSON.stringify(initial, null, 2)
    applyJsonToForm()
  } else if (typeof props.configJson === 'string' && props.configJson) {
    jsonText.value = props.configJson
    applyJsonToForm()
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
  if (policy.value) obj.permissionPolicy = policy.value
  if (lang.value) obj.language = lang.value
  if (effort.value) obj.effortLevel = effort.value
  return JSON.stringify(obj, null, 2)
}

function syncFormToJson() {
  try {
    const parsed = JSON.parse(jsonText.value || '{}')
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
    if (policy.value) parsed.permissionPolicy = policy.value
    else delete parsed.permissionPolicy
    if (lang.value) parsed.language = lang.value
    else delete parsed.language
    if (effort.value) parsed.effortLevel = effort.value
    else delete parsed.effortLevel

    jsonText.value = JSON.stringify(parsed, null, 2)
  } catch (e) { console.warn('[syncFormToJson]', e) }
}

function applyJsonToForm() {
  try {
    const parsed = JSON.parse(jsonText.value || '{}')
    const env = readEnvObject(parsed)

    const k = (env.ANTHROPIC_AUTH_TOKEN || parsed.ANTHROPIC_AUTH_TOKEN || parsed.primaryApiKey || parsed.apiKey || '').toString()
    const u = (env.ANTHROPIC_BASE_URL || parsed.ANTHROPIC_BASE_URL || parsed.baseURL || parsed.apiBaseUrl || '').toString()
    if (k) form.key = k
    if (u) form.url = u

    const t = (parsed.model || '').toString()
    if (['haiku', 'sonnet', 'opus', 'reasoning'].includes(t)) tierKey.value = t

    const tm = {
      haiku: (env.ANTHROPIC_DEFAULT_HAIKU_MODEL || parsed.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').toString().trim(),
      sonnet: (env.ANTHROPIC_DEFAULT_SONNET_MODEL || parsed.ANTHROPIC_DEFAULT_SONNET_MODEL || '').toString().trim(),
      opus: (env.ANTHROPIC_DEFAULT_OPUS_MODEL || parsed.ANTHROPIC_DEFAULT_OPUS_MODEL || '').toString().trim(),
      reasoning: (env.ANTHROPIC_REASONING_MODEL || parsed.ANTHROPIC_REASONING_MODEL || '').toString().trim(),
    }
    if (tm.haiku) tier.haiku = tm.haiku
    if (tm.sonnet) tier.sonnet = tm.sonnet
    if (tm.opus) tier.opus = tm.opus
    if (tm.reasoning) tier.reasoning = tm.reasoning

    const po = (parsed.permissionPolicy || '').toString()
    if (['ask', 'allow_all', 'read_only'].includes(po)) policy.value = po
    const la = (parsed.language || '').toString()
    if (['zh-CN', 'en-US'].includes(la)) lang.value = la
    const ef = (parsed.effortLevel || '').toString()
    if (['low', 'medium', 'high', 'max'].includes(ef)) effort.value = ef
  } catch (e) { console.warn('[applyJsonToForm]', e) }
}

function formatJson() {
  try {
    const parsed = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(parsed, null, 2)
    applyJsonToForm()
  } catch (_) {
    ElMessage.error('JSON 格式错误,请检查后重试')
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
    const config = JSON.parse(jsonText.value || '{}')
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
  } catch (e) { console.warn('[handleToggle]', e) }
}

function isOfficialKey(key) {
  if (!key) return false
  const k = key.trim().toLowerCase()
  return k.startsWith('sk-ant-') || k.startsWith('sk-sy-')
}

function onSave() {
  applyJsonToForm()
  const keyTrim = form.key.trim()
  const urlTrim = form.url.trim()
  const nameTrim = form.name.trim()
  const isOfficial = keyTrim ? isOfficialKey(keyTrim) : false

  if (!keyTrim) {
    ElMessage.error('请设置 API Key')
    return
  }
  if (!isOfficial) {
    if (!nameTrim) {
      ElMessage.error('请设置名称')
      return
    }
    if (!urlTrim) {
      ElMessage.error('请设置 Base URL')
      return
    }
  }

  let configObj = null
  try {
    configObj = JSON.parse(jsonText.value || '{}')
  } catch (e) {
    ElMessage.error('配置 JSON 格式错误: ' + (e?.message || ''))
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
