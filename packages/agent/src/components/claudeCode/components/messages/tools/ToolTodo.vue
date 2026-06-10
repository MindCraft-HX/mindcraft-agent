<template>
  <div class="todo-panel">
    <!-- 有任务列表时（旧格式 TodoWrite / TaskCreate） -->
    <div v-if="todoList.length" class="todo-list">
      <div v-for="(t, i) in todoList" :key="`${t.id || i}-${t.content || ''}`" class="todo-row">
        <span class="todo-status" :class="`s-${t.status || 'pending'}`">{{ statusLabel(t.status) }}</span>
        <span class="todo-text">{{ t.content || t.id || '未命名任务' }}</span>
      </div>
    </div>
    <!-- 单条操作结果（TaskUpdate / TaskDelete） -->
    <div v-else-if="singleAction" class="todo-single">
      <span class="todo-status" :class="`s-${singleAction.status}`">{{ statusLabel(singleAction.status) }}</span>
      <span class="todo-text">{{ singleAction.label }}</span>
    </div>
    <!-- TaskCreate：有 activeForm / description / subject -->
    <div v-else-if="taskCreate" class="todo-single">
      <span class="todo-status" :class="`s-${taskCreate.status || 'pending'}`">{{ statusLabel(taskCreate.status || 'pending') }}</span>
      <span class="todo-text">{{ taskCreate.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  msg: { type: Object, required: true },
})

const parsed = computed(() => {
  const raw = props.msg?.text
  if (!raw || typeof raw !== 'string') return {}
  try { return JSON.parse(raw) } catch (_) { return {} }
})

const todoList = computed(() => {
  const raw = parsed.value
  if (!Array.isArray(raw?.todos)) return []
  return raw.todos.map(t => ({
    id: t?.id || t?.task_id || '',
    content: t?.content || t?.task || '',
    status: t?.status || 'pending',
  }))
})

const singleAction = computed(() => {
  const raw = parsed.value
  if (raw?.todos) return null
  if (raw?.status && (raw?.taskId !== undefined || raw?.task_id !== undefined)) {
    return {
      status: raw.status,
      label: `任务 #${raw.taskId ?? raw.task_id} ${raw.status === 'completed' ? '已完成' : raw.status === 'cancelled' ? '已取消' : raw.status === 'deleted' ? '已删除' : raw.status === 'in_progress' ? '进行中' : raw.status}`,
    }
  }
  return null
})

const taskCreate = computed(() => {
  const raw = parsed.value
  if (raw?.todos || raw?.status || singleAction.value) return null
  if (raw?.description || raw?.subject || raw?.activeForm || raw?.task) {
    return {
      status: raw?.status || 'pending',
      label: raw?.activeForm || raw?.subject || raw?.description || raw?.task || '新任务',
    }
  }
  return null
})

function statusLabel(status) {
  const s = String(status || 'pending')
  if (s === 'completed') return '已完成'
  if (s === 'in_progress') return '进行中'
  if (s === 'cancelled' || s === 'deleted') return '已取消'
  return '待处理'
}
</script>

<style scoped>
.todo-panel { padding: 8px 10px; border-bottom: 1px solid var(--cc-bg-tertiary); }
.todo-list { display: flex; flex-direction: column; gap: 6px; }
.todo-row { display: flex; align-items: center; gap: 8px; }
.todo-single { display: flex; align-items: center; gap: 8px; }
.todo-status { font-size: 10px; border-radius: 10px; padding: 1px 7px; flex-shrink: 0; }
.todo-status.s-pending { background: var(--cc-border); color: var(--cc-text-secondary); }
.todo-status.s-in_progress { background: var(--cc-warning-bg); color: var(--cc-primary); }
.todo-status.s-completed { background: var(--cc-success-bg); color: var(--cc-success); }
.todo-status.s-cancelled { background: var(--cc-error-bg); color: var(--cc-error); }
.todo-status.s-deleted { background: var(--cc-error-bg); color: var(--cc-error-text); }
.todo-text { font-size: 12px; color: var(--cc-text-secondary); line-height: 1.35; }
</style>
