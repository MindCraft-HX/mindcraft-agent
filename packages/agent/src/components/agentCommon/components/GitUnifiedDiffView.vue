<template>
  <div class="unified-diff">
    <template v-if="!binary">
      <div
        v-for="(hunk, hi) in hunks"
        :key="'hunk-' + hi"
        class="diff-hunk"
      >
        <div class="diff-hunk-header">{{ hunk.header }}</div>
        <div
          v-for="(line, li) in annotatedLines(hi)"
          :key="'line-' + hi + '-' + li"
          class="diff-line"
          :class="'diff-line--' + line.type"
        >
          <span class="diff-line-num diff-line-num--old">{{
            line.type === 'add' ? '' : line.oldLine
          }}</span>
          <span class="diff-line-num diff-line-num--new">{{
            line.type === 'del' ? '' : line.newLine
          }}</span>
          <span class="diff-line-prefix">{{
            line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
          }}</span>
          <span class="diff-line-text">{{ line.text }}</span>
        </div>
      </div>
    </template>
    <div v-else class="diff-binary-hint">
      {{ $t('git.binaryNoPreview') || 'Binary file - no text preview available' }}
    </div>
    <div v-if="truncated" class="diff-truncated-hint">
      {{
        truncatedAtLines
          ? ($t('git.diffTruncated', { n: truncatedAtLines }) || `Diff truncated (showing first ${truncatedAtLines} lines)`)
          : ($t('git.diffTruncatedGeneric') || 'Diff truncated — output too large')
      }}
    </div>
  </div>
</template>

<script setup>
import { annotateHunkLines } from '../utils/unifiedDiff.js'

const props = defineProps({
  hunks: { type: Array, default: () => [] },
  binary: { type: Boolean, default: false },
  truncated: { type: Boolean, default: false },
  truncatedAtLines: { type: Number, default: null },
})

/**
 * Annotate hunk lines with computed line numbers.
 * Cached per hunk to avoid recomputation on every re-render.
 */
const annotatedCache = new Map()
function annotatedLines(hunkIndex) {
  if (annotatedCache.has(hunkIndex)) return annotatedCache.get(hunkIndex)
  const hunk = props.hunks[hunkIndex]
  if (!hunk) return []
  const result = annotateHunkLines(hunk)
  annotatedCache.set(hunkIndex, result)
  return result
}

// Invalidate cache when hunks change
import { watch } from 'vue'
watch(() => props.hunks, () => {
  annotatedCache.clear()
}, { deep: true })
</script>

<style scoped>
.unified-diff {
  font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.55;
  overflow-x: auto;
  background: var(--cc-bg-deepest, #0d0d0d);
  border-radius: 4px;
  padding: 2px 0;
}

.diff-hunk {
  margin-bottom: 0;
}

.diff-hunk-header {
  padding: 3px 8px;
  font-size: 11px;
  color: var(--cc-diff-ctx, #858585);
  background: var(--cc-bg-surface, #1a1a1a);
  border-top: 1px solid var(--cc-border-light, #2a2a2a);
  border-bottom: 1px solid var(--cc-border-light, #2a2a2a);
  white-space: pre;
}

.diff-hunk + .diff-hunk .diff-hunk-header {
  border-top: none;
}

.diff-line {
  display: flex;
  align-items: baseline;
  padding: 0 8px;
  min-height: 1.55em;
  white-space: pre;
}

.diff-line--add {
  background: var(--cc-diff-add-bg, #1a3a1a);
}
.diff-line--del {
  background: var(--cc-diff-del-bg, #3a1a1a);
}
.diff-line--ctx {
  color: var(--cc-diff-ctx, #858585);
}

.diff-line:hover {
  filter: brightness(1.15);
}

.diff-line-num {
  display: inline-block;
  width: 42px;
  min-width: 42px;
  text-align: right;
  padding-right: 8px;
  font-size: 11px;
  color: var(--cc-diff-line-num, #555);
  user-select: none;
  flex-shrink: 0;
}

.diff-line-prefix {
  display: inline-block;
  width: 12px;
  min-width: 12px;
  text-align: center;
  margin-right: 6px;
  font-weight: bold;
  user-select: none;
  flex-shrink: 0;
}

.diff-line--add .diff-line-prefix {
  color: var(--cc-diff-add-prefix, #4caf50);
}
.diff-line--del .diff-line-prefix {
  color: var(--cc-diff-del-prefix, #f44336);
}

.diff-line-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.diff-binary-hint,
.diff-truncated-hint {
  padding: 16px;
  text-align: center;
  color: var(--cc-text-secondary, #888);
  font-style: italic;
  font-size: 13px;
}

.diff-truncated-hint {
  border-top: 1px solid var(--cc-border-light, #2a2a2a);
  color: var(--cc-warning-text, #e6a23c);
  font-style: normal;
}
</style>
<style>
/* Global style: scrollbars inside unified diff */
.unified-diff::-webkit-scrollbar {
  height: 5px;
  width: 5px;
}
.unified-diff::-webkit-scrollbar-thumb {
  background: var(--cc-scrollbar-thumb, #444);
  border-radius: 3px;
}
</style>
