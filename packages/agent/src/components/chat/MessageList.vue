<template>
  <div class="msg-list" ref="listRef" @scroll="onScroll">
    <!-- 欢迎界面 -->
    <div v-if="!messages.length" class="welcome-area">
      <div class="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <path d="M8 10h24a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H18l-10 8V16a6 6 0 0 1 6-6z"/>
        </svg>
      </div>
      <p class="welcome-title">开始对话</p>
      <p class="welcome-hint">你可以问我任何问题，也可以上传图片让我识别</p>
      <p class="welcome-hint">开启联网搜索后，我还能帮你查询最新信息</p>
    </div>

    <!-- 消息列表 -->
    <div class="msg-items" v-else>
      <MessageBubble
        v-for="(msg, i) in messages"
        :key="i"
        :msg="msg"
        @preview-image="$emit('preview-image', $event)"
      />
    </div>

    <!-- 流式错误 -->
    <div v-if="error" class="msg-error">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 5v3M8 10.5v0.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>{{ error }}</span>
    </div>

    <!-- 回到底部按钮 -->
    <button v-if="showScrollBtn" class="scroll-btn" @click="scrollToBottom">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="4 6 8 10 12 6"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import MessageBubble from './MessageBubble.vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  error: { type: String, default: '' },
})

defineEmits(['preview-image'])

const listRef = ref(null)
const showScrollBtn = ref(false)

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function onScroll() {
  const el = listRef.value
  if (!el) return
  showScrollBtn.value = (el.scrollHeight - el.scrollTop - el.clientHeight) > 120
}

// 消息变化时自动滚动到底部
watch(() => props.messages.length, () => scrollToBottom(), { flush: 'post' })
// streaming 文本变化时滚动
watch(
  () => {
    const last = props.messages[props.messages.length - 1]
    if (last?.isStreaming) {
      if (Array.isArray(last.content)) {
        return last.content.find(c => c.type === 'text')?.text?.length || 0
      }
      return typeof last.content === 'string' ? last.content.length : 0
    }
    return 0
  },
  () => scrollToBottom(),
  { flush: 'post' }
)
</script>

<style lang="scss" scoped>
.msg-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  position: relative;
}

.welcome-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--cc-text-dim, #888);
  user-select: none;
}

.welcome-icon {
  margin-bottom: 8px;
}

.welcome-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--cc-text-muted, #bbb);
  margin: 0;
}

.welcome-hint {
  font-size: 12px;
  color: var(--cc-text-dim, #888);
  margin: 0;
}

.msg-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(220, 50, 50, 0.1);
  border: 1px solid rgba(220, 50, 50, 0.3);
  color: #f87171;
  font-size: 12px;
}

.scroll-btn {
  position: sticky;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--cc-border, #3a3a3a);
  background: var(--cc-bg-elevated, #2a2a2a);
  color: var(--cc-text-muted, #bbb);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  &:hover {
    background: var(--cc-bg-hover, #333);
  }
}
</style>
