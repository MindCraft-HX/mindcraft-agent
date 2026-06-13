<template>
  <section class="plan-overview" :aria-label="$t('agent.planOverview')">
    <div class="plan-overview-head">
      <div class="plan-overview-title-wrap">
        <div class="plan-overview-kicker">PLAN SNAPSHOT</div>
        <div class="plan-overview-title">{{ $t('agent.currentPlan') }}</div>
      </div>
      <div class="plan-overview-actions">
        <button
          type="button"
          class="plan-overview-dismiss"
          :title="$t('agent.closePlan')"
          @click="emit('dismiss', overview.sourceMessageId)"
        >
          ×
        </button>
        <button type="button" class="plan-overview-jump" @click="emit('jumpToMessage', overview.sourceMessageId)">{{ $t('agent.locateOriginalMsg') }}</button>
        <button
          type="button"
          class="plan-overview-toggle"
          :aria-expanded="String(!isCollapsed)"
          :title="isCollapsed ? $t('agent.expandPlan') : $t('agent.collapsePlan')"
          @click="isCollapsed = !isCollapsed"
        >
          {{ isCollapsed ? $t('agent.expand') : $t('agent.collapse') }}
        </button>
      </div>
    </div>

    <div v-if="isCollapsed" class="plan-overview-collapsed-summary">
      <span class="plan-overview-collapsed-label">{{ $t('agent.currentPlan') }}</span>
      <span class="plan-overview-collapsed-pill">{{ progressText }}</span>
      <span v-if="overview.currentStep" class="plan-overview-collapsed-text">{{ overview.currentStep.step }}</span>
      <span v-else-if="lastCompletedStep" class="plan-overview-collapsed-text">{{ $t('agent.lastCompleted') }} {{ lastCompletedStep.step }}</span>
      <span v-else-if="overview.explanation" class="plan-overview-collapsed-text">{{ overview.explanation }}</span>
    </div>

    <template v-else>
      <div v-if="overview.summary.total" class="plan-overview-progress">
        <div class="plan-overview-progress-bar" aria-hidden="true">
          <div class="plan-overview-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <div class="plan-overview-progress-text">{{ progressText }}</div>
      </div>

      <div class="plan-overview-chips">
        <span class="plan-overview-chip">总计 {{ overview.summary.total }}</span>
        <span class="plan-overview-chip is-active">进行中 {{ overview.summary.inProgress }}</span>
        <span class="plan-overview-chip is-done">已完成 {{ overview.summary.completed }}</span>
        <span class="plan-overview-chip">待处理 {{ overview.summary.pending }}</span>
      </div>

      <div class="plan-overview-focus-grid">
        <div v-if="overview.currentStep" class="plan-overview-focus">
          <div class="plan-overview-label">{{ $t('agent.currentFocus') }}</div>
          <div class="plan-overview-step">{{ overview.currentStep.step }}</div>
        </div>

        <div v-if="lastCompletedStep" class="plan-overview-focus is-completed">
          <div class="plan-overview-label">{{ $t('agent.lastCompletedSection') }}</div>
          <div class="plan-overview-step">{{ lastCompletedStep.step }}</div>
        </div>

        <div v-if="!overview.currentStep && !lastCompletedStep && overview.explanation" class="plan-overview-focus">
          <div class="plan-overview-label">{{ $t('agent.explanation') }}</div>
          <div class="plan-overview-step">{{ overview.explanation }}</div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { resolvePlanOverviewCollapsedState } from './tools/currentPlanOverviewState.mjs'

const props = defineProps({
  overview: { type: Object, required: true },
})

const emit = defineEmits(['jumpToMessage', 'dismiss'])
const isCollapsed = ref(false)

watch(
  () => props.overview?.sourceMessageId ?? null,
  (nextSourceMessageId, previousSourceMessageId) => {
    isCollapsed.value = resolvePlanOverviewCollapsedState({
      previousSourceMessageId,
      nextSourceMessageId,
      wasCollapsed: isCollapsed.value,
    })
  },
  { immediate: true }
)

const progressPercent = computed(() => {
  const total = props.overview?.summary?.total || 0
  if (!total) return 0
  return Math.round(((props.overview.summary.completed || 0) / total) * 100)
})

