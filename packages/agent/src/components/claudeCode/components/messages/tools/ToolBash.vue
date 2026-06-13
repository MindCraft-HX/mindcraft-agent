<template>
  <div class="bash-panel">
    <div class="bash-meta" v-if="msg.bashCwd">
      <span class="bash-cwd-label">cwd</span>
      <span class="bash-cwd-path">{{ msg.bashCwd }}</span>
    </div>
    <pre class="bash-cmd">$ {{ msg.bashCmd }}</pre>
    <details v-if="msg.bashOutput" class="bash-output-details">
      <summary class="bash-output-summary">{{ $t('agent.output') }}</summary>
      <pre class="bash-output">{{ msg.bashOutput }}</pre>
    </details>
  </div>
</template>

<script setup>
defineProps({
  msg: { type: Object, required: true },
})
defineEmits(['expand'])
</script>

<style scoped>
.bash-meta {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; background: var(--cc-bg-code-deep);
  border-bottom: 1px solid var(--cc-border);
}
.bash-cwd-label {
  font-size: 10px; color: var(--cc-text-dim); background: var(--cc-bg-tertiary);
  padding: 1px 5px; border-radius: 3px; flex-shrink: 0;
}
.bash-cwd-path {
  font-size: 11px; color: var(--cc-tool-label);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bash-cmd {
  margin: 0; padding: 7px 10px; font-size: 11px; color: var(--cc-tool-done);
  font-family: 'Cascadia Code', Consolas, monospace;
  background: var(--cc-bg-code-deep); border-bottom: 1px solid var(--cc-border);
  white-space: pre-wrap; word-break: break-all;
}
.bash-panel {
  background: var(--cc-bg-code-deep);
}
.bash-output {
  margin: 0; padding: 7px 10px; font-size: 11px; color: var(--cc-text-tertiary);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: auto; max-height: 300px; white-space: pre;
  background: var(--cc-bg-deepest);
}
.bash-output-details {
  margin: 0;
  border-top: 1px solid var(--cc-border);
}
.bash-output-details > summary {
  display: block;
  cursor: pointer; font-size: 11px; color: var(--cc-text-dim);
  padding: 6px 10px 4px; user-select: none;
  list-style: none;
}
.bash-output-details > summary::-webkit-details-marker {
  display: none;
}
.diff-expand-btn {
  float: right; cursor: pointer; font-size: 14px;
  color: var(--cc-diff-expand-btn); padding: 0 4px; border-radius: 3px;
}
.diff-expand-btn:hover {
  color: var(--cc-diff-expand-btn-hover-color);
  background: var(--cc-diff-expand-btn-hover-bg);
}
</style>
