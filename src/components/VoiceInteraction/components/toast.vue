<!-- Toast.vue -->
<template>
  <transition name="fade">
    <div v-if="visible" class="toast" :class="type">
      {{ message }}
    </div>
  </transition>
</template>

<script setup>
import { ref } from "vue"
const visible = ref(false)
const message = ref('')
const type = ref('info')
const show = (params) => {
  message.value = params.message || ''
  type.value = params.type || 'info';
  visible.value = true;

  setTimeout(() => {
    hide();
  }, params.duration || 2000);
}
const hide = () => {
  visible.value = false;
}


defineExpose({ show });
</script>

<style scoped>
.toast {
  position: fixed;
  top: 140px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  color: white;
  z-index: 3000;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.toast.success {
  background-color: #67C23A;
}

.toast.warning {
  background-color: #E6A23C;
}

.toast.error {
  background-color: #F56C6C;
}

.toast.info {
  background-color: #909399;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>