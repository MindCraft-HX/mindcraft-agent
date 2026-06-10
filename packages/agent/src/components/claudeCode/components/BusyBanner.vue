<template>
  <div v-if="thinking" class="cc-busy-banner" role="status">
    <span class="cc-busy-spinner" aria-hidden="true"></span>
    <div class="cc-busy-lines">
      <template v-if="firstAwaitingAssistant">
        <span class="cc-busy-title">首次连接中</span>
        <span class="cc-busy-sub">正在加载 Agent / SDK 与连接模型，可能需要数十秒；此期间界面可能暂时无响应，属正常现象。请勿切换对话或工作目录，可点输入栏右侧「中断」停止。</span>
      </template>
      <template v-else>
        <span class="cc-busy-title">正在执行</span>
        <span class="cc-busy-sub">模型或工具处理中，若稍慢请耐心等待；需要时可点「中断」。</span>
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