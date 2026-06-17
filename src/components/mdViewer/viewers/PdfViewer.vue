<template>
  <div class="viewer-pdf">
    <iframe
      v-if="objectUrl"
      class="pdf-frame"
      :src="objectUrl"
      title="pdf-preview"
    />
    <div v-else class="pdf-empty">{{ $t('doc.pdfEmpty') }}</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  binary: { type: [Uint8Array, Object, Array], default: null },
})

const objectUrl = ref('')

function revokeObjectUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

function updateObjectUrl() {
  revokeObjectUrl()
  const raw = props.binary
  if (!raw) return
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw.data || raw)
  objectUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

watch(() => props.binary, updateObjectUrl, { immediate: true })

onBeforeUnmount(() => {
  revokeObjectUrl()
})
</script>

<style scoped>
.viewer-pdf {
  height: 100%;
  min-height: 560px;
  border: 1px solid var(--doc-line, #dbe4f0);
  border-radius: 14px;
  overflow: hidden;
  background: var(--doc-paper, #eef2ff);
}

.pdf-frame {
  width: 100%;
  height: 100%;
  min-height: 560px;
  border: none;
  background: #fff;
}

.pdf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 560px;
  color: var(--doc-muted);
  font-size: 14px;
}
</style>
