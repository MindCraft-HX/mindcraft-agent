<template>
  <div class="mention-popup">
    <div class="mention-header">
      <span class="mention-hint">{{ flatMode ? $t('agent.matchFiles', { n: suggestions.length }) : $t('agent.selectByLevel') }}</span>
      <button
        type="button"
        class="mention-flat-toggle"
        :class="{ active: flatMode }"
        :title="flatMode ? $t('agent.switchToHierarchy') : $t('agent.switchToFlat')"
        @mousedown.prevent="$emit('toggleFlatMode')"
      >
        {{ flatMode ? $t('agent.flatMode') : $t('agent.hierarchyMode') }}
      </button>
    </div>
    <div
      v-for="(item, i) in suggestions"
      :key="item"
      class="mention-item"
      :class="{ active: i === activeIdx }"
      @mousedown.prevent="$emit('applyMention', item)"
    >
      <span class="mention-icon-wrap">
        <svg v-if="item.endsWith('/')" class="mention-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
        <svg v-else class="mention-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
      </span>
      <span class="mention-token">{{ item }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  suggestions: { type: Array, default: () => [] },
  activeIdx: { type: Number, default: -1 },
  flatMode: { type: Boolean, default: false },
})

defineEmits(['applyMention', 'toggleFlatMode'])
</script>

<style scoped>
.mention-popup {
  position: absolute;
  bottom: 100%;
  left: 10px;
  right: 10px;
  margin-bottom: 4px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 7px;
  max-height: min(42vh, 240px);
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 51;
  box-shadow: 0 4px 16px var(--cc-shadow);
}

.mention-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  border-bottom: 1px solid var(--cc-border);
  flex-shrink: 0;
}
.mention-hint {
  font-size: 9px;
  color: var(--cc-text-dim);
}
.mention-flat-toggle {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--cc-border-strong);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-dim);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}
.mention-flat-toggle:hover {
  color: var(--cc-primary);
  border-color: var(--cc-primary);
}
.mention-flat-toggle.active {
  color: var(--cc-primary);
  border-color: var(--cc-primary);
  background: var(--cc-border);
}

.mention-item {
  padding: 7px 12px;
  cursor: pointer;
  transition: background 0.1s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mention-item:hover,
.mention-item.active {
  background: var(--cc-border);
}

.mention-icon-wrap { padding-top: 2px; }

.mention-icon {
  flex-shrink: 0;
  color: var(--cc-text-muted);
}

.mention-item.active .mention-icon,
.mention-item:hover .mention-icon {
  color: var(--cc-text-secondary);
}

.mention-token {
  font-size: 12px;
  color: var(--cc-text-secondary);
  font-family: Consolas, monospace;
}
</style>
