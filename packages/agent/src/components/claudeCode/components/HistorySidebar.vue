<template>
  <div class="cc-sidebar" :class="{ collapsed: !sidebarOpen }">
    <div class="sidebar-header">
      <span v-if="sidebarOpen" class="sidebar-title">历史对话
        <button
          v-if="sidebarOpen"
          class="sidebar-icon-btn"
          :disabled="refreshing"
          @click="emit('refresh')"
          title="刷新列表"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" :class="{ 'spinning': refreshing }">
            <path d="M8 3a5 5 0 104.546 2.914.5.5 0 11.908-.418A6 6 0 118 2v1z"/>
            <path d="M8 1a.5.5 0 01.5.5v4a.5.5 0 01-1 0v-4A.5.5 0 018 1z"/>
            <path d="M8 5.5L5.5 3H10.5L8 5.5z"/>
          </svg>
        </button>
      </span>
      <div class="sidebar-header-actions">

        <button
          v-if="sidebarOpen"
          class="sidebar-icon-btn"
          :disabled="locked"
          @click="emit('openSettings')"
          title="设置"
        >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"/>
          </svg>
        </button>
        <button
          class="sidebar-toggle"
          type="button"
          @click="emit('update:sidebarOpen', !sidebarOpen)"
          :title="sidebarOpen ? '收起' : '展开'"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path v-if="sidebarOpen" d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/>
            <path v-else d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/>
          </svg>
        </button>
      </div>
    </div>

    <button
      v-if="sidebarOpen"
      type="button"
      class="sidebar-new-chat"
      :disabled="newChatDisabled"
      :title="newChatDisabled ? '请先选择并锁定工作文件夹' : '新建对话'"
      @click="emit('newChat')"
    >
      <span class="new-chat-icon">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
        </svg>
      </span>
      <span>新建对话</span>
    </button>

    <!-- 搜索框 -->
    <div v-if="sidebarOpen" class="sidebar-search">
      <svg class="search-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z"/>
      </svg>
      <input
        type="text"
        v-model="searchQuery"
        placeholder="搜索历史对话"
        class="search-input"
      />
    </div>

    <template v-if="sidebarOpen">
      <div class="sidebar-list" @scroll="onScroll">
        <div v-if="loading" class="loading-state">
          <div class="loading-dot"></div>
          <span>加载中…</span>
        </div>

        <div
          v-for="g in visibleDateGroups"
          :key="g.key"
          v-show="g.items.length"
          class="date-group"
        >
          <div class="date-header">{{ g.label }}</div>
          <div
            v-for="session in g.items"
            :key="session.id"
            class="sidebar-item"
            :class="{ active: session.id === activeId }"
            @click="!loading && emit('switchTab', session.id)"
          >
            <template v-if="renamingId === session.id">
              <input
                class="rename-input"
                v-model="renameText"
                ref="renameInputRef"
                @keydown.enter="confirmRename(session)"
                @keydown.esc="cancelRename"
                @blur="confirmRename(session)"
                @click.stop
              />
            </template>
            <template v-else>
              <span class="sidebar-item-title" :title="formatSessionName(session)">
                <span v-if="session.thinking" class="thinking-dot"></span>
                {{ formatSessionTitle(session) }}
              </span>
              <span class="sidebar-item-meta">
                {{ formatSessionTime(session.updatedAt) }} · {{ formatFileSize(session.fileSize) }}
              </span>
              <div class="sidebar-item-actions">
                <button class="sib-btn edit" type="button" @click.stop="startRename(session)" title="重命名">✎</button>
                <button class="sib-btn del" type="button" @click.stop="emit('requestDelete', session)" title="删除">×</button>
              </div>
            </template>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore && !loading" class="load-more">
          <button @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中…' : `加载更多 (${loadedCount} / ${totalFiltered})` }}
          </button>
        </div>

        <!-- 空状态 -->
        <div v-if="!hasAnyVisible&&!loading" class="empty-state">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color:var(--cc-text-dim)">
            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1a6 6 0 100 12A6 6 0 008 2z"/>
            <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
          </svg>
          <span>{{ searchQuery ? '未找到匹配的对话' : '暂无历史对话' }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { shouldDeferClaudeSessionMessageTitle } from '../utils/pendingSessionBinding.mjs'

const PAGE_SIZE = 100

const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  },
  activeId: {
    type: String,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  sidebarOpen: {
    type: Boolean,
    default: true
  },
  newChatDisabled: {
    type: Boolean,
    default: false
  },
  refreshing: {
    type: Boolean,
    default: false
  },
  locked: {
    type: Boolean,
    default: false
  },
})

