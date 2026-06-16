<template>
  <div v-if="visible" class="model-cmd-overlay" @click.self="cancel">
    <div class="model-cmd-palette" tabindex="0" ref="panelRef" @keydown="onKeydown">
      <div class="model-cmd-header">
        <span>{{ $t('agent.switchModel') }}</span>
        <span class="model-cmd-hint">{{ $t('agent.modelNav') }}</span>
      </div>
      <div class="model-cmd-list">
        <div
          v-for="(item, idx) in modelOptions"
          :key="item.id"
          :ref="el => (rowRefs[idx] = el)"
          class="model-cmd-row"
          :class="{ active: item.id === hoveredId }"
          @click="confirmSelection(item)"
          @mouseenter="hoveredId = item.id"
        >
          <div class="model-cmd-row-left">
            <span class="model-cmd-name">{{ item.label }}</span>
            <span class="model-cmd-model">{{ item.id }}</span>
          </div>
          <div class="model-cmd-row-right">
            <span class="model-cmd-desc">{{ item.desc }}</span>
            <svg
              v-if="item.id === initialModel"
              class="model-cmd-check"
              width="14" height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="model-cmd-effort">
        <span class="model-effort-label">{{ $t('agent.thinkingEffort') }}</span>
        <div class="effort-dots">
          <button
            v-for="(e, i) in efforts"
            :key="e.key"
            class="effort-dot"
            :class="{ active: i <= effortIndex }"
            :title="e.label"
            @click="effortIndex = i"
          ></button>
          <span class="effort-dot-label">{{ efforts[effortIndex]?.label || '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { normalizeCodexReasoningEffort } from '../utils/providerToml.mjs'

const visible = ref(false)
const panelRef = ref(null)
const rowRefs = ref([])
const effortIndex = ref(2)

// 硬编码模型列表，仅包含支持 Responses API 的模型
// gpt-5.4 默认排第一
const modelOptions = [
  { id: 'gpt-5.4', label: 'GPT-5.4', desc: '推荐' },
  { id: 'gpt-5.5', label: 'GPT-5.5', desc: '最新' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', desc: '' },
  { id: 'gpt-5.2', label: 'GPT-5.2', desc: '稳定' },
]

const efforts = [
  { key: 'minimal', label: 'Minimal' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'xhigh', label: 'XHigh' },
]

const hoveredId = ref('')
const initialModel = ref('')
let resolveOpen = null

function close() { visible.value = false }
function cancel() {
  resolveOpen?.(null)
  resolveOpen = null
  close()
}

async function open() {
  const [currentModel, currentEffort] = await Promise.all([
    window.electronAPI?.codexGetModel?.() || Promise.resolve(''),
    window.electronAPI?.codexGetReasoningEffort?.() || Promise.resolve(''),
  ])

  const model = (currentModel || '').trim()
  // 匹配当前模型，若不在列表里则高亮第一个
  const matched = modelOptions.find(m => m.id === model)
  hoveredId.value = matched ? model : modelOptions[0].id
  initialModel.value = model || ''

  const effortStr = normalizeCodexReasoningEffort(currentEffort) || 'medium'
  const idx = efforts.findIndex(e => e.key === effortStr)
  effortIndex.value = idx >= 0 ? idx : 2

  visible.value = true
  await nextTick()
  panelRef.value?.focus?.()
  focusHoveredRow()

  return new Promise((resolve) => { resolveOpen = resolve })
}

function focusHoveredRow() {
  const idx = modelOptions.findIndex(m => m.id === hoveredId.value)
  if (idx >= 0 && rowRefs.value[idx]) {
    rowRefs.value[idx]?.focus?.()
  }
}

async function confirmSelection(item) {
  const effort = efforts[effortIndex.value].key
  await window.electronAPI?.codexSetModel?.(item.id)
  await window.electronAPI?.codexSetReasoningEffort?.(effort)
  resolveOpen?.({ model: item.id, effort, label: `${item.label} (${efforts[effortIndex.value].label})` })
  resolveOpen = null
  close()
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); cancel(); return }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const idx = modelOptions.findIndex(m => m.id === hoveredId.value)
    if (idx < modelOptions.length - 1) {
      hoveredId.value = modelOptions[idx + 1].id
      focusHoveredRow()
    }
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const idx = modelOptions.findIndex(m => m.id === hoveredId.value)
    if (idx > 0) {
      hoveredId.value = modelOptions[idx - 1].id
      focusHoveredRow()
    }
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const item = modelOptions.find(m => m.id === hoveredId.value)
    if (item) confirmSelection(item)
  }
}

defineExpose({ open, close })
</script>

<style scoped>
.model-cmd-overlay {
  position: fixed; inset: 0;
  background: var(--cc-overlay-bg);
  z-index: 220;
  display: flex; align-items: flex-end; justify-content: center;
  padding-bottom: 18vh;
}
.model-cmd-palette {
  width: 440px;
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 8px 32px var(--cc-shadow);
  outline: none;
}
.model-cmd-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--cc-border);
  font-size: 12px; font-weight: 600; color: var(--cc-text-muted);
}
.model-cmd-hint { font-size: 10px; color: var(--cc-text-dim); font-weight: 400; }

.model-cmd-list {
  padding: 6px; display: flex; flex-direction: column; gap: 2px;
}
.model-cmd-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 7px; cursor: pointer;
  transition: background 0.1s; gap: 12px; outline: none;
}
.model-cmd-row:hover,
.model-cmd-row.active,
.model-cmd-row:focus-visible { background: var(--cc-bg-hover); }
.model-cmd-row-left { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.model-cmd-name {
  font-size: 13px; color: var(--cc-text); font-weight: 600;
  white-space: nowrap;
}
.model-cmd-model {
  font-size: 11px; color: var(--cc-text-dim);
  font-family: Consolas, 'Courier New', monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.model-cmd-row-right {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.model-cmd-desc {
  font-size: 10px; color: var(--cc-text-dim); opacity: 0.7;
  white-space: nowrap;
}
.model-cmd-check { color: var(--cc-success); flex-shrink: 0; }

/* 推理强度 */
.model-cmd-effort {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 8px 14px 12px; border-top: 1px solid var(--cc-border);
}
.model-effort-label {
  font-size: 11px; color: var(--cc-text-dim); font-weight: 500;
  margin-right: 4px;
}
.effort-dots {
  display: flex; align-items: center; gap: 0;
  background: var(--cc-border-strong); border-radius: 10px; padding: 3px 4px;
}
.effort-dot {
  width: 14px; height: 14px; border-radius: 50%; border: none;
  background: var(--cc-icon-muted); cursor: pointer; padding: 0;
  margin: 0 2px; transition: background 0.15s;
}
.effort-dot.active { background: var(--cc-primary); }
.effort-dot:hover:not(.active) { background: var(--cc-text-dim); }
.effort-dot-label { font-size: 11px; color: var(--cc-text-dim); margin-left: 6px; }
</style>
