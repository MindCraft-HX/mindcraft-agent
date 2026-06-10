<template>
  <div class="status-bar-metrics">
    <!-- 左侧区域 -->
    <div class="sb-left">
      <!-- 模型 -->
      <span v-if="shortModel" class="sb-group">
        <span class="sb-icon">🤖</span>
        <span class="sb-val">{{ shortModel }}</span>
      </span>

      <!-- 费用 -->
      <!-- <span v-if="m.costUsd > 0" class="sb-group">
        <span class="sb-icon">💲</span>
        <span class="sb-val">{{ m.costUsd.toFixed(3) }}</span>
      </span> -->

      <!-- Token 用量 -->
      <span v-if="hasTokenData" class="sb-group">
        <span class="sb-icon">📊</span>
        <span class="sb-val">in {{ fmtK(m.inputTokens) }}</span>
        <span class="sb-sep">/</span>
        <span class="sb-val">out {{ fmtK(m.outputTokens) }}</span>
        <span v-if="hasCache" class="sb-sep">/</span>
        <span v-if="hasCache" class="sb-val sb-cache">cache {{ fmtK(m.cacheReadTokens + m.cacheCreationTokens) }}</span>
      </span>

      <!-- 上下文 -->
      <span v-if="contextPct > 0 || compacting" class="sb-group sb-context-wrap" :class="{ 'sb-warn': contextPct > 80, 'sb-compacting': compacting }">
        <svg class="sb-ring" :class="{ 'sb-ring-spin': compacting }" viewBox="0 0 24 24" width="16" height="16">
          <circle class="sb-ring-bg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5"/>
          <circle v-if="!compacting" class="sb-ring-fg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5"
            :stroke-dasharray="`${contextPct * 0.5655} 56.55`"
            stroke-linecap="round"
            transform="rotate(-90 12 12)"
          />
          <circle v-else class="sb-ring-fg sb-ring-compacting" cx="12" cy="12" r="9" fill="none" stroke-width="2.5"
            stroke-dasharray="28 56.55"
            stroke-linecap="round"
            transform="rotate(-90 12 12)"
          />
        </svg>
        <span v-if="!compacting" class="sb-val">{{ contextPct }}%</span>
        <span v-else class="sb-val sb-compacting-text">压缩中</span>
        <span class="sb-tooltip">
          <template v-if="!compacting">
            <span class="sb-tooltip-title">上下文已用 {{ contextPct }}%（{{ fmtK(m.contextUsage) }} / {{ fmtK(m.contextWindow) }} tokens）</span>
            <span class="sb-tooltip-sub">CodeX 根据自动压缩阈值自动管理上下文。</span>
          </template>
          <span v-else class="sb-tooltip-title">CodeX 正在自动压缩上下文…</span>
        </span>
      </span>
    </div>

    <!-- 右侧区域 -->
    <div class="sb-right">
      <!-- 运行中指示 -->
      <span v-if="m.thinking" class="sb-group sb-thinking">
        <span class="sb-dot"></span>
        <span class="sb-val">运行中 {{ formatDuration(displayDurationMs) }}</span>
      </span>
      <!-- 已完成显示总时长 -->
      <span v-else-if="displayDurationMs > 0" class="sb-group">
        <span class="sb-val">用时 {{ formatDuration(displayDurationMs) }}</span>
      </span>

      <!-- 速度 -->
      <span v-if="hasSpeed" class="sb-group">
        <span class="sb-icon">⚡</span>
        <span class="sb-val">in {{ m.speedInputPerSec }}/s</span>
        <span class="sb-sep">·</span>
        <span class="sb-val">out {{ m.speedOutputPerSec }}/s</span>
      </span>

      <!-- Git -->
      <span v-if="m.gitBranch" class="sb-group">
        <span class="sb-icon">🔀</span>
        <span class="sb-val sb-branch">{{ m.gitBranch }}</span>
        <span v-if="m.gitChanges > 0" class="sb-val sb-changes">({{ m.gitChanges }})</span>
      </span>

      <!-- API 限额 -->
      <span v-if="m.usageApiSessionPct != null" class="sb-group" :class="{ 'sb-warn': m.usageApiSessionPct > 80 }">
        <span class="sb-icon">⏱</span>
        <span class="sb-val">{{ m.usageApiSessionPct.toFixed(0) }}%</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  metrics: { type: Object, required: true },
  liveDurationMs: { type: Number, default: 0 },
  compacting: { type: Boolean, default: false },
})

