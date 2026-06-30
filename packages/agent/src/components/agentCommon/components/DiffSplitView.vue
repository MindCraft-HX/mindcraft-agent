<template>
  <div class="diff-view split">
    <div class="diff-split-container">
      <div class="diff-split-side left">
        <template v-for="(h, i) in diffLines" :key="'l'+i">
          <div v-if="h.type === 'ctx'" class="diff-line ctx" v-html="highlight(h.text, filePath)"></div>
          <template v-else>
            <div v-for="(t, j) in (h.del || [])" :key="'d'+j" class="diff-line del">
              <template v-if="h.delSegments && h.delSegments[j]">
                <span v-for="(seg, k) in h.delSegments[j]" :key="k"
                  :class="{ 'diff-word-changed': seg.type === 'changed' }">{{ seg.value }}</span>
              </template>
              <template v-else v-html="highlight(t, filePath)"></template>
            </div>
            <div v-for="n in Math.max(0, (h.add?.length || 0) - (h.del?.length || 0))" :key="'ep'+n" class="diff-line empty"></div>
          </template>
        </template>
      </div>
      <div class="diff-split-side right">
        <template v-for="(h, i) in diffLines" :key="'r'+i">
          <div v-if="h.type === 'ctx'" class="diff-line ctx" v-html="highlight(h.text, filePath)"></div>
          <template v-else>
            <div v-for="n in Math.max(0, (h.del?.length || 0) - (h.add?.length || 0))" :key="'ep'+n" class="diff-line empty"></div>
            <div v-for="(t, j) in (h.add || [])" :key="'a'+j" class="diff-line add">
              <template v-if="h.addSegments && h.addSegments[j]">
                <span v-for="(seg, k) in h.addSegments[j]" :key="k"
                  :class="{ 'diff-word-changed': seg.type === 'changed' }">{{ seg.value }}</span>
              </template>
              <template v-else v-html="highlight(t, filePath)"></template>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { highlight } from '../render.js'

defineProps({
  diffLines: { type: Array, required: true },
  filePath: { type: String, default: '' },
})
</script>

<style scoped>
.diff-view { padding: 6px 0; }
.diff-split-container { display: flex; width: 100%; }
.diff-split-side {
  flex: 1; min-width: 0; overflow-x: auto;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px; line-height: 1.6;
  background: var(--cc-bg-deepest);
}
.diff-split-side::-webkit-scrollbar { height: 4px; }
.diff-split-side.left { border-right: 1px solid var(--cc-border-strong); }
.diff-line { display: flex; padding: 0 10px; min-height: 19.2px; white-space: pre; }
.diff-line.add { background: var(--cc-diff-add-bg); }
.diff-line.del { background: var(--cc-diff-del-bg); }
.diff-line.ctx { color: var(--cc-diff-ctx); }
.diff-line.empty { background: var(--cc-diff-empty-bg); }
.diff-line :deep(.hljs) { white-space: pre; }
.diff-line.del .diff-word-changed {
  background: var(--cc-diff-word-del-bg, #6b2828);
  border-radius: 2px; padding: 0 1px;
}
.diff-line.add .diff-word-changed {
  background: var(--cc-diff-word-add-bg, #3f5c2a);
  border-radius: 2px; padding: 0 1px;
}
</style>