const progressText = computed(() => {
  const total = props.overview?.summary?.total || 0
  if (!total) return t('agent.syncExplanation')
  return `${props.overview.summary.completed}/${total} 已完成`
})

const lastCompletedStep = computed(() => {
  const list = Array.isArray(props.overview?.completedSteps) ? props.overview.completedSteps : []
  return list.length ? list[list.length - 1] : null
})
</script>

<style scoped>
.plan-overview {
  position: sticky;
  top: 8px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 14px 12px;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--cc-primary) 18%, var(--cc-tool-border));
  border-radius: 14px;
  background:
    linear-gradient(140deg, color-mix(in srgb, var(--cc-primary) 11%, transparent), transparent 58%),
    color-mix(in srgb, var(--cc-bg) 78%, var(--cc-bg-secondary));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--cc-bg) 20%, transparent);
  backdrop-filter: blur(14px);
}

.plan-overview:has(.plan-overview-collapsed-summary) {
  gap: 8px;
  padding-top: 11px;
  padding-bottom: 11px;
}

.plan-overview-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.plan-overview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-overview-title-wrap {
  min-width: 0;
}

.plan-overview-kicker {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.14em;
  color: var(--cc-text-dim);
  margin-bottom: 6px;
}

.plan-overview-title {
  font-size: 15px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--cc-text);
}

.plan-overview-dismiss,
.plan-overview-jump,
.plan-overview-toggle {
  flex-shrink: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.plan-overview-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 82%, transparent);
  background: transparent;
  color: var(--cc-text-dim);
  font-size: 16px;
  line-height: 1;
}

.plan-overview-jump,
.plan-overview-toggle {
  border: 1px solid color-mix(in srgb, var(--cc-primary) 20%, var(--cc-tool-border));
  background: color-mix(in srgb, var(--cc-bg) 42%, transparent);
  color: var(--cc-text-secondary);
  padding: 7px 10px;
  font-size: 11px;
  line-height: 1;
}

.plan-overview-dismiss:hover,
.plan-overview-toggle:hover,
.plan-overview-jump:hover {
  color: var(--cc-primary);
  background: color-mix(in srgb, var(--cc-bg) 32%, transparent);
  border-color: color-mix(in srgb, var(--cc-primary) 40%, var(--cc-tool-border));
  transform: translateY(-1px);
}

.plan-overview-collapsed-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-top: 2px;
}

.plan-overview-collapsed-label {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  color: var(--cc-text-dim);
}

.plan-overview-collapsed-pill {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-bg) 28%, transparent);
  color: var(--cc-text-secondary);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 76%, transparent);
}

.plan-overview-collapsed-text {
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cc-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-overview-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.plan-overview-progress-bar {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--cc-border) 78%, transparent);
}

.plan-overview-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cc-primary), color-mix(in srgb, var(--cc-success) 82%, white));
}

.plan-overview-progress-text {
  font-size: 11px;
  line-height: 1;
  color: var(--cc-text-secondary);
  white-space: nowrap;
}

.plan-overview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plan-overview-chip {
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  color: var(--cc-text-dim);
  background: color-mix(in srgb, var(--cc-bg) 28%, transparent);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 76%, transparent);
}

.plan-overview-chip.is-active {
  color: var(--cc-primary);
  background: var(--cc-warning-bg);
  border-color: color-mix(in srgb, var(--cc-warning-border) 72%, transparent);
}

.plan-overview-chip.is-done {
  color: var(--cc-success);
  background: var(--cc-success-bg);
  border-color: color-mix(in srgb, var(--cc-success-border) 72%, transparent);
}

.plan-overview-focus-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.plan-overview-focus {
  padding: 10px 11px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--cc-bg-secondary) 84%, transparent);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 74%, transparent);
}

.plan-overview-focus.is-completed {
  border-color: color-mix(in srgb, var(--cc-success-border) 68%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--cc-success) 8%, transparent), transparent 48%),
    color-mix(in srgb, var(--cc-bg-secondary) 84%, transparent);
}

.plan-overview-label {
  margin-bottom: 7px;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--cc-text-dim);
}

.plan-overview-step {
  font-size: 12px;
  line-height: 1.6;
  color: var(--cc-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 980px) {
  .plan-overview-head {
    flex-direction: column;
    align-items: stretch;
  }

  .plan-overview-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .plan-overview-focus-grid {
    grid-template-columns: 1fr;
  }
}
</style>
