<template>
  <div class="exit-plan-panel">
    <div class="exit-plan-status" :class="{ 'plan-enter': isEnter }">
      {{ statusLabel }}
    </div>
    <div v-if="data.plan" class="exit-plan-markdown" v-html="renderContent(data.plan, 'ClaudeCode:ToolPlan')"></div>
    <div v-if="data.planFilePath" class="exit-plan-path-wrap">
      <span class="exit-plan-path-label">{{ $t('agent.planFile') }}</span>
      <span class="exit-plan-path">{{ data.planFilePath }}</span>
    </div>
    <div v-if="!isEnter && !msg.planReviewAnswered" class="plan-review-state" :class="{ 'plan-review-error': msg.planResponseError }">
      <span>{{ msg.planResponseError || (msg.planSubmitting ? '正在提交操作...' : '等待审查中...') }}</span>
      <button v-if="msg.status === 'pending'" type="button" :disabled="msg.planSubmitting" @click.stop="reopenPlanReview?.(msg)">审查</button>
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { renderContent } from '../../../../agentCommon/render.js'

const props = defineProps({
  msg: { type: Object, required: true },
  isEnter: { type: Boolean, default: false },
})

const reopenPlanReview = inject('reopenPlanReview', null)

const statusLabel = computed(() => {
  if (props.isEnter) return '已进入计划模式'
  if (props.msg?.status === 'pending') return '等待退出计划模式'
  if (props.msg?.planAction === 'accept') return '已退出计划模式'
  return '仍在计划模式'
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
.plan-review-state { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--cc-text-muted); }
.plan-review-state button { padding: 2px 10px; border: 1px solid var(--cc-primary); border-radius: 4px; background: transparent; color: var(--cc-primary); cursor: pointer; }
.plan-review-state button:hover { background: var(--cc-primary); color: #fff; }
.plan-review-state button:disabled { opacity: 0.55; cursor: wait; }
.plan-review-error { color: var(--cc-error-text); }
</style>
