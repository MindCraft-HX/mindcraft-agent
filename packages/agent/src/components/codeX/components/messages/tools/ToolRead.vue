<template>
  <div>
    <div class="tool-file-label">
      <span v-if="msg.filePath" class="doc-file-link" @click.stop="openInDocumentViewer">{{ msg.filePath }}</span>
      <span v-if="msg.readContent" class="diff-expand-btn" @click.stop="$emit('expand')">⤢</span>
    </div>
    <pre v-if="msg.readContent" class="tool-code"><code v-html="highlight(msg.readContent, msg.filePath)"></code></pre>
  </div>
</template>

<script setup>
import { highlight } from '../../../../agentCommon/render.js'

const props = defineProps({
  msg: { type: Object, required: true },
})
defineEmits(['expand'])

function openInDocumentViewer() {
  window.electronAPI?.openMdWin?.({
    filePath: props.msg.filePath,
    content: props.msg.readContent || '',
    source: 'agent-file-link',
  })
}
</script>

<style scoped>
.tool-file-label {
  font-size: 10px; color: var(--cc-tool-label); padding: 5px 10px 2px;
  font-family: 'Cascadia Code', Consolas, monospace;
}
.tool-code {
  margin: 0; padding: 7px 10px; font-size: 11px; color: var(--cc-tool-output);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: auto; max-height: 320px; white-space: pre;
}
.doc-file-link {
  cursor: pointer; color: var(--cc-link, var(--cc-assistant-heading));
  text-decoration: underline; text-underline-offset: 2px;
}
.doc-file-link:hover { color: var(--cc-primary); }
.diff-expand-btn {
  float: right; cursor: pointer; font-size: 14px;
  color: var(--cc-diff-expand-btn); padding: 0 4px; border-radius: 3px;
}
.diff-expand-btn:hover {
  color: var(--cc-diff-expand-btn-hover-color);
  background: var(--cc-diff-expand-btn-hover-bg);
}
</style>
