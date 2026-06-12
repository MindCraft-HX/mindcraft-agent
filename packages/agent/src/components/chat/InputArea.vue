<template>
  <div
    class="input-area"
    :class="{ dragging: dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDropFiles"
  >
    <!-- 图片附件栏（复用项目模式：粘贴/拖拽即显示，支持多图） -->
    <ImageAttachmentBar
      :images="pendingImages"
      @preview="$emit('preview-image', $event)"
      @remove="removeAt"
    />

    <!-- 输入框 -->
    <div class="input-row">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="input-textarea"
        :placeholder="placeholder"
        :rows="1"
        @input="autoResize"
        @keydown="onKeydown"
        @paste="onPasteFiltered"
      ></textarea>
    </div>

    <!-- 底部控制栏 -->
    <div class="control-row">
      <!-- 左侧：接口 / 模型 -->
      <div class="control-left">
        <select v-model="localProvider" class="ctrl-select" title="API 接口类型">
          <option value="claude">Anthropic 接口</option>
          <option value="codex">OpenAI 接口</option>
        </select>

        <select v-model="localModel" class="ctrl-select ctrl-model-select" title="模型">
          <option v-if="!modelOptions.length" value="" disabled>未配置模型</option>
          <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <!-- 右侧：思考档位 + 搜索 + 发送 -->
      <div class="control-right">
        <!-- 思考档位：关/低/中/高（Claude → budget，OpenAI → reasoning_effort） -->
        <div class="think-seg" title="深度思考强度">
          <span class="think-seg-label">思考</span>
          <button
            v-for="lv in thinkingLevels" :key="lv.value"
            class="think-seg-btn"
            :class="{ active: localThinkingLevel === lv.value, off: lv.value === 'off' && localThinkingLevel === 'off' }"
            @click="localThinkingLevel = lv.value"
          >{{ lv.label }}</button>
        </div>

        <!-- 联网搜索 -->
        <button
          class="ctrl-toggle"
          :class="{ active: localWebSearch }"
          @click="localWebSearch = !localWebSearch"
          title="联网搜索"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="6"/>
            <ellipse cx="8" cy="8" rx="3" ry="6"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          <span>搜索</span>
        </button>

        <!-- 发送 / 停止 -->
        <button
          v-if="!isStreaming"
          class="ctrl-send-btn"
          :disabled="!canSend"
          @click="doSend"
          title="发送 (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 2l13 6-13 6 3-6-3-6z"/>
          </svg>
        </button>
        <button
          v-else
          class="ctrl-stop-btn"
          @click="$emit('stop')"
          title="停止生成"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 拖拽提示遮罩 -->
    <div v-if="dragging" class="drop-overlay">松开以添加图片</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import ImageAttachmentBar from '../agentCommon/components/ImageAttachmentBar.vue'
import { useImageAttachments } from '../agentCommon/composables/useImageAttachments.js'

const props = defineProps({
  provider: { type: String, default: 'claude' },
  model: { type: String, default: '' },
  thinkingLevel: { type: String, default: 'off' },
  webSearchEnabled: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:provider', 'update:model', 'update:thinkingLevel', 'update:webSearchEnabled',
  'send', 'stop', 'preview-image',
])

const textareaRef = ref(null)
const inputText = ref('')

// 图片附件（复用 agentCommon：粘贴/拖拽，多图，上限 10）
const {
  pendingImages, dragging, addImages, removeAt, onPaste, dispose,
} = useImageAttachments({ getActiveTab: () => null })

