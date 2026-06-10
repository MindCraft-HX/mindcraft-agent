<template>
  <Teleport to="body">
    <div v-if="visible" class="diff-modal-overlay" :class="themeClass" @click.self="$emit('close')">
      <div class="diff-modal">
        <div class="diff-modal-header">
          <span class="diff-modal-title">{{ title }}</span>
          <span class="diff-modal-close" @click="$emit('close')">✕</span>
        </div>
        <div class="diff-modal-body">
          <template v-if="diffLines && diffLines.length">
            <DiffSplitView :diffLines="diffLines" :filePath="filePath" />
          </template>
          <template v-else>
            <pre class="modal-code-pre"><code v-html="codeHtml"></code></pre>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useClaudeThemeStore } from '../../../stores/claudeTheme.js'
import { highlight } from '../render.js'
import DiffSplitView from '../components/DiffSplitView.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  diffLines: { type: Array, default: () => [] },
  filePath: { type: String, default: '' },
  rawContent: { type: String, default: '' },
})

defineEmits(['close'])

const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

const codeHtml = computed(() => {
  if (!props.rawContent) return ''
  return highlight(props.rawContent, props.filePath)
})
</script>

<style>
.diff-modal-overlay {
  position: fixed; inset: 0;
  background: var(--cc-diff-modal-overlay, rgba(0, 0, 0, 0.7));
  z-index: 9999; display: flex;
  align-items: center; justify-content: center;
}
.diff-modal {
  width: 92vw; height: 85vh;
  background: var(--cc-diff-modal-bg, #111);
  border-radius: 8px; display: flex;
  flex-direction: column; overflow: hidden;
  border: 1px solid var(--cc-diff-modal-border, #333);
}
.diff-modal-header {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--cc-diff-modal-header-bg, #222);
  border-bottom: 1px solid var(--cc-diff-modal-border, #333);
}
.diff-modal-title {
  font-size: 13px; color: var(--cc-diff-modal-title, #ccc);
  font-family: 'Cascadia Code', Consolas, monospace;
}
.diff-modal-close {
  cursor: pointer; color: var(--cc-diff-modal-close, #888);
  font-size: 16px; padding: 2px 6px; border-radius: 3px;
}
.diff-modal-close:hover {
  color: var(--cc-diff-modal-close-hover-color, #fff);
  background: var(--cc-diff-modal-close-hover-bg, #444);
}
.diff-modal-body {
  flex: 1; overflow-x: hidden; overflow-y: auto;
  padding: 8px 0; color: var(--cc-diff-modal-body-text, #cfcfcf);
  background: var(--cc-diff-modal-body-bg, #0d0d0d);
}
.diff-modal-body .modal-code-pre {
  margin: 0; padding: 10px 16px;
  font-size: 12px; line-height: 1.6;
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: pre; overflow-x: auto;
  color: var(--cc-diff-modal-body-text, #cfcfcf);
}
</style>