const m = computed(() => props.metrics)

const shortModel = computed(() => {
  return m.value.model || ''
})

const hasTokenData = computed(() => m.value.inputTokens > 0 || m.value.outputTokens > 0)
const hasCache = computed(() => m.value.cacheReadTokens > 0 || m.value.cacheCreationTokens > 0)

const contextPct = computed(() => {
  if (!m.value.contextUsage || !m.value.contextWindow) return 0
  const pct = Math.min(100, Math.round((m.value.contextUsage / m.value.contextWindow) * 100))
  return pct
})

const displayDurationMs = computed(() => {
  if (m.value.thinking && props.liveDurationMs > 0) return props.liveDurationMs
  if (m.value.durationMs > 0) return m.value.durationMs
  return props.liveDurationMs || 0
})

const hasSpeed = computed(() => m.value.speedInputPerSec > 0 || m.value.speedOutputPerSec > 0)

function fmtK(n) {
  if (!n) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function formatDuration(ms) {
  if (!ms) return '0s'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return sec + 's'
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return `${min}m${rem > 0 ? rem + 's' : ''}`
  const hr = Math.floor(min / 60)
  const rMin = min % 60
  return `${hr}h${rMin > 0 ? rMin + 'm' : ''}`
}
</script>

<style scoped>
.status-bar-metrics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
  font-size: 12px;
  color: var(--cc-statusbar-text);
  background: var(--cc-statusbar-bg);
  border-top: 1px solid var(--cc-statusbar-border);
  flex-shrink: 0;
  min-height: 28px;
  user-select: none;
}

.sb-left, .sb-right {
  display: flex;
  align-items: center;
  gap: 0;
}

.sb-right {
  gap: 0;
}

.sb-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  white-space: nowrap;
}

.sb-group:first-child { padding-left: 0; }

.sb-icon {
  font-size: 11px;
  opacity: 0.7;
}

.sb-val {
  color: var(--cc-text-secondary);
  font-weight: 500;
}

.sb-sep {
  color: var(--cc-text-dim);
  margin: 0 1px;
}

.sb-cache {
  color: var(--cc-statusbar-muted);
}

.sb-branch {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-changes {
  color: var(--cc-warning);
}

.sb-warn .sb-val {
  color: var(--cc-warning);
}

.sb-thinking .sb-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cc-success-text);
  animation: sb-pulse 1.5s ease-in-out infinite;
}

@keyframes sb-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 上下文圆形进度条 */
.sb-context-wrap {
  position: relative;
}

.sb-context-wrap:hover .sb-tooltip {
  display: flex;
}

.sb-ring {
  flex-shrink: 0;
  display: block;
}

.sb-ring-bg {
  stroke: var(--cc-border-light);
}

.sb-ring-fg {
  stroke: var(--cc-success-text);
  transition: stroke-dasharray 0.4s ease;
}

.sb-warn .sb-ring-fg {
  stroke: var(--cc-warning);
}

/* 压缩中：圆环旋转动画 */
.sb-compacting {
  cursor: default;
}

.sb-ring-spin {
  animation: sb-ring-rotate 1.2s linear infinite;
}

@keyframes sb-ring-rotate {
  to { transform: rotate(360deg); }
}

.sb-ring-compacting {
  stroke: var(--cc-primary);
  transition: none;
}

.sb-compacting-text {
  color: var(--cc-primary) !important;
}

.sb-tooltip {
  display: none;
  flex-direction: column;
  gap: 4px;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--cc-bg-elevated);
  border: 1px solid var(--cc-border-light);
  border-radius: 6px;
  padding: 8px 12px;
  white-space: nowrap;
  width: max-content;
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 4px 16px var(--cc-shadow);
}

.sb-tooltip-title {
  font-size: 12px;
  color: var(--cc-text-secondary);
  font-weight: 400;
  line-height: 1.4;
  white-space: normal;
  max-width: 320px;
}

.sb-tooltip-sub {
  font-size: 11px;
  color: var(--cc-text-muted);
}
</style>
