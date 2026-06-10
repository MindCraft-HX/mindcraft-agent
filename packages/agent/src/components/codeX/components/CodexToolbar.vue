<template>
  <div class="cc-toolbar">
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="color:var(--cc-text-muted);flex-shrink:0">
      <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
    </svg>
    <span class="cwd-text" :class="{ placeholder: !cwd }" :title="cwd" @click="cwd ? null : emit('selectDir')">
      {{ cwd || '点击选择工作目录' }}
    </span>
    <button v-if="!embedded" class="tb-btn switch-agent-btn" type="button" @click="emit('switchAgent')" title="切换到 Claude Code">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a.5.5 0 01.5.5v1.5h2a1.5 1.5 0 011.5 1.5v2a.5.5 0 01-1 0v-2a.5.5 0 00-.5-.5H9V9.5a.5.5 0 01-1 0V4H4.5a.5.5 0 00-.5.5v2a.5.5 0 01-1 0v-2A1.5 1.5 0 014.5 3h2V1.5A.5.5 0 018 1zM8 15a.5.5 0 01-.5-.5v-1.5h-2a1.5 1.5 0 01-1.5-1.5v-2a.5.5 0 011 0v2a.5.5 0 00.5.5H7V6.5a.5.5 0 011 0V12h3.5a.5.5 0 00.5-.5v-2a.5.5 0 011 0v2A1.5 1.5 0 0111.5 13H9.5v1.5A.5.5 0 018 15z"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { inject } from 'vue'

const props = defineProps({
  cwd: { type: String, default: '' },
  locked: { type: Boolean, default: false },
})

const emit = defineEmits(['selectDir', 'switchAgent'])
function openPlugins() {
  window.dispatchEvent(new CustomEvent('codex-open-plugins'))
}
const embedded = inject('codehubEmbedded', false)
</script>

<style scoped>
.cc-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  flex-shrink: 0;
  background: var(--cc-bg-secondary);
  border-bottom: 1px solid var(--cc-border-light);
}
.cwd-text {
  flex: 1;
  font-size: 12px;
  color: var(--cc-panel-title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.cwd-text.placeholder {
  color: var(--cc-text-dim);
}
.cwd-text.placeholder:hover {
  color: var(--cc-primary);
}
.tb-btn {
  height: 20px;
  padding: 0 8px;
  border-radius: 4px;
  flex-shrink: 0;
  background: var(--cc-bg-elevated);
  border: 1px solid var(--cc-border-strong);
  color: var(--cc-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.tb-btn:hover {
  background: var(--cc-btn-bg-hover);
  color: var(--cc-text);
}
.tb-btn.primary {
  height: 22px;
  padding: 0 10px;
  background: var(--cc-primary);
  border-color: var(--cc-primary-hover);
  color: var(--cc-btn-primary-text);
  font-weight: 700;
}
.tb-btn.primary:hover {
  background: var(--cc-primary-hover);
  border-color: var(--cc-border-focus);
  color: var(--cc-btn-primary-text);
}
.tb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
.switch-agent-btn {
  margin-left: auto;
  width: 26px;
  height: 22px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
