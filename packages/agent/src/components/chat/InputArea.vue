<template>
  <div class="input-area">
    <!-- 图片附件栏 -->
    <div v-if="images.length" class="image-bar">
      <div v-for="(img, i) in images" :key="i" class="image-bar-item">
        <img :src="imgPreview(img)" alt="attachment" />
        <button class="image-remove" @click="removeImage(i)" title="移除">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
          </svg>
        </button>
      </div>
    </div>

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
        @paste="onPaste"
      ></textarea>
    </div>

    <!-- 底部控制栏 -->
    <div class="control-row">
      <!-- 左侧：Provider / 模型 -->
      <div class="control-left">
        <select v-model="localProvider" class="ctrl-select" @change="onProviderChange">
          <option value="claude">Claude</option>
          <option value="codex">CodeX</option>
        </select>

        <input
          v-model="localModel"
          class="ctrl-model-input"
          :placeholder="modelPlaceholder"
          :list="'model-suggestions-' + localProvider"
          @focus="onModelFocus"
        />
        <datalist :id="'model-suggestions-' + localProvider">
          <option v-for="m in modelSuggestions" :key="m" :value="m"/>
        </datalist>
      </div>

      <!-- 右侧：控制开关 + 发送 -->
      <div class="control-right">
        <!-- 思考开关（Claude 专用） -->
        <button
          v-if="localProvider === 'claude'"
          class="ctrl-toggle"
          :class="{ active: localThinking }"
          @click="localThinking = !localThinking"
          title="深度思考"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="5"/>
            <path d="M8 4v4l3 2"/>
          </svg>
          <span>思考</span>
        </button>

        <!-- 思考预算（Claude 开启思考时显示） -->
        <select v-if="localProvider === 'claude' && localThinking" v-model="localThinkingBudget" class="ctrl-select ctrl-select-sm">
          <option :value="2000">2k</option>
          <option :value="4000">4k</option>
          <option :value="8000">8k</option>
          <option :value="16000">16k</option>
        </select>

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

        <!-- 图片上传 -->
        <button class="ctrl-icon-btn" @click="triggerImageUpload" title="上传图片">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
            <circle cx="5" cy="6" r="1"/>
            <path d="M1.5 11l3-3 2 2 3-3 4.5 4.5"/>
          </svg>
        </button>
        <input ref="fileInputRef" type="file" accept="image/*" multiple hidden @change="onFileChange" />

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
          title="停止"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  provider: { type: String, default: 'claude' },
  model: { type: String, default: '' },
  thinkingEnabled: { type: Boolean, default: false },
  thinkingBudget: { type: Number, default: 4000 },
  webSearchEnabled: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:provider', 'update:model',
  'update:thinkingEnabled', 'update:thinkingBudget',
  'update:webSearchEnabled',
  'send', 'stop',
])

const textareaRef = ref(null)
const fileInputRef = ref(null)
const inputText = ref('')
const images = reactive([])

// 本地状态（双向绑定到父组件）
const localProvider = ref(props.provider)
const localModel = ref(props.model)
const localThinking = ref(props.thinkingEnabled)
const localThinkingBudget = ref(props.thinkingBudget)
const localWebSearch = ref(props.webSearchEnabled)

watch(localProvider, v => emit('update:provider', v))
watch(localModel, v => emit('update:model', v))
watch(localThinking, v => emit('update:thinkingEnabled', v))
watch(localThinkingBudget, v => emit('update:thinkingBudget', v))
watch(localWebSearch, v => emit('update:webSearchEnabled', v))

// 同步回父组件
watch(() => props.provider, v => { localProvider.value = v })
watch(() => props.model, v => { localModel.value = v })
watch(() => props.thinkingEnabled, v => { localThinking.value = v })
watch(() => props.thinkingBudget, v => { localThinkingBudget.value = v })
watch(() => props.webSearchEnabled, v => { localWebSearch.value = v })

// provider 变更时尝试从配置读取模型
const cachedProviders = ref({ claude: null, codex: null })

