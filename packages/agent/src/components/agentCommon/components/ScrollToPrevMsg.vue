<template>
  <Transition name="scroll-prev-fade">
    <el-button
      v-if="show"
      class="scroll-prev-btn"
      circle
      title="滚动到上一个问题"
      @click="$emit('scroll-prev')"
    >
      <el-icon><ArrowUp /></el-icon>
    </el-button>
  </Transition>
</template>

<script setup>
import { ArrowUp } from '@element-plus/icons-vue'

defineProps({
  show: Boolean,
})

defineEmits(['scroll-prev'])
</script>

<style scoped>
.scroll-prev-btn {
  position: absolute;
  bottom: 75px;
  right: 33px;
  z-index: 999;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--cc-btn-bg);
  border-color: var(--cc-btn-border);
  color: var(--cc-btn-text);
  box-shadow: 0 2px 8px var(--cc-shadow);
  transition: all 0.2s;
}
.scroll-prev-btn:hover {
  background: var(--cc-btn-bg-hover);
  border-color: var(--cc-btn-border-hover);
  color: var(--cc-btn-text-hover);
}
.scroll-prev-fade-enter-active,
.scroll-prev-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.scroll-prev-fade-enter-from,
.scroll-prev-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