const emit = defineEmits([
  'update:sidebarOpen',
  'switchTab',
  'requestDelete',
  'openSettings',
  'newChat',
  'refresh',
  'rename',
])

// 当前日期标签
const todayLabel = ref('今天')
const yesterdayLabel = ref('昨天')
const pastWeekLabel = ref('过去一周')
const olderLabel = ref('更早之前')

// 搜索
const searchQuery = ref('')

// 分页
const loadedCount = ref(PAGE_SIZE)
const loadingMore = ref(false)

// 搜索过滤
const filteredSessions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.sessions
  return props.sessions.filter(s => {
    const title = formatSessionTitle(s).toLowerCase()
    return title.includes(q)
  })
})

// 按日期分组
const groupedByDate = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const lastWeek = new Date(today)
  lastWeek.setDate(lastWeek.getDate() - 7)

  const result = {
    today: [],
    yesterday: [],
    pastWeek: [],
    older: [],
  }

  for (const session of filteredSessions.value) {
    const dateField = session.updatedAt || session.createdAt
    if (!dateField) {
      result.today.push(session)
      continue
    }
    const sessionDate = new Date(dateField)
    if (sessionDate >= today) {
      result.today.push(session)
    } else if (sessionDate >= yesterday) {
      result.yesterday.push(session)
    } else if (sessionDate >= lastWeek) {
      result.pastWeek.push(session)
    } else {
      result.older.push(session)
    }
  }
  return result
})

// 分页后的可见数据
const visibleDateGroups = computed(() => {
  const limit = loadedCount.value
  const groups = [
    { key: 'today', label: todayLabel.value, items: [] },
    { key: 'yesterday', label: yesterdayLabel.value, items: [] },
    { key: 'pastWeek', label: pastWeekLabel.value, items: [] },
    { key: 'older', label: olderLabel.value, items: [] },
  ]
  let count = 0
  for (const g of groups) {
    const allItems = groupedByDate.value[g.key] || []
    for (const item of allItems) {
      if (count >= limit) break
      g.items.push(item)
      count++
    }
    if (count >= limit) break
  }
  return groups
})

const hasMore = computed(() => loadedCount.value < filteredSessions.value.length)
const totalFiltered = computed(() => filteredSessions.value.length)

const hasAnyVisible = computed(() => {
  return visibleDateGroups.value.some(g => g.items.length > 0)
})

function loadMore() {
  loadingMore.value = true
  setTimeout(() => {
    loadedCount.value += PAGE_SIZE
    loadingMore.value = false
  }, 200)
}

function onScroll(e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10 && hasMore.value && !loadingMore.value) {
    loadMore()
  }
}

// 搜索/数据变化时重置分页
watch([searchQuery, () => props.sessions], () => {
  loadedCount.value = PAGE_SIZE
})

// 重命名
const renamingId = ref(null)
const renameText = ref('')
const renameInputRef = ref(null)

function startRename(session) {
  renamingId.value = session.id
  renameText.value = formatSessionTitle(session)
  nextTick(() => {
    // v-for 中的 ref 是数组，取第一个实际 DOM 元素
    const el = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value
    if (el) { el.focus(); el.select() }
  })
}

function confirmRename(session) {
  const newName = renameText.value.trim()
  if (newName && newName !== formatSessionTitle(session)) {
    emit('rename', session, newName)
  }
  renamingId.value = null
  renameText.value = ''
}

function cancelRename() {
  renamingId.value = null
  renameText.value = ''
}

// 格式化会话标题
function formatSessionTitle(session) {
  if (session.name && !session.name.includes('会话 ') && session.name !== `会话 ${session.id.slice(0, 8)}`) {
    return session.name.slice(0, 35)
  }
  const idPrefix = `会话 ${session.id.slice(0, 8)}`
  if (shouldDeferClaudeSessionMessageTitle(session)) {
    return session.name || '新对话'
  }
  if (session.messages && session.messages.length > 0) {
    const firstUserMsg = session.messages.find(m => m.role === 'user')
    if (firstUserMsg) {
      let content = ''
      if (typeof firstUserMsg.content === 'string') {
        content = firstUserMsg.content
      } else if (Array.isArray(firstUserMsg.content)) {
        content = firstUserMsg.content
          .filter(c => c.type === 'text' && c.text && !c.text.trim().startsWith('<ide_'))
          .map(c => c.text)
          .join('\n')
      }
      if (content && content.trim()) {
        return content.slice(0, 25).trim() + (content.length > 25 ? '...' : '')
      }
    }
  }
  return idPrefix
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '?'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatSessionName(session) {
  return formatSessionTitle(session)
}

function formatSessionTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sessionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (sessionDate.getTime() === today.getTime()) {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sessionDate.getTime() === yesterday.getTime()) {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `昨天 ${hours}:${minutes}`
  }
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
</script>

<style scoped>
.cc-sidebar {
  width: 220px;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
  background: var(--cc-panel-bg);
  border-right: 1px solid var(--cc-panel-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s;
}
.cc-sidebar.collapsed {
  width: 36px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--cc-border);
}
.sidebar-title {
  font-size: 11px;
  color: var(--cc-panel-title);
  font-weight: 600;
  letter-spacing: 0.05em;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: 1;
}
.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sidebar-icon-btn,
.sidebar-toggle {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: none;
  border: none;
  color: var(--cc-panel-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sidebar-icon-btn:hover {
  background: var(--cc-panel-item-hover);
  color: var(--cc-primary);
}
.sidebar-toggle:hover {
  background: var(--cc-panel-item-hover);
  color: var(--cc-primary);
}
.sidebar-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.sidebar-icon-btn svg.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg) }
  to { transform: rotate(360deg) }
}

