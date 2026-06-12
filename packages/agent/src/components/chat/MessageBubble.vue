<template>
  <div class="msg-bubble" :class="[`msg-${msg.role}`, { 'msg-streaming': msg.isStreaming }]">
    <!-- 用户消息 -->
    <template v-if="msg.role === 'user'">
      <div class="msg-body">
        <!-- 图片 -->
        <div v-if="userImages.length" class="msg-images">
          <div
            v-for="(img, i) in userImages"
            :key="i"
            class="msg-image-thumb"
            @click="$emit('preview-image', img)"
          >
            <img :src="imgUrl(img)" alt="user image" />
          </div>
        </div>
        <!-- 文本 -->
        <div class="msg-text" v-if="userText">{{ userText }}</div>
      </div>
    </template>

    <!-- 助手消息 -->
    <template v-else>
      <div class="msg-body">
        <!-- 内容块：遍历 content 数组 -->
        <template v-if="hasContentBlocks">
          <template v-for="(block, i) in contentBlocks" :key="i">
            <!-- 文本块：markdown 渲染 -->
            <div v-if="block.type === 'text'" class="msg-text markdown-body" v-html="renderMd(block.text)"></div>
            <!-- 工具使用块 -->
            <div v-else-if="block.type === 'tool_use'" class="msg-tool-block">
              <div class="tool-header">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="8" cy="8" r="6"/>
                  <path d="M8 5v6M5 8h6"/>
                </svg>
                <span>搜索：{{ block.name === 'web_search' ? '联网搜索' : block.name }}</span>
                <span v-if="block.input?.query" class="tool-query">"{{ block.input.query }}"</span>
              </div>
            </div>
          </template>
        </template>
        <!-- 纯文本助手消息 -->
        <div v-else class="msg-text markdown-body" v-html="renderMd(assistantText)"></div>

        <!-- 流式中加载指示 -->
        <span v-if="msg.isStreaming" class="streaming-cursor">▊</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { renderContent } from '../agentCommon/render.js'

const props = defineProps({
  msg: { type: Object, required: true },
})

defineEmits(['preview-image'])

const userImages = computed(() => {
  if (props.msg.role !== 'user') return []
  if (!Array.isArray(props.msg.content)) return []
  return props.msg.content.filter(c => c.type === 'image' || c.type === 'image_url')
})

const userText = computed(() => {
  if (props.msg.role !== 'user') return ''
  if (typeof props.msg.content === 'string') return props.msg.content
  if (Array.isArray(props.msg.content)) {
    return props.msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  }
  return ''
})

const hasContentBlocks = computed(() => {
  return props.msg.role === 'assistant' && Array.isArray(props.msg.content)
})

const contentBlocks = computed(() => {
  if (!hasContentBlocks.value) return []
  return props.msg.content || []
})

const assistantText = computed(() => {
  if (props.msg.role !== 'assistant') return ''
  if (typeof props.msg.content === 'string') return props.msg.content
  if (Array.isArray(props.msg.content)) {
    return props.msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  }
  return ''
})

function imgUrl(img) {
  if (img.url) return img.url
  if (img.base64 || img.data) {
    return `data:${img.mediaType || 'image/png'};base64,${img.base64 || img.data}`
  }
  return ''
}

function renderMd(text) {
  if (!text) return ''
  try {
    return renderContent(text)
  } catch (_) {
    // 简单 HTML 转义回退
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  }
}
</script>

<style lang="scss" scoped>
.msg-bubble {
  padding: 10px 16px;
  max-width: 85%;
  border-radius: 12px;
  line-height: 1.55;
  font-size: 13px;
  word-break: break-word;
}

.msg-user {
  align-self: flex-end;
  background: var(--cc-primary, #c6613f);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg-assistant {
  align-self: flex-start;
  background: var(--cc-bg-elevated, #2a2a2a);
  color: var(--cc-text, #e0e0e0);
  border-bottom-left-radius: 4px;
}

.msg-body {
  min-width: 0;
}

.msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.msg-image-thumb {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.2);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.msg-text {
  white-space: pre-wrap;
  overflow-wrap: break-word;

  :deep(p) { margin: 0 0 6px; &:last-child { margin: 0; } }
  :deep(code) {
    background: rgba(0,0,0,0.15);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  }
  :deep(pre) {
    background: rgba(0,0,0,0.2);
    padding: 10px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 6px 0;
    code { background: none; padding: 0; }
  }
  :deep(a) {
    color: var(--cc-primary, #c6613f);
    text-decoration: underline;
  }
  :deep(ul), :deep(ol) {
    padding-left: 18px;
    margin: 4px 0;
  }
  :deep(blockquote) {
    border-left: 3px solid var(--cc-primary, #c6613f);
    padding-left: 10px;
    margin: 6px 0;
    opacity: 0.85;
  }
  :deep(table) {
    border-collapse: collapse;
    margin: 6px 0;
    th, td {
      border: 1px solid var(--cc-border, #3a3a3a);
      padding: 4px 8px;
      font-size: 12px;
    }
    th { background: rgba(0,0,0,0.15); }
  }
}

.msg-tool-block {
  margin: 4px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0,0,0,0.15);
  border: 1px solid var(--cc-border, #3a3a3a);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cc-text-muted, #bbb);
  svg { flex-shrink: 0; margin-top: -1px; }
}

.tool-query {
  color: var(--cc-text, #e0e0e0);
  font-style: italic;
}

.streaming-cursor {
  display: inline-block;
  animation: blink 0.8s steps(1) infinite;
  color: var(--cc-primary, #c6613f);
  margin-left: 1px;
}

@keyframes blink {
  50% { opacity: 0; }
}
</style>
