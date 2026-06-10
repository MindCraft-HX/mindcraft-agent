<template>
  <div class="ask-panel">
    <div v-if="msg.askAnswered && msg.askAnswerText" class="ask-answered">
      <span class="ask-answered-label">已选择：</span>
      <span class="ask-answered-text">{{ msg.askAnswerText }}</span>
    </div>
    <div v-else-if="!msg.askAnswered" class="ask-waiting">等待回答中…</div>
  </div>
</template>

<script setup>
defineProps({
  msg: { type: Object, required: true },
})
</script>

<style scoped>
.ask-panel {
  padding: 8px 10px; border-bottom: 1px solid var(--cc-bg-tertiary);
  display: flex; flex-direction: column; gap: 7px;
}
.ask-answered { font-size: 12px; line-height: 1.4; }
.ask-answered-label { color: var(--cc-text-muted); }
.ask-answered-text { color: var(--cc-text-secondary); font-weight: 500; }
.ask-waiting { font-size: 12px; color: var(--cc-text-muted); }
</style>