.sidebar-new-chat {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin: 8px 8px 4px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-tertiary);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.new-chat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  line-height: 1;
}
.sidebar-new-chat span {
  line-height: 1;
}
.sidebar-new-chat:hover:not(:disabled) {
  background: var(--cc-bg-elevated);
  color: var(--cc-primary);
  border-color: var(--cc-primary);
}
.sidebar-new-chat:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* 搜索框 */
.sidebar-search {
  position: relative;
  padding: 4px 8px;
  flex-shrink: 0;
}
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--cc-text-muted);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 5px 8px 5px 28px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.search-input:focus {
  border-color: var(--cc-primary);
}
.search-input::placeholder {
  color: var(--cc-text-muted);
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px;
}
.sidebar-list::-webkit-scrollbar {
  width: 6px;
}
.sidebar-list::-webkit-scrollbar-thumb {
  background: var(--cc-border);
  border-radius: 3px;
}

.date-group {
  margin-bottom: 12px;
}
.date-header {
  font-size: 10px;
  color: var(--cc-panel-text);
  padding: 4px 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sidebar-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  padding: 8px 8px;
  border-radius: 6px;
  cursor: pointer;
  min-height: 38px;
  transition: background 0.1s;
  margin-bottom: 2px;
  position: relative;
}
.sidebar-item:hover {
  background: var(--cc-panel-item-hover);
}
.sidebar-item.active {
  background: var(--cc-panel-item-active);
  border-left: 2px solid var(--cc-primary);
}
.sidebar-item-title {
  width: 100%;
  font-size: 13px;
  color: var(--cc-panel-title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
  display: flex;
  align-items: center;
}
.thinking-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cc-primary);
  margin-right: 6px;
  flex-shrink: 0;
  animation: thinking-pulse 1.2s ease-in-out infinite;
}
@keyframes thinking-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
.sidebar-item.active .sidebar-item-title {
  color: var(--cc-panel-active-text);
}
.sidebar-item-meta {
  font-size: 10px;
  color: var(--cc-text-dim);
  white-space: nowrap;
}
.sidebar-item.active .sidebar-item-meta {
  color: var(--cc-text-muted);
}
.sidebar-item-actions {
  display: none;
  gap: 2px;
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  padding-left: 8px;
}
.sidebar-item:hover .sidebar-item-actions {
  display: flex;
}

.sib-btn {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: none;
  border: none;
  color: var(--cc-panel-text);
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sib-btn:hover {
  background: var(--cc-btn-bg);
  color: var(--cc-btn-text);
}
.sib-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.sib-btn.del:hover {
  background: var(--cc-error-bg);
  color: var(--cc-error);
}
.sib-btn.edit:hover {
  background: var(--cc-btn-bg);
  color: var(--cc-primary);
}

/* 内联重命名输入框 */
.rename-input {
  width: 100%;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--cc-primary);
  background: var(--cc-bg-secondary);
  color: var(--cc-text);
  font-size: 13px;
  line-height: 1.4;
  outline: none;
  box-sizing: border-box;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 12px;
  color: var(--cc-panel-text);
  gap: 8px;
}
.empty-state span {
  font-size: 11px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 12px;
  color: var(--cc-text-dim);
  font-size: 11px;
  user-select: none;
}
.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cc-primary);
  animation: hs-pulse 1s ease-in-out infinite;
}
@keyframes hs-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* 加载更多按钮 */
.load-more {
  padding: 8px 0;
  text-align: center;
}
.load-more button {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.load-more button:hover:not(:disabled) {
  background: var(--cc-bg-elevated);
  color: var(--cc-primary);
}
.load-more button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
