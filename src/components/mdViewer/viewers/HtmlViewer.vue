<template>
  <div class="viewer-html" :class="`viewer-html--${editMode}`">
    <!-- 预览：sandbox iframe（sanitizer/CSP 属 2B 子门槛） -->
    <iframe
      v-if="editMode === 'preview-only'"
      class="html-frame"
      sandbox=""
      :srcdoc="text || fallbackHtml"
      title="html-preview"
    />

    <!-- 源码（HTML 默认模式） -->
    <CodeMirrorEditor
      v-else-if="editMode === 'edit-only'"
      ref="editorRef"
      :model-value="draft"
      :ext="ext || 'html'"
      :file-path="filePath"
      @update:model-value="onEditorInput"
    />

    <!-- 分屏：左源码右实时预览 -->
    <template v-else>
      <div class="html-split-pane html-split-edit">
        <CodeMirrorEditor
          ref="editorRef"
          :model-value="draft"
          :ext="ext || 'html'"
          :file-path="filePath"
          @update:model-value="onEditorInput"
        />
      </div>
      <div class="html-split-pane html-split-preview">
        <iframe
          class="html-frame"
          sandbox=""
          :srcdoc="draft || fallbackHtml"
          title="html-preview"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const CodeMirrorEditor = defineAsyncComponent(() => import('../editors/CodeMirrorEditor.vue'))

const props = defineProps({
  text: { type: String, default: '' },
  ext: { type: String, default: 'html' },
  filePath: { type: String, default: '' },
  editMode: { type: String, default: 'preview-only' },
  editorText: { type: String, default: '' },
  dirty: { type: Boolean, default: false },
})

const emit = defineEmits(['update:editorText', 'update:dirty'])

const { t } = useI18n()

const editorRef = ref(null)
// dirty 时 editorText 是权威草稿（用户可能已删空，空串必须原样保留，
// 否则 remount 会把原文填回来，保存时写出的却是空文件）；
// 非 dirty 时草稿等于原文，空 editorText 表示尚未初始化，回退原文。
const draft = ref(props.dirty ? props.editorText : (props.editorText || props.text || ''))

// 异步文件加载完成后同步 draft（否则编辑器显示空白）；dirty 草稿不回填。
watch(() => props.text, (newText) => {
  if (!props.dirty && draft.value === '' && newText) {
    draft.value = newText
  }
}, { immediate: true })

function onEditorInput(newText) {
  draft.value = newText
  emit('update:editorText', newText)
  emit('update:dirty', newText !== (props.text || ''))
}

const fallbackHtml = computed(() => `<!doctype html><html><body><p>${t('doc.htmlEmpty')}</p></body></html>`)

function focus() {
  editorRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
.viewer-html {
  height: 100%;
  min-height: 480px;
  border: 1px solid var(--doc-line, #dbe4f0);
  border-radius: 14px;
  overflow: hidden;
  background: var(--doc-paper, #fff);
}

.viewer-html--split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.html-split-pane {
  overflow: auto;
  min-height: 0;
}

.html-split-edit {
  border-right: 1px solid var(--doc-line, #e2e8f0);
}

.html-frame {
  width: 100%;
  height: 100%;
  min-height: 480px;
  border: none;
  background: #fff;
}
</style>
