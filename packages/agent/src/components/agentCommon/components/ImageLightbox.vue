<template>
  <Teleport to="body">
    <div
      v-if="src"
      class="cc-img-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click="emit('close')"
    >
      <button type="button" class="cc-img-lightbox-close" :aria-label="$t('common.close')" @click.stop="emit('close')">×</button>
      <img :src="src" class="cc-img-lightbox-img" alt="预览" @click.stop />
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  src: { type: String, default: null },
})
const emit = defineEmits(['close'])
</script>

<style>
.cc-img-lightbox {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: var(--cc-overlay-bg);
  cursor: zoom-out;
}
.cc-img-lightbox-img {
  max-width: min(96vw, 1400px);
  max-height: 92vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 40px var(--cc-shadow);
  cursor: default;
}
.cc-img-lightbox-close {
  position: fixed;
  top: 14px;
  right: 16px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--cc-bg-elevated);
  color: var(--cc-text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
}
.cc-img-lightbox-close:hover {
  background: var(--cc-bg-hover);
  color: var(--cc-btn-primary-text);
}
</style>

