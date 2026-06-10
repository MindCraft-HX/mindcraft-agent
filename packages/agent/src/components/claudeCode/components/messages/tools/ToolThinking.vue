<template>
  <pre v-if="text" class="thinking-pre">{{ text }}</pre>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  msg: { type: Object, required: true },
})

const text = computed(() => {
  const raw = props.msg?.text
  if (!raw || typeof raw !== 'string') return ''
  if (raw.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(raw.trim())
      if (obj && typeof obj === 'object') {
        return obj.thinking || (obj.type === 'thinking' ? obj.text : '') || raw.trim()
      }
    } catch (_) {}
  }
  return raw.trim()
})
</script>

<style scoped>
.thinking-pre {
  margin: 0; padding: 8px 10px;
  font-size: 11px; line-height: 1.55;
  color: var(--cc-text-secondary);
  font-family: 'Cascadia Code', Consolas, monospace;
  background: var(--cc-bg-code-deep);
  border-radius: 6px; white-space: pre-wrap;
  word-break: break-word; max-height: 320px; overflow: auto;
}
</style>
