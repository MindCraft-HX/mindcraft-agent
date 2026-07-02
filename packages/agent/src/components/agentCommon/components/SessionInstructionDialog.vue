<template>
  <Teleport to="body">
    <div v-if="visible" class="si-mask" :class="themeClass" @click.self="close">
      <div class="si-dialog">
        <div class="si-header">
          <div>
            <div class="si-title">{{ $t('agent.sessionInstruction') }}</div>
            <div class="si-subtitle">{{ $t('agent.sessionInstructionHint') }}</div>
          </div>
          <button type="button" class="si-close" aria-label="Close" @click="close">&times;</button>
        </div>

        <label class="si-field">
          <span class="si-label">{{ $t('agent.sessionDescription') }}</span>
          <input
            v-model="draft.description"
            class="si-input"
            type="text"
            :placeholder="$t('agent.sessionDescriptionPlaceholder')"
          />
        </label>
        <label class="si-field">
          <span class="si-label">{{ $t('agent.sessionInstructionContent') }}</span>
          <textarea
            v-model="draft.content"
            class="si-textarea"
            :placeholder="$t('agent.sessionInstructionPlaceholder')"
          />
        </label>

        <!-- Attachments -->
        <div class="si-field">
          <span class="si-label">{{ $t('agent.sessionInstructionAttachments') }}</span>
          <span class="si-attachment-hint">{{ $t('agent.sessionInstructionAttachmentHint') }}</span>
          <div class="si-attachment-list">
            <div
              v-for="(att, i) in draft.attachments"
              :key="i"
              class="si-attachment-item"
              :class="{ 'si-attachment-disabled': !att.enabled }"
            >
              <button
                type="button"
                class="si-attachment-toggle"
                :title="att.enabled ? '禁用' : '启用'"
                @click="att.enabled = !att.enabled"
              >{{ att.enabled ? '✓' : '—' }}</button>
              <span class="si-attachment-name" :title="att.path">{{ att.name }}</span>
              <button
                type="button"
                class="si-attachment-remove"
                :title="$t('agent.sessionInstructionRemoveAttachment')"
                @click="draft.attachments.splice(i, 1)"
              >&times;</button>
            </div>
          </div>
          <button type="button" class="si-attachment-add" @click="addAttachments">
            + {{ $t('agent.sessionInstructionAddAttachment') }}
          </button>
        </div>

        <div class="si-actions">
          <button type="button" class="si-btn ghost" @click="close">{{ $t('settings.cancel') }}</button>
          <button type="button" class="si-btn primary" @click="save">{{ $t('settings.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref, toRaw } from 'vue'
import { log as debugLog } from '../utils/rendererDebug.mjs'

defineProps({
  themeClass: { type: String, default: '' },
})

const visible = ref(false)
const chatKey = ref('')
const emit = defineEmits(['saved'])
const draft = reactive({
  enabled: false,
  description: '',
  content: '',
  attachments: [],
})

function assignDraft(data = {}) {
  draft.enabled = Boolean(data.enabled)
  draft.description = data.description || ''
  draft.content = typeof data.content === 'string' ? data.content : ''
  draft.attachments = Array.isArray(data.attachments) ? data.attachments : []
}

async function open(nextChatKey) {
  chatKey.value = nextChatKey || ''
  const data = await window.electronAPI?.getSessionInstruction?.(chatKey.value).catch(() => null)
  debugLog('sessionInstruction', 'open loaded', { chatKey: chatKey.value, enabled: data?.enabled, hasContent: Boolean(data?.content) })
  assignDraft(data || {})
  visible.value = true
}

function close() {
  visible.value = false
}

async function addAttachments() {
  try {
    const files = await window.electronAPI?.openSessionAttachmentDialog?.()
    if (!files?.length) return
    const existing = new Set(draft.attachments.map(a => a.path))
    for (const f of files) {
      if (!existing.has(f.path)) {
        draft.attachments.push(f)
      }
    }
  } catch (_) {}
}

async function save() {
  const plain = toRaw(draft)
  const payload = {
    chatKey: chatKey.value,
    instruction: {
      enabled: true,
      description: plain.description,
      content: plain.content,
      attachments: plain.attachments,
    },
  }
  debugLog('sessionInstruction', 'save payload', { chatKey: payload.chatKey, enabled: payload.instruction.enabled, contentLen: payload.instruction.content.length })
  const result = await window.electronAPI?.setSessionInstruction?.(payload)
  debugLog('sessionInstruction', 'save result', { ok: result?.ok, returnedEnabled: result?.instruction?.enabled })
  emit('saved', chatKey.value)
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
  background: var(--si-mask-bg, var(--cc-overlay-bg, rgba(0, 0, 0, 0.36)));
  backdrop-filter: blur(2px);
}
.si-mask.cc-theme-light {
  --si-mask-bg: rgba(250, 249, 247, 0.72);
}
.si-mask.cc-theme-brown {
  --si-mask-bg: rgba(239, 232, 221, 0.76);
}
.si-mask.cc-theme-blue {
  --si-mask-bg: rgba(8, 28, 56, 0.62);
}
.si-mask.cc-theme-dark {
  --si-mask-bg: rgba(0, 0, 0, 0.55);
}
.si-dialog {
  width: min(620px, calc(100vw - 40px));
  border: 1px solid var(--cc-dialog-border, var(--cc-border-strong, #3a3a3a));
  border-radius: 12px;
  background: var(--cc-dialog-bg, var(--cc-bg-tertiary, #faf9f7));
  color: var(--cc-dialog-title, var(--cc-text, #222));
  box-shadow: 0 18px 48px var(--cc-shadow, rgba(0, 0, 0, 0.18));
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
  color: var(--cc-text-muted, #666);
}
.si-close {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--cc-text-muted, #666);
  cursor: pointer;
  font-size: 22px;
}
.si-field {
  display: block;
  margin-bottom: 10px;
}
.si-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cc-text-secondary, #333);
}
.si-input,
.si-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cc-border, #d8d4ca);
  border-radius: 8px;
  background: var(--cc-bg-input, var(--cc-bg-secondary, #fff));
  color: var(--cc-text, #222);
  outline: none;
}
.si-input {
  height: 34px;
  padding: 0 10px;
}
.si-textarea {
  min-height: 220px;
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
  font-family: inherit;
}
.si-attachment-hint {
  display: block;
  margin-top: 2px;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--cc-text-muted, #888);
}
.si-attachment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}
.si-attachment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--cc-bg-secondary, #f7f6f4);
  border: 1px solid var(--cc-border, #d8d4ca);
  font-size: 12px;
}
.si-attachment-disabled {
  opacity: 0.5;
}
.si-attachment-toggle {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 1px solid var(--cc-border, #d8d4ca);
  border-radius: 4px;
  background: var(--cc-bg-input, #fff);
  color: var(--cc-primary, #2f81f7);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
}
.si-attachment-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cc-text, #222);
}
.si-attachment-remove {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--cc-text-muted, #999);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}
.si-attachment-remove:hover {
  color: #e74c3c;
}
.si-attachment-add {
  display: inline-block;
  height: 28px;
  padding: 0 12px;
  border: 1px dashed var(--cc-border, #d8d4ca);
  border-radius: 6px;
  background: transparent;
  color: var(--cc-primary, #2f81f7);
  cursor: pointer;
  font-size: 12px;
}
.si-attachment-add:hover {
  border-style: solid;
  background: var(--cc-bg-secondary, #f0f0f0);
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
  border: 1px solid var(--cc-dialog-cancel-border, var(--cc-border-strong, #d8d4ca));
  cursor: pointer;
}
.si-btn.ghost {
  background: var(--cc-dialog-cancel-bg, var(--cc-bg-secondary, #f7f6f4));
  color: var(--cc-dialog-cancel-text, var(--cc-text-secondary, #333));
}
.si-btn.primary {
  background: var(--cc-dialog-confirm-bg, var(--cc-primary, #2f81f7));
  border-color: var(--cc-dialog-confirm-border, var(--cc-primary, #2f81f7));
  color: var(--cc-dialog-confirm-text, #fff);
}
</style>
