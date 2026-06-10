<template>
  <div>
    <div v-if="summaryLines.length" class="tool-generic-summary">
      <div v-for="(line, i) in summaryLines" :key="i" class="tool-summary-line">{{ line }}</div>
    </div>
    <details v-if="msg.text" class="tool-raw-details">
      <summary>原始参数</summary>
      <pre class="tool-raw">{{ msg.text }}</pre>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  msg: { type: Object, required: true },
})

const summaryLines = computed(() => {
  const raw = props.msg?.text
  if (!raw || typeof raw !== 'string') return []
  let obj
  try { obj = JSON.parse(raw) } catch (_) { return [] }
  if (!obj || typeof obj !== 'object') return []
  const name = (props.msg?.toolName || '').toLowerCase()

  if (name === 'grep') {
    const lines = []
    if (obj.pattern) lines.push(`搜索：${obj.pattern}`)
    if (obj.path) lines.push(`路径：${obj.path}`)
    return lines
  }
  if (name === 'glob') {
    const lines = []
    if (obj.pattern) lines.push(`匹配：${obj.pattern}`)
    if (obj.path) lines.push(`路径：${obj.path}`)
    return lines
  }

  const lines = []
  for (const [k, v] of Object.entries(obj).slice(0, 6)) {
    if (v == null) continue
    if (Array.isArray(v)) lines.push(`${k}: [${v.length}项]`)
    else if (typeof v === 'object') lines.push(`${k}: {对象}`)
    else lines.push(`${k}: ${String(v)}`)
  }
  return lines
})
</script>

<style scoped>
.tool-generic-summary { padding: 6px 10px; display: flex; flex-direction: column; gap: 4px; }
.tool-summary-line { font-size: 11px; color: var(--cc-text-muted); line-height: 1.45; }
.tool-raw-details { border-top: 1px solid var(--cc-bg-tertiary); }
.tool-raw-details > summary {
  cursor: pointer; font-size: 11px; color: var(--cc-text-dim);
  padding: 6px 10px 4px; user-select: none;
}
.tool-raw {
  margin: 0; padding: 7px 10px; font-size: 11px; color: var(--cc-text-dim);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow-x: auto; max-height: 160px; white-space: pre;
}
</style>
