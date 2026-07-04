<template>
  <div class="bash-panel">
    <div class="bash-meta" v-if="msg.bashCwd">
      <span class="bash-cwd-label">cwd</span>
      <span class="bash-cwd-path">{{ msg.bashCwd }}</span>
    </div>
    <pre class="bash-cmd">$ {{ msg.bashCmd }}</pre>

    <!-- 小输出：保持当前 <details> 体验 -->
    <details v-if="msg.bashOutput && !isLargeOutput" class="bash-output-details">
      <summary class="bash-output-summary">{{ $t('agent.output') }}</summary>
      <pre class="bash-output">{{ msg.bashOutput }}</pre>
    </details>

    <!-- 大输出：preview + 按需挂载完整输出 -->
    <div v-if="msg.bashOutput && isLargeOutput" class="bash-output-large">
      <div class="bash-output-summary-row">
        <span class="bash-output-stats">
          {{ $t('agent.output') }}（{{ outputStats }}）
        </span>
        <button
          class="bash-output-toggle"
          :aria-expanded="showFullOutput"
          @click="showFullOutput = !showFullOutput"
        >
          {{ showFullOutput ? $t('agent.collapseOutput') : $t('agent.expandOutput') }}
        </button>
      </div>
      <pre class="bash-output-preview">{{ previewResult?.preview || '' }}</pre>
      <pre v-if="showFullOutput" class="bash-output">{{ msg.bashOutput }}</pre>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  buildBashOutputPreview,
  LARGE_BASH_OUTPUT_CHARS,
  LARGE_BASH_OUTPUT_LINES,
} from '../../../utils/codexUiEventMapper.mjs'

const { t } = useI18n()

const props = defineProps({
  msg: { type: Object, required: true },
})
defineEmits(['expand'])

const showFullOutput = ref(false)

// 切换消息时重置展开状态
watch(() => props.msg.toolUseId, () => {
  showFullOutput.value = false
})

const isLargeOutput = computed(() => {
  const output = props.msg.bashOutput || ''
  if (!output) return false
  if (output.length > LARGE_BASH_OUTPUT_CHARS) return true
  const lines = output.split('\n')
  const lineCount = lines.length - (lines.length > 1 && lines[lines.length - 1] === '' ? 1 : 0)
  return lineCount > LARGE_BASH_OUTPUT_LINES
})

const previewResult = computed(() => {
  if (!isLargeOutput.value) return null
  return buildBashOutputPreview(props.msg.bashOutput || '')
})

const outputStats = computed(() => {
  const r = previewResult.value
  if (!r) return ''
  return `${r.totalLines} ${t('agent.lines')}，${r.totalChars.toLocaleString()} ${t('agent.chars')}`
})
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

/* 大输出样式 */
.bash-output-large {
  margin: 0;
  border-top: 1px solid var(--cc-border);
}
.bash-output-summary-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px 4px;
}
.bash-output-stats {
  font-size: 11px; color: var(--cc-text-dim);
  user-select: none;
}
.bash-output-toggle {
  font-size: 11px; color: var(--cc-tool-done);
  background: none; border: 1px solid var(--cc-border);
  border-radius: 4px; padding: 1px 8px; cursor: pointer;
  font-family: inherit;
}
.bash-output-toggle:hover {
  background: var(--cc-bg-hover);
}
.bash-output-preview {
  margin: 0; padding: 7px 10px; font-size: 11px; color: var(--cc-text-tertiary);
  font-family: 'Cascadia Code', Consolas, monospace;
  overflow: auto; max-height: 200px; white-space: pre;
  background: var(--cc-bg-deepest);
  opacity: 0.75;
}
</style>
