<template>
  <div class="export-overlay" @click.self="$emit('close')">
    <div class="export-card">
      <div class="export-header">
        <span class="export-title">{{ $t('settings.exportPreviewTitle') }}</span>
        <button class="export-close" @click="$emit('close')" :title="$t('common.close')">✕</button>
      </div>

      <div class="export-body">
        <p class="export-desc">{{ $t('settings.exportSecurityWarning') }}</p>

        <div class="export-counts">
          <div v-if="codexCount > 0" class="export-count">
            {{ $t('settings.exportCodexCount', { n: codexCount }) }}
          </div>
          <div v-if="claudeCount > 0" class="export-count">
            {{ $t('settings.exportClaudeCount', { n: claudeCount }) }}
          </div>
        </div>

        <div v-if="incompleteNames && incompleteNames.length > 0" class="export-incomplete">
          {{ $t('settings.exportIncompleteHint') }}：{{ incompleteNames.join(', ') }}
        </div>

        <div class="export-options">
          <label class="export-option">
            <input type="radio" v-model="mode" value="full" />
            <span class="export-option-content">
              <strong>{{ $t('settings.exportIncludeSecrets') }}</strong>
              <small>{{ $t('settings.exportIncludeSecretsHint') }}</small>
            </span>
          </label>

          <label class="export-option">
            <input type="radio" v-model="mode" value="redact" />
            <span class="export-option-content">
              <strong>{{ $t('settings.exportRedactSecrets') }}</strong>
              <small>{{ $t('settings.exportRedactSecretsHint') }}</small>
            </span>
          </label>

          <label class="export-option export-option--checkbox">
            <input type="checkbox" v-model="includeActive" />
            <span class="export-option-content">
              <strong>{{ $t('settings.exportIncludeActive') }}</strong>
              <small>{{ $t('settings.exportIncludeActiveHint') }}</small>
            </span>
          </label>
        </div>
      </div>

      <div class="export-footer">
        <button class="ss-action-btn ss-action-btn--primary" @click="onConfirm">
          {{ $t('settings.exportButton') }}
        </button>
        <button class="ss-action-btn" @click="$emit('close')">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  claudeCount: { type: Number, default: 0 },
  codexCount: { type: Number, default: 0 },
  hasSecrets: { type: Boolean, default: false },
  incompleteNames: { type: Array, default: () => [] },
})

const emit = defineEmits(['confirm', 'close'])

const mode = ref('full')
const includeActive = ref(false)

function onConfirm() {
  emit('confirm', {
    includeSecrets: mode.value === 'full',
    includeActive: includeActive.value,
  })
}
</script>

<style scoped>
.export-overlay {
  position: fixed; inset: 0;
  background: var(--cc-overlay-bg); z-index: 400;
  display: flex; align-items: center; justify-content: center;
}
.export-card {
  width: 440px; max-width: 92vw;
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 16px 48px var(--cc-shadow);
}
.export-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--cc-border);
}
.export-title {
  font-size: 14px; font-weight: 600;
  color: var(--cc-text);
}
.export-close {
  width: 28px; height: 28px;
  border: none; background: transparent; color: var(--cc-text-dim);
  cursor: pointer; font-size: 14px; border-radius: 6px;
}
.export-close:hover { background: var(--cc-menu-hover); color: var(--cc-text); }
.export-body {
  padding: 16px 18px;
}
.export-desc {
  font-size: 13px; color: var(--cc-warning);
  margin: 0 0 14px; line-height: 1.5;
}
.export-counts {
  display: flex; gap: 16px; margin-bottom: 12px;
}
.export-count {
  font-size: 13px; color: var(--cc-text);
  font-weight: 500;
}
.export-incomplete {
  font-size: 12px; color: var(--cc-text-muted);
  margin-bottom: 12px;
}
.export-options {
  display: flex; flex-direction: column; gap: 10px;
}
.export-option {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--cc-border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.12s;
}
.export-option:hover {
  border-color: var(--cc-primary);
}
.export-option input {
  margin-top: 3px;
  accent-color: var(--cc-primary);
}
.export-option-content {
  display: flex; flex-direction: column; gap: 2px;
}
.export-option-content strong {
  font-size: 13px; color: var(--cc-text); font-weight: 600;
}
.export-option-content small {
  font-size: 11px; color: var(--cc-text-dim); line-height: 1.4;
}
.export-option--checkbox {
  margin-top: 4px;
}
.export-footer {
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid var(--cc-border);
}
</style>
