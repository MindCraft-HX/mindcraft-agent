<template>
  <span class="tool-status-badge" :class="[`badge-${status}`]" aria-label="工具状态">
    <!-- running: pulsing dot -->
    <span v-if="status === 'running'" class="badge-dot" aria-hidden="true"></span>
    <!-- pending: bolt icon (simplified) -->
    <svg v-else-if="status === 'pending'" class="badge-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5.5 1L3 5.5h2L4 9l3.5-5h-2L6.5 1z" fill="currentColor"/>
    </svg>
    <!-- done: check -->
    <svg v-else-if="status === 'done'" class="badge-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <!-- denied: x -->
    <svg v-else-if="status === 'denied'" class="badge-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </svg>
    <!-- error: triangle -->
    <svg v-else-if="status === 'error'" class="badge-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 1l4.5 8H.5z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
      <path d="M5 4.5v1.5M5 7.5v.01" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </svg>
    <span class="badge-text">{{ label }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'done' },
})

const labels = {
  running: '运行中',
  pending: '待确认',
  done: '完成',
  denied: '已拒绝',
  error: '失败',
}

const label = computed(() => labels[props.status] || props.status)
</script>

<style scoped>
.tool-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 10px;
  flex-shrink: 0;
  user-select: none;
}

/* Status colors */
.badge-running {
  background: var(--cc-success-bg);
  color: var(--cc-hljs-built-in);
}
.badge-done {
  background: var(--cc-success-bg);
  color: var(--cc-success);
}
.badge-pending {
  background: var(--cc-warning-bg);
  color: var(--cc-primary);
}
.badge-denied {
  background: var(--cc-error-bg);
  color: var(--cc-error);
}
.badge-error {
  background: var(--cc-tool-deny-hover-bg);
  color: var(--cc-error-text);
}

/* Badge icon */
.badge-icon {
  flex-shrink: 0;
  color: inherit;
}

/* Running dot */
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  animation: status-pulse 2s ease-in-out infinite;
}

.badge-text {
  line-height: 1;
}

/* Pending: animate the icon only to avoid flashing the whole badge */
.badge-pending .badge-icon {
  animation: status-breathe 2.2s ease-in-out infinite;
}

/* Animations */
@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@keyframes status-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .badge-icon,
  .badge-dot,
  .tool-status-badge {
    animation: none !important;
  }
}
</style>
