<template>
  <div class="viewer-markdown markdown-body" v-html="html"></div>
</template>

<script setup>
import { computed } from 'vue'
import { renderHtml } from '@/utils/MarkdownIt.js'

const props = defineProps({
  text: { type: String, default: '' },
})

const html = computed(() => renderHtml(props.text || ''))
</script>

<style scoped>
.viewer-markdown {
  line-height: 1.8;
  font-size: 15px;
  color: var(--doc-text);
}

.viewer-markdown:deep(h1),
.viewer-markdown:deep(h2),
.viewer-markdown:deep(h3),
.viewer-markdown:deep(h4),
.viewer-markdown:deep(h5),
.viewer-markdown:deep(h6) {
  color: #111827;
  line-height: 1.35;
  margin: 1.5em 0 0.65em;
  font-weight: 700;
}

.viewer-markdown:deep(h1) {
  font-size: 2rem;
  padding-bottom: 0.35em;
  border-bottom: 2px solid var(--doc-line);
}

.viewer-markdown:deep(h2) {
  font-size: 1.55rem;
  padding-bottom: 0.28em;
  border-bottom: 1px solid var(--doc-line);
}

.viewer-markdown:deep(h3) { font-size: 1.28rem; }
.viewer-markdown:deep(h4) { font-size: 1.08rem; }

.viewer-markdown:deep(p),
.viewer-markdown:deep(ul),
.viewer-markdown:deep(ol),
.viewer-markdown:deep(blockquote),
.viewer-markdown:deep(pre),
.viewer-markdown:deep(table) {
  margin: 0 0 1rem;
}

.viewer-markdown:deep(a) {
  color: var(--doc-accent);
  text-decoration: none;
  border-bottom: 1px solid rgba(37, 99, 235, 0.28);
}

.viewer-markdown:deep(a:hover) {
  border-bottom-color: var(--doc-accent);
}

.viewer-markdown:deep(hr) {
  border: none;
  border-top: 1px solid var(--doc-line);
  margin: 1.8rem 0;
}

.viewer-markdown:deep(blockquote) {
  margin-left: 0;
  padding: 0.8rem 1rem;
  color: var(--doc-muted);
  background: #f8fafc;
  border-left: 4px solid var(--doc-line-strong);
  border-radius: 0 10px 10px 0;
}

.viewer-markdown:deep(code) {
  font-family: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
}

.viewer-markdown:deep(p code),
.viewer-markdown:deep(li code),
.viewer-markdown:deep(td code),
.viewer-markdown:deep(th code) {
  padding: 0.16rem 0.4rem;
  color: #1d4ed8;
  background: var(--doc-inline-code-bg);
  border: 1px solid #dbeafe;
  border-radius: 6px;
  font-size: 0.92em;
}

.viewer-markdown:deep(pre) {
  overflow: auto;
}

.viewer-markdown:deep(.code-block) {
  overflow: hidden;
  border: 1px solid #1f2937;
  border-radius: 12px;
  background: var(--doc-code-bg);
}

.viewer-markdown:deep(.code-block .header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.viewer-markdown:deep(.code-block .button-group) {
  display: flex;
  gap: 8px;
}

.viewer-markdown:deep(.code-block button) {
  padding: 4px 10px;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  cursor: pointer;
}

.viewer-markdown:deep(.code-block .hljs) {
  margin: 0;
  padding: 14px 0 14px 52px;
  color: #e5e7eb;
  background: transparent;
}

.viewer-markdown:deep(.code-block ol) {
  margin: 0;
  padding: 0;
}

.viewer-markdown:deep(.code-block li) {
  padding: 0 16px 0 0;
  white-space: pre-wrap;
}

.viewer-markdown:deep(.line-num) {
  display: inline-block;
  width: 0;
}

.viewer-markdown:deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  border-spacing: 0;
  border: 1px solid var(--doc-line);
  border-radius: 10px;
  background: #fff;
}

.viewer-markdown:deep(thead) {
  background: #f8fafc;
}

.viewer-markdown:deep(th),
.viewer-markdown:deep(td) {
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--doc-line);
}

.viewer-markdown:deep(th) {
  font-weight: 700;
  color: #111827;
}

.viewer-markdown:deep(tr:nth-child(even) td) {
  background: #fcfcfd;
}

.viewer-markdown:deep(ul),
.viewer-markdown:deep(ol) {
  padding-left: 1.5rem;
}

.viewer-markdown:deep(.md-task-list) {
  list-style: none;
  padding-left: 0.2rem;
}

.viewer-markdown:deep(.md-task-item) {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin: 0.25rem 0;
}

.viewer-markdown:deep(.md-task-checkbox) {
  width: 16px;
  height: 16px;
  margin-top: 0.28rem;
  accent-color: var(--doc-accent);
}

.viewer-markdown:deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1rem auto;
  border-radius: 12px;
}
</style>
