<template>
  <div class="md-editor" :class="`md-editor--${editMode}`">
    <!-- 仅预览模式 -->
    <div v-if="editMode === 'preview-only'" class="md-preview markdown-body" v-html="previewHtml"></div>

    <!-- 仅编辑模式 -->
    <CodeMirrorEditor
      v-else-if="editMode === 'edit-only'"
      ref="editorRef"
      :model-value="editorText"
      :ext="ext || 'md'"
      :file-path="filePath"
      @update:model-value="onEditorChange"
    />

    <!-- 分屏模式 -->
    <template v-else-if="editMode === 'split'">
      <div class="md-split-pane md-split-edit">
        <CodeMirrorEditor
          ref="editorRef"
          :model-value="editorText"
          :ext="ext || 'md'"
          :file-path="filePath"
          @update:model-value="onEditorChange"
        />
      </div>
      <div class="md-split-pane md-split-preview">
        <div class="markdown-body" v-html="previewHtml"></div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { defineAsyncComponent } from 'vue'
import { renderHtml } from '@/utils/MarkdownIt.js'

const CodeMirrorEditor = defineAsyncComponent(() => import('./CodeMirrorEditor.vue'))

const props = defineProps({
  text: { type: String, default: '' },
  ext: { type: String, default: 'md' },
  filePath: { type: String, default: '' },
  editMode: { type: String, default: 'preview-only' },
})

const emit = defineEmits(['update:editorText', 'update:dirty'])

const editorRef = ref(null)
const editorText = ref(props.text || '')

// 预览 HTML（实时从 editorText 计算）
const previewHtml = computed(() => renderHtml(editorText.value || ''))

// 初始化 editorText（仅在 text 变化且非用户编辑中时同步）
watch(() => props.text, (newText) => {
  // 仅在外部 text 变化且当前编辑内容为空或模式切换时同步
  if (editorText.value === '' && newText) {
    editorText.value = newText
  }
}, { immediate: true })

// 编辑模式切换回 preview-only 时，重置 editorText 为原始 text
watch(() => props.editMode, (newMode, oldMode) => {
  if (newMode === 'preview-only' && oldMode !== 'preview-only') {
    // 用户回到预览模式，重置编辑器内容为原始 text
    editorText.value = props.text || ''
  }
})

function onEditorChange(newText) {
  editorText.value = newText
  emit('update:editorText', newText)
  emit('update:dirty', newText !== (props.text || ''))
}

function focus() {
  editorRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
.md-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.md-editor--split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  overflow: hidden;
}

.md-split-pane {
  overflow: auto;
  min-height: 0;
}

/* ── 分屏窗格主题滚动条 ── */
.md-split-pane::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.md-split-pane::-webkit-scrollbar-track {
  background: var(--cc-scrollbar-track, transparent);
}
.md-split-pane::-webkit-scrollbar-thumb {
  background: var(--cc-scrollbar-thumb, #4a4a4a);
  border-radius: 4px;
}
.md-split-pane::-webkit-scrollbar-thumb:hover {
  background: var(--cc-scrollbar-thumb-hover, #5a5a5a);
}
.md-split-pane::-webkit-scrollbar-corner {
  background: transparent;
}

.md-split-edit {
  border-right: 1px solid var(--doc-line, var(--cc-border-medium, #e5e7eb));
}

.md-split-preview {
  padding: 22px 28px;
  background: var(--doc-paper, var(--cc-bg, #ffffff));
}

/* 复用 MarkdownViewer 的 markdown-body 样式（通过 :deep() 继承） */
.md-preview {
  padding: 0;
}
</style>
