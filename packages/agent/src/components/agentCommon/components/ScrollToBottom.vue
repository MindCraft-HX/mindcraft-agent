<template>
  <Transition name="scroll-bottom-fade">
    <el-button
      v-if="show"
      class="scroll-bottom-btn"
      circle
      :title="newMsgCount > 0 ? `${newMsgCount} 条新消息` : '滚动到底部'"
      @click="$emit('scroll')"
    >
      <span v-if="newMsgCount > 0" class="scroll-bottom-badge">{{ newMsgCount > 99 ? '99+' : newMsgCount }}</span>
      <el-icon v-else><ArrowDown /></el-icon>
    </el-button>
  </Transition>
</template>

<script setup>
import { ArrowDown } from '@element-plus/icons-vue'

defineProps({
  show: Boolean,
  newMsgCount: { type: Number, default: 0 },
})

defineEmits(['scroll'])
</script>

<style scoped>
.scroll-bottom-btn {
  position: absolute;
  bottom: 33px;
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
.scroll-bottom-btn:hover {
  background: var(--cc-btn-bg-hover);
  border-color: var(--cc-btn-border-hover);
  color: var(--cc-btn-text-hover);
}
.scroll-bottom-badge {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: var(--cc-btn-primary-text);
}
.scroll-bottom-fade-enter-active,
.scroll-bottom-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.scroll-bottom-fade-enter-from,
.scroll-bottom-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
