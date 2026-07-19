<template>
  <div class="home-page" :class="themeClass">
    <div class="home-hero">
      <h1 class="hero-title">{{ $t('home.welcome') }}</h1>
    </div>

    <div class="home-cards">
      <!-- 开始项目对话 -->
      <div class="home-card home-card-project" @click="openAgentHub">
        <div class="card-head">
          <div class="card-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="11 8 5 16 11 24"/>
              <polyline points="21 8 27 16 21 24"/>
            </svg>
          </div>
          <span class="card-title">{{ $t('home.startProject') }}</span>
        </div>

        <div class="card-body">
          <template v-if="projectLoading">
            <div class="card-skeleton">
              <div class="skeleton-line" style="width:75%"></div>
              <div class="skeleton-line" style="width:55%"></div>
              <div class="skeleton-line" style="width:65%"></div>
            </div>
          </template>
          <template v-else-if="recentProject.hasRecent">
            <div class="project-list">
              <div
                v-for="proj in recentProject.projects.slice(0, 4)"
                :key="proj.sessionId || proj.projectName + proj.chatName"
                class="project-entry"
                @click.stop="openProjectEntry(proj)"
              >
                <span class="badge" :style="{ background: proj.agentColor }">
                  {{ proj.agentName }}
                </span>
                <span class="project-entry-name">{{ proj.projectName }}</span>
                <span class="project-entry-meta" v-if="proj.chatName">
                  {{ proj.chatName }} · {{ formatTime(proj.updatedAt) }}
                </span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8v12"/>
                  <path d="M12 20l6-6 6 6"/>
                  <path d="M12 26h12"/>
                </svg>
              </div>
              <p class="empty-text">{{ $t('home.noRecentProjects') }}</p>
              <p class="empty-hint">{{ $t('home.clickToStart') }}</p>
            </div>
          </template>
        </div>

        <div class="card-foot">
          <span class="card-action">{{ $t('home.enterProject') }}</span>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="6 3 12 9 6 15"/>
          </svg>
        </div>
      </div>

      <!-- 浏览文档 -->
      <div class="home-card home-card-doc" @click="openDocBrowser">
        <div class="card-head">
          <div class="card-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 4H8.5a2.5 2.5 0 0 0-2.5 2.5v19a2.5 2.5 0 0 0 2.5 2.5h15a2.5 2.5 0 0 0 2.5-2.5V12l-6-8z"/>
              <polyline points="18 4 18 12 26 12"/>
            </svg>
          </div>
          <span class="card-title">{{ $t('home.browseDocs') }}</span>
        </div>

        <div class="card-body">
          <template v-if="docsLoading">
            <div class="card-skeleton">
              <div class="skeleton-line" style="width:75%"></div>
              <div class="skeleton-line" style="width:55%"></div>
              <div class="skeleton-line" style="width:65%"></div>
            </div>
          </template>
          <template v-else-if="recentDocs.length">
            <div class="doc-list">
              <div
                v-for="doc in recentDocs.slice(0, 3)"
                :key="doc.filePath"
                class="doc-entry"
              >
                <span class="doc-ext-badge">{{ doc.ext || 'file' }}</span>
                <div class="doc-info">
                  <span class="doc-name">{{ doc.name || $t('home.unnamedFile') }}</span>
                  <span class="doc-path">{{ dirPath(doc.filePath) }}</span>
                </div>
                <span class="doc-time">{{ formatTime(doc.openedAt) }}</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="format-row">
              <span class="fmt-badge">MD</span>
              <span class="fmt-badge">PDF</span>
              <span class="fmt-badge">DOCX</span>
              <span class="fmt-badge">XLSX</span>
            </div>
            <p class="feature-text">{{ $t('home.openLocalFolder') }}</p>
          </template>
        </div>

        <div class="card-foot">
          <span class="card-action">{{ $t('home.browseDocs') }}</span>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="6 3 12 9 6 15"/>
          </svg>
        </div>
      </div>

      <!-- 开始对话 -->
      <div class="home-card home-card-chat">
        <div class="card-head" @click="openChatHome">
          <div class="card-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 6h16a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H11l-6 5V10a4 4 0 0 1 4-4z"/>
            </svg>
          </div>
          <span class="card-title">{{ $t('home.startChat') }}</span>
        </div>

        <div class="card-body">
          <template v-if="recentChatsLoading">
            <div class="card-skeleton">
              <div class="skeleton-line" style="width:72%"></div>
              <div class="skeleton-line" style="width:58%"></div>
              <div class="skeleton-line" style="width:66%"></div>
            </div>
          </template>
          <template v-else-if="recentChats.length">
            <div class="project-list">
              <div
                v-for="chat in recentChats.slice(0, 4)"
                :key="chat.id"
                class="project-entry"
                @click.stop="openChat(chat)"
              >
                <span class="project-entry-name">{{ chat.title || $t('home.newChat') }}</span>
                <span class="project-entry-meta">{{ formatTime(chat.updatedAt) }}</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="feature-text">{{ $t('home.noProjectChat') }}</div>
            <div class="feature-text feature-text-sub">{{ $t('home.reuseApi') }}</div>
          </template>
        </div>

        <div class="card-foot" @click="openChatHome">
          <span class="card-action">{{ $t('home.enterChat') }}</span>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="6 3 12 9 6 15"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 用量统计 -->
    <div class="home-stats">
      <div class="stats-header">
        <h2 class="stats-title">{{ $t('home.stats') }}</h2>
        <div class="trend-toggle">
          <button :class="{ active: trendDays === 1 }" @click="setTrendDays(1)">{{ $t('home.today') }}</button>
          <button :class="{ active: trendDays === 7 }" @click="setTrendDays(7)">{{ $t('home.days7') }}</button>
          <button :class="{ active: trendDays === 30 }" @click="setTrendDays(30)">{{ $t('home.days30') }}</button>
        </div>
      </div>

      <div class="stats-body">
        <div v-if="statsLoading" class="stats-today-skeleton">
          <div class="stats-stat-skeleton">
            <div class="skeleton-line skeleton-label"></div>
            <div class="skeleton-line skeleton-value"></div>
          </div>
          <div class="stats-stat-skeleton">
            <div class="skeleton-line skeleton-label"></div>
            <div class="skeleton-line skeleton-value"></div>
          </div>
          <div class="stats-stat-skeleton">
            <div class="skeleton-line skeleton-label"></div>
            <div class="skeleton-line skeleton-value"></div>
          </div>
        </div>
        <div v-else class="stats-today">
          <div class="stats-period-label">{{ $t('home.todayRange') }}</div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('home.input') }}</span>
            <span class="stat-value">{{ formatNumber(summaryStats.inputTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('home.output') }}</span>
            <span class="stat-value">{{ formatNumber(summaryStats.outputTokens) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('home.cache') }}</span>
            <span class="stat-value">{{ formatNumber(summaryStats.cacheReadTokens) }}</span>
          </div>
        </div>
        <div class="stats-chart">
          <div v-if="trendLoading" class="chart-skeleton">
            <div class="skeleton-line chart-line-lg"></div>
            <div class="skeleton-line chart-line-md"></div>
            <div class="skeleton-line chart-line-lg"></div>
            <div class="skeleton-line chart-line-sm"></div>
          </div>
          <TokenChart v-else-if="trendData.length" :data="trendData" />
          <div v-else class="chart-empty">{{ $t('home.noTrendData') }}</div>
        </div>
      </div>
    </div>

    <div class="home-footer">
      <div class="footer-left"></div>
      <div class="footer-right">
        <span class="footer-version">v{{ appVersion }}</span>

        <!-- idle / not-available(非dev)：默认检查按钮 -->
        <button
          v-if="updateState === 'idle' || (updateState === 'not-available' && !isDevMode)"
          class="footer-update-btn"
          @click="checkForUpdate"
        >
          {{ $t('settings.checkAppUpdate') }}
        </button>

        <!-- not-available + dev：开发模式（无更新服务器，静默） -->
        <span
          v-else-if="updateState === 'not-available' && isDevMode"
          class="footer-dev-mode"
          :title="$t('settings.appUpToDate')"
        >开发模式</span>

        <!-- checking：带 spinner 的禁用按钮 -->
        <button
          v-else-if="updateState === 'checking'"
          class="footer-update-btn"
          disabled
        >
          <span class="footer-spinner"></span>{{ $t('settings.checking') }}
        </button>

        <!-- available：显示版本号 + 下载按钮 -->
        <template v-else-if="updateState === 'available'">
          <span class="footer-new-version" :title="releaseNotes">{{ $t('settings.appUpdateAvailable', { version: newVersion }) }}</span>
          <button class="footer-update-btn footer-download-btn" @click="handleDownloadUpdate">
            {{ $t('settings.downloadUpdate') }}
          </button>
        </template>

        <!-- downloading：紧凑进度条 -->
        <div v-else-if="updateState === 'downloading'" class="footer-progress">
          <div class="footer-progress-bar">
            <div
              class="footer-progress-fill"
              :class="{ 'footer-progress-indeterminate': downloadProgress === 0 }"
              :style="{ width: downloadProgress > 0 ? Math.round(downloadProgress) + '%' : '30%' }"
            ></div>
          </div>
          <span class="footer-progress-text">
            {{ downloadProgress > 0 ? Math.round(downloadProgress) + '%' : $t('settings.downloading') }}
          </span>
        </div>

        <!-- downloaded：重启安装按钮 -->
        <button
          v-else-if="updateState === 'downloaded'"
          class="footer-update-btn footer-install-btn"
          @click="handleInstallUpdate"
        >
          {{ $t('settings.restartToInstall') }}
        </button>

        <!-- error：可重试 -->
        <button
          v-else-if="updateState === 'error'"
          class="footer-update-btn footer-error-btn"
          :title="$t('settings.appUpdateFailed')"
          @click="checkForUpdate"
        >
          {{ $t('common.retry') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useClaudeThemeStore } from '@mindcraft/agent'
import { useHomeData, formatNumber, formatTime } from '@/components/Home/useHomeData.js'
import { createLegacyNavigationAdapter } from '@/workbench/navigationIntent.mjs'

const TokenChart = defineAsyncComponent(() => import('@/components/Home/TokenChart.vue'))

const router = useRouter()
// 首页入口统一走 typed navigation intent（设计 4.4），不直接操作路由/写 localStorage
const navigationAdapter = createLegacyNavigationAdapter({ router })

function dispatchNavIntent(intent) {
  void navigationAdapter.dispatch({
    requestId: `home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'home',
    ...intent,
  })
}

const openAgentHub = () => dispatchNavIntent({ type: 'focus-agent' })
const openDocBrowser = () => dispatchNavIntent({ type: 'open-document', resourceId: 'legacy://document-viewer' })
const openChatHome = () => dispatchNavIntent({ type: 'focus-chat' })
const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

const {
  recentProject,
  recentDocs,
  summaryStats,
  trendData,
  trendDays,
  setTrendDays,
  projectLoading,
  docsLoading,
  statsLoading,
  trendLoading,
} = useHomeData()

// 最近对话会话
const recentChats = ref([])
const recentChatsLoading = ref(true)
onMounted(async () => {
  requestAnimationFrame(() => {
    setTimeout(async () => {
      try {
        const api = window.electronAPI || {}
        const result = await api.chatListSessions?.()
        const sessions = Array.isArray(result?.sessions) ? result.sessions : []
        recentChats.value = sessions
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      } catch (_) {}
      recentChatsLoading.value = false
    }, 0)
  })
})

// 版本号 + 更新检测（完整状态机，对齐 SystemSettings.vue）
const appVersion = ref('')
const updateState = ref('idle')         // idle | checking | available | downloading | downloaded | not-available | error
const newVersion = ref('')
const downloadProgress = ref(0)
const releaseNotes = ref('')
const isDevMode = ref(false)
const pendingManualCheckId = ref(0)
let _cleanupUpdateStatus = null

onMounted(() => {
  // 监听器必须在任何异步 IPC 之前注册，
  // 否则 getAppVersion/getAppUpdateStatus 等待主进程时用户可能点击按钮，
  // 导致主进程发出的 app-update-status 事件丢失，按钮永远卡在"检查中…"
  _cleanupUpdateStatus = window.electronAPI?.onAppUpdateStatus?.((data) => {
    if (!data) return
    applyUpdateStatus(data)
  })

  requestAnimationFrame(() => {
    setTimeout(async () => {
      try {
        const v = await window.electronAPI?.getAppVersion()
        if (v) appVersion.value = v
      } catch (_) {}

      try {
        const status = await window.electronAPI?.getAppUpdateStatus()
        applyUpdateStatus(status, { fromSnapshot: true })
      } catch (_) {}
    }, 0)
  })
})

onUnmounted(() => {
  if (typeof _cleanupUpdateStatus === 'function') _cleanupUpdateStatus()
})

function checkForUpdate() {
  if (!window.electronAPI?.checkForUpdates) return
  updateState.value = 'checking'
  window.electronAPI.checkForUpdates().then((result) => {
    pendingManualCheckId.value = Number(result?.checkId || 0)
  }).catch(() => {
    pendingManualCheckId.value = 0
    updateState.value = 'error'
  })
}

function applyUpdateStatus(data, options = {}) {
  const nextState = data.error ? 'error' : (data.state || 'idle')
  const fromSnapshot = Boolean(options.fromSnapshot)
  const checkId = Number(data.checkId || 0)

  if (nextState === 'checking' && checkId > 0) {
    pendingManualCheckId.value = checkId
  }
  // 忽略旧的检查结果（比当前手动检查 ID 小的非快照事件）
  if (!fromSnapshot && pendingManualCheckId.value > 0 && checkId > 0 && checkId < pendingManualCheckId.value) {
    return
  }

  updateState.value = nextState
  if (checkId > 0 && checkId === pendingManualCheckId.value && nextState !== 'checking') {
    pendingManualCheckId.value = 0
  }
  if (data.version !== undefined) newVersion.value = data.version || ''
  if (data.progress != null) downloadProgress.value = data.progress
  if (data.releaseNotes !== undefined) releaseNotes.value = data.releaseNotes || ''
  if (data.dev != null) isDevMode.value = Boolean(data.dev)
}

async function handleDownloadUpdate() {
  const result = await window.electronAPI?.downloadUpdate?.()
  if (!result?.success) {
    updateState.value = 'error'
  }
}

function handleInstallUpdate() {
  window.electronAPI?.installUpdate?.()
}

function openChat(chat) {
  // typed intent 携带 sessionId，由 ChatView 从路由 query 消费并切换内部会话
  dispatchNavIntent({ type: 'focus-chat', chatTarget: { sessionId: chat.id } })
}

function openProjectEntry(proj) {
  dispatchNavIntent({
    type: 'focus-agent',
    agentTarget: {
      agent: proj.agentType,
      projectId: proj.projectId,
      chatId: proj.chatId || '',
      sessionId: proj.sessionId || '',
    },
  })
}

function dirPath(filePath) {
  if (!filePath) return ''
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return lastSep > 0 ? filePath.slice(0, lastSep) : filePath
}
</script>

<style lang="scss" scoped>
.home-page {
  height: 100%;
  overflow-y: auto;
  padding: 28px 32px;
  background: var(--cc-bg-secondary, #1e1e1e);
  display: flex;
  flex-direction: column;
}

/* ===== Hero ===== */
.home-hero {
  margin-bottom: 20px;
}

.hero-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--cc-text, #e0e0e0);
  margin: 0;
}

/* ===== Cards ===== */
.home-cards {
  display: flex;
  gap: 14px;
  margin-bottom: 20px;
  min-height: 280px;
  height: calc(100vh - 360px);
  max-height: 360px;
}

.home-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
  user-select: none;
  overflow: hidden;

  &:hover {
    border-color: var(--cc-primary, #c6613f);
    box-shadow: 0 0 0 1px var(--cc-primary, #c6613f);

    .card-foot {
      color: var(--cc-primary, #c6613f);
      background: var(--cc-primary-bg, #1c1408);

      svg {
        transform: translateX(2px);
      }
    }
  }

  &:active {
    transform: scale(0.995);
  }
}

/* Card head */
.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 12px;
}

.card-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 9px;
  background: var(--cc-primary-bg, #1c1408);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cc-primary, #c6613f);
  flex-shrink: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
}

/* Card body — main preview area */
.card-body {
  flex: 1;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
}

.card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Project list */
.project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--cc-bg-secondary, #1e1e1e);
  transition: background 0.12s;

  &:hover {
    background: var(--cc-panel-item-hover, #252525);
  }
}

.badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  padding: 2px 7px;
  border-radius: 3px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.project-entry-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.project-entry-meta {
  font-size: 10px;
  color: var(--cc-text-dim, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.empty-icon {
  color: var(--cc-text-dim, #555);
  opacity: 0.5;
}

.empty-text {
  font-size: 13px;
  color: var(--cc-text-muted, #bbb);
  margin: 0;
}

.empty-hint {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  margin: 0;
}

/* Doc list */
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--cc-bg-secondary, #1e1e1e);
  transition: background 0.12s;

  &:hover {
    background: var(--cc-panel-item-hover, #252525);
  }
}

.doc-ext-badge {
  font-size: 9px;
  font-weight: 700;
  color: var(--cc-text-muted, #bbb);
  background: var(--cc-bg-elevated, #2a2a2a);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  flex-shrink: 0;
  margin-top: 1px;
}

.doc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-name {
  font-size: 12px;
  color: var(--cc-text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.doc-path {
  font-size: 10px;
  color: var(--cc-text-dim, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-time {
  font-size: 10px;
  color: var(--cc-text-dim, #888);
  flex-shrink: 0;
  margin-top: 1px;
}

/* Initial state for docs */
.format-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.fmt-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--cc-text-muted, #bbb);
  background: var(--cc-bg-secondary, #1e1e1e);
  border: 1px solid var(--cc-border, #2a2a2a);
  padding: 3px 9px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}

.feature-text {
  font-size: 12px;
  color: var(--cc-text-muted, #bbb);
  margin: 0;
  line-height: 1.5;
}

.feature-text-sub {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  margin-top: 4px;
}

/* Card foot */
.card-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 20px;
  border-top: 1px solid var(--cc-border, #2a2a2a);
  margin-top: auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--cc-text-muted, #bbb);
  transition: all 0.18s;

  svg {
    transition: transform 0.18s;
  }
}

/* ===== Stats ===== */
.home-stats {
  border-radius: 10px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  overflow: hidden;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.stats-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
  margin: 0;
}

.trend-toggle {
  display: flex;
  gap: 2px;
  background: var(--cc-bg-secondary, #1e1e1e);
  border-radius: 6px;
  padding: 2px;

  button {
    padding: 4px 14px;
    font-size: 12px;
    font-weight: 500;
    color: var(--cc-text-muted, #bbb);
    background: transparent;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      color: var(--cc-text, #e0e0e0);
    }

    &.active {
      color: var(--cc-btn-primary-text, #fff);
      background: var(--cc-primary, #c6613f);
    }
  }
}

.stats-body {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 24px;
  padding: 14px 20px 20px;
}

.stats-today {
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}

.stats-period-label {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  margin-bottom: 2px;
}

.stats-today-skeleton {
  display: flex;
  flex-direction: column;
  gap: 18px;
  justify-content: center;
}

.stats-stat-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-label {
  font-size: 11px;
  color: var(--cc-text-dim, #888);
  letter-spacing: 0.3px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--cc-text, #e0e0e0);
  font-variant-numeric: tabular-nums;
}

.stats-chart {
  min-height: 200px;
  position: relative;
}

.chart-skeleton {
  height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  opacity: 0.92;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--cc-text-dim, #888);
  font-size: 13px;
}

.home-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid var(--cc-border, rgba(255,255,255,0.06));
  margin-top: auto;
  flex-shrink: 0;
}

.home-footer .footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-footer .footer-version {
  font-size: 11px;
  color: var(--cc-text-muted, #777);
  font-family: monospace;
}

.home-footer .footer-update-btn {
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--cc-border, rgba(255,255,255,0.08));
  background: transparent;
  color: var(--cc-text-dim, #888);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.home-footer .footer-update-btn:hover:not(:disabled) {
  color: var(--cc-primary, #4a9eff);
  border-color: var(--cc-primary, #4a9eff);
}
.home-footer .footer-update-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 开发模式提示：低调灰色，不抢眼 */
.home-footer .footer-dev-mode {
  font-size: 10px;
  color: var(--cc-text-dim, #666);
  opacity: 0.5;
  cursor: default;
  user-select: none;
}

/* 检查中 spinner */
.home-footer .footer-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--cc-border, rgba(255,255,255,0.2));
  border-top-color: var(--cc-primary, #4a9eff);
  border-radius: 50%;
  animation: footer-spin 0.7s linear infinite;
  display: inline-block;
  margin-right: 5px;
  vertical-align: middle;
}
@keyframes footer-spin {
  to { transform: rotate(360deg); }
}

/* 新版本号提示 */
.home-footer .footer-new-version {
  font-size: 10px;
  color: var(--cc-warning, #f0a020);
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 下载按钮 */
.home-footer .footer-download-btn {
  color: var(--cc-primary, #4a9eff) !important;
  border-color: var(--cc-primary, #4a9eff) !important;
}

/* 安装按钮 */
.home-footer .footer-install-btn {
  color: var(--cc-success, #4caf50) !important;
  border-color: var(--cc-success, #4caf50) !important;
}

/* 错误重试按钮 */
.home-footer .footer-error-btn {
  color: var(--cc-error, #f56c6c) !important;
  border-color: var(--cc-error, #f56c6c) !important;
}

/* 下载进度条 */
.home-footer .footer-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.home-footer .footer-progress-bar {
  width: 80px;
  height: 4px;
  background: var(--cc-border, rgba(255,255,255,0.12));
  border-radius: 2px;
  overflow: hidden;
}

.home-footer .footer-progress-fill {
  height: 100%;
  background: var(--cc-primary, #4a9eff);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.home-footer .footer-progress-indeterminate {
  animation: footer-progress-pulse 1.2s ease-in-out infinite;
  opacity: 0.6;
}

@keyframes footer-progress-pulse {
  0%   { opacity: 0.3; }
  50%  { opacity: 0.8; }
  100% { opacity: 0.3; }
}

.home-footer .footer-progress-text {
  font-size: 10px;
  color: var(--cc-text-dim, #888);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  white-space: nowrap;
}

.skeleton-line {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--cc-bg-secondary, #1e1e1e) 0%,
    rgba(198, 97, 63, 0.22) 35%,
    var(--cc-panel-item-hover, #252525) 50%,
    rgba(198, 97, 63, 0.16) 65%,
    var(--cc-bg-secondary, #1e1e1e) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer var(--mc-loading-shimmer-duration) ease-in-out infinite;
}

.skeleton-label {
  width: 44px;
  height: 8px;
}

.skeleton-value {
  width: 86px;
  height: 22px;
}

.chart-line-lg {
  width: 92%;
}

.chart-line-md {
  width: 76%;
}

.chart-line-sm {
  width: 61%;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
