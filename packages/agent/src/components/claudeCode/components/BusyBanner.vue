<template>
  <div v-if="thinking" class="cc-busy-banner" role="status">
    <span class="cc-busy-spinner" aria-hidden="true"></span>
    <div class="cc-busy-lines">
      <template v-if="firstAwaitingAssistant">
        <span class="cc-busy-title">{{ $t('agent.connecting') }}</span>
        <span class="cc-busy-sub">{{ $t('agent.connectingDesc') }}</span>
      </template>
      <template v-else>
        <span class="cc-busy-title">{{ $t('agent.executing') }}</span>
        <span class="cc-busy-sub">{{ $t('agent.executingDesc') }}</span>
      </template>
    </div>
  </div>
</template>

<script setup>
defineProps({
  thinking: { type: Boolean, default: false },
  firstAwaitingAssistant: { type: Boolean, default: false },
})
</script>

<style scoped>
.cc-busy-banner {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px 10px;
  background: linear-gradient(180deg, var(--cc-busy-bg-from) 0%, var(--cc-busy-bg-to) 100%);
  border-bottom: 1px solid var(--cc-busy-border);
}
.cc-busy-spinner {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  flex-shrink: 0;
  border: 2px solid var(--cc-busy-spinner-ring);
  border-top-color: var(--cc-busy-spinner-arc);
  border-radius: 50%;
  animation: cc-busy-spin 0.75s linear infinite;
}
@keyframes cc-busy-spin { to { transform: rotate(360deg); } }
.cc-busy-lines { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cc-busy-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--cc-busy-title);
}
.cc-busy-sub {
  font-size: 11px;
  line-height: 1.5;
  color: var(--cc-busy-sub);
}
</style>