onMounted(async () => {
  try {
    const api = window.electronAPI || {}
    const claudeP = await api.claudeGetProviders?.()
    if (claudeP) cachedProviders.value.claude = claudeP
    const codexP = await api.codexGetProviders?.()
    if (codexP) cachedProviders.value.codex = codexP
  } catch (_) {}

  // 初始化模型
  if (!localModel.value) {
    tryLoadModel()
  }
})

function tryLoadModel() {
  const p = localProvider.value
  if (p === 'claude') {
    const prov = cachedProviders.value.claude
    if (prov?.providers?.length && prov.activeIdx >= 0) {
      const active = prov.providers[prov.activeIdx]
      const tier = active?.selectedTier || prov?.selectedTier || 'sonnet'
      localModel.value = active?.tierModels?.[tier] || prov?.tierModels?.[tier] || ''
    }
  } else {
    const prov = cachedProviders.value.codex
    if (prov?.providers?.length && prov.activeIdx >= 0) {
      localModel.value = prov.providers[prov.activeIdx]?.model || ''
    }
  }
}

function onProviderChange() {
  tryLoadModel()
}

function onModelFocus() {
  if (!localModel.value) tryLoadModel()
}

const modelSuggestions = computed(() => {
  if (localProvider.value === 'claude') {
    return [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-20250514',
      'claude-3-5-sonnet-20241022',
    ]
  }
  return [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'o1',
    'o3-mini',
  ]
})

const placeholder = computed(() => {
  return localProvider.value === 'claude' ? '向 Claude 提问...' : '向 CodeX 提问...'
})

const modelPlaceholder = computed(() => {
  return localProvider.value === 'claude' ? '模型名称' : '模型名称'
})

const canSend = computed(() => {
  return (inputText.value.trim() || images.length > 0) && !props.isStreaming
})

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 150) + 'px'
}

function onKeydown(e) {
  // Enter 发送、Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (canSend.value) doSend()
  }
}

function doSend() {
  if (!canSend.value) return
  const text = inputText.value.trim()
  if (!text && !images.length) return
  emit('send', text, [...images])
  inputText.value = ''
  images.length = 0
  nextTick(() => {
    const el = textareaRef.value
    if (el) { el.style.height = 'auto' }
  })
}

function imgPreview(img) {
  if (img.url) return img.url
  if (img.base64 || img.data) {
    return `data:${img.mediaType || 'image/png'};base64,${img.base64 || img.data}`
  }
  return ''
}

function removeImage(i) {
  images.splice(i, 1)
}

function addImage(file) {
  if (!file || !file.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = () => {
    const base64 = reader.result.split(',')[1]
    images.push({
      file,
      base64,
      mediaType: file.type,
      name: file.name,
    })
  }
  reader.readAsDataURL(file)
}

function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      addImage(item.getAsFile())
    }
  }
}

function triggerImageUpload() {
  fileInputRef.value?.click()
}

function onFileChange(e) {
  const files = e.target?.files
  if (!files) return
  for (const file of files) addImage(file)
  e.target.value = ''
}

// 暴露方法给父组件
defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<style lang="scss" scoped>
.input-area {
  border-top: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  padding: 8px 14px 10px;
}

.image-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.image-bar-item {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--cc-border, #2a2a2a);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.6);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;

  .image-bar-item:hover & {
    opacity: 1;
  }
}

.input-row {
  margin-bottom: 6px;
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
}

.control-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-right {
  display: flex;
  align-items: center;
  gap: 6px;
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

  &:focus {
    border-color: var(--cc-primary, #c6613f);
  }
}

.ctrl-select-sm {
  width: 48px;
}

.ctrl-model-input {
  width: 130px;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text, #e0e0e0);
  font-size: 11px;
  outline: none;

  &:focus {
    border-color: var(--cc-primary, #c6613f);
  }

  &::placeholder {
    color: var(--cc-text-dim, #666);
  }
}

.ctrl-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
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
    background: var(--cc-primary-bg, rgba(198, 97, 63, 0.15));
    color: var(--cc-primary, #c6613f);
  }
}

.ctrl-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-elevated, #252525);
  color: var(--cc-text-dim, #888);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    border-color: var(--cc-primary, #c6613f);
    color: var(--cc-text, #e0e0e0);
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

  &:hover {
    background: var(--cc-primary-bg, rgba(198, 97, 63, 0.15));
  }
}
</style>
