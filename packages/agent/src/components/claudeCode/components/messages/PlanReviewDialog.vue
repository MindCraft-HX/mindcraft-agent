<template>
  <Teleport to="body">
    <Transition name="plan-review-fade">
      <div v-if="visible" class="plan-review-overlay" :class="themeClass">
        <div class="plan-review-dialog">
          <div class="plan-review-header">
            <span class="plan-review-title">{{ $t('agent.planReview') }}</span>
            <span class="plan-review-close" @click="$emit('reject')">✕</span>
          </div>
          <div class="plan-review-body">
            <div v-if="planText" class="plan-review-content" v-html="planText"></div>
            <div v-else class="plan-review-empty">{{ $t('agent.planEmpty') }}</div>
          </div>
          <div class="plan-review-footer">
            <div v-if="showFeedback" class="plan-review-feedback-row">
              <textarea v-model="fbText" class="plan-review-fb-input" :placeholder="$t('agent.planFeedback')" rows="2" @keydown.enter.exact.stop="submitFeedback"></textarea>
              <button class="plan-review-fb-send" @click="submitFeedback">{{ $t('agent.send') }}</button>
            </div>
            <div class="plan-review-actions">
              <button class="plan-btn fb-btn" @click="showFeedback = !showFeedback">{{ showFeedback ? $t('agent.collapse') : $t('agent.feedback') }}</button>
              <button class="plan-btn reject-btn" @click="$emit('reject')">{{ $t('agent.reject') }}</button>
              <button class="plan-btn accept-btn" @click="$emit('accept')">{{ $t('agent.accept') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { renderContent } from '../../../agentCommon/render.js'

const props = defineProps({
  visible: Boolean,
  plan: { type: String, default: '' },
  planFilePath: { type: String, default: '' },
  themeClass: { type: String, default: '' },
})

const emit = defineEmits(['accept', 'reject', 'feedback'])

const showFeedback = ref(false)
const fbText = ref('')

const planText = computed(() => {
  const p = props.plan
  if (!p || typeof p !== 'string') return ''
  try { return renderContent(p, 'ClaudeCode:PlanReview') } catch (_) { return p.replace(/</g, '&lt;') }
})

function submitFeedback() {
  const t = fbText.value.trim()
  if (!t) return
  showFeedback.value = false
  fbText.value = ''
  emit('feedback', t)
}
</script>

<style scoped>
.plan-review-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.45);
}
.plan-review-dialog {
  width: 60%; max-width: 90vw; max-height: 85vh;
  display: flex; flex-direction: column;
  border-radius: 12px;
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  color: var(--cc-text-secondary);
}
.plan-review-header {
  padding: 18px 24px 14px; border-bottom: 1px solid var(--cc-border);
  display: flex; align-items: center; flex-shrink: 0;
}
.plan-review-title { font-size: 15px; font-weight: 600; flex: 1; }
.plan-review-close {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--cc-text-muted);
}
.plan-review-close:hover { background: var(--cc-bg-tertiary); color: var(--cc-text-secondary); }
.plan-review-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
.plan-review-content { font-size: 13px; line-height: 1.65; color: var(--cc-hljs-text); }
.plan-review-empty { font-size: 13px; color: var(--cc-text-muted); font-style: italic; }
.plan-review-footer { padding: 14px 24px 18px; border-top: 1px solid var(--cc-border); flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
.plan-review-feedback-row { display: flex; gap: 8px; }
.plan-review-fb-input {
  flex: 1; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--cc-border);
  background: var(--cc-bg); font-size: 13px; color: var(--cc-text-secondary); outline: none; resize: vertical;
}
.plan-review-fb-input:focus { border-color: var(--cc-primary); }
.plan-review-fb-send {
  align-self: flex-end; padding: 8px 16px; border-radius: 6px; border: none;
  background: var(--cc-primary); color: #fff; font-size: 13px; cursor: pointer;
}
.plan-review-fb-send:hover { opacity: 0.85; }
.plan-review-actions { display: flex; gap: 10px; justify-content: flex-end; }
.plan-btn {
  padding: 9px 20px; border-radius: 8px; border: 1px solid var(--cc-border);
  font-size: 13px; cursor: pointer; background: var(--cc-bg-tertiary); color: var(--cc-text-secondary);
}
.plan-btn:hover { border-color: var(--cc-text-dim); }
.accept-btn { background: var(--cc-primary); border-color: var(--cc-primary); color: #fff; font-weight: 500; }
.accept-btn:hover { opacity: 0.88; }
.reject-btn { background: transparent; border-color: var(--cc-warning); color: var(--cc-warning); }
.reject-btn:hover { background: var(--cc-warning-bg, rgba(255,152,0,0.08)); }

.plan-review-fade-enter-active,
.plan-review-fade-leave-active { transition: opacity 0.2s; }
.plan-review-fade-enter-from,
.plan-review-fade-leave-to { opacity: 0; }
</style>
