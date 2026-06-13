<template>
  <div class="todo-card">
    <div class="todo-hero">
      <div class="todo-hero-top">
        <div class="todo-title-wrap">
          <div class="todo-kicker">TASK SNAPSHOT</div>
          <div class="todo-title">{{ $t('agent.todoTitle') }}</div>
        </div>
        <div v-if="parsed.summary.total" class="todo-progress-pill">{{ progressText }}</div>
      </div>

      <div class="todo-meta">
        <span class="todo-meta-chip">总计 {{ parsed.summary.total }}</span>
        <span class="todo-meta-chip is-active">进行中 {{ parsed.summary.inProgress }}</span>
        <span class="todo-meta-chip is-done">已完成 {{ parsed.summary.completed }}</span>
        <span class="todo-meta-chip">待处理 {{ parsed.summary.pending }}</span>
        <span v-if="parsed.summary.cancelled" class="todo-meta-chip is-cancelled">已取消 {{ parsed.summary.cancelled }}</span>
      </div>
    </div>

    <div v-if="parsed.currentItem" class="todo-focus-card">
      <div class="todo-section-label">{{ $t('agent.currentFocus') }}</div>
      <div class="todo-focus-text">{{ parsed.currentItem.content }}</div>
    </div>

    <div class="todo-list">
      <div v-for="(item, index) in parsed.items" :key="item.id || index" class="todo-row">
        <span class="todo-index" :class="`s-${item.status}`">{{ index + 1 }}</span>
        <div class="todo-main">
          <div class="todo-text">{{ item.content }}</div>
        </div>
        <span class="todo-status" :class="`s-${item.status}`">{{ statusLabel(item.status) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { parseTodoListPayload } from './todoList.mjs'

const props = defineProps({
  msg: { type: Object, required: true },
})

const parsed = computed(() => parseTodoListPayload(props.msg?.text || ''))
const progressText = computed(() => {
  const total = parsed.value.summary.total
  if (!total) return '无待办'
  return `${parsed.value.summary.completed}/${total} 已完成`
})

function statusLabel(status) {
  const s = String(status || 'pending')
  if (s === 'completed') return '已完成'
  if (s === 'in_progress') return '进行中'
  if (s === 'cancelled') return '已取消'
  return '待处理'
}
</script>

<style scoped>
.todo-card {
  display: flex;
  flex-direction: column;
  padding: 10px 10px 0;
  gap: 10px;
}

.todo-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--cc-tool-border);
  border-radius: 10px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--cc-primary) 9%, transparent), transparent 58%),
    color-mix(in srgb, var(--cc-bg-secondary) 84%, transparent);
}

.todo-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.todo-title-wrap {
  min-width: 0;
}

.todo-kicker {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--cc-text-dim);
  margin-bottom: 5px;
}

.todo-title {
  font-size: 14px;
  line-height: 1.2;
  font-weight: 600;
  color: var(--cc-text);
}

.todo-progress-pill {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-bg) 30%, transparent);
  color: var(--cc-text-secondary);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 70%, transparent);
}

.todo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.todo-meta-chip {
  font-size: 10px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 999px;
  color: var(--cc-text-dim);
  background: color-mix(in srgb, var(--cc-bg) 26%, transparent);
  border: 1px solid color-mix(in srgb, var(--cc-tool-border) 70%, transparent);
}

.todo-meta-chip.is-active {
  color: var(--cc-primary);
  background: var(--cc-warning-bg);
  border-color: color-mix(in srgb, var(--cc-warning-border) 70%, transparent);
}

.todo-meta-chip.is-done {
  color: var(--cc-success);
  background: var(--cc-success-bg);
  border-color: color-mix(in srgb, var(--cc-success-border) 70%, transparent);
}

.todo-meta-chip.is-cancelled {
  color: var(--cc-error);
  background: var(--cc-error-bg);
  border-color: color-mix(in srgb, var(--cc-error-border) 70%, transparent);
}

.todo-focus-card {
  padding: 11px 12px 10px;
  border: 1px solid var(--cc-tool-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--cc-bg-secondary) 88%, transparent);
}

.todo-section-label {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--cc-text-dim);
  margin-bottom: 8px;
}

.todo-focus-text {
  font-size: 12px;
  line-height: 1.65;
  color: var(--cc-text-secondary);
  white-space: pre-wrap;
}

.todo-list {
  display: grid;
  gap: 8px;
  padding-bottom: 2px;
}

.todo-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--cc-tool-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--cc-bg-secondary) 74%, transparent);
}

.todo-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  font-size: 11px;
  color: var(--cc-text-secondary);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cc-bg) 26%, transparent);
}

.todo-index.s-in_progress {
  color: var(--cc-primary);
  background: var(--cc-warning-bg);
}

.todo-index.s-completed {
  color: var(--cc-success);
  background: var(--cc-success-bg);
}

.todo-index.s-cancelled {
  color: var(--cc-error);
  background: var(--cc-error-bg);
}

.todo-main {
  min-width: 0;
}

.todo-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--cc-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.todo-status {
  font-size: 10px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.todo-status.s-pending {
  background: var(--cc-border);
  color: var(--cc-text-secondary);
}

.todo-status.s-in_progress {
  background: var(--cc-warning-bg);
  color: var(--cc-primary);
}

.todo-status.s-completed {
  background: var(--cc-success-bg);
  color: var(--cc-success);
}

.todo-status.s-cancelled {
  background: var(--cc-error-bg);
  color: var(--cc-error);
}
</style>
