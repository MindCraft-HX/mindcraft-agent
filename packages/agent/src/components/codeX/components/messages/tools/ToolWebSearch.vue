<template>
  <div class="web-search-panel">
    <div class="search-query" v-if="query">
      <span class="label">搜索：</span>
      <span class="value">{{ query }}</span>
    </div>
    <div v-else class="search-empty">网页搜索</div>
    <details v-if="rawText" class="tool-raw-details">
      <summary>原始参数</summary>
      <pre class="tool-raw">{{ rawText }}</pre>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  msg: { type: Object, required: true },
})

const query = computed(() => {
  const raw = props.msg?.text
  if (!raw || typeof raw !== 'string') return ''
  try {
    const obj = JSON.parse(raw)
    return obj?.query || ''
  } catch (_) { return '' }
})

const rawText = computed(() => props.msg?.text || '')
</script>

<style scoped>
.web-search-panel { padding: 8px 10px; }
.search-query { font-size: 12px; line-height: 1.4; }
.search-query .label { color: var(--cc-text-muted); }
.search-query .value { color: var(--cc-text-secondary); font-weight: 500; }
.search-empty { font-size: 12px; color: var(--cc-text-muted); }
.tool-raw-details { border-top: 1px solid var(--cc-bg-tertiary); margin-top: 6px; }
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
