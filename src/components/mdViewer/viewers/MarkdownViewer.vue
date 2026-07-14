<template>
  <div class="viewer-markdown" :class="{ 'markdown-body': editMode === 'preview-only' }">
    <!-- 仅预览模式：现有只读行为 -->
    <template v-if="editMode === 'preview-only'">
      <div v-html="html"></div>
    </template>
    <!-- 编辑 / 分屏模式：MarkdownEditor -->
    <template v-else>
      <MarkdownEditor
        :text="text"
        :ext="ext"
        :file-path="filePath"
        :edit-mode="editMode"
        @update:editor-text="$emit('update:editorText', $event)"
        @update:dirty="$emit('update:dirty', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { renderHtml } from '@/utils/MarkdownIt.js'

const MarkdownEditor = defineAsyncComponent(() => import('../editors/MarkdownEditor.vue'))

const props = defineProps({
  text: { type: String, default: '' },
  editMode: { type: String, default: 'preview-only' },
  ext: { type: String, default: 'md' },
  filePath: { type: String, default: '' },
})

defineEmits(['update:editorText', 'update:dirty'])

const html = computed(() => renderHtml(props.text || ''))
</script>

<style scoped>
.viewer-markdown {
  line-height: 1.8;
  font-size: 15px;
  color: var(--doc-text);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 编辑/分屏模式撑满高度 */
.viewer-markdown > :deep(.md-editor) {
  flex: 1;
  min-height: 0;
}

.viewer-markdown:deep(h1),
.viewer-markdown:deep(h2),
.viewer-markdown:deep(h3),
.viewer-markdown:deep(h4),
.viewer-markdown:deep(h5),
.viewer-markdown:deep(h6) {
  color: var(--doc-text);
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
  border-bottom: 1px solid color-mix(in srgb, var(--doc-accent) 32%, transparent);
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
  background: var(--doc-paper);
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
  color: var(--cc-assistant-inline-code-text, var(--doc-accent));
  background: var(--doc-inline-code-bg);
  border: 1px solid var(--doc-line);
  border-radius: 6px;
  font-size: 0.92em;
}

.viewer-markdown:deep(pre) {
  overflow: auto;
}

.viewer-markdown:deep(.code-block) {
  overflow: hidden;
  border: 1px solid var(--doc-line);
  border-radius: 12px;
  background: var(--doc-code-bg);
}

.viewer-markdown:deep(.code-block .header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  color: var(--doc-code-label);
  background: var(--doc-code-header-bg);
  border-bottom: 1px solid var(--doc-code-header-border);
}

.viewer-markdown:deep(.code-block .name) {
  color: var(--doc-code-label);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.viewer-markdown:deep(.code-block .button-group) {
  display: flex;
  gap: 8px;
}

.viewer-markdown:deep(.code-block button) {
  padding: 4px 10px;
  color: var(--doc-code-btn-text);
  background: var(--doc-code-btn-bg);
  border: 1px solid var(--doc-code-btn-border);
  border-radius: 999px;
  cursor: pointer;
}

.viewer-markdown:deep(.code-block button:hover) {
  color: var(--doc-code-btn-hover-text);
  background: var(--doc-code-btn-hover-bg);
  border-color: var(--doc-code-btn-hover-border);
}

.viewer-markdown:deep(.code-block .hljs) {
  margin: 0;
  padding: 14px 0 14px 52px;
  color: var(--cc-hljs-text, var(--doc-text));
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

/* --- highlight.js token 颜色映射：跟随主题 --- */
.viewer-markdown:deep(.hljs-keyword)  { color: var(--cc-hljs-keyword); }
.viewer-markdown:deep(.hljs-built_in) { color: var(--cc-hljs-built-in); }
.viewer-markdown:deep(.hljs-string)   { color: var(--cc-hljs-string); }
.viewer-markdown:deep(.hljs-number)   { color: var(--cc-hljs-number); }
.viewer-markdown:deep(.hljs-comment)  { color: var(--cc-hljs-comment); font-style: italic; }
.viewer-markdown:deep(.hljs-function) { color: var(--cc-hljs-function); }
.viewer-markdown:deep(.hljs-title)    { color: var(--cc-hljs-function); }
.viewer-markdown:deep(.hljs-params)   { color: var(--cc-hljs-params); }
.viewer-markdown:deep(.hljs-variable) { color: var(--cc-hljs-params); }
.viewer-markdown:deep(.hljs-attr)     { color: var(--cc-hljs-params); }
.viewer-markdown:deep(.hljs-name)     { color: var(--cc-hljs-type); }
.viewer-markdown:deep(.hljs-tag)      { color: var(--cc-hljs-tag); }
.viewer-markdown:deep(.hljs-type)     { color: var(--cc-hljs-type); }
.viewer-markdown:deep(.hljs-literal)  { color: var(--cc-hljs-tag); }
.viewer-markdown:deep(.hljs-operator) { color: var(--cc-hljs-operator); }
.viewer-markdown:deep(.hljs-punctuation) { color: var(--cc-hljs-operator); }

.viewer-markdown:deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  border-spacing: 0;
  border: 1px solid var(--doc-line);
  border-radius: 10px;
  background: var(--doc-paper);
}

.viewer-markdown:deep(thead) {
  background: var(--doc-bg);
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
  color: var(--doc-text);
}

.viewer-markdown:deep(tr:nth-child(even) td) {
  background: var(--doc-bg);
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
