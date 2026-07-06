<template>
  <Transition name="ask-dialog-fade">
    <div v-if="visible && currentQuestion" class="ask-dialog-overlay" :class="themeClass" @click.self="() => {}">
      <div class="ask-dialog">
        <div class="ask-dialog-header">
          <span class="ask-dialog-title">{{ $t('agent.askTitle') }}</span>
          <span class="ask-dialog-step">{{ currentIndex + 1 }} / {{ questions.length }}</span>
          <span class="ask-dialog-close" @click="handleClose">✕</span>
        </div>
        <div class="ask-dialog-body">
          <div class="ask-q-header" v-if="currentQuestion.header">{{ currentQuestion.header }}</div>
          <div class="ask-q-prompt">{{ currentQuestion.prompt }}</div>
          <div class="ask-q-options">
            <button
              v-for="(opt, oi) in currentQuestion.options"
              :key="oi"
              class="ask-q-option"
              @click="selectOption(opt)"
            >
              <span class="opt-label">{{ opt.label }}</span>
              <span v-if="opt.description" class="opt-desc">{{ opt.description }}</span>
            </button>
          </div>
          <div class="ask-q-custom">
            <input
              class="ask-q-input"
              :placeholder="$t('agent.askPlaceholder')"
              v-model="customText"
              @keydown.enter.stop="submitCustom"
            />
            <button class="ask-q-send" @click="submitCustom">{{ $t('agent.send') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  questions: { type: Array, default: () => [] },
  themeClass: { type: String, default: '' },
})

const emit = defineEmits(['answer', 'close'])

const currentIndex = ref(0)
const customText = ref('')

const currentQuestion = computed(() => props.questions[currentIndex.value] || null)

function selectOption(opt) {
  emitAndAdvance(opt)
}

function submitCustom() {
  const text = customText.value.trim()
  if (!text) return
  emitAndAdvance({ label: text, description: '' })
}

function emitAndAdvance(opt) {
  emit('answer', currentQuestion.value, opt)
  customText.value = ''
  currentIndex.value++
}

function handleClose() {
  emit('close')
}

function reset() {
  currentIndex.value = 0
  customText.value = ''
}

defineExpose({ reset })
</script>

<style scoped>
.ask-dialog-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.45);
}
.ask-dialog {
  width: 60%;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 12px;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  color: var(--cc-text-secondary);
}
.ask-dialog-header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--cc-border);
  display: flex;
  align-items: center;
  gap: 8px;
}
.ask-dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--cc-text-secondary);
  flex: 1;
}
.ask-dialog-step {
  font-size: 12px;
  color: var(--cc-text-muted);
}
.ask-dialog-close {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--cc-text-muted);
  transition: background 0.12s;
}
.ask-dialog-close:hover {
  background: var(--cc-bg-tertiary);
  color: var(--cc-text-secondary);
}
.ask-dialog-body {
  padding: 20px 24px 24px;
}
.ask-q-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--cc-text-muted);
  margin-bottom: 4px;
  text-transform: uppercase;
}
.ask-q-prompt {
  font-size: 14px;
  color: var(--cc-text-secondary);
  margin-bottom: 16px;
  line-height: 1.5;
}
.ask-q-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ask-q-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-tertiary);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.ask-q-option:hover {
  border-color: var(--cc-primary);
  background: var(--cc-bg-elevated);
}
.opt-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cc-text-secondary);
}
.opt-desc {
  font-size: 11px;
  color: var(--cc-text-muted);
  margin-top: 2px;
}
.ask-q-custom {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.ask-q-input {
  flex: 1;
  padding: 9px 12px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg);
  font-size: 13px;
  color: var(--cc-text-secondary);
  outline: none;
}
.ask-q-input:focus {
  border-color: var(--cc-primary);
}
.ask-q-send {
  padding: 9px 18px;
  border-radius: 6px;
  border: none;
  background: var(--cc-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.ask-q-send:hover { opacity: 0.85; }

.ask-dialog-fade-enter-active,
.ask-dialog-fade-leave-active {
  transition: opacity 0.2s;
}
.ask-dialog-fade-enter-from,
.ask-dialog-fade-leave-to {
  opacity: 0;
}
</style>
