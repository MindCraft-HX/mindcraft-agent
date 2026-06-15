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
      <div class="cc-img-lightbox-wrapper">
        <button type="button" class="cc-img-lightbox-close" :aria-label="$t('common.close')" @click.stop="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <img :src="src" class="cc-img-lightbox-img" alt="预览" @click.stop />
      </div>
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
.cc-img-lightbox-wrapper {
  position: relative;
  display: inline-block;
  line-height: 0;
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
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(4px);
  transition: background 0.15s, transform 0.15s;
}
.cc-img-lightbox-close:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.08);
}
</style>

