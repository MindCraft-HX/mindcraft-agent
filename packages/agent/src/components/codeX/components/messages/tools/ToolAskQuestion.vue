<template>
  <div class="ask-panel">
    <div v-if="msg.askAnswered && msg.askAnswerText" class="ask-answered">
      <span class="ask-answered-label">已选择：</span>
      <span class="ask-answered-text">{{ msg.askAnswerText }}</span>
    </div>
    <div v-else-if="!msg.askAnswered" class="ask-waiting">
      <span>等待回答中…</span>
      <button class="ask-reopen-btn" @click.stop="handleReopen">回答</button>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'

const props = defineProps({
  msg: { type: Object, required: true },
})

const reopenAskDialog = inject('reopenAskDialog', null)

function handleReopen() {
  reopenAskDialog?.(props.msg)
}
</script>

<style scoped>
.ask-panel {
  padding: 8px 10px; border-bottom: 1px solid var(--cc-bg-tertiary);
  display: flex; flex-direction: column; gap: 7px;
}
.ask-answered { font-size: 12px; line-height: 1.4; }
.ask-answered-label { color: var(--cc-text-muted); }
.ask-answered-text { color: var(--cc-text-secondary); font-weight: 500; }
.ask-waiting { font-size: 12px; color: var(--cc-text-muted); display: flex; align-items: center; gap: 8px; }
.ask-reopen-btn {
  padding: 2px 10px; border-radius: 4px; border: 1px solid var(--cc-primary);
  background: transparent; color: var(--cc-primary); font-size: 11px;
  cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.ask-reopen-btn:hover { background: var(--cc-primary); color: #fff; }
</style>
