<template>
  <div class="settings">
    <el-drawer title="设置" v-model="settingsDrawer" direction="rtl" size="50%" @open="onDrawerOpen">
      <div class="settings-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="settings-tab"
          :class="{ active: active === t.key }"
          @click="activateTab(t.key)"
        >
          <span :class="t.iconClass" :style="t.iconStyle"></span>
          <span class="settings-tab-label">{{ t.label }}</span>
        </button>
      </div>
      <div class="settings-body">
        <template v-for="t in tabs" :key="t.key">
          <component
            v-show="active === t.key"
            :is="t.settingsComponent"
            :ref="(el) => { if (el) settingsRefs[t.key] = el }"
            embedded
          />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, reactive, inject, nextTick } from 'vue'
import { useAgentRegistry } from '@mindcraft/agent'

const { agents } = useAgentRegistry()

const settingsDrawer = inject("settingsDrawer")
const activeSetting = inject("activeSetting")

const active = ref(agents.value[0]?.key || '')
const settingsRefs = reactive({})

const tabs = computed(() => agents.value.map(a => ({
  key: a.key,
  label: a.name,
  iconClass: a.iconClass,
  iconStyle: { ...a.iconStyle, fontSize: a.key === 'codex' ? '18px' : '16px' },
  settingsComponent: a.settingsComponent,
})))

function onDrawerOpen() {
  active.value = activeSetting.value || agents.value[0]?.key || ''
  nextTick(() => loadCurrentTab())
}

function activateTab(key) {
  active.value = key
  nextTick(() => loadCurrentTab())
}

function loadCurrentTab() {
  const ref = settingsRefs[active.value]
  ref?.openSettings?.()
}
</script>

<style scoped>
.settings {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--cc-border, #e2dfd9);
  padding: 0 8px;
  gap: 0;
  flex-shrink: 0;
  margin-bottom: 16px;
}

.settings-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--cc-text-dim, #666);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  font-family: inherit;
}

.settings-tab:hover {
  color: var(--cc-text, #111);
}

.settings-tab.active {
  color: var(--cc-primary, #c6613f);
  border-bottom-color: var(--cc-primary, #c6613f);
}

.settings-tab-label {
  white-space: nowrap;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
</style>
