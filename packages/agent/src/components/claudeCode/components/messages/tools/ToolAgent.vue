<template>
  <div class="agent-panel">
    <div class="agent-meta">
      <span v-if="data.subagent_type" class="agent-tag">{{ data.subagent_type }}</span>
      <span v-if="data.model" class="agent-tag model">{{ data.model }}</span>
    </div>
    <div v-if="data.description" class="agent-desc">{{ data.description }}</div>
    <details v-if="data.prompt" class="agent-prompt-details">
      <summary>Prompt</summary>
      <pre class="agent-prompt">{{ data.prompt }}</pre>
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
.agent-panel {
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.agent-meta {
  display: flex; gap: 6px; align-items: center;
}
.agent-tag {
  font-size: 10px; padding: 1px 7px; border-radius: 10px;
  background: var(--cc-info-bg); color: var(--cc-info-text);
}
.agent-tag.model {
  background: var(--cc-warning-bg); color: var(--cc-primary);
}
.agent-desc {
  font-size: 12px; color: var(--cc-text-secondary); line-height: 1.4;
}
.agent-prompt-details {
  border-top: 1px solid var(--cc-bg-tertiary); margin-top: 2px;
}
.agent-prompt-details > summary {
  cursor: pointer; font-size: 11px; color: var(--cc-text-dim);
  padding: 5px 0 3px; user-select: none;
}
.agent-prompt {
  margin: 0; padding: 6px 0; font-size: 11px;
  color: var(--cc-text-muted); line-height: 1.5;
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre-wrap; word-break: break-word;
  max-height: 200px; overflow: auto;
}
</style>
