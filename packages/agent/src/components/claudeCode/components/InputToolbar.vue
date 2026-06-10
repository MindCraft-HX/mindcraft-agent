<template>
  <div class="mode-row">
    <div class="toolbar-left">
      <button
        type="button"
        class="toolbar-btn"
        :disabled="disabled"
        title="选择或拖入本地文件"
        @click="$emit('addFile')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :disabled="disabled"
        title="引用文件 @"
        @click="$emit('triggerMention')"
      >
        <span class="toolbar-char">@</span>
      </button>
      <button
        type="button"
        class="toolbar-btn"
        :disabled="disabled"
        title="命令 /"
        @click="$emit('triggerSlash')"
      >
        <span class="toolbar-char">/</span>
      </button>
      <button
        type="button"
        class="toolbar-btn plugins-btn"
        :disabled="disabled"
        title="插件管理"
        @click="$emit('openPlugins')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1"/>
          <rect x="9.5" y="1.5" width="5" height="5" rx="1"/>
          <rect x="1.5" y="9.5" width="5" height="5" rx="1"/>
          <rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
        </svg>
      </button>
      <button
        type="button"
        class="toolbar-btn skills-btn"
        :disabled="disabled"
        title="技能管理"
        @click="$emit('openSkills')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="8,1.5 10.5,6.5 16,7.5 12,11.5 13,17 8,14.5 3,17 4,11.5 0,7.5 5.5,6.5"/>
        </svg>
      </button>
    </div>
    <select
      :value="runMode"
      class="mode-select"
      title="执行模式"
      @change="$emit('update:runMode', $event.target.value)"
    >
      <option value="ask_before_edits">Ask before edits</option>
      <option value="edit_automatically">Edit automatically</option>
      <option value="plan_mode">Plan mode</option>
    </select>
  </div>
</template>

<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  runMode: { type: String, default: 'ask_before_edits' },
})

defineEmits(['addFile', 'triggerMention', 'triggerSlash', 'update:runMode', 'openPlugins', 'openSkills'])
</script>

<style scoped>
.mode-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-tertiary);
  color: var(--cc-text-muted);
  border-radius: 5px;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.toolbar-btn:hover:not(:disabled) {
  color: var(--cc-primary);
  background: var(--cc-border);
  border-color: var(--cc-primary);
}
.toolbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.toolbar-btn svg { display: block; }
.toolbar-char {
  font-size: 14px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
  line-height: 1;
  display: block;
}

.mode-select {
  height: 24px;
  min-width: 130px;
  border-radius: 5px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary);
  font-size: 10px;
  padding: 0 24px 0 8px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--cc-text-dim) 50%), linear-gradient(135deg, var(--cc-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 11px) calc(50% - 1px), calc(100% - 7px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  flex-shrink: 0;
}
.mode-select:hover:not(:disabled) { border-color: var(--cc-border-strong); }
.mode-select:focus { border-color: var(--cc-border-focus); }
.mode-select:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
