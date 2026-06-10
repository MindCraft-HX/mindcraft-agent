<template>
  <div v-if="visible" class="shared-settings-overlay" @click.self="close">
    <div class="shared-settings-card">
      <div class="shared-settings-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="shared-settings-tab"
          :class="{ active: active === t.key }"
          @click="activateTab(t.key)"
        >
          <span :class="t.iconClass" :style="t.iconStyle"></span>
          <span class="shared-settings-tab-label">{{ t.label }}</span>
        </button>
        <button class="shared-settings-close" @click="close" title="关闭">✕</button>
      </div>
      <div class="shared-settings-body">
        <ClaudeAPISetting v-show="active === 'claude'" ref="claudeSetting" embedded />
        <CodexAPISetting v-show="active === 'codex'" ref="codexSetting" embedded />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import ClaudeAPISetting from '../claudeCode/components/APISetting.vue'
import CodexAPISetting from '../codeX/components/APISetting.vue'

const visible = ref(false)
const active = ref('claude')
const claudeSetting = ref(null)
const codexSetting = ref(null)

const tabs = [
  {
    key: 'claude',
    label: 'Claude Code',
    iconClass: 'mindcraft-flow-win-iconfont icon-mindcraft-claude1',
    iconStyle: { color: '#D97757', fontSize: '16px' },
  },
  {
    key: 'codex',
    label: 'GPT Codex',
    iconClass: 'icon iconfont icon-ChatGPT',
    iconStyle: { color: '#74AA9C', fontSize: '18px' },
  },
]

function open() {
  visible.value = true
  nextTick(() => loadCurrentTab())
}

function close() {
  visible.value = false
}

function activateTab(key) {
  active.value = key
  nextTick(() => loadCurrentTab())
}

function loadCurrentTab() {
  if (active.value === 'claude') {
    claudeSetting.value?.openSettings?.()
  } else {
    codexSetting.value?.openSettings?.()
  }
}

defineExpose({ open, close })
</script>

<style scoped>
.shared-settings-overlay {
  position: fixed; inset: 0;
  background: var(--cc-overlay-bg); z-index: 300;
  display: flex; align-items: center; justify-content: center;
}
.shared-settings-card {
  width: 680px; max-width: 92vw; max-height: 85vh;
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border);
  border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px var(--cc-shadow);
}
.shared-settings-tabs {
  display: flex; align-items: center;
  border-bottom: 1px solid var(--cc-border);
  padding: 0 8px; gap: 0;
  flex-shrink: 0;
}
.shared-settings-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; border: none; background: transparent;
  color: var(--cc-text-dim); font-size: 13px; font-weight: 500;
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
}
.shared-settings-tab:hover { color: var(--cc-text); }
.shared-settings-tab.active {
  color: var(--cc-primary); border-bottom-color: var(--cc-primary);
}
.shared-settings-tab-label { white-space: nowrap; }
.shared-settings-close {
  margin-left: auto; width: 28px; height: 28px;
  border: none; background: transparent; color: var(--cc-text-dim);
  cursor: pointer; font-size: 14px; display: flex; align-items: center;
  justify-content: center; border-radius: 6px;
}
.shared-settings-close:hover { background: var(--cc-menu-hover); color: var(--cc-text); }
.shared-settings-body {
  flex: 1; overflow-y: auto; min-height: 0;
  background: var(--cc-bg-secondary);
}
</style>
