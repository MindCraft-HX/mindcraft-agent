<template>
  <div class="chat-view" :class="themeClass">
    <!-- 会话列表侧边栏 -->
    <SessionList
      :sessions="sessionList"
      :current-id="currentSessionId"
      :collapsed="sidebarCollapsed"
      @new-session="onNewSession"
      @switch="onSwitchSession"
      @delete="onDeleteSession"
      @rename="onRenameSession"
      @toggle="sidebarCollapsed = !sidebarCollapsed"
    />

    <!-- 主对话区域 -->
    <div class="chat-main">
      <!-- 顶部栏 -->
      <div class="chat-topbar">
        <span class="chat-title">{{ currentSession.title || $t('chat.newChat') }}</span>
        <div class="chat-topbar-actions">
          <span v-if="currentSession.contextSummary" class="chat-summary-indicator" :title="$t('chat.compressed')">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h8l3 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/></svg>
          </span>
          <button
            class="topbar-btn"
            :disabled="isStreaming || !currentSession.messages.length"
            @click="clearContext"
            :title="$t('chat.clearContext')"
          >{{ $t('chat.clearShort') }}</button>
          <button
            class="topbar-btn"
            :disabled="isStreaming || currentSession.messages.length < 2"
            @click="onCompress"
            :title="$t('chat.compress')"
          >{{ $t('chat.compressShort') }}</button>
        </div>
      </div>

      <!-- 消息列表 -->
      <MessageList
        :messages="currentSession.messages"
        :error="streamError"
        :project-cwd="currentSession.cwd || ''"
        @preview-image="previewImageUrl = $event"
      />

      <!-- 输入区 -->
      <InputArea
        ref="inputRef"
        :provider="currentSession.provider"
        :model="currentSession.model"
        :thinking-level="currentSession.thinkingLevel"
        :web-search-enabled="currentSession.webSearchEnabled"
        :is-streaming="isStreaming"
        @update:provider="onProviderUpdate"
        @update:model="onModelUpdate"
        @update:thinking-level="onThinkingLevelUpdate"
        @update:web-search-enabled="onWebSearchUpdate"
        @preview-image="previewImageUrl = $event"
        @send="onSend"
        @stop="onStop"
      />

      <!-- 图片预览弹窗 -->
      <Teleport to="body">
        <div
          v-if="previewImageUrl"
          class="img-preview-overlay"
          @click="previewImageUrl = null"
        >
          <img :src="imgPreviewSrc(previewImageUrl)" alt="preview" @click.stop />
          <button class="img-preview-close" @click="previewImageUrl = null">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/>
            </svg>
          </button>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useClaudeThemeStore } from '../stores/claudeTheme.js'
import { useChatSession } from '../composables/useChatSession.js'
import { useChatStream } from '../composables/useChatStream.js'
import SessionList from '../components/chat/SessionList.vue'
import MessageList from '../components/chat/MessageList.vue'
import InputArea from '../components/chat/InputArea.vue'

// 主题
const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

// 会话管理
const {
  sessionList,
  currentSessionId,
  currentSession,
  hasCurrentSession,
  loadList,
  createSession,
  switchSession,
  saveSession,
  deleteSession,
  renameSession,
  addMessage,
  updateLastAssistant,
  getLastAssistant,
  clearMessages,
  setSummary,
} = useChatSession()

// 流式管理
const { isStreaming, streamError, sendMessage, stopStreaming, compressContext } = useChatStream({
  currentSession,
  addMessage,
  updateLastAssistant,
  getLastAssistant,
  saveSession,
})

// UI 状态
const sidebarCollapsed = ref(false)
const previewImageUrl = ref(null)
const inputRef = ref(null)

// 生命周期
onMounted(async () => {
  await loadList()
  // 首页跳转目标会话
  const targetId = localStorage.getItem('mindcraft_agent_chat_target_session')
  if (targetId) {
    localStorage.removeItem('mindcraft_agent_chat_target_session')
    await switchSession(targetId)
    return
  }
  if (sessionList.value.length > 0) {
    await switchSession(sessionList.value[0].id)
  } else {
    await createSession('claude')
  }
})

// 路由记忆
watch(() => currentSessionId.value, (id) => {
  if (id) localStorage.setItem('mindcraft_agent_last_chat_session', id)
})

// 会话操作
async function onNewSession() {
  try { await saveSession() } catch (_) {}
  await createSession(currentSession.provider || 'claude')
}

async function onSwitchSession(id) {
  if (isStreaming.value) stopStreaming() // 安全复位：防止上次崩溃残留流状态
  await switchSession(id)
}

async function onDeleteSession(id) {
  if (sessionList.value.length <= 1) {
    // 删除最后一个时，创建新会话
    await deleteSession(id)
    await createSession(currentSession.provider || 'claude')
  } else {
    await deleteSession(id)
    if (!currentSessionId.value) {
      await switchSession(sessionList.value[0]?.id)
    }
  }
}

async function onRenameSession(id, title) {
  await renameSession(id, title)
}

// 设置更新
function onProviderUpdate(v) {
  currentSession.provider = v
  // 不重置 model，让 InputArea 自动选出新 provider 的默认模型
}
function onModelUpdate(v) { currentSession.model = v }
function onThinkingLevelUpdate(v) { currentSession.thinkingLevel = v }
function onWebSearchUpdate(v) { currentSession.webSearchEnabled = v }

// 上下文操作
function clearContext() {
  clearMessages()
  setSummary('')
  saveSession()
}

async function onCompress() {
  await compressContext()
}

// 发送 / 停止
async function onSend(text, images) {
  // 确保有当前会话
  if (!hasCurrentSession.value) {
    await createSession(currentSession.provider || 'claude')
  }
  await sendMessage(text, images)
}

function onStop() {
  stopStreaming()
}

// 图片预览（支持 dataUrl 字符串 / 内部格式 {mediaType, data} / {url}）
function imgPreviewSrc(img) {
  if (!img) return ''
  if (typeof img === 'string') return img
  if (img.url) return img.url
  if (img.dataUrl) return img.dataUrl
  const data = img.base64 || img.data
  const type = img.mediaType || 'image/png'
  return data ? `data:${type};base64,${data}` : ''
}
</script>

<style lang="scss" scoped>
.chat-view {
  display: flex;
  height: 100%;
  background: var(--cc-bg, #1a1a1a);
  color: var(--cc-text, #e0e0e0);
  overflow: hidden;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg-deepest, #0d1117);
  flex-shrink: 0;
}

.chat-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.chat-summary-indicator {
  color: var(--cc-primary, #c6613f);
  opacity: 0.6;
  display: flex;
  align-items: center;
  margin-right: 2px;
}

.topbar-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: transparent;
  color: var(--cc-text-dim, #888);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: var(--cc-primary, #c6613f);
    color: var(--cc-primary, #c6613f);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

/* 图片预览 */
.img-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 8px;
    cursor: default;
  }
}

.img-preview-close {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}
</style>
