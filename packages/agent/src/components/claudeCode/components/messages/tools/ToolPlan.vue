<template>
  <div class="exit-plan-panel">
    <div class="exit-plan-status" :class="{ 'plan-enter': isEnter }">
      {{ isEnter ? '已进入计划模式' : '已退出计划模式' }}
    </div>
    <div v-if="data.plan" class="exit-plan-markdown" v-html="renderContent(data.plan, 'ClaudeCode:ToolPlan')"></div>
    <div v-if="data.planFilePath" class="exit-plan-path-wrap">
      <span class="exit-plan-path-label">{{ $t('agent.planFile') }}</span>
      <span class="exit-plan-path">{{ data.planFilePath }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { renderContent } from '../../../../agentCommon/render.js'

const props = defineProps({
  msg: { type: Object, required: true },
  isEnter: { type: Boolean, default: false },
})

const data = computed(() => {
  const raw = props.msg?.text
  if (!raw || typeof raw !== 'string') return {}
  try {
    const obj = JSON.parse(raw)
    return {
      plan: typeof obj.plan === 'string' ? obj.plan : '',
      planFilePath: typeof obj.planFilePath === 'string' ? obj.planFilePath : '',
    }
  } catch (_) { return {} }
})
</script>

<style scoped>
.exit-plan-panel {
  padding: 8px 10px; border-bottom: 1px solid var(--cc-bg-tertiary);
  display: flex; flex-direction: column; gap: 8px;
}
.exit-plan-status {
  align-self: flex-start; font-size: 10px; border-radius: 10px;
  padding: 1px 7px; background: var(--cc-success-bg); color: var(--cc-success);
}
.exit-plan-status.plan-enter {
  background: var(--cc-info-bg); color: var(--cc-info-text);
}
.exit-plan-markdown { font-size: 12px; line-height: 1.55; color: var(--cc-hljs-text); }
.exit-plan-path-wrap {
  display: flex; gap: 6px; font-size: 11px;
  color: var(--cc-text-dim); align-items: baseline;
}
.exit-plan-path-label { flex-shrink: 0; }
.exit-plan-path {
  color: var(--cc-tool-label);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow-wrap: anywhere;
}
</style>
