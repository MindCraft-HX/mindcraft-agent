<template>
  <div class="ps-panel">
    <div class="ps-cmd" v-if="data.command">
      <code>{{ data.command }}</code>
    </div>
    <div class="ps-desc" v-if="data.description">{{ data.description }}</div>
    <div class="ps-meta" v-if="data.cwd || data.timeout || data.env">
      <span v-if="data.cwd" class="ps-tag">cwd: {{ data.cwd }}</span>
      <span v-if="data.timeout" class="ps-tag">{{ data.timeout }}ms</span>
      <span v-if="data.env" class="ps-tag">env</span>
    </div>
    <details v-if="data.output || data.stderr" class="ps-output">
      <summary>输出</summary>
      <pre class="ps-output-text">{{ data.output || data.stderr }}</pre>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  msg: { type: Object, required: true },
})

const data = computed(() => {
  const raw = props.msg?.text
  if (!raw || typeof raw !== 'string') return {}
  try { return JSON.parse(raw) } catch (_) { return {} }
})
</script>

<style scoped>
.ps-panel {
  padding: 0;
  display: flex; flex-direction: column;
  background: var(--cc-bg-code-deep);
}
.ps-panel > * + * {
  border-top: 1px solid var(--cc-border);
}
.ps-cmd code {
  display: block;
  font-size: 12px; color: var(--cc-tool-done);
  font-family: 'Cascadia Code', Consolas, monospace;
  background: var(--cc-bg-code-deep);
  padding: 7px 10px;
  word-break: break-all; line-height: 1.5;
}
.ps-desc {
  font-size: 12px; color: var(--cc-text-secondary);
  padding: 7px 10px;
}
.ps-meta {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px;
}
.ps-tag {
  font-size: 10px; padding: 1px 6px; border-radius: 8px;
  background: var(--cc-bg-tertiary); color: var(--cc-text-dim);
}
.ps-output {
  margin: 0;
}
.ps-output > summary {
  display: block;
  cursor: pointer; font-size: 11px; color: var(--cc-text-dim);
  padding: 6px 10px 4px; user-select: none;
  list-style: none;
}
.ps-output > summary::-webkit-details-marker {
  display: none;
}
.ps-output-text {
  margin: 0; padding: 6px 10px 8px; font-size: 11px;
  color: var(--cc-text-muted); line-height: 1.5;
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre-wrap; word-break: break-all;
  max-height: 200px; overflow: auto;
  background: var(--cc-bg-deepest);
}
</style>
