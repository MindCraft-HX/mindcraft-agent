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
        <select v-model="localProvider" class="ctrl-select" :title="$t('agent.apiType')">
          <option value="claude">{{ $t('agent.anthropicApi') }}</option>
          <option value="codex">{{ $t('agent.openaiApi') }}</option>
        </select>

        <!-- 模型选择（自定义下拉） -->
        <div class="model-picker" ref="modelPickerRef">
          <button class="model-trigger" :class="{ open: modelDropdownOpen }" @click="modelDropdownOpen = !modelDropdownOpen" :title="$t('agent.selectModel')">
            <span class="model-trigger-label">{{ selectedModelLabel || $t('agent.selectModel') }}</span>
            <svg class="model-trigger-chevron" :class="{ flipped: modelDropdownOpen }" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <polyline points="2 3.5 5 6.5 8 3.5"/>
            </svg>
          </button>
          <div v-if="modelDropdownOpen" class="model-popover" :style="popoverStyle" @click.stop>
            <div class="model-popover-scroll">
              <div
                v-for="m in modelOptions"
                :key="m.value"
                class="model-option"
                :class="{ selected: m.value === localModel }"
                @click="selectModel(m)"
              >
                <span class="model-option-tier">{{ m.tier ? tierLabel(m.tier) : m.label.split(' · ')[0] }}</span>
                <span class="model-option-id">{{ m.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：思考档位 + 搜索 + 发送 -->
      <div class="control-right">
        <!-- 思考档位：4 点指示器（关/低/中/高，匹配项目面板 effort 样式） -->
        <div class="think-dots" :title="$t('chat.thinking')">
          <span class="think-dots-label">{{ $t('chat.thinkShort') }}</span>
          <div class="think-dots-group">
            <button
              v-for="(lv, idx) in thinkingLevels" :key="lv.value"
              class="think-dot"
              :class="{ filled: localThinkingLevel !== 'off' && idx < levelIndex(localThinkingLevel), active: localThinkingLevel === lv.value }"
              :title="lv.label"
              @click="onThinkingDotClick(lv)"
            ></button>
          </div>
        </div>

        <!-- 联网搜索 -->
        <button
          class="ctrl-toggle"
          :class="{ active: localWebSearch }"
          @click="localWebSearch = !localWebSearch"
          :title="$t('chat.webSearch')"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="6"/>
            <ellipse cx="8" cy="8" rx="3" ry="6"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
          </svg>
          <span>{{ $t('chat.search') }}</span>
        </button>

        <!-- 发送 / 停止 -->
        <button
          v-if="!isStreaming"
          class="ctrl-send-btn"
          :disabled="!canSend"
          @click="doSend"
          :title="$t('chat.send')"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 2l13 6-13 6 3-6-3-6z"/>
          </svg>
        </button>
        <button
          v-else
          class="ctrl-stop-btn"
          @click="$emit('stop')"
          :title="$t('chat.stop')"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 拖拽提示遮罩 -->
    <div v-if="dragging" class="drop-overlay">{{ $t('chat.dropImage') }}</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import ImageAttachmentBar from '../agentCommon/components/ImageAttachmentBar.vue'
import { useImageAttachments } from '../agentCommon/composables/useImageAttachments.js'

const { t } = useI18n()

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
const modelPickerRef = ref(null)

// ── 模型自定义下拉 ──
const modelDropdownOpen = ref(false)
const selectedModelLabel = computed(() => {
  const cur = modelOptions.value.find(m => m.value === localModel.value)
  return cur?.label || localModel.value || ''
})
function selectModel(m) {
  localModel.value = m.value
  modelDropdownOpen.value = false
}
const popoverStyle = computed(() => {
  const el = modelPickerRef.value
  if (!el) return { top: '0px', left: '0px' }
  const rect = el.getBoundingClientRect()
  const minH = 250 // 预估 popover 最小高度
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const style = { left: rect.left + 'px', minWidth: Math.max(rect.width, 220) + 'px' }
  // 下方空间不足时向上弹出
  if (spaceBelow < minH && spaceAbove > spaceBelow) {
    style.bottom = (window.innerHeight - rect.top + 4) + 'px'
  } else {
    style.top = (rect.bottom + 4) + 'px'
  }
  return style
})
function closeModelDropdown(e) {
  if (modelDropdownOpen.value && modelPickerRef.value && !modelPickerRef.value.contains(e.target)) {
    modelDropdownOpen.value = false
  }
}
// 点击外部关闭
watch(modelDropdownOpen, (open) => {
  if (open) document.addEventListener('pointerdown', closeModelDropdown, true)
  else document.removeEventListener('pointerdown', closeModelDropdown, true)
})

// 图片附件（复用 agentCommon：粘贴/拖拽，多图，上限 10）
const {
  pendingImages, dragging, addImages, removeAt, onPaste, dispose,
} = useImageAttachments({ getActiveTab: () => null })

const thinkingLevels = computed(() => [
  { value: 'low', label: t('chat.low') },
  { value: 'medium', label: t('chat.medium') },
  { value: 'high', label: t('chat.high') },
])

function levelIndex(level) {
  if (!level || level === 'off') return 0
  const idx = thinkingLevels.value.findIndex(l => l.value === level)
  return idx >= 0 ? idx + 1 : 0
}

function onThinkingDotClick(lv) {
  // 点击已激活档位 → 关闭；否则切到该档位
  localThinkingLevel.value = localThinkingLevel.value === lv.value ? 'off' : lv.value
}

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
watch(() => props.model, v => {
  if (v && v !== localModel.value) localModel.value = v
  // props 空值时不覆盖——等 refreshModelOptions 选出默认
  if (!v && modelOptions.value.length && !localModel.value) localModel.value = modelOptions.value[0].value
})
watch(() => props.thinkingLevel, v => { localThinkingLevel.value = v })
watch(() => props.webSearchEnabled, v => { localWebSearch.value = v })

// ── 模型选项：从已配置的 Provider 读取 ──
const claudeProvidersState = ref(null)
const codexProvidersState = ref(null)
const modelOptions = ref([])

const CLAUDE_TIER_LABELS = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', reasoning: 'Reasoning' }
function tierLabel(tier) { return CLAUDE_TIER_LABELS[tier] || tier }
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
    // 优先选用当前 provider 的默认模型，失败则用列表第一项，再失败用 props.model
    localModel.value = defaultModel() || values[0] || props.model || ''
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

const placeholder = computed(() => t('chat.placeholder'))

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

/* ── 模型自定义下拉 ── */
.model-picker {
  position: relative;
}

.model-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text, #e0e0e0);
  font-size: 11px;
  cursor: pointer;
  outline: none;
  white-space: nowrap;
  transition: border-color 0.15s;

  &:hover, &.open {
    border-color: var(--cc-primary, #c6613f);
  }
}

.model-trigger-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-trigger-chevron {
  flex-shrink: 0;
  transition: transform 0.15s;
  opacity: 0.5;
  &.flipped { transform: rotate(180deg); }
}

.model-popover {
  position: fixed;
  z-index: 10000;
  background: var(--cc-bg-elevated, #252525);
  border: 1px solid var(--cc-border-strong, #3a3a3a);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  overflow: hidden;
}

.model-popover-scroll {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: var(--cc-bg-hover, rgba(255,255,255,0.06));
  }
  &.selected {
    background: var(--cc-primary-bg, rgba(198, 97, 63, 0.12));
    .model-option-tier { color: var(--cc-primary, #c6613f); font-weight: 600; }
  }
}

.model-option-tier {
  font-size: 12px;
  font-weight: 500;
  color: var(--cc-text-muted, #bbb);
}

.model-option-id {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
}

/* 思考档位圆点（匹配项目 effort 4 点样式） */
.think-dots {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
}

.think-dots-label {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  user-select: none;
}

.think-dots-group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 5px 8px;
  background: var(--cc-bg-elevated, #252525);
  border: 1px solid var(--cc-border, #2a2a2a);
  border-radius: 16px;
}

.think-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--cc-text-dim, #555);
  cursor: pointer;
  padding: 0;
  background: transparent;
  transition: all 0.15s;

  &:hover {
    transform: scale(1.18);
    border-color: var(--cc-primary, #c6613f);
  }

  /* 低：浅橙 */
  &:nth-child(1).filled {
    background: #e8a87c;
    border-color: #e8a87c;
  }
  /* 中：棕色 */
  &:nth-child(2).filled {
    background: #d47a5a;
    border-color: #d47a5a;
  }
  /* 高：深棕 */
  &:nth-child(3).filled {
    background: var(--cc-primary, #c6613f);
    border-color: var(--cc-primary, #c6613f);
  }

  &.active {
    box-shadow: 0 0 0 2px var(--cc-bg, #1a1a1a), 0 0 0 4px var(--cc-primary, #c6613f);
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
