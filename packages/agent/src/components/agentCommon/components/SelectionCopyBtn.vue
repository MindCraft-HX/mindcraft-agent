<template>
  <Teleport to="body">
    <Transition name="copy-btn-fade">
      <div
        v-if="show"
        class="selection-copy-btn"
        :class="{ copied }"
        :style="{ top: style.top, left: style.left }"
        @mousedown.prevent
        @click.stop="$emit('copy')"
      >
        <el-icon v-if="!copied" :size="15"><CopyDocument /></el-icon>
        <el-icon v-else :size="15"><CircleCheckFilled /></el-icon>
        <span v-if="copied" class="copy-tooltip">已复制</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { CopyDocument, CircleCheckFilled } from '@element-plus/icons-vue'

defineProps({
  show: { type: Boolean, default: false },
  style: { type: Object, default: () => ({ top: '0px', left: '0px' }) },
  copied: { type: Boolean, default: false },
})

defineEmits(['copy'])
</script>

<style scoped>
.selection-copy-btn {
  position: fixed;
  z-index: 9999;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(40, 40, 48, 0.88);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #e8e8ed;
  transition: background 0.18s, transform 0.18s, width 0.25s, border-radius 0.25s, border-color 0.18s;
  transform: translateY(0);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.selection-copy-btn:hover {
  background: rgba(55, 55, 68, 0.94);
  border-color: rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}

.selection-copy-btn.copied {
  width: 82px;
  border-radius: 15px;
  background: rgba(34, 140, 80, 0.92);
  border-color: rgba(255, 255, 255, 0.18);
  gap: 4px;
  padding: 0 12px;
  justify-content: flex-start;
  cursor: default;
}

.copy-tooltip {
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  letter-spacing: 0.01em;
}

/* Transition */
.copy-btn-fade-enter-active {
  transition: opacity 0.12s ease, transform 0.15s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.copy-btn-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.1s ease;
}
.copy-btn-fade-enter-from {
  opacity: 0;
  transform: scale(0.7);
}
.copy-btn-fade-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
</style>