const thinkingLevels = [
  { value: 'off', label: '关' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

// 本地状态（双向绑定到父组件）
const localProvider = ref(props.provider)
const localModel = ref(props.model)
const localThinkingLevel = ref(props.thinkingLevel)
const localWebSearch = ref(props.webSearchEnabled)

watch(localProvider, v => { emit('update:provider', v); refreshModelOptions(true) })
watch(localModel, v => emit('update:model', v))
watch(localThinkingLevel, v => emit('update:thinkingLevel', v))
watch(localWebSearch, v => emit('update:webSearchEnabled', v))

// 父组件同步回来（切换会话时）
watch(() => props.provider, v => { if (v !== localProvider.value) { localProvider.value = v } })
watch(() => props.model, v => { if (v !== localModel.value) localModel.value = v })
watch(() => props.thinkingLevel, v => { localThinkingLevel.value = v })
watch(() => props.webSearchEnabled, v => { localWebSearch.value = v })

// ── 模型选项：从已配置的 Provider 读取 ──
const claudeProvidersState = ref(null)
const codexProvidersState = ref(null)
const modelOptions = ref([])

const CLAUDE_TIER_LABELS = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', reasoning: 'Reasoning' }
const CLAUDE_FALLBACK_MODELS = [
  { label: 'Sonnet · claude-sonnet-4-20250514', value: 'claude-sonnet-4-20250514' },
  { label: 'Opus · claude-opus-4-20250514', value: 'claude-opus-4-20250514' },
  { label: 'Haiku · claude-3-5-haiku-20241022', value: 'claude-3-5-haiku-20241022' },
]
const CODEX_FALLBACK_MODELS = [
  { label: 'gpt-4o', value: 'gpt-4o' },
  { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
  { label: 'o3-mini', value: 'o3-mini' },
]

function buildClaudeOptions() {
  const state = claudeProvidersState.value
  const providers = Array.isArray(state?.providers) ? state.providers : []
  const activeIdx = Number.isInteger(state?.activeIdx) ? state.activeIdx : -1
  const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : providers[0]
  const tierModels = active?.tierModels || {}
  const opts = []
  const seen = new Set()
  for (const tier of ['haiku', 'sonnet', 'opus', 'reasoning']) {
    const m = String(tierModels[tier] || '').trim()
    if (m && !seen.has(m)) {
      seen.add(m)
      opts.push({ label: `${CLAUDE_TIER_LABELS[tier]} · ${m}`, value: m, tier })
    }
  }
  return opts.length ? opts : CLAUDE_FALLBACK_MODELS
}

function buildCodexOptions() {
  const state = codexProvidersState.value
  const providers = Array.isArray(state?.providers) ? state.providers : []
  const opts = []
  const seen = new Set()
  for (const p of providers) {
    const m = String(p?.model || '').trim()
    if (m && !seen.has(m)) {
      seen.add(m)
      opts.push({ label: p.name ? `${m}（${p.name}）` : m, value: m })
    }
  }
  return opts.length ? opts : CODEX_FALLBACK_MODELS
}

function refreshModelOptions(resetModel = false) {
  modelOptions.value = localProvider.value === 'claude' ? buildClaudeOptions() : buildCodexOptions()
  const values = modelOptions.value.map(o => o.value)
  if (resetModel || !localModel.value || !values.includes(localModel.value)) {
    localModel.value = defaultModel() || values[0] || ''
  }
}

function defaultModel() {
  if (localProvider.value === 'claude') {
    const state = claudeProvidersState.value
    const providers = Array.isArray(state?.providers) ? state.providers : []
    const activeIdx = Number.isInteger(state?.activeIdx) ? state.activeIdx : -1
    const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : providers[0]
    const tier = active?.selectedTier || state?.selectedTier || 'sonnet'
    return String(active?.tierModels?.[tier] || '').trim()
  }
  const state = codexProvidersState.value
  const providers = Array.isArray(state?.providers) ? state.providers : []
  const activeIdx = Number.isInteger(state?.activeIdx) ? state.activeIdx : -1
  const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : providers[0]
  return String(active?.model || '').trim()
}

onMounted(async () => {
  try {
    const apiObj = window.electronAPI || {}
    const [claudeP, codexP] = await Promise.all([
      apiObj.claudeGetProviders?.().catch(() => null),
      apiObj.codexGetProviders?.().catch(() => null),
    ])
    claudeProvidersState.value = claudeP || null
    codexProvidersState.value = codexP || null
  } catch (_) {}
  refreshModelOptions(!props.model)
})

onUnmounted(() => dispose?.())

const placeholder = computed(() => '输入问题，Enter 发送，Shift+Enter 换行，可直接粘贴图片')

const canSend = computed(() => {
  return (inputText.value.trim() || pendingImages.value.length > 0) && !props.isStreaming
})

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 150) + 'px'
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (canSend.value) doSend()
  }
}

