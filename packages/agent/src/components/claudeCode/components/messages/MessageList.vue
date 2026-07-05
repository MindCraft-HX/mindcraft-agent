<template>
  <div
    ref="listRef"
    class="message-list"
    :data-path-context-cwd="tab.cwd || projectCwd || ''"
    :data-path-context-workspace-root="tab.cwd || projectCwd || ''"
    data-path-context-source="agent-message"
  >
    <div class="history-top-sentinel" :ref="setHistoryTopSentinelRef"></div>

    <!-- 滚动顶部加载更多加载动画：固定高度占位 + 绝对定位，不推动已有内容 -->
    <div v-if="tab.loadingMore" class="load-more-indicator">
      <div class="loading-spinner">
        <span></span><span></span><span></span>
      </div>
    </div>

    <!-- 加载中：有 filePath 但消息未加载 -->
    <div v-if="tab._loadingMessages" class="cc-empty cc-loading">
      <div class="loading-dots">
        <span></span><span></span><span></span>
      </div>
      <div class="empty-sub">{{ $t('agent.loadingHistory') }}</div>
    </div>

    <!-- 无消息：显示空状态 -->
    <div v-if="!tab._loadingMessages && tab.messages.length === 0" class="cc-empty">
      <div class="empty-icon mindcraft-flow-win-iconfont  icon-mindcraft-claude1"></div>
      <div class="empty-title">Claude Code</div>
      <div class="empty-sub">{{ $t('agent.startChatHint') }}</div>
    </div>

    <div
      v-for="msg in tab.messages"
      :key="msg.id"
      v-memo="[msg.text, msg.status, msg.toolError, msg.expanded]"
      class="msg-row"
      :data-msg-id="msg.id"
      :class="msg.role"
    >
      <MessageItem
        :msg="msg"
        :toolIcon="toolIcon"
        :toolLabel="toolLabel"
        :isWriteTool="isWriteTool"
        :isEditTool="isEditTool"
        :isBashTool="isBashTool"
        :isReadTool="isReadTool"
        @openImage="(src) => emit('openImage', src)"
        @respondPermission="(toolMsg, allowed) => emit('respondPermission', toolMsg, allowed)"
        @respondAskQuestion="(toolMsg, q, opt) => emit('respondAskQuestion', toolMsg, q, opt)"
      />
    </div>

    <div v-if="tab.thinking" class="msg-assistant thinking-row">
      <div class="assistant-avatar mindcraft-flow-win-iconfont  icon-mindcraft-claude1"></div>
      <div class="thinking-wrap">
        <div class="thinking-dots"><span></span><span></span><span></span></div>
        <span class="thinking-label" :class="{ 'first-awaiting': firstAwaitingAssistant }">{{ firstAwaitingAssistant ? $t('agent.firstRequest') : $t('agent.responding') }}</span>
      </div>
    </div>

    <!-- 划词复制按钮 -->
    <SelectionCopyBtn :show="showBtn" :style="btnStyle" :copied="copied" @copy="copySelection" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import MessageItem from './MessageItem.vue'
import SelectionCopyBtn from '../../../agentCommon/components/SelectionCopyBtn.vue'
import { useSelectionCopy } from '../../../agentCommon/composables/useSelectionCopy.js'

defineProps({
  tab: { type: Object, required: true },
  projectCwd: { type: String, default: '' },
  firstAwaitingAssistant: { type: Boolean, default: false },
  setHistoryTopSentinelRef: { type: Function, required: true },
  toolIcon: { type: Function, required: true },
  toolLabel: { type: Function, required: true },
  isWriteTool: { type: Function, required: true },
  isEditTool: { type: Function, required: true },
  isBashTool: { type: Function, required: true },
  isReadTool: { type: Function, required: true },
})

const emit = defineEmits(['openImage', 'respondPermission', 'respondAskQuestion'])

