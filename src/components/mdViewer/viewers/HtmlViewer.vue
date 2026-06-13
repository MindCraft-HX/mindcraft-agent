<template>
  <div class="viewer-html">
    <iframe
      class="html-frame"
      sandbox=""
      :srcdoc="text || fallbackHtml"
      title="html-preview"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  text: { type: String, default: '' },
})

const { t } = useI18n()

const fallbackHtml = computed(() => `<!doctype html><html><body><p>${t('doc.htmlEmpty')}</p></body></html>`)
</script>

<style scoped>
.viewer-html {
  height: 100%;
  min-height: 480px;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}

.html-frame {
  width: 100%;
  height: 100%;
  min-height: 480px;
  border: none;
  background: #fff;
}
</style>
