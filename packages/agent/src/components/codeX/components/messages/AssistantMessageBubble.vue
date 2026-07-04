<template>
  <div class="msg-assistant">
    <div :class="['assistant-avatar', 'icon', 'iconfont', iconClass]" :style="iconStyle"></div>
    <div class="assistant-main">
      <div class="assistant-content" v-html="renderContent(msg.text, 'CodeX:AssistantBubble')"></div>
      <TokenMetaRow v-if="msg._turnTokens" v-bind="msg._turnTokens" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { renderContent } from '../../../agentCommon/render.js'
import TokenMetaRow from '../../../agentCommon/components/TokenMetaRow.vue'
import '../../../agentCommon/markdown.css'

const props = defineProps({
  msg: { type: Object, required: true },
  type: { type: String, default: 'claude code' }
})

const iconMap = {
  'claude code': 'icon-ChatGPT',
  'codex': 'icon-codex',
  'agent': 'icon-agent',
  'default': 'icon-ChatGPT'
}

const colorMap = {
  'claude code': '#f59e0b',
  'codex': '#10b981',
  'agent': '#f59e0b',
  'default': '#f59e0b'
}

const iconClass = computed(() => iconMap[props.type] || iconMap.default)

const iconStyle = computed(() => ({
  color: colorMap[props.type] || colorMap.default
}))

// 快速判断：不含任何 markdown 标记时直接渲染纯文本，跳过正则和 v-html
</script>

<style scoped>
.msg-assistant { display: flex; gap: 9px; align-items: flex-start; padding: 2px 14px; }
.assistant-avatar {
  width: 22px; height: 22px; border-radius: 5px; flex-shrink: 0; margin-top: 2px;
  background: var(--cc-assistant-bg); border: 1px solid var(--cc-assistant-border);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--cc-assistant-label);
}
.assistant-content {
  flex: 1; min-width: 0; line-height: 1.65; color: var(--cc-assistant-text);
  word-break: break-word; font-size: 13px; white-space: pre-wrap;
}
.assistant-main { flex: 1; min-width: 0; }
.assistant-content:deep(.agent-markdown),
.assistant-content.agent-markdown { color: inherit; }
.assistant-content :deep(.code-block) {
  background: var(--cc-assistant-code-bg) !important; border: 1px solid var(--cc-assistant-code-border); border-radius: 6px;
  box-sizing: border-box;
}
.assistant-content :deep(.code-block .code-header) {
  color: var(--cc-assistant-label);
  background: color-mix(in srgb, var(--cc-assistant-code-bg) 82%, #fff 18%);
}
.assistant-content :deep(.code-block .hljs) { background: transparent !important; padding: 0; }
.assistant-content :deep(.code-block pre),
.assistant-content :deep(.code-block code) { color: var(--cc-assistant-text); }
.assistant-content :deep(.inline-code) {
  background: var(--cc-assistant-inline-code-bg); border-radius: 3px; padding: 1px 5px;
  font-size: 12px; color: var(--cc-assistant-inline-code-text);
  font-family: 'Cascadia Code', Consolas, monospace;
}
.assistant-content :deep(.md-h1),
.assistant-content :deep(.md-h2),
.assistant-content :deep(.md-h3),
.assistant-content :deep(.md-h4),
.assistant-content :deep(.md-strong-line) { color: var(--cc-assistant-heading); }
.assistant-content :deep(.md-link) { color: var(--cc-assistant-heading); }
.assistant-content :deep(a.inline-code.md-file-link) {
  color: var(--cc-assistant-inline-code-text);
  border-bottom-color: currentColor;
}
.assistant-content :deep(.md-blockquote) {
  border-left-color: var(--cc-assistant-table-border);
  color: var(--cc-text-secondary);
}
.assistant-content :deep(.md-table-scroll) { max-width: 100%; overflow-x: auto; }
.assistant-content :deep(.md-table-wrap) {
  display: inline-block; margin: 8px 0; border: 1px solid var(--cc-assistant-table-border); border-radius: 6px;
}
.assistant-content :deep(.md-table) { border-collapse: collapse; font-size: 11px; }
.assistant-content :deep(.md-table th),
.assistant-content :deep(.md-table td) { border-right: 1px solid var(--cc-border); border-bottom: 1px solid var(--cc-border); text-align: left; }
.assistant-content :deep(.md-table th) { color: var(--cc-assistant-th-text); background: var(--cc-assistant-th-bg); font-weight: 600; position: sticky; top: 0; }
.assistant-content :deep(.md-table td) { color: var(--cc-assistant-td-text); }
.assistant-content :deep(.md-table th:last-child),
.assistant-content :deep(.md-table td:last-child) { border-right: none; }
</style>