const listRef = ref(null)
const { showBtn, btnStyle, copied, copySelection } = useSelectionCopy(listRef)
</script>

<style scoped>
.message-list {
  width: 100%;
}

.history-top-sentinel {
  height: 1px;
  margin-top: -1px;
}

.cc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  animation: empty-fade-in 0.15s ease-out;
}

.empty-icon { font-size: 30px; color: var(--cc-primary); opacity: 0.45; }

@keyframes empty-fade-in { from { opacity: 0; } to { opacity: 1; } }
.empty-title { font-size: 14px; font-weight: 600; color: var(--cc-ph-title); }
.empty-sub { font-size: 12px; color: var(--cc-text-dim); }

.cc-loading .loading-dots { display: flex; gap: 6px; align-items: center; }
.cc-loading .loading-dots span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--cc-primary); opacity: 0.4;
  animation: loadDot 1.6s infinite cubic-bezier(0.45, 0, 0.45, 1);
}
.cc-loading .loading-dots span:nth-child(2) { animation-delay: 0.533s; }
.cc-loading .loading-dots span:nth-child(3) { animation-delay: 1.067s; }
@keyframes loadDot {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}

.msg-row {
  padding: 5px 14px; scroll-margin-top: 31px;
}
.msg-row:hover { background: color-mix(in srgb, var(--cc-bg-hover) 35%, transparent); }

.thinking-row {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  padding: 2px 14px;
  /* 固定高度避免 CLS */
  min-height: 26px;
}

.thinking-row .assistant-avatar {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  flex-shrink: 0;
  margin-top: 2px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--cc-primary);
}

.thinking-dots { display: flex; align-items: center; gap: 4px; padding: 0; }
.thinking-dots span {
  width: 5px; height: 5px; border-radius: 50%; background: var(--cc-primary);
  animation: tdot 1.5s infinite cubic-bezier(0.45, 0, 0.45, 1);
}
.thinking-dots span:nth-child(2) { animation-delay: 0.5s; }
.thinking-dots span:nth-child(3) { animation-delay: 1.0s; }
@keyframes tdot { 0%,100%{transform:scale(0.5);opacity:0.3} 50%{transform:scale(1);opacity:1} }
.thinking-wrap { min-height: 22px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.thinking-label { font-size: 13px; line-height: 1.65; color: var(--cc-text-muted); }

/* Shimmer for first-awaiting thinking label */
.thinking-label.first-awaiting {
  background: linear-gradient(
    100deg,
    var(--cc-text-muted) 28%,
    color-mix(in srgb, var(--cc-text-muted) 65%, var(--cc-primary) 35%) 42%,
    var(--cc-text-muted) 56%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: text-shimmer 2.6s ease-in-out infinite;
}
@keyframes text-shimmer {
  0%   { background-position: 120% 0; }
  100% { background-position: -20% 0; }
}

/* 滚动顶部加载更多：绝对定位，不推动已有内容，避免 CLS */
.load-more-indicator {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}
.loading-spinner { display: flex; gap: 6px; align-items: center; }
.loading-spinner span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--cc-primary); opacity: 0.4;
  animation: loadMoreDot 1.6s infinite cubic-bezier(0.45, 0, 0.45, 1);
}
.loading-spinner span:nth-child(2) { animation-delay: 0.533s; }
.loading-spinner span:nth-child(3) { animation-delay: 1.067s; }
@keyframes loadMoreDot {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}

/* Reduced motion: disable all loading & entry animations */
@media (prefers-reduced-motion: reduce) {
  .thinking-dots span,
  .cc-loading .loading-dots span,
  .loading-spinner span,
  .thinking-label.first-awaiting {
    animation: none !important;
  }
  .thinking-label.first-awaiting {
    -webkit-text-fill-color: var(--cc-text-muted);
    background: none;
  }
  .msg-row { animation: none !important; }
  .cc-empty { animation: none !important; }
}
</style>
