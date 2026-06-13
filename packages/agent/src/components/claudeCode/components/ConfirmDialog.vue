<template>
  <div v-if="visible" class="cc-confirm-overlay" @click="onCancel">
    <div class="cc-confirm-panel" @click.stop>
      <div class="cc-confirm-message">{{ message }}</div>
      <div class="cc-confirm-actions">
        <button class="cc-confirm-btn cancel" @click="onCancel">{{ cancelText }}</button>
        <button class="cc-confirm-btn ok" @click="onOk">{{ okText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const visible = ref(false)
const message = ref('')
const okText = ref(t('common.ok'))
const cancelText = ref(t('common.cancel'))
let resolver = null

function open(opts = {}) {
  return new Promise((resolve) => {
    message.value = opts.message || ''
    okText.value = opts.okText || t('common.ok')
    cancelText.value = opts.cancelText || t('common.cancel')
    resolver = resolve
    visible.value = true
  })
}

function onOk() {
  visible.value = false
  if (resolver) resolver(true)
  resolver = null
}

function onCancel() {
  visible.value = false
  if (resolver) resolver(false)
  resolver = null
}

defineExpose({ open })
</script>

<style scoped>
.cc-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 99998;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cc-bg-overlay);
}
.cc-confirm-panel {
  background: var(--cc-dialog-bg);
  border: 1px solid var(--cc-dialog-border);
  border-radius: 10px;
  padding: 20px 24px;
  min-width: 280px;
  max-width: 420px;
  box-shadow: 0 8px 32px var(--cc-shadow-strong);
}
.cc-confirm-message {
  font-size: 14px;
  color: var(--cc-dialog-title);
  line-height: 1.6;
  margin-bottom: 18px;
  text-align: center;
  white-space: pre-line;
}
.cc-confirm-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.cc-confirm-btn {
  padding: 7px 20px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background .15s, border-color .15s;
}
.cc-confirm-btn.ok {
  background: var(--cc-dialog-confirm-bg);
  border-color: var(--cc-dialog-confirm-border);
  color: var(--cc-dialog-confirm-text);
}
.cc-confirm-btn.ok:hover {
  background: var(--cc-primary-hover);
}
.cc-confirm-btn.cancel {
  background: var(--cc-dialog-cancel-bg);
  border-color: var(--cc-dialog-cancel-border);
  color: var(--cc-dialog-cancel-text);
}
.cc-confirm-btn.cancel:hover {
  background: var(--cc-dialog-cancel-hover-bg);
  color: var(--cc-dialog-cancel-hover-text);
}
</style>
