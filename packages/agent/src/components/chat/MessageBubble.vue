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

    <!-- 工具结果消息（web_search 等） -->
    <template v-else-if="msg.role === 'tool'">
      <div class="msg-body">
        <div class="msg-tool-result" @click="toolExpanded = !toolExpanded">
          <div class="tool-header">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="7" cy="7" r="4.5"/>
              <line x1="10.5" y1="10.5" x2="14" y2="14"/>
            </svg>
            <span>已搜索「{{ msg.query || msg.toolName }}」，{{ msg.resultCount || 0 }} 条结果</span>
            <svg class="tool-chevron" :class="{ open: toolExpanded }" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <polyline points="3 4.5 6 7.5 9 4.5"/>
            </svg>
          </div>
          <pre v-if="toolExpanded" class="tool-detail" @click.stop>{{ msg.content }}</pre>
        </div>
      </div>
    </template>

    <!-- 助手消息 -->
    <template v-else>
      <div class="msg-body">
        <!-- 等待指示：流式中且尚无文本 -->
        <div v-if="msg.isStreaming && !assistantText.trim()" class="msg-waiting">
          <span class="waiting-dots"><i></i><i></i><i></i></span>
          <span v-if="msg.thinkingChars > 0">深度思考中…（{{ msg.thinkingChars }} 字）</span>
          <span v-else>等待响应…</span>
        </div>

        <!-- 思考过程（可折叠块） -->
        <div v-if="thinkingText" class="msg-thinking" :class="{ expanded: thinkingExpanded }">
          <div class="thinking-toggle" @click="thinkingExpanded = !thinkingExpanded">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="8" cy="8" r="5"/>
              <path d="M8 5v3M8 10.5v0.5"/>
            </svg>
            <span class="thinking-label">思考过程（{{ msg.thinkingChars || 0 }} 字）</span>
            <svg class="thinking-chevron" :class="{ open: thinkingExpanded }" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <polyline points="2 3.5 5 6.5 8 3.5"/>
            </svg>
          </div>
          <div v-show="thinkingExpanded" class="thinking-content">{{ thinkingText }}</div>
        </div>

        <!-- 内容块：遍历 content 数组 -->
        <template v-if="hasContentBlocks">
          <template v-for="(block, i) in contentBlocks" :key="i">
            <!-- 文本块：markdown 渲染 -->
            <div v-if="block.type === 'text' && block.text" class="msg-text markdown-body" v-html="renderMd(block.text)"></div>
            <!-- 工具使用块 -->
            <div v-else-if="block.type === 'tool_use'" class="msg-tool-block">
              <div class="tool-header">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="7" cy="7" r="4.5"/>
                  <line x1="10.5" y1="10.5" x2="14" y2="14"/>
                </svg>
                <span>{{ block.name === 'web_search' ? '联网搜索' : block.name }}</span>
                <span v-if="block.input?.query" class="tool-query">"{{ block.input.query }}"</span>
              </div>
            </div>
          </template>
        </template>
        <!-- 纯文本助手消息 -->
        <div v-else-if="assistantText" class="msg-text markdown-body" v-html="renderMd(assistantText)"></div>

        <!-- 流式中加载指示（已有文本时显示光标） -->
        <span v-if="msg.isStreaming && assistantText.trim()" class="streaming-cursor">▊</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { renderContent } from '../agentCommon/render.js'

const props = defineProps({
  msg: { type: Object, required: true },
})

defineEmits(['preview-image'])

const toolExpanded = ref(false)

const thinkingExpanded = ref(false)
const thinkingText = computed(() => {
  if (props.msg.role !== 'assistant') return ''
  return props.msg.thinkingText || ''
})

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

.msg-tool {
  align-self: flex-start;
  background: transparent;
  padding: 0 16px;
  max-width: 85%;
}

.msg-thinking {
  margin: 4px 0 8px;
  border-left: 3px solid var(--cc-primary, #c6613f);
  border-radius: 0 6px 6px 0;
  background: rgba(198, 97, 63, 0.06);
  overflow: hidden;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  color: var(--cc-primary, #c6613f);
  transition: background 0.12s;

  &:hover {
    background: rgba(198, 97, 63, 0.1);
  }
}

.thinking-label {
  flex: 1;
}

.thinking-chevron {
  flex-shrink: 0;
  transition: transform 0.15s;
  opacity: 0.6;
  &.open { transform: rotate(180deg); }
}

.thinking-content {
  padding: 8px 12px 10px 12px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--cc-text-dim, #999);
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
  max-height: 320px;
  overflow-y: auto;
}

.msg-waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--cc-text-dim, #888);
  padding: 2px 0;
}

.waiting-dots {
  display: inline-flex;
  gap: 3px;

  i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--cc-primary, #c6613f);
    animation: wait-bounce 1.2s ease-in-out infinite;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
}

@keyframes wait-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.msg-tool-result {
  border-radius: 8px;
  background: var(--cc-bg-elevated, rgba(255,255,255,0.04));
  border: 1px solid var(--cc-border, #3a3a3a);
  padding: 7px 10px;
  cursor: pointer;
  user-select: none;

  &:hover {
    border-color: var(--cc-border-strong, #4a4a4a);
  }
}

.tool-chevron {
  margin-left: auto;
  transition: transform 0.15s;
  flex-shrink: 0;

  &.open { transform: rotate(180deg); }
}

.tool-detail {
  margin: 8px 0 0;
  padding: 8px;
  border-radius: 6px;
  background: rgba(0,0,0,0.25);
  font-size: 11px;
  line-height: 1.5;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--cc-text-muted, #bbb);
  cursor: text;
  user-select: text;
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
