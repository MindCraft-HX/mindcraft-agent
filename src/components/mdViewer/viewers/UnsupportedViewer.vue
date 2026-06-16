<template>
  <div class="viewer-unsupported">
    <div class="unsupported-card">
      <div class="unsupported-title">{{ $t('doc.unsupported') }}</div>
      <div class="unsupported-desc">
        {{ fileLabel }} 当前无法在“文档浏览”内渲染。
      </div>
      <button
        v-if="canOpenExternal"
        class="unsupported-btn"
        type="button"
        @click="$emit('openExternal')"
      >
        {{ $t('doc.openExternal') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  filePath: { type: String, default: '' },
  name: { type: String, default: '' },
  ext: { type: String, default: '' },
})

defineEmits(['openExternal'])

const canOpenExternal = computed(() => Boolean(props.filePath))
const fileLabel = computed(() => props.ext ? `.${props.ext}` : (props.name || '该文件'))
</script>

<style scoped>
.viewer-unsupported {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
}

.unsupported-card {
  width: min(460px, 100%);
  padding: 28px 24px;
  border-radius: 18px;
  border: 1px solid var(--doc-line, #dbe4f0);
  background: var(--cc-bg-elevated, var(--doc-paper, #ffffff));
  box-shadow: 0 16px 40px var(--cc-shadow, rgba(15, 23, 42, 0.08));
}

.unsupported-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--doc-text, #111827);
}

.unsupported-desc {
  margin-top: 10px;
  line-height: 1.7;
  color: var(--doc-muted, #475569);
}

.unsupported-btn {
  margin-top: 18px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--cc-primary-border, #bfdbfe);
  border-radius: 10px;
  color: var(--cc-primary, #1d4ed8);
  background: var(--cc-primary-bg, #eff6ff);
  cursor: pointer;
}

.unsupported-btn:hover {
  background: var(--cc-bg-hover, #dbeafe);
}
</style>
