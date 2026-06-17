<template>
  <div v-if="visible" class="model-cmd-overlay" @click.self="cancel">
    <div class="model-cmd-palette" tabindex="0" ref="panelRef" @keydown="onKeydown">
      <div class="model-cmd-header">
        <span>{{ $t('agent.selectModel') }}</span>
        <span class="model-cmd-hint">{{ $t('agent.modelNav') }}</span>
      </div>
      <div class="model-cmd-list">
        <div
          v-for="(item, idx) in tierItems"
          :key="item.key"
          :ref="el => (rowRefs[idx] = el)"
          class="model-cmd-row"
          :class="{ active: item.key === hoveredTier }"
          @click="confirmSelection(item.key)"
          @mouseenter="hoveredTier = item.key"
        >
          <span class="model-cmd-name">{{ item.label }}</span>
          <span class="model-cmd-model">{{ displayModel(item.key) }}</span>
          <svg
            v-if="item.key === initialTier"
            class="model-cmd-check"
            width="14" height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
          </svg>
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
            @click="setEffortIndex(i)"
          ></button>
          <span class="effort-dot-label">{{ efforts[effortIndex]?.label || '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const visible = ref(false)
const panelRef = ref(null)
const rowRefs = ref([])

const tierItems = [
  { key: 'haiku', label: 'Haiku', defaultModel: '' },
  { key: 'sonnet', label: 'Sonnet', defaultModel: '' },
  { key: 'opus', label: 'Opus', defaultModel: '' },
  { key: 'reasoning', label: 'Reasoning', defaultModel: '' },
]

const efforts = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'xhigh', label: 'X-High' },
]

const pickerTierModels = ref({ haiku: '', sonnet: '', opus: '', reasoning: '' })
const activeTier = ref('sonnet')
const hoveredTier = ref('sonnet')
const initialTier = ref('sonnet')
const effortIndex = ref(1)  // 默认 Medium
let resolveOpen = null

function displayModel(key) {
  const model = (pickerTierModels.value[key] || '').trim()
  if (model) return model
  return tierItems.find(t => t.key === key)?.defaultModel || ''
}

function close() {
  visible.value = false
}

function cancel() {
  resolveOpen?.(null)
  resolveOpen = null
  close()
}

async function open(opts = {}) {
  const [tierModels, currentModel, currentEffort] = await Promise.all([
    window.electronAPI?.claudeGetTierModels?.() || Promise.resolve({}),
    window.electronAPI?.claudeGetModel?.() || Promise.resolve(''),
    window.electronAPI?.claudeGetEffortLevel?.() || Promise.resolve('medium'),
  ])
  pickerTierModels.value = {
    haiku: (tierModels.haiku || '').trim(),
    sonnet: (tierModels.sonnet || '').trim(),
    opus: (tierModels.opus || '').trim(),
    reasoning: (tierModels.reasoning || '').trim(),
  }

  const model = String(opts.model || currentModel || '').trim()
  let storedTier = ''
  try {
    storedTier = (await window.electronAPI?.claudeGetSelectedTier?.()) || ''
  } catch (e) {
    console.warn('[SelectModel] claudeGetSelectedTier failed:', e?.message || e)
  }
  let inferred = ['haiku', 'sonnet', 'opus', 'reasoning'].includes(opts.tier) ? opts.tier : ''
  if (!inferred) inferred = ['haiku', 'sonnet', 'opus', 'reasoning'].includes(storedTier) ? storedTier : ''
  if (!inferred) {
    inferred = 'sonnet'
    if (model) {
      for (const item of tierItems) {
        const tierModel = (pickerTierModels.value[item.key] || item.defaultModel).trim()
        if (tierModel === model) {
          inferred = item.key
          break
        }
      }
    }
  }

  if (model && inferred === 'sonnet' && pickerTierModels.value.sonnet !== model) {
    pickerTierModels.value.sonnet = model
  }

  activeTier.value = inferred
  hoveredTier.value = inferred
  initialTier.value = inferred

  // 读取当前 effort 并匹配到索引
  const effortStr = String(opts.effort || currentEffort || 'medium').trim().toLowerCase()
  const idx = efforts.findIndex(e => e.key === effortStr)
  effortIndex.value = idx >= 0 ? idx : 1

  visible.value = true

  await nextTick()
  panelRef.value?.focus?.()

  return new Promise((resolve) => {
    resolveOpen = resolve
  })
}

async function confirmSelection(key) {
  const item = tierItems.find(t => t.key === key)
  const label = item?.label || key
  const effort = efforts[effortIndex.value].key
  const effortLabel = efforts[effortIndex.value].label

  if (key && key !== initialTier.value) {
    const model = (pickerTierModels.value[key] || '').trim()
      || item?.defaultModel
      || ''

    pickerTierModels.value[key] = model
    activeTier.value = key

    const newTierModels = {
      haiku: (pickerTierModels.value.haiku || '').trim(),
      sonnet: (pickerTierModels.value.sonnet || '').trim(),
      opus: (pickerTierModels.value.opus || '').trim(),
      reasoning: (pickerTierModels.value.reasoning || '').trim(),
    }

    await window.electronAPI?.claudeSetModel?.(model)
    await window.electronAPI?.claudeSetTierModels?.(newTierModels)
    await window.electronAPI?.claudeSetSelectedTier?.(key)
    await window.electronAPI?.claudePatchSettingsJson?.({ model: key })
    await window.electronAPI?.claudeSetEffortLevel?.(effort)

    resolveOpen?.({ key, label, model, effort, effortLabel })
  } else {
    // 同一 tier：仅可能更新 effort
    await window.electronAPI?.claudeSetEffortLevel?.(effort)
    resolveOpen?.({ key, label, model: displayModel(key), effort, effortLabel })
  }

  resolveOpen = null
  close()
}

function setEffortIndex(i) {
  effortIndex.value = i
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const idx = tierItems.findIndex(t => t.key === hoveredTier.value)
    if (idx < tierItems.length - 1) {
      hoveredTier.value = tierItems[idx + 1].key
    }
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const idx = tierItems.findIndex(t => t.key === hoveredTier.value)
    if (idx > 0) {
      hoveredTier.value = tierItems[idx - 1].key
    }
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmSelection(hoveredTier.value)
  }
}

defineExpose({ open, close })
</script>

<style lang="scss" scoped>
.model-cmd-overlay {
  position: fixed;
  inset: 0;
  background: var(--cc-overlay-bg);
  z-index: 220;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 18vh;
}
.model-cmd-palette {
  width: 420px;
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 32px var(--cc-shadow);
  outline: none;
}
.model-cmd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--cc-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--cc-text-muted);
}
.model-cmd-hint {
  font-size: 10px;
  color: var(--cc-text-dim);
  font-weight: 400;
}
.model-cmd-list {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.model-cmd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
}
.model-cmd-row:hover,
.model-cmd-row.active {
  background: var(--cc-bg-hover);
}
.model-cmd-name {
  font-size: 13px;
  color: var(--cc-text);
  font-weight: 500;
  min-width: 72px;
}
.model-cmd-model {
  font-size: 11px;
  color: var(--cc-text-dim);
  font-family: Consolas, monospace;
  flex: 1;
}
.model-cmd-check {
  color: var(--cc-success);
  flex-shrink: 0;
}
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
