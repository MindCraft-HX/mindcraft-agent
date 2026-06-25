<template>
  <div v-if="show" class="token-meta-row">
    <span v-if="showDuration" class="meta-item">🕐 {{ fmtDuration(durationMs) }}</span>
    <span v-if="showTokens" class="meta-item">📊 in {{ fmtK(inputTokens) }} / out {{ fmtK(outputTokens) }}</span>
    <span v-if="showCache" class="meta-item">💾 cache {{ fmtK(cacheReadTokens) }}</span>
    <span v-if="showCost" class="meta-item">💰 ${{ costUsd.toFixed(2) }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  cacheReadTokens: { type: Number, default: 0 },
  cacheCreationTokens: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
})

const show = computed(() =>
  (props.inputTokens > 0 || props.outputTokens > 0 || props.cacheReadTokens > 0 || props.durationMs > 0)
)

const showDuration = computed(() => props.durationMs > 0)
const showTokens = computed(() => props.inputTokens > 0 || props.outputTokens > 0 || props.cacheReadTokens > 0)
const showCache = computed(() => (props.cacheReadTokens || 0) > 0)
const showCost = computed(() => props.costUsd > 0)

function fmtK(n) {
  if (!n) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function fmtDuration(ms) {
  if (!ms) return '0s'
  const sec = ms / 1000
  if (sec < 60) return sec.toFixed(1) + 's'
  const min = Math.floor(sec / 60)
  const rem = Math.floor(sec % 60)
  if (min < 60) return `${min}m${rem > 0 ? rem + 's' : ''}`
  const hr = Math.floor(min / 60)
  const rMin = min % 60
  return `${hr}h${rMin > 0 ? rMin + 'm' : ''}`
}
</script>

<style scoped>
.token-meta-row {
  margin-top: 10px;
  padding-left: 8px;
  border-left: 2px solid var(--cc-border-light);
  font-size: 11px;
  color: var(--cc-text-dim);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  opacity: 0.55;
  user-select: none;
  line-height: 1.5;
  animation: meta-fade-in 0.4s ease;
}

@keyframes meta-fade-in {
  from { opacity: 0; }
  to   { opacity: 0.55; }
}
</style>
