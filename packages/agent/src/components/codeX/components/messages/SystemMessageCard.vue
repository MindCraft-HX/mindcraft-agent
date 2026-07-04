<template>
  <div v-if="msg._isCompact" class="compact-card">
    <div class="compact-head" @click="msg.expanded = !msg.expanded">
      <span class="compact-title">{{ msg.compactTitle || $t('agent.contextCompacted') }}</span>
      <svg class="compact-chevron" :class="{ expanded: msg.expanded }" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.646 4.646a.5.5 0 01.708 0l6 6a.5.5 0 01-.708.708L8 5.707l-5.646 5.647a.5.5 0 01-.708-.708l6-6z"/>
      </svg>
    </div>
    <div v-if="msg.expanded" class="compact-body">
      <div v-if="msg.compactSummary" v-html="renderContent(msg.compactSummary, 'CodeX:SystemCard')"></div>
      <div v-else class="compact-loading">{{ $t('agent.summaryLoading') }}</div>
    </div>
  </div>
  <div
    v-else-if="msg.systemListBlock && Array.isArray(msg.systemListRows) && msg.systemListRows.length"
    class="msg-system msg-system--listing"
  >
    <template v-for="(row, i) in msg.systemListRows" :key="i">
      <div v-if="row.type === 'title'" class="listing-title">{{ row.text }}</div>
      <div v-else-if="row.type === 'section'" class="listing-section">{{ row.text }}</div>
      <div v-else-if="row.type === 'empty'" class="listing-empty">{{ row.text }}</div>
      <div v-else-if="row.type === 'row'" class="listing-row">
        <span class="listing-cmd" :title="row.cmd">{{ row.cmd }}</span>
        <span class="listing-meta">{{ row.meta }}</span>
        <span class="listing-desc">{{ row.desc }}</span>
      </div>
    </template>
  </div>
  <div v-else-if="msg._isDiffBlock" class="msg-system msg-system--diff">{{ msg.text }}</div>
  <div v-else class="msg-system">{{ msg.text }}</div>
</template>

<script setup>
import { renderContent } from '../../../agentCommon/render.js'

defineProps({
  msg: { type: Object, required: true },
})
</script>

<style scoped>
.msg-system {
  text-align: left; font-size: 11px; color: var(--cc-text-muted);
  padding: 4px 0; white-space: pre-wrap; word-break: break-word; max-width: 100%;
}
.msg-system--listing {
  font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 12px; line-height: 1.5;
  color: var(--cc-text-secondary); padding: 10px 12px; margin: 4px 0;
  background: var(--cc-bg-tertiary); border: 1px solid var(--cc-border);
  border-radius: 8px; overflow-x: auto;
}
.listing-title { font-weight: 600; color: var(--cc-text); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--cc-border); }
.listing-section { color: var(--cc-text-dim); font-size: 11px; margin: 10px 0 6px; }
.listing-empty { color: var(--cc-text-dim); font-size: 12px; padding: 6px 0; }
.listing-row {
  display: grid; grid-template-columns: minmax(9.5rem, 14rem) minmax(4.5rem, max-content) minmax(0, 1fr);
  column-gap: 0.75rem; align-items: start; padding: 3px 0; border-bottom: 1px solid var(--cc-border-light);
}
.listing-row:last-child { border-bottom: none; }
.listing-cmd { color: var(--cc-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.listing-meta { color: var(--cc-text-dim); font-size: 11px; white-space: nowrap; }
.listing-desc { color: var(--cc-text-secondary); min-width: 0; word-break: break-word; white-space: normal; }
.compact-card { margin: 4px 0; }
.compact-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; cursor: pointer; user-select: none; }
.compact-title { color: var(--cc-text-muted); font-size: 12px; font-style: italic; }
.compact-chevron { color: var(--cc-text-dim); flex-shrink: 0; transition: transform 0.2s; transform: rotate(180deg); }
.compact-chevron.expanded { transform: rotate(0deg); }
.compact-body { padding: 8px 0 4px; color: var(--cc-text-secondary); font-size: 12px; line-height: 1.6; }
.compact-loading { color: var(--cc-text-dim); font-size: 11px; font-style: italic; }
.msg-system--diff {
  font-family: 'Cascadia Code', 'Consolas', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px; line-height: 1.5; color: var(--cc-text-secondary);
  background: var(--cc-bg-tertiary); border: 1px solid var(--cc-border);
  border-radius: 6px; padding: 10px 12px; margin: 8px 0; overflow-x: auto;
  white-space: pre;
}
</style>
