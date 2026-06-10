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
const props = defineProps({
  text: { type: String, default: '' },
})

const fallbackHtml = '<!doctype html><html><body><p>HTML 内容为空。</p></body></html>'
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
