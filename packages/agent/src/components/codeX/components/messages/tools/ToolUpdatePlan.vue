<template>
  <div class="update-plan-card">
    <div class="plan-hero" :class="{ 'has-steps': parsed.summary.total }">
      <div class="plan-hero-top">
        <div class="plan-title-wrap">
          <div class="plan-kicker">PLAN</div>
          <div class="plan-title">执行计划</div>
        </div>
        <div v-if="parsed.summary.total" class="plan-progress-pill">{{ progressText }}</div>
      </div>

      <div v-if="parsed.summary.total" class="plan-progress-track" aria-hidden="true">
        <div class="plan-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <div v-if="parsed.summary.total" class="plan-meta">
        <span class="plan-meta-chip">总计 {{ parsed.summary.total }}</span>
        <span class="plan-meta-chip is-active">进行中 {{ parsed.summary.inProgress }}</span>
        <span class="plan-meta-chip is-done">已完成 {{ parsed.summary.completed }}</span>
        <span class="plan-meta-chip">待处理 {{ parsed.summary.pending }}</span>
      </div>
    </div>

    <div v-if="parsed.explanation" class="plan-explanation-card">
      <div class="plan-section-label">说明</div>
      <div class="plan-explanation">{{ parsed.explanation }}</div>
    </div>

    <div v-if="parsed.steps.length" class="plan-list">
      <div v-for="(item, index) in parsed.steps" :key="item.id || index" class="plan-row">
        <span class="plan-index" :class="`s-${item.status}`">{{ index + 1 }}</span>
        <div class="plan-main">
          <div v-if="item.status === 'in_progress'" class="plan-current-mark">当前步骤</div>
          <div class="plan-step">{{ item.step }}</div>
        </div>
        <span class="plan-status" :class="`s-${item.status}`">{{ statusLabel(item.status) }}</span>
      </div>
    </div>

    <details v-if="msg.text" class="tool-raw-details">
      <summary>原始参数</summary>
      <pre class="tool-raw">{{ msg.text }}</pre>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { parseUpdatePlanPayload } from './updatePlan.mjs'

const props = defineProps({
  msg: { type: Object, required: true },
})

const parsed = computed(() => parseUpdatePlanPayload(props.msg?.text || ''))
const progressPercent = computed(() => {
  const total = parsed.value.summary.total
  if (!total) return 0
  return Math.round((parsed.value.summary.completed / total) * 100)
})
const progressText = computed(() => {
  const total = parsed.value.summary.total
  if (!total) return '未开始'
  return `${parsed.value.summary.completed}/${total} 已完成`
})

function statusLabel(status) {
  if (status === 'completed') return '已完成'
  if (status === 'in_progress') return '进行中'
  return '待处理'
}
</script>

<style scoped>
.update-plan-card {
  display: flex;
  flex-direction: column;
  padding: 10px 10px 0;
  gap: 10px;
}

.plan-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
  border: 1px solid var(--cc-tool-border);
  border-radius: 10px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cc-primary) 12%, transparent), transparent 55%),
    color-mix(in srgb, var(--cc-bg-secondary) 82%, transparent);
}

.plan-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.plan-title-wrap {
  min-width: 0;
}

.plan-kicker {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--cc-text-dim);
  margin-bottom: 5px;
}

.plan-title {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 600;
  color: var(--cc-text);
}

.plan-progress-pill {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-bg) 30%, transparent);
  color: var(--cc-text-secondary);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 70%, transparent);
}

.plan-progress-track {
  position: relative;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--cc-border) 70%, transparent);
}

.plan-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cc-primary), color-mix(in srgb, var(--cc-success) 85%, white));
}

.plan-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plan-meta-chip {
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  color: var(--cc-text-dim);
  background: color-mix(in srgb, var(--cc-bg) 26%, transparent);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 70%, transparent);
}

.plan-meta-chip.is-active {
  color: var(--cc-primary);
  background: var(--cc-warning-bg);
  border-color: color-mix(in srgb, var(--cc-warning-border) 70%, transparent);
}

.plan-meta-chip.is-done {
  color: var(--cc-success);
  background: var(--cc-success-bg);
  border-color: color-mix(in srgb, var(--cc-success-border) 70%, transparent);
}

.plan-explanation-card {
  padding: 11px 12px 10px;
  border: 1px solid var(--cc-tool-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--cc-bg-secondary) 88%, transparent);
}

.plan-section-label {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--cc-text-dim);
  margin-bottom: 8px;
}

.plan-explanation {
  font-size: 12px;
  line-height: 1.65;
  color: var(--cc-text-secondary);
  white-space: pre-wrap;
}

.plan-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding-bottom: 2px;
}

.plan-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 10px 10px 12px;
  border: 1px solid var(--cc-tool-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--cc-bg-secondary) 74%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--cc-bg) 22%, transparent);
}

.plan-row:has(.plan-status.s-in_progress) {
  border-color: color-mix(in srgb, var(--cc-primary) 38%, var(--cc-tool-border));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--cc-primary) 10%, transparent), transparent 42%),
    color-mix(in srgb, var(--cc-bg-secondary) 72%, transparent);
}

.plan-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  font-size: 11px;
  line-height: 1;
  color: var(--cc-text-secondary);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-bg) 26%, transparent);
}

.plan-index.s-in_progress {
  color: var(--cc-primary);
  background: var(--cc-warning-bg);
}

.plan-index.s-completed {
  color: var(--cc-success);
  background: var(--cc-success-bg);
}

.plan-main {
  min-width: 0;
}

.plan-current-mark {
  display: inline-flex;
  align-items: center;
  margin-bottom: 6px;
  font-size: 10px;
  line-height: 1;
  color: var(--cc-primary);
}

.plan-step {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cc-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.plan-status {
  margin-top: 1px;
  font-size: 10px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.plan-status.s-pending {
  background: var(--cc-border);
  color: var(--cc-text-secondary);
}

.plan-status.s-in_progress {
  background: var(--cc-warning-bg);
  color: var(--cc-primary);
}

.plan-status.s-completed {
  background: var(--cc-success-bg);
  color: var(--cc-success);
}

@media (max-width: 980px) {
  .plan-list {
    grid-template-columns: 1fr;
  }
}

.tool-raw-details {
  border-top: 1px solid var(--cc-bg-tertiary);
  margin: 0 -10px;
}

.tool-raw-details > summary {
  cursor: pointer;
  font-size: 11px;
  color: var(--cc-text-dim);
  padding: 8px 12px 6px;
  user-select: none;
}

.tool-raw {
  margin: 0;
  padding: 8px 12px 10px;
  font-size: 11px;
  color: var(--cc-text-dim);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow-x: auto;
  max-height: 160px;
  white-space: pre;
}
</style>
