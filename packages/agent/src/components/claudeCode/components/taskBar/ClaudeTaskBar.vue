<template>
  <section v-if="visible" class="claude-task-bar">
    <header class="claude-task-bar__header">
      <div
        class="claude-task-bar__summary"
        role="button"
        tabindex="0"
        @click="$emit('toggle-collapsed')"
        @keydown.enter.prevent="$emit('toggle-collapsed')"
        @keydown.space.prevent="$emit('toggle-collapsed')"
      >
        <span class="claude-task-bar__badge" :class="`is-${phaseClass}`">{{ phaseLabel }}</span>
        <div class="claude-task-bar__meta">
          <strong>任务进度</strong>
          <span v-if="planItems.length">{{ completedPlanCount }}/{{ planItems.length }} 已完成</span>
        </div>
      </div>
      <div class="claude-task-bar__actions">
        <button type="button" class="claude-task-bar__action" @click.stop="$emit('toggle-collapsed')">
          {{ collapsed ? '展开' : '收起' }}
        </button>
        <button type="button" class="claude-task-bar__action is-close" @click.stop="$emit('close')">
          关闭
        </button>
      </div>
    </header>

    <div v-if="!collapsed" class="claude-task-bar__body">
      <section v-if="planItems.length" class="claude-task-bar__section">
        <div class="claude-task-bar__section-head">
          <span class="claude-task-bar__section-title">当前任务</span>
          <span class="claude-task-bar__section-count">{{ planItems.length }}</span>
        </div>
        <div class="claude-task-bar__list">
          <div
            v-for="item in planItems"
            :key="`plan-${item.id}`"
            class="claude-task-bar__item"
          >
            <span class="claude-task-bar__dot" :class="`is-${normalizeStatus(item.status)}`"></span>
            <span class="claude-task-bar__text">{{ item.description }}</span>
            <span class="claude-task-bar__status">{{ statusLabel(item.status) }}</span>
          </div>
        </div>
      </section>

      <section v-else-if="fallbackExecutionItems.length" class="claude-task-bar__section is-subtle">
        <div class="claude-task-bar__section-head">
          <span class="claude-task-bar__section-title">执行中</span>
          <span class="claude-task-bar__section-count">{{ executionItems.length }}</span>
        </div>
        <div class="claude-task-bar__list">
          <div
            v-for="item in fallbackExecutionItems"
            :key="`execution-${item.id}`"
            class="claude-task-bar__item is-execution"
          >
            <span class="claude-task-bar__dot" :class="`is-${normalizeStatus(item.status)}`"></span>
            <span class="claude-task-bar__text">{{ item.description }}</span>
            <span class="claude-task-bar__status">{{ statusLabel(item.status) }}</span>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const MAX_FALLBACK_EXECUTION_ITEMS = 3

const props = defineProps({
  visible: { type: Boolean, default: false },
  phase: { type: String, default: 'idle' },
  planItems: { type: Array, default: () => [] },
  executionItems: { type: Array, default: () => [] },
  collapsed: { type: Boolean, default: false },
})

defineEmits(['toggle-collapsed', 'close'])

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'completed') return 'completed'
  if (value === 'failed' || value === 'error') return 'failed'
  if (value === 'cancelled' || value === 'deleted') return 'muted'
  if (value === 'in_progress') return 'running'
  return 'pending'
}

function statusLabel(status) {
  const value = normalizeStatus(status)
  if (value === 'failed') return '失败'
  if (value === 'completed') return '已完成'
  if (value === 'running') return '进行中'
  if (value === 'muted') return '已结束'
  return '等待中'
}

const completedPlanCount = computed(() =>
  props.planItems.filter(item => normalizeStatus(item.status) === 'completed').length
)

const fallbackExecutionItems = computed(() =>
  props.executionItems.slice(-MAX_FALLBACK_EXECUTION_ITEMS)
)

const phaseClass = computed(() => {
  if (props.phase === 'done') return 'done'
  if (props.phase === 'running') return 'running'
  return 'idle'
})

const phaseLabel = computed(() => {
  if (props.phase === 'done') return '已完成'
  if (props.phase === 'running') return '执行中'
  return '空闲'
})
</script>

<style scoped>
.claude-task-bar {
  margin: 10px 12px 0;
  border: 1px solid var(--cc-border);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--cc-bg-secondary) 0%, var(--cc-bg) 100%);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.claude-task-bar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.claude-task-bar__summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
  cursor: pointer;
}

.claude-task-bar__summary:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.55);
  outline-offset: -2px;
}

.claude-task-bar__badge {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.claude-task-bar__badge.is-running {
  background: rgba(34, 197, 94, 0.14);
  color: #1f8f4e;
}

.claude-task-bar__badge.is-done {
  background: rgba(59, 130, 246, 0.14);
  color: #2563eb;
}

.claude-task-bar__badge.is-idle {
  background: rgba(148, 163, 184, 0.16);
  color: var(--cc-text-muted);
}

.claude-task-bar__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.claude-task-bar__meta strong {
  font-size: 13px;
  color: var(--cc-text);
}

.claude-task-bar__meta span {
  font-size: 12px;
  color: var(--cc-text-muted);
}

.claude-task-bar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.claude-task-bar__action {
  border: none;
  background: transparent;
  color: var(--cc-text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}

.claude-task-bar__action:hover {
  background: var(--cc-bg-tertiary);
  color: var(--cc-text);
}

.claude-task-bar__action.is-close:hover {
  color: #b91c1c;
}

.claude-task-bar__body {
  border-top: 1px solid var(--cc-border-light);
  padding: 10px 14px 12px;
}

.claude-task-bar__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.claude-task-bar__section.is-subtle {
  opacity: 0.86;
}

.claude-task-bar__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.claude-task-bar__section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--cc-text);
}

.claude-task-bar__section-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--cc-bg-tertiary);
  color: var(--cc-text-muted);
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

.claude-task-bar__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.claude-task-bar__item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.claude-task-bar__item.is-execution .claude-task-bar__text {
  color: var(--cc-text-muted);
  font-size: 12px;
}

.claude-task-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cc-text-dim);
}

.claude-task-bar__dot.is-running {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
}

.claude-task-bar__dot.is-completed {
  background: #2563eb;
}

.claude-task-bar__dot.is-pending {
  background: #f59e0b;
}

.claude-task-bar__dot.is-failed {
  background: #ef4444;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.12);
}

.claude-task-bar__dot.is-muted {
  background: #94a3b8;
}

.claude-task-bar__text {
  font-size: 13px;
  color: var(--cc-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.claude-task-bar__status {
  font-size: 12px;
  color: var(--cc-text-muted);
}

@media (max-width: 900px) {
  .claude-task-bar__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .claude-task-bar__actions {
    width: 100%;
    justify-content: flex-end;
  }

  .claude-task-bar__item {
    grid-template-columns: 10px minmax(0, 1fr);
  }

  .claude-task-bar__status {
    grid-column: 2;
  }
}
</style>
