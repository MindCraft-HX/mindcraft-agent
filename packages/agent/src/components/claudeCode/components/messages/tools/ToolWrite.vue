<template>
  <div class="tool-write-wrap">
    <div class="tool-file-label">{{ msg.filePath }}
      <span v-if="msg.diffLines.length" class="diff-expand-btn" @click.stop="$emit('expand')">⤢</span>
    </div>
    <template v-if="msg.diffLines.length">
      <DiffSplitView :diffLines="msg.diffLines" :filePath="msg.filePath" />
    </template>
    <template v-else-if="msg.newContent">
      <pre class="tool-code"><code v-html="highlight(msg.newContent, msg.filePath)"></code></pre>
    </template>
  </div>
</template>

<script setup>
import { watch, onMounted } from 'vue'
import { highlight } from '../../../../agentCommon/render.js'
import DiffSplitView from '../../../../agentCommon/components/DiffSplitView.vue'
import { buildDiffLinesEnhanced } from '../../../../agentCommon/utils/helpers.js'

const props = defineProps({
  msg: { type: Object, required: true },
})
defineEmits(['expand'])

// 组件挂载或展开时懒计算 diff（用 requestIdleCallback 分批，不阻塞渲染）
function computeDiff() {
  const m = props.msg
  if (m.diffLines?.length || !m._diffInput) return
  const inp = m._diffInput
  if (!inp.oldStr && !inp.newStr) return
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      if (!m.diffLines?.length) m.diffLines = buildDiffLinesEnhanced(inp.oldStr, inp.newStr)
    })
  } else {
    setTimeout(() => {
      if (!m.diffLines?.length) m.diffLines = buildDiffLinesEnhanced(inp.oldStr, inp.newStr)
    }, 0)
  }
}

onMounted(computeDiff)
watch(() => props.msg.expanded, (val) => { if (val) computeDiff() })
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
.diff-expand-btn {
  float: right; cursor: pointer; font-size: 14px;
  color: var(--cc-diff-expand-btn); padding: 0 4px; border-radius: 3px;
}
.diff-expand-btn:hover {
  color: var(--cc-diff-expand-btn-hover-color);
  background: var(--cc-diff-expand-btn-hover-bg);
}
</style>
