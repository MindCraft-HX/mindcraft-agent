<template>
  <div class="mode-row">
    <div class="toolbar-left">
      <button
        type="button"
        class="toolbar-btn"
        :disabled="disabled"
        title="添加本地文件或图片"
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
    <div class="toolbar-right">
      <!-- 网络访问开关 -->
      <label class="toggle-row" title="允许 Codex 访问网络">
        <span class="toggle-label">🌐</span>
        <span class="toggle-text">{{ $t('agent.networkAccess') }}</span>
        <button
          type="button"
          class="mini-toggle"
          :class="{ active: networkAccess }"
          :disabled="disabled"
          @click="$emit('update:networkAccess', !networkAccess)"
        >
          <span class="mini-toggle-knob"></span>
        </button>
      </label>
      <!-- sandbox 文件权限 -->
      <select
        :value="sandboxMode"
        class="mode-select"
        title="文件访问权限"
        :disabled="disabled"
        @change="$emit('update:sandboxMode', $event.target.value)"
      >
        <option value="read-only">{{ $t('settings.sandbox.readOnlyShort') }}</option>
        <option value="workspace-write">{{ $t('settings.sandbox.workspaceWriteShort') }}</option>
        <option value="danger-full-access">{{ $t('settings.sandbox.fullAccessShort') }}</option>
      </select>
      <!-- 网页搜索模式 -->
      <select
        :value="webSearch"
        class="mode-select"
        title="网页搜索模式"
        :disabled="disabled"
        @change="$emit('update:webSearch', $event.target.value)"
      >
        <option value="disabled">{{ $t('settings.disable') }}</option>
        <option value="cached">{{ $t('settings.cacheSearch') }}</option>
        <option value="live">{{ $t('settings.liveSearch') }}</option>
      </select>
    </div>
  </div>
</template>

<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  networkAccess: { type: Boolean, default: true },
  webSearch: { type: String, default: 'disabled' },
  sandboxMode: { type: String, default: 'workspace-write' },
})

defineEmits(['addFile', 'triggerMention', 'triggerSlash', 'update:networkAccess', 'update:webSearch', 'update:sandboxMode', 'openPlugins', 'openSkills'])
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
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

/* 网络开关 */
.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
}
.toggle-label {
  font-size: 11px;
  line-height: 1;
}
.toggle-text {
  font-size: 10px;
  color: var(--cc-text-secondary);
  line-height: 1;
}

.mini-toggle {
  width: 28px;
  height: 16px;
  border-radius: 8px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-tertiary);
  cursor: pointer;
  padding: 0;
  position: relative;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.mini-toggle.active {
  background: var(--cc-primary);
  border-color: var(--cc-primary);
}
.mini-toggle:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.mini-toggle-knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.mini-toggle.active .mini-toggle-knob {
  transform: translateX(12px);
}

/* sandbox / 搜索模式下拉 */
.mode-select {
  height: 22px;
  min-width: 72px;
  border-radius: 5px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary);
  font-size: 10px;
  padding: 0 18px 0 6px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--cc-text-dim) 50%), linear-gradient(135deg, var(--cc-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 8px) calc(50% - 1px), calc(100% - 4px) calc(50% - 1px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  flex-shrink: 0;
}
.mode-select:hover:not(:disabled) { border-color: var(--cc-border-strong); }
.mode-select:focus { border-color: var(--cc-border-focus); }
.mode-select:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
