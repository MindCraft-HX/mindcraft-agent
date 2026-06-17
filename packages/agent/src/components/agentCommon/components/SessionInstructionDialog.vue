<template>
  <Teleport to="body">
    <div v-if="visible" class="si-mask" @click.self="close">
      <div class="si-dialog">
        <div class="si-header">
          <div>
            <div class="si-title">{{ $t('agent.sessionInstruction') }}</div>
            <div class="si-subtitle">{{ $t('agent.sessionInstructionHint') }}</div>
          </div>
          <button type="button" class="si-close" aria-label="Close" @click="close">&times;</button>
        </div>

        <label class="si-toggle">
          <input v-model="draft.enabled" type="checkbox" />
          <span>{{ $t('agent.sessionInstructionEnabled') }}</span>
        </label>

        <input
          v-model="draft.title"
          class="si-input"
          type="text"
          :placeholder="$t('agent.sessionInstructionTitlePlaceholder')"
        />
        <textarea
          v-model="draft.content"
          class="si-textarea"
          :placeholder="$t('agent.sessionInstructionPlaceholder')"
        />

        <div class="si-actions">
          <button type="button" class="si-btn ghost" @click="close">{{ $t('settings.cancel') }}</button>
          <button type="button" class="si-btn primary" @click="save">{{ $t('settings.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref } from 'vue'

const visible = ref(false)
const chatKey = ref('')
const draft = reactive({
  enabled: false,
  instructionId: '',
  title: '',
  description: '',
  content: '',
  attachments: [],
})

function assignDraft(data = {}) {
  draft.enabled = Boolean(data.enabled)
  draft.instructionId = data.instructionId || ''
  draft.title = data.title || ''
  draft.description = data.description || ''
  draft.content = typeof data.content === 'string' ? data.content : ''
  draft.attachments = Array.isArray(data.attachments) ? data.attachments : []
}

async function open(nextChatKey) {
  chatKey.value = nextChatKey || ''
  const data = await window.electronAPI?.getSessionInstruction?.(chatKey.value).catch(() => null)
  assignDraft(data || {})
  visible.value = true
}

function close() {
  visible.value = false
}

async function save() {
  await window.electronAPI?.setSessionInstruction?.({
    chatKey: chatKey.value,
    instruction: {
      enabled: draft.enabled,
      instructionId: draft.instructionId,
      title: draft.title,
      description: draft.description,
      content: draft.content,
      attachments: draft.attachments,
    },
  })
  close()
}

defineExpose({ open })
</script>

<style scoped>
.si-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.36);
}
.si-dialog {
  width: min(620px, calc(100vw - 40px));
  border: 1px solid var(--cc-border-strong);
  border-radius: 12px;
  background: var(--cc-bg-primary);
  color: var(--cc-text-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  padding: 16px;
}
.si-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.si-title {
  font-size: 15px;
  font-weight: 700;
}
.si-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--cc-text-muted);
}
.si-close {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--cc-text-muted);
  cursor: pointer;
  font-size: 22px;
}
.si-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
}
.si-input,
.si-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cc-border);
  border-radius: 8px;
  background: var(--cc-bg-secondary);
  color: var(--cc-text-primary);
  outline: none;
}
.si-input {
  height: 34px;
  padding: 0 10px;
  margin-bottom: 10px;
}
.si-textarea {
  min-height: 220px;
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
  font-family: inherit;
}
.si-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.si-btn {
  height: 30px;
  border-radius: 7px;
  padding: 0 14px;
  border: 1px solid var(--cc-border-strong);
  cursor: pointer;
}
.si-btn.ghost {
  background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary);
}
.si-btn.primary {
  background: var(--cc-primary);
  border-color: var(--cc-primary);
  color: white;
}
</style>
