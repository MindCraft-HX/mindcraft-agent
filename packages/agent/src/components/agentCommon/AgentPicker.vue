<template>
  <Teleport to="body">
    <div v-if="visible" class="agent-picker-overlay" @click.self="close">
      <div class="agent-picker" :class="themeClass">
        <div class="agent-picker-title">选择编程智能体</div>
        <div class="agent-picker-sub">选择后将直接进入，后续可随时切换</div>

        <div class="agent-picker-list">
          <div v-for="agent in agentList" :key="agent.key"
               class="agent-card" @click="selectAgent(agent.key)">
            <div class="agent-card-icon">
              <div :class="agent.iconClass" :style="agent.iconStyle"></div>
            </div>
            <div class="agent-card-info">
              <div class="agent-card-name">{{ agent.name }}</div>
              <div class="agent-card-desc">{{ agent.description }}</div>
            </div>
            <svg class="agent-card-arrow" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useClaudeThemeStore } from '../../stores/claudeTheme.js'
import { AGENT_DEFINITIONS } from '../../registry/agentRegistry.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  closable: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'select'])
const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

const agentList = AGENT_DEFINITIONS

const hasDefault = computed(() => {
  return !!localStorage.getItem('codeHub_default_agent')
})

function selectAgent(agent) {
  localStorage.setItem('codeHub_default_agent', agent)
  emit('select', agent)
  emit('close')
}

function close() {
  if (!props.closable && !hasDefault.value) return
  emit('close')
}
</script>

<style>
.agent-picker-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}
.agent-picker {
  width: 560px; max-height: 80vh;
  background: var(--cc-bg, #1a1a2e); color: var(--cc-text, #e0e0e0);
  border-radius: 16px; overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--cc-border, #333);
}
.agent-picker-title {
  padding: 24px 24px 4px; font-size: 18px; font-weight: 600; color: var(--cc-text, #fff);
}
.agent-picker-sub {
  padding: 4px 24px 16px; font-size: 12px; color: var(--cc-text-muted, #888);
}
.agent-picker-list {
  padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px;
}
.agent-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--cc-border, #333); background: var(--cc-panel-bg, #22223a);
  transition: all 0.15s ease;
}
.agent-card:hover {
  border-color: var(--cc-primary, #c6613f); background: var(--cc-hover-bg, #2a2a4a);
  box-shadow: 0 2px 12px rgba(198, 97, 63, 0.2);
}
.agent-card-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: var(--cc-accent-bg, #2a2a4a); flex-shrink: 0;
}
.agent-card-info { flex: 1; min-width: 0; }
.agent-card-name { font-size: 14px; font-weight: 600; margin-bottom: 3px; color: var(--cc-text, #fff); }
.agent-card-desc { font-size: 12px; color: var(--cc-text-muted, #888); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-card-arrow {
  color: var(--cc-text-muted, #888); flex-shrink: 0; opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
}
.agent-card:hover .agent-card-arrow {
  opacity: 1; transform: translateX(3px); color: var(--cc-text, #ccc);
}
</style>