/** 粘贴：仅接收图片（文本走默认行为） */
function onPasteFiltered(e) {
  onPaste(e)
}

/** 拖拽：过滤出图片文件 */
function onDropFiles(e) {
  dragging.value = false
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
  if (files.length) addImages(files)
}

function doSend() {
  if (!canSend.value) return
  const text = inputText.value.trim()
  const images = pendingImages.value
    .filter(img => img.isImage && img.dataUrl)
    .map(img => ({ dataUrl: img.dataUrl, mediaType: img.mediaType || 'image/png' }))
  if (!text && !images.length) return
  emit('send', text, images)
  inputText.value = ''
  pendingImages.value = []
  nextTick(() => {
    const el = textareaRef.value
    if (el) { el.style.height = 'auto' }
  })
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<style lang="scss" scoped>
.input-area {
  position: relative;
  border-top: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  padding: 8px 14px 10px;
}

.input-row {
  margin: 6px 0;
}

.input-textarea {
  width: 100%;
  resize: none;
  border: 1px solid var(--cc-border, #2a2a2a);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text, #e0e0e0);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;

  &:focus {
    border-color: var(--cc-primary, #c6613f);
  }

  &::placeholder {
    color: var(--cc-text-dim, #666);
  }
}

.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.control-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrl-select {
  height: 28px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text, #e0e0e0);
  font-size: 11px;
  cursor: pointer;
  outline: none;
  max-width: 240px;

  &:hover { border-color: var(--cc-border-strong, #444); }
  &:focus { border-color: var(--cc-primary, #c6613f); }
}

.ctrl-model-select {
  text-overflow: ellipsis;
}

/* 思考档位（关/低/中/高） */
.think-seg {
  display: flex;
  align-items: center;
  gap: 0;
  height: 28px;
  border: 1px solid var(--cc-border, #2a2a2a);
  border-radius: 6px;
  background: var(--cc-bg-elevated, #252525);
  overflow: hidden;
}

.think-seg-label {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  padding: 0 8px;
  border-right: 1px solid var(--cc-border, #2a2a2a);
  user-select: none;
}

.think-seg-btn {
  height: 100%;
  padding: 0 9px;
  border: none;
  background: transparent;
  color: var(--cc-text-dim, #888);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;

  & + & {
    border-left: 1px solid var(--cc-border, #2a2a2a);
  }

  &:hover:not(.active) {
    color: var(--cc-text, #e0e0e0);
    background: var(--cc-bg-hover, rgba(255,255,255,0.05));
  }

  &.active {
    background: var(--cc-primary, #c6613f);
    color: #fff;
    font-weight: 600;
  }

  /* "关"档位激活时用中性色，避免误以为开启了功能 */
  &.active.off {
    background: var(--cc-border-strong, #444);
    color: var(--cc-text-muted, #bbb);
  }
}

.ctrl-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text-dim, #888);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    border-color: var(--cc-primary, #c6613f);
    color: var(--cc-text-muted, #bbb);
  }

  &.active {
    border-color: var(--cc-primary, #c6613f);
    background: var(--cc-primary, #c6613f);
    color: #fff;
    font-weight: 600;
  }
}

.ctrl-send-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--cc-primary, #c6613f);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    opacity: 0.85;
  }
}

.ctrl-stop-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--cc-primary, #c6613f);
  background: transparent;
  color: var(--cc-primary, #c6613f);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  animation: stop-pulse 1.6s ease-in-out infinite;

  &:hover {
    background: var(--cc-primary-bg, rgba(198, 97, 63, 0.15));
  }
}

@keyframes stop-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(198, 97, 63, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(198, 97, 63, 0); }
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 13px;
  border: 2px dashed var(--cc-primary, #c6613f);
  border-radius: 8px;
  pointer-events: none;
  z-index: 5;
}
</style>
