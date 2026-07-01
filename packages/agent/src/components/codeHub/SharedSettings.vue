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
        <button class="shared-settings-close" @click="close" :title="$t('common.close')">✕</button>
      </div>
      <div class="shared-settings-body">
        <component
          v-if="activeTab"
          :is="activeTab.settingsComponent"
          :key="activeTab.key"
          :ref="(el) => { if (el) settingsRefs[activeTab.key] = el }"
          embedded
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentRegistry } from '../../registry/useAgentRegistry.js'
import SystemSettings from '../agentCommon/components/SystemSettings.vue'
import ShortcutSettings from '../agentCommon/components/ShortcutSettings.vue'
import ImportConfig from '../agentCommon/components/ImportConfig.vue'

const { agents } = useAgentRegistry()
const { t } = useI18n()

const visible = ref(false)
const active = ref(agents.value[0]?.key || '')
const settingsRefs = reactive({})

const tabs = computed(() => {
  const agentTabs = agents.value.map(a => ({
    key: a.key,
    label: a.name,
    iconClass: a.iconClass,
    iconStyle: { ...a.iconStyle, fontSize: a.key === 'codex' ? '18px' : '16px' },
    settingsComponent: a.settingsComponent,
  }))
  // 快捷键设置 Tab
  agentTabs.push({
    key: 'shortcuts',
    label: t('shortcuts.title', '快捷键'),
    iconClass: 'ss-icon-shortcuts',
    iconStyle: { color: '#c6613f', fontSize: '16px' },
    settingsComponent: ShortcutSettings,
  })
  // 追加系统设置 Tab
  agentTabs.push({
    key: 'system',
    label: t('settings.systemSettings'),
    iconClass: 'ss-icon-system',
    iconStyle: { color: '#7e8ba3', fontSize: '16px' },
    settingsComponent: SystemSettings,
  })
  // 导入配置 Tab
  agentTabs.push({
    key: 'import',
    label: t('settings.importConfig'),
    iconClass: 'ss-icon-import',
    iconStyle: { color: '#7e8ba3', fontSize: '16px' },
    settingsComponent: ImportConfig,
  })
  return agentTabs
})

const activeTab = computed(() => tabs.value.find(t => t.key === active.value) || null)

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
  const ref = settingsRefs[active.value]
  ref?.openSettings?.()
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
.ss-icon-system::before { content: '⚙'; }
.ss-icon-shortcuts::before { content: '⌨'; }
.ss-icon-import::before { content: '⬇'; }
.shared-settings-body {
  flex: 1; overflow-y: auto; min-height: 0;
  background: var(--cc-bg-secondary);
}
</style>
