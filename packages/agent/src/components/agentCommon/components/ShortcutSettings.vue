<template>
  <div class="sc-settings">
    <div class="sc-hint">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0">
        <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1a6 6 0 100 12A6 6 0 008 2z"/>
        <path d="M7.5 4a.5.5 0 01.5.5v4a.5.5 0 01-1 0v-4a.5.5 0 01.5-.5z"/>
        <path d="M7 10a1 1 0 112 0 1 1 0 01-2 0z"/>
      </svg>
      <span>{{ $t('shortcuts.hint') }}</span>
    </div>

    <div v-for="(items, groupKey) in groupedShortcuts" :key="groupKey" class="sc-group">
      <div class="sc-group-title">{{ groupLabels[groupKey] || groupKey }}</div>
      <div
        v-for="item in items"
        :key="item.id"
        class="sc-row"
        :class="{
          'sc-recording': recordingId === item.id,
          'sc-conflict': conflictIds.has(item.id),
        }"
      >
        <span class="sc-label">{{ item.label }}</span>
        <div class="sc-key-wrap">
          <template v-if="item.disabled">
            <span class="sc-key-disabled">{{ $t('shortcuts.disabled') }}</span>
          </template>
          <template v-else>
            <span
              class="sc-key"
              :class="{ 'sc-key-recording': recordingId === item.id }"
              @click="startRecording(item.id)"
              :title="$t('shortcuts.clickToChange')"
            >
              <template v-if="recordingId === item.id">
                <span class="sc-key-waiting">{{ $t('shortcuts.recording') }}</span>
              </template>
              <template v-else>
                <kbd v-for="(k, i) in formatKeys(item.currentKeys || item.defaultKeys)" :key="i">{{ k }}</kbd>
              </template>
            </span>
          </template>
        </div>
        <div class="sc-actions">
          <button
            v-if="item.currentKeys && item.currentKeys !== item.defaultKeys"
            class="sc-reset-btn"
            @click="resetSingle(item.id)"
            :title="$t('shortcuts.reset')"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 2A3.5 3.5 0 002 5.5v5A3.5 3.5 0 005.5 14h5a3.5 3.5 0 003.5-3.5V8a.5.5 0 011 0v2.5a4.5 4.5 0 01-4.5 4.5h-5A4.5 4.5 0 011 10.5v-5A4.5 4.5 0 015.5 1H8a.5.5 0 010 1H5.5z"/>
              <path d="M11.854 1.146a.5.5 0 010 .708L9.707 4H13.5a.5.5 0 010 1h-4a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v3.793l2.146-2.147a.5.5 0 01.708 0z"/>
            </svg>
          </button>
          <span v-if="conflictIds.has(item.id)" class="sc-conflict-tag" :title="$t('shortcuts.conflict')">!</span>
        </div>
      </div>
    </div>

    <div class="sc-footer">
      <button class="sc-reset-all-btn" @click="resetAll">{{ $t('shortcuts.resetAll') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShortcutStore } from '../../../stores/useShortcutStore.js'
import { SHORTCUT_GROUPS } from '../../../settings/defaultShortcuts.js'

const { t } = useI18n()
const store = useShortcutStore()

const groupLabels = SHORTCUT_GROUPS

// ── 分组快捷键列表 ──
const groupedShortcuts = computed(() => {
  return store.getGroupedShortcuts()
})

/** 拆分 combo 字符串用于 <kbd> 渲染：'Ctrl+Shift+Tab' → ['Ctrl', 'Shift', 'Tab'] */
const KEY_DISPLAY_MAP = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: '↵', Escape: 'Esc', Tab: 'Tab',
  Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Meta: 'Cmd',
}

function formatKeys(combo) {
  if (!combo) return []
  return combo.split('+').map(k => KEY_DISPLAY_MAP[k] || k)
}

// ── 录制状态 ──
const recordingId = ref(null)
const conflictIds = ref(new Set())

