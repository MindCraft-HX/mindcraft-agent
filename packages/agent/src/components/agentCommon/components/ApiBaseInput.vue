<template>
  <div ref="rootRef" class="api-base-input">
    <input
      ref="inputRef"
      class="api-base-input__field"
      :class="inputClass"
      :value="modelValue"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="open = true"
      @input="onInput"
      @keydown="onKeydown"
    />
    <button
      type="button"
      class="api-base-input__toggle"
      aria-label="Show API Base presets"
      :aria-expanded="open && showAll"
      @mousedown.prevent="togglePresetMenu"
    >
      <svg class="api-base-input__chevron" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 4.5 6 7.5 9 4.5"/></svg>
    </button>
    <div v-if="open && suggestions.length" class="api-base-input__menu" role="listbox">
      <button
        v-for="(preset, index) in suggestions"
        :key="preset.id"
        type="button"
        class="api-base-input__option"
        :class="{ 'is-active': index === activeIndex }"
        role="option"
        :aria-selected="index === activeIndex"
        @mousedown.prevent="selectPreset(preset)"
        @mousemove="activeIndex = index"
      >
        <span class="api-base-input__name">{{ preset.label }}</span>
        <span v-if="preset.apiFormat" class="api-base-input__format">{{ preset.apiFormat }}</span>
        <span class="api-base-input__url">{{ preset.url }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getApiBasePresets, searchApiBasePresets } from '../utils/apiBaseCatalog.mjs'

const props = defineProps({
  modelValue: { type: String, default: '' },
  agentType: { type: String, required: true },
  placeholder: { type: String, default: '' },
  inputClass: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'preset-selected'])
const rootRef = ref(null)
const inputRef = ref(null)
const open = ref(false)
const showAll = ref(false)
const activeIndex = ref(-1)
const suggestions = computed(() => showAll.value
  ? getApiBasePresets(props.agentType)
  : searchApiBasePresets(props.agentType, props.modelValue))

watch(suggestions, () => { activeIndex.value = -1 })

function onInput(event) {
  emit('update:modelValue', event.target.value)
  showAll.value = false
  open.value = true
}

function togglePresetMenu() {
  const shouldOpenAll = !(open.value && showAll.value)
  showAll.value = shouldOpenAll
  open.value = shouldOpenAll
  activeIndex.value = -1
  inputRef.value?.focus()
}

function selectPreset(preset) {
  emit('update:modelValue', preset.url)
  emit('preset-selected', preset)
  open.value = false
  showAll.value = false
  inputRef.value?.focus()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    open.value = false
    showAll.value = false
    return
  }
  if (!suggestions.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    const delta = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + delta + suggestions.value.length) % suggestions.value.length
    return
  }
  if (event.key === 'Enter' && open.value && activeIndex.value >= 0) {
    event.preventDefault()
    selectPreset(suggestions.value[activeIndex.value])
  }
}

function onDocumentPointerDown(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    open.value = false
    showAll.value = false
  }
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))
</script>

<style scoped>
.api-base-input { position: relative; }
.api-base-input__field {
  width: 100%; box-sizing: border-box; padding: 8px 40px 8px 12px; border: 1px solid var(--cc-border-strong);
  border-radius: 6px; outline: none; background: var(--cc-bg-input); color: var(--cc-text); font-size: 13px;
  transition: border-color 0.15s;
}
.api-base-input__field:focus { border-color: var(--cc-primary); background: var(--cc-bg-elevated); }
.api-base-input__field::placeholder { color: var(--cc-text-faint); }
.api-base-input__toggle {
  display: flex; align-items: center; justify-content: center;
  position: absolute; z-index: 2; top: 1px; right: 1px; width: 34px; height: calc(100% - 2px);
  border: 0; border-left: 1px solid var(--cc-border-strong); border-radius: 0 5px 5px 0;
  background: var(--cc-bg-input); color: var(--cc-text-dim); cursor: pointer;
}
.api-base-input__chevron { display: block; }
.api-base-input__toggle:hover { background: var(--cc-bg-hover); color: var(--cc-text); }
.api-base-input__menu {
  position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0;
  max-height: 264px; overflow-y: auto; border: 1px solid var(--cc-border-strong);
  border-radius: 7px; background: var(--cc-bg-elevated); box-shadow: 0 8px 24px var(--cc-shadow);
}
.api-base-input__option {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; width: 100%;
  padding: 8px 10px; border: 0; background: transparent; color: var(--cc-text); text-align: left; cursor: pointer;
}
.api-base-input__option:hover, .api-base-input__option.is-active { background: var(--cc-bg-hover); }
.api-base-input__name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.api-base-input__format { align-self: center; padding: 1px 5px; border-radius: 999px; background: var(--cc-primary-bg); color: var(--cc-primary); font-size: 10px; }
.api-base-input__url { grid-column: 1 / -1; color: var(--cc-text-dim); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