function onRecordKeydown(event) {
  if (recordingId.value === null) return
  event.preventDefault()
  event.stopPropagation()

  // 用 Escape 取消录制
  if (event.key === 'Escape') {
    cancelRecording()
    return
  }

  // 纯修饰键不录制
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return

  const combo = store._eventToKeyCombo(event)
  if (!combo) return

  const newKeys = combo

  // 冲突检测
  const conflicts = store.findConflicts(recordingId.value, newKeys)
  if (conflicts.length > 0) {
    const next = new Set(conflictIds.value)
    next.add(recordingId.value)
    conflictIds.value = next
  } else {
    const next = new Set(conflictIds.value)
    next.delete(recordingId.value)
    conflictIds.value = next
  }

  store.updateShortcut(recordingId.value, newKeys)
  stopRecording()
}

function startRecording(id) {
  cancelRecording()
  recordingId.value = id
  window.__mc_recording_shortcut = true
  document.addEventListener('keydown', onRecordKeydown, true)
}

function stopRecording() {
  recordingId.value = null
  window.__mc_recording_shortcut = false
  document.removeEventListener('keydown', onRecordKeydown, true)
}

function cancelRecording() {
  stopRecording()
}

function resetSingle(id) {
  store.resetShortcut(id)
  const next = new Set(conflictIds.value)
  next.delete(id)
  conflictIds.value = next
}

function resetAll() {
  store.resetAllShortcuts()
  conflictIds.value = new Set()
}

onUnmounted(() => {
  stopRecording()
})
</script>

<style scoped>
.sc-settings {
  padding: 16px 20px;
  color: var(--cc-text);
}

.sc-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  border-radius: 8px;
  background: var(--cc-panel-bg);
  border: 1px solid var(--cc-border);
  font-size: 12px;
  color: var(--cc-text-dim);
  line-height: 1.5;
}

.sc-group {
  margin-bottom: 18px;
}
.sc-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--cc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  padding-left: 4px;
}

.sc-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: background 0.1s;
}
.sc-row:hover {
  background: var(--cc-panel-item-hover);
}
.sc-row.sc-conflict {
  background: var(--cc-error-bg, rgba(220, 38, 38, 0.08));
}

.sc-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--cc-text);
}

.sc-key-wrap {
  flex-shrink: 0;
}

.sc-key {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  background: var(--cc-bg-secondary);
  cursor: pointer;
  min-width: 60px;
  transition: border-color 0.12s, background 0.12s;
}
.sc-key:hover {
  border-color: var(--cc-primary);
}
.sc-key-recording {
  border-color: var(--cc-primary);
  background: var(--cc-menu-hover);
  animation: sc-pulse 1s ease-in-out infinite;
}
@keyframes sc-pulse {
  0%, 100% { border-color: var(--cc-primary); }
  50% { border-color: var(--cc-text-muted); }
}

.sc-key kbd {
  display: inline-block;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--cc-panel-bg);
  border: 1px solid var(--cc-border);
  font-size: 11px;
  font-family: inherit;
  color: var(--cc-text);
  line-height: 1.3;
}

.sc-key-waiting {
  font-size: 11px;
  color: var(--cc-primary);
  padding: 2px 4px;
}

.sc-key-disabled {
  font-size: 11px;
  color: var(--cc-text-dim);
  font-style: italic;
}

.sc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  width: 36px;
  justify-content: flex-end;
}

.sc-reset-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--cc-text-dim);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sc-reset-btn:hover {
  background: var(--cc-btn-bg);
  color: var(--cc-primary);
}

.sc-conflict-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--cc-error, #dc2626);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.sc-footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--cc-border);
}

.sc-reset-all-btn {
  padding: 6px 16px;
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  background: var(--cc-bg-secondary);
  color: var(--cc-text-dim);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.sc-reset-all-btn:hover {
  color: var(--cc-error);
  border-color: var(--cc-error);
}
</style>
