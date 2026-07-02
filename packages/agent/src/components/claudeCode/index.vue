<template>
  <div
    class="cc-wrap"
    :class="[themeClass, { 'cc-first-query-lock': firstAwaitingAssistant }]"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <!-- 顶部：项目/文件夹 Tabs -->
    <ProjectTabs
      v-if="!embedded"
      :projects="projectTabSummaries"
      :activeProjectId="activeProjectId"
      @switchProject="switchProject"
      @deleteProject="requestDeleteProject"
      @newProject="newProject"
      @closeAll="closeAllProjects"
      @reorderProjects="reorderProjects"
    />

    <!-- 内容区域（侧边栏 + 主区域）-->
    <div class="cc-content">
      <!-- 左侧：历史对话列表（按日期分组） -->
      <HistorySidebar
        :sessions="activeProject?.chats || []"
        :activeId="activeChatId"
        v-model:sidebarOpen="sidebarOpen"
        :newChatDisabled="!activeProject?.cwdLocked"
        :loading="sidebarLoading"
        :refreshing="sidebarRefreshing"
        @switchTab="switchChat"
        @requestDelete="requestDeleteChat"
        @openSettings="openSettings"
        @newChat="newChat"
        @refresh="handleRefreshSessions"
        @rename="handleRenameChat"
      />

      <!-- 右侧主区域 -->
      <div class="cc-main">
      <div v-if="initializing" class="cc-init-overlay">
        <div class="cc-init-card">
          <div class="cc-init-spinner"></div>
          <div class="cc-init-title">{{ $t('agent.restoringSession') }}</div>
          <div class="cc-init-sub">{{ $t('agent.restoringSessionHint') }}</div>
        </div>
      </div>

      <!-- 设置面板 -->
      <APISetting ref="apiSettingRef" @providerActivated="handleProviderActivated"></APISetting>

      <!-- 分级模型弹窗（只做等级选择，不改模型） -->
      <SelectModel ref="selectModelRef"></SelectModel>

      <!-- 工具栏 -->
      <ClaudeToolbar
        :cwd="activeProject?.cwd || ''"
        :locked="firstAwaitingAssistant || Boolean(activeProject?.cwdLocked)"
        @select-dir="() => selectDir(activeProject)"
        @switch-agent="switchToCodex"
      />
      <ClaudeTaskBar
        :visible="taskBarVisible"
        :phase="activeTaskPhase"
        :plan-items="activePlanTaskItems"
        :execution-items="activeExecutionTaskItems"
        :collapsed="activeTaskCollapsed"
        @toggle-collapsed="toggleActiveTaskBarCollapsed"
        @close="dismissActiveTaskBar"
      />

      <!-- 请求中提示 -->
      <!-- <BusyBanner :thinking="Boolean(activeTab?.thinking)" :firstAwaitingAssistant="firstAwaitingAssistant" /> -->

      <!-- 消息区：移除 :key 避免切换项目时销毁重建 DOM，通过响应式数据自动更新内容 -->
      <div class="cc-messages-wrap">
        <!-- 消息滚动容器 -->
        <div class="cc-messages-area">
        <!-- v-for 单元素：ref 卸载时仍能用 t.id，避免 activeTab 已变 null 时读 .id 报错 -->
        <template v-for="t in activeTab ? [activeTab] : []" :key="t.id">
          <div
            class="cc-messages cc-messages-body"
            :ref="el => setMsgRef(t.id, el)"
            @scroll.passive="onMessagesScroll"
            @wheel.passive="onMessagesWheel"
          >
            <MessageList
              :tab="t"
              :project-cwd="activeProject?.cwd || ''"
              :firstAwaitingAssistant="firstAwaitingAssistant"
              :setHistoryTopSentinelRef="setHistoryTopSentinelRef"
              :toolIcon="toolIcon"
              :toolLabel="toolLabel"
              :isWriteTool="isWriteTool"
              :isEditTool="isEditTool"
              :isBashTool="isBashTool"
              :isReadTool="isReadTool"
              @openImage="openImageLightbox"
              @respondPermission="respondPermission"
              @respondAskQuestion="respondAskQuestion"
            />
          </div>
        </template>
        <ScrollToPrevMsg
          :show="showScrollPrevBtn"
          @scroll-prev="handleScrollPrev"
        />
        <ScrollToBottom
          :show="showScrollBottomBtn"
          :newMsgCount="newMsgCount"
          @scroll="handleScrollBottom"
        />

        <div v-if="!activeTab" class="cc-messages cc-messages-placeholder">
          <div class="cc-messages-placeholder-inner">
            <div class="cc-ph-icon mindcraft-flow-win-iconfont icon-mindcraft-claude1"></div>
            <div class="cc-ph-title">Claude Code</div>
            <p v-if="!activeProject?.cwdLocked" class="cc-ph-sub">{{ $t('agent.selectFirst') }}</p>
            <p v-else class="cc-ph-sub">{{ $t('agent.selectOrNew') }}</p>
            <button
              v-if="!activeProject?.cwdLocked"
              class="cc-browse-btn"
              type="button"
              @click="selectDir(activeProject)"
            >
              <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
              </svg>
              {{ $t('agent.selectFolder') }}
            </button>
          </div>
        </div>
        </div><!-- .cc-messages-area -->
      </div>

      <!-- 图片预览条 -->
      <ImageAttachmentBar
        :images="pendingImages"
        @preview="openImageLightbox"
        @remove="(idx) => removeAt(idx)"
      />

      <!-- 输入区 -->
      <div class="cc-input-area">
        <!-- slash 命令提示 -->
        <SlashPopup
          v-if="slashSuggestions.length || (slashLoadingRemote && inputText.startsWith('/') && !inputText.includes(' '))"
          :showModelGroup="inputText === '/'"
          :modelName="slashModelName"
          :effortLevel="slashEffortLevel"
          :thinkingEnabled="slashThinkingEnabled"
          :suggestions="slashSuggestions"
          :activeIdx="slashIdx"
          :loadingRemote="slashLoadingRemote"
          @openModelPicker="openModelPicker"
          @setEffortLevel="setEffortLevel"
          @toggleThinking="toggleThinking"
          @applySlash="applySlash"
        />
        <!-- @ 文件提示 -->
        <MentionPopup
          v-if="mentionSuggestions.length"
          :suggestions="mentionSuggestions"
          :activeIdx="mentionIdx"
          :flatMode="mentionFlatMode"
          @applyMention="applyMention"
          @toggleFlatMode="toggleMentionFlatMode"
        />
        <div class="input-box">
          <textarea
            ref="inputEl"
            v-model="inputText"
            class="cc-textarea"
            :placeholder="!activeProject?.cwdLocked ? $t('agent.selectFolderFirst') : (!activeTab ? $t('agent.selectOrNewChat') : (activeTab.thinking ? $t('agent.queueMsg') : $t('agent.sendMsgClaude')))"
            :disabled="!activeProject?.cwdLocked || !activeTab"
            @keydown="onKeydown"
            @compositionstart="onCompositionStart"
            @compositionend="onCompositionEnd"
            @input="onInputChange"
            @blur="persistActiveInputDraft"
            @paste="onPaste($event)"
            rows="1"
          ></textarea>
          <div class="input-actions">
            <button v-if="activeTab?.thinking" type="button" class="abort-btn" @click="abortSession" :title="$t('agent.abort')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 3.5h6A1.5 1.5 0 0112.5 5v6a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 11V5A1.5 1.5 0 015 3.5z"/>
              </svg>
            </button>
            <button class="send-btn" :disabled="!canSend" :title="activeTab?.thinking ? $t('agent.queueSend') : $t('chat.sendShort')" @click="sendMessage">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M15.964.686a.5.5 0 00-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 00-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 00.886-.083l6-15Zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 00-.154-.154l-.338-.215 7.494-7.494 1.178-.471-.47 1.178z"/>
              </svg>
            </button>
          </div>
        </div>
        <InputToolbar
          :disabled="!activeProject?.cwdLocked || !activeTab"
          :runMode="activeRunMode"
          :instruction-enabled="activeSessionInstructionEnabled"
          @addFile="addImageClick"
          @triggerMention="triggerMention"
          @triggerSlash="triggerSlashMenu"
          @openPlugins="openPlugins"
          @openSkills="openSkills"
          @openInstruction="openSessionInstruction"
          @toggleInstruction="setActiveSessionInstructionEnabled"
          @update:runMode="activeRunMode = $event"
        />
        <input ref="fileInputRef" type="file" multiple style="display:none" @change="onFileSelect" />
      </div>

      <div v-if="dragging" class="drop-mask">{{ $t('agent.dragFile') }}</div>

      <ImageLightbox :src="imageLightboxSrc" @close="closeImageLightbox" />

      <!-- 底部状态栏 -->
      <StatusBarMetrics
        :metrics="metricsData"
        :liveDurationMs="metricsLiveDurationMs"
        :compacting="metricsData.compacting"
        model-display="claude-short"
        @send-message="sendFromStatusBar"
      />

      <ConfirmDialog ref="confirmDialogRef" />
      <ManagePlugins ref="managePluginsRef" api-prefix="plugins" @plugin-toggled="refreshSlashCommands(true)" />
      <ManageSkills
        ref="manageSkillsRef"
        api-prefix="skills"
        :cwd="activeProject?.cwd || ''"
        @skills-changed="refreshSlashCommands(true)"
      />
      <SessionInstructionDialog ref="sessionInstructionRef" :theme-class="themeClass" @saved="refreshActiveSessionInstructionState" />
      <!-- <AgentPicker :visible="showAgentPicker" @close="showAgentPicker = false" @select="onAgentPicked" /> -->
      <AskQuestionDialog
        ref="askDialogRef"
        :visible="askDialogVisible"
        :questions="askDialogQuestions"
        :themeClass="themeClass"
        @answer="handleAskDialogAnswer"
        @close="handleAskDialogClose"
      />
      <!-- [BISECT] PlanReviewDialog 临时禁用：排除法定位死机根因 -->
      <!--
      <PlanReviewDialog
        :visible="planReviewVisible"
        :plan="planReviewPlan"
        :planFilePath="planReviewFilePath"
        :themeClass="themeClass"
        @accept="handlePlanAccept"
        @reject="handlePlanReject"
        @feedback="handlePlanFeedback"
      />
      -->
      </div><!-- /cc-main -->
      </div><!-- /cc-content -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, watch, markRaw, provide, inject, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineOptions({ name: 'claudeCode' })

// ═══════════════════════════════════════════════════════════════
// 🔴 全局渲染错误捕获 — 防止单 session 崩溃拖垮整个 app
// 规则：
//   1. 捕获所有子组件的渲染 / setup / watcher 错误
//   2. 记录完整错误链 + 当前活跃 session 信息，方便定位
//   3. return false 阻止错误继续冒泡，app 保持可用
// 生产模式：可改为 return false 静默降级，仅 console.error 输出
// ═══════════════════════════════════════════════════════════════
onErrorCaptured((err, instance, info) => {
  const tabId = activeTab.value?.id || 'none'
  const tabName = activeTab.value?.name || 'none'
  const sessionId = (activeTab.value?.sessionId || '').slice(-12)

  console.error(
    '%c[🔴 claudeCode ErrorBoundary] 捕获到渲染错误 — app 不会崩溃',
    'color:#e53935;font-weight:bold;font-size:14px'
  )
  console.error('  错误类型:', err?.constructor?.name || typeof err)
  console.error('  错误消息:', err?.message || String(err))
  console.error('  错误来源:', info)                    // e.g. "render function", "setup function", "watcher callback"
  console.error('  错误栈:', err?.stack || '(无堆栈)')
  console.error('  当前 Tab:', tabName, `(id=${tabId}, session=${sessionId})`)
  console.error('  组件名(推测):', instance?.$options?.name || instance?.type?.name || instance?.type?.__name || '(匿名组件)')
  console.groupCollapsed('📋 完整 Error 对象')
  console.error(err)
  console.groupEnd()

  // 💡 返回 false 阻止冒泡：app 不会白屏，但出错的子树可能被卸载
  //    如果出问题的是 MessageList 里某条消息，Vue 会卸载它并尝试恢复
  return false
})

const embedded = inject('codehubEmbedded', false)
const openSharedSettings = inject('codehubOpenSharedSettings', null)
const codehubActiveAgent = inject('codehubActiveAgent', null)
const isPanelActive = computed(() => !codehubActiveAgent || codehubActiveAgent.value === 'claudeCode')
const isReady = ref(false)
const initializing = ref(true)

// import AgentPicker from '../agentCommon/AgentPicker.vue'
import ProjectTabs from './components/ProjectTabs.vue'
import SlashPopup from './components/SlashPopup.vue'
import MentionPopup from './components/MentionPopup.vue'
import InputToolbar from './components/InputToolbar.vue'
import SessionInstructionDialog from '../agentCommon/components/SessionInstructionDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import APISetting from './components/APISetting.vue'
import SelectModel from './components/SelectModel.vue'
import HistorySidebar from './components/HistorySidebar.vue'
import ClaudeToolbar from './components/ClaudeToolbar.vue'
import ClaudeTaskBar from './components/taskBar/ClaudeTaskBar.vue'
import BusyBanner from './components/BusyBanner.vue'
import ImageAttachmentBar from './components/ImageAttachmentBar.vue'
import ImageLightbox from './components/ImageLightbox.vue'
import MessageList from './components/messages/MessageList.vue'
import AskQuestionDialog from './components/messages/AskQuestionDialog.vue'
import PlanReviewDialog from './components/messages/PlanReviewDialog.vue'
import StatusBarMetrics from '../agentCommon/components/StatusBarMetrics.vue'
import ManagePlugins from './components/ManagePlugins.vue'
import ManageSkills from './components/ManageSkills.vue'
import ScrollToBottom from '../agentCommon/components/ScrollToBottom.vue'
import ScrollToPrevMsg from '../agentCommon/components/ScrollToPrevMsg.vue'
import { useImageAttachments } from './composables/useImageAttachments'
import { useSlashCommands } from './composables/useSlashCommands'
import { useClaudeHistory } from './composables/useClaudeHistory'
import { useInputHistory } from '../agentCommon/composables/useInputHistory.js'
import { useClaudeAgentStream } from './composables/useClaudeAgentStream'
import {
  beginTaskBatch,
  createEmptyTaskState,
  dismissTaskBar as dismissClaudeTaskBar,
  ensureTaskState,
  getTaskViewModel,
  readTaskState,
  toggleTaskBarCollapsed as toggleClaudeTaskBarCollapsed,
} from './composables/useClaudeTaskState.mjs'
import { useSessionRefresh } from '../agentCommon/composables/useSessionRefresh'
import { useSessionDraft } from '../agentCommon/composables/useSessionDraft.js'
import { useAgentMetricsController } from '../agentCommon/composables/useAgentMetricsController.js'
import { useClaudeThemeStore } from '../../stores/claudeTheme.js'
import { useScrollBottom } from './composables/useScrollBottom.js'
import { applyToolResult, safeIpcPayload, stripSystemContextTags as stripSystemContextTagsShared } from '../agentCommon/utils/helpers.js'
import { playDoneSound } from '../agentCommon/utils/playDoneSound.js'
import { perfStart } from '../agentCommon/utils/rendererPerfProbe.mjs'
import { log as debugLog } from '../agentCommon/utils/rendererDebug.mjs'
import { buildProjectTabSummary, getCwdBasename } from '../agentCommon/utils/projectTabSummary.mjs'
import { useTextareaAutosize } from '../agentCommon/composables/useTextareaAutosize.js'
import { shouldPlayNotificationSound } from '../agentCommon/runtime/agentNotificationGate.mjs'
import { playAskSound } from '../agentCommon/utils/playAskSound.js'
import { countVisibleClaudeUserMessages, isClaudeMetaUserEntry } from './utils/internalPromptFilter.mjs'
import { shouldReloadClaudeChatFromDisk } from './utils/sessionRefreshGuard.mjs'
import { canHydrateChatFromDisk, shouldResetMessagesForDiskReload } from '../agentCommon/utils/historyHydrationAuthority.mjs'
import { analyzeClaudeSessionIntegrity, markDanglingClaudeToolsInterrupted } from './utils/sessionIntegrity.mjs'
import { resolveClaudeHistorySelection } from './utils/historyRestoreSelection.mjs'
import { sanitizeClaudeProjectsForPersistence } from './utils/historyPersistenceSanitizer.mjs'
import {
  applyClaudeMetrics,
  isClaudeTurnLocked,
  markClaudeAborted,
  markClaudeAbortRequested,
  markClaudeIdle,
  markClaudeStreamActivity,
  markClaudeTurnStarting,
  sanitizeClaudePersistedMetrics,
} from './utils/claudeRuntimeState.mjs'
import { resolveToolMeta, resolveToolLabel, resolveToolIconKey } from '../agentCommon/tools/toolMeta.js'
import {
  adoptScannedClaudeSession,
  findPendingClaudeSessionForAdoption,
  hasUnboundClaudeSessionPendingAdoption,
} from './utils/pendingSessionBinding.mjs'
import {
  getClaudeChatKey,
  getClaudeCliSessionId,
  getClaudeSessionFilePath,
} from './utils/claudeSessionIdentity.mjs'
const claudeTheme = useClaudeThemeStore()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)
const router = useRouter()
const codehubSwitchToAgent = inject('codehubSwitchToAgent', null)

function switchToCodex() {
  if (codehubSwitchToAgent) {
    codehubSwitchToAgent('codex')
  } else {
    router.push('/main/codex')
  }
}

// 消息上限：内存和 DOM 共用单一数组，超过此值丢弃最早的消息
const MAX_MESSAGES = 60
let projectCounter = 0
let chatCounter = 0
let msgId = 0

const nextMsgId = () => ++msgId
const nextProjectId = () => `proj-${++projectCounter}`
const nextChatId = () => `chat-${++chatCounter}`

// project 结构：{ id, name, cwd, cwdLocked, chats: Chat[] }
// chat 结构：{ id, name, sessionId, thinking, messages, currentAssistantId, runMode, cliSessionId }
const projects = ref([])
const activeProjectId = ref(null)
const activeChatId = ref(null)
const inputText = ref('')
const inputEl = ref(null)
// Phase 5: rAF 合并的 autosize，同一帧内多次输入只 resize 一次
const textareaAutosize = useTextareaAutosize()
watch(inputEl, (el) => { if (el) textareaAutosize.bindTextarea(el) }, { immediate: true })
const { handleHistoryKeydown, pushToHistory, resetHistory } = useInputHistory()
const isComposing = ref(false)
const msgRefs = {}
const historyTopSentinelRef = ref(null)

// 回到最底部 — 由 hook 管理
const activeMsgContainer = ref(null)
const {
  show: showScrollBottomBtn,
  newMsgCount,
  scrollToBottom: scrollToBottomActive,
  onScroll: onScrollBottomHook,
  bumpCount: bumpScrollCount,
  scrollOrBump,
} = useScrollBottom(activeMsgContainer)

/** 智能滚动：活跃 tab 在底部时自动滚，不在底部时 bumpCount；非活跃 tab 直接滚到底部 */
function smartScrollToBottom(chatId, smooth = true) {
  const id = chatId || activeChatId.value
  if (id === activeChatId.value) {
    scrollOrBump(smooth)
  } else {
    const el = msgRefs[id]
    if (!el) return
    nextTick(() => { if (el) el.scrollTop = el.scrollHeight })
  }
}

// 滚动到上一个用户消息
const showScrollPrevBtn = ref(false)
// scrollPrevCurrentId: 当前定位到的 user 消息 ID，null 表示未初始化
let scrollPrevCurrentId = null

function handleScrollPrev() {
  const el = activeMsgContainer.value
  if (!el) return
  const tab = activeTab.value
  if (!tab) return

  const msgEls = el.querySelectorAll('.msg-row.user')
  if (msgEls.length <= 1) return

  // 根据当前滚动位置找最近的用户消息，不依赖 scrollPrevCurrentId
  const scrollTop = el.scrollTop
  let currentIndex = -1
  for (let i = 0; i < msgEls.length; i++) {
    if (msgEls[i].offsetTop >= scrollTop - 20) {
      currentIndex = i
      break
    }
  }
  // 如果所有 user 消息都在视口下方（滚动到底部），取最后一条
  if (currentIndex < 0) currentIndex = Math.max(0, msgEls.length - 1)

  // 还有更多历史未加载 → 直接滚动到最顶部触发加载
  if (currentIndex <= 0 && msgEls.length > 0) {
    // 没有更多历史可加载，直接滚动
  }

  doScrollPrev(el, currentIndex)
}

function doScrollPrev(el, fallbackIndex = -1) {
  const msgEls = el.querySelectorAll('.msg-row.user')
  if (msgEls.length <= 1) return

  // 优先用当前滚动位置对应的索引
  let currentIndex = fallbackIndex >= 0 ? fallbackIndex : -1

  // 如果没有 fallback，尝试用 scrollPrevCurrentId
  if (currentIndex < 0 && scrollPrevCurrentId) {
    for (let i = 0; i < msgEls.length; i++) {
      if (msgEls[i].dataset.msgId === scrollPrevCurrentId) {
        currentIndex = i
        break
      }
    }
  }

  // 兜底：最后一条
  if (currentIndex < 0) {
    currentIndex = Math.max(0, msgEls.length - 1)
  }

  const targetIdx = Math.max(0, currentIndex - 1)
  const targetEl = msgEls[targetIdx]
  if (!targetEl) return
  scrollPrevCurrentId = targetEl.dataset.msgId
  targetEl.scrollIntoView({ behavior: 'auto', block: 'start' })
  const t = activeTab.value
  showScrollPrevBtn.value = targetIdx > 0
}

function resetScrollPrev() {
  scrollPrevCurrentId = null
  updateScrollPrevBtn()
}

function updateScrollPrevBtn() {
  const tab = activeTab.value
  if (!tab) { showScrollPrevBtn.value = false; scrollPrevCurrentId = null; return }
  const userCount = countVisibleClaudeUserMessages(tab.messages)
  if (userCount <= 1) { showScrollPrevBtn.value = false; scrollPrevCurrentId = null; return }
  showScrollPrevBtn.value = true
}
let historyTopObserver = null
let scrollThrottleTimer = null
let wheelThrottleTimer = null
let loadMoreCooldownTimer = null
const confirmDialogRef = ref(null)
const apiSettingRef = ref(null)
const selectModelRef = ref(null)
const managePluginsRef = ref(null)
const manageSkillsRef = ref(null)
const sessionInstructionRef = ref(null)
const activeSessionInstructionEnabled = ref(false)
const claudeDefaultModel = ref('')
const claudeDefaultEffort = ref('medium')

async function loadClaudeModelDefaults() {
  try {
    const [model, effort] = await Promise.all([
      window.electronAPI?.claudeGetModel?.() || Promise.resolve(''),
      window.electronAPI?.claudeGetEffortLevel?.() || Promise.resolve('medium'),
    ])
    claudeDefaultModel.value = String(model || '').trim()
    claudeDefaultEffort.value = ['low', 'medium', 'high', 'xhigh'].includes(effort) ? effort : 'medium'
  } catch (_) {
    claudeDefaultModel.value = ''
    claudeDefaultEffort.value = 'medium'
  }
}

// ---- StatusBar Metrics ----
const {
  metricsData,
  metricsLiveDurationMs,
  buildNewTurnMetrics: buildNewClaudeTurnMetrics,
  mergeRuntimeMetrics: mergeClaudeRuntimeMetrics,
  syncTimerForTab: syncMetricsTimerForClaudeTab,
  resetActiveMetrics,
  applyMetricsToTab,
  stopMetricsTimer: stopMetricsLiveTimer,
} = useAgentMetricsController({
  ensureThinkingStart(tab, durationMs = 0) {
    markClaudeStreamActivity(tab, { type: 'metrics_timer' }, Date.now() - (durationMs || 0))
  },
})
let _unregAgentEvent = null

// refreshMetricsForChat 期间的轮询锁，防止 polling 数据覆盖刚查出的完整结果
let _refreshingMetrics = false

function findClaudeTabBySessionId(sessionId = '') {
  if (!sessionId) return null
  return projects.value.flatMap(p => p.chats || []).find(c => c.sessionId === sessionId) || null
}

function onMetricsUpdate(data) {
  if (!data || _refreshingMetrics) return
  const targetTab = data.sessionId ? findClaudeTabBySessionId(data.sessionId) : activeTab.value
  if (!targetTab) return

  const mergedMetrics = applyMetricsToTab(targetTab, data)
  if (mergedMetrics && !mergedMetrics.sessionId) {
    targetTab.metrics = {
      ...mergedMetrics,
      sessionId: targetTab.sessionId,
    }
  }

  if (typeof data.thinking === 'boolean') applyClaudeMetrics(targetTab, data)

  const active = activeTab.value
  if (active && active.id === targetTab.id) {
    Object.assign(metricsData.value, mergeClaudeRuntimeMetrics(metricsData.value, data, targetTab))
    syncMetricsTimerForClaudeTab(targetTab, data.durationMs || 0)
  }
}


function resetMetrics() {
  resetActiveMetrics({
    keepModel: metricsData.value.model,
    compacting: false,
  })
}

function normalizeClaudeEffort(value) {
  const effort = String(value || '').trim().toLowerCase()
  if (effort === 'max') return 'xhigh'
  return ['low', 'medium', 'high', 'xhigh'].includes(effort) ? effort : ''
}

function normalizeClaudeModelTier(value) {
  const tier = String(value || '').trim().toLowerCase()
  return ['haiku', 'sonnet', 'opus', 'reasoning'].includes(tier) ? tier : ''
}

function getClaudeTabModel(tab) {
  return String(tab?.model || claudeDefaultModel.value || '').trim()
}

function getClaudeTabEffort(tab) {
  return normalizeClaudeEffort(tab?.effort) || claudeDefaultEffort.value || 'medium'
}

function getInheritedClaudeRunMode(project = activeProject.value) {
  const activeChat = project?.chats?.find(c => c.id === activeChatId.value) || null
  return activeChat?.runMode || 'edit_automatically'
}

function persistClaudeTabMeta(tab, project = activeProject.value) {
  if (!tab || !project?.cwd || !tab.cliSessionId) return
  window.electronAPI?.claudeWriteSessionMeta?.({
    cwd: project.cwd,
    cliSessionId: tab.cliSessionId,
    filePath: tab.filePath || '',
    chatKey: tab.sessionId,
    data: {
      model: getClaudeTabModel(tab),
      effort: getClaudeTabEffort(tab),
      modelTier: normalizeClaudeModelTier(tab.modelTier) || null,
    },
  })
}

async function refreshMetricsForChat(chat) {
  const stop = perfStart('claude.refreshMetricsForChat')
  stopMetricsLiveTimer()
  if (!chat?.cliSessionId) { resetMetrics(); stop(); return }
  _refreshingMetrics = true
  try {
    const result = await window.electronAPI.claudeAgentQueryMetrics?.({
      cliSessionId: chat.cliSessionId,
      model: getClaudeTabModel(chat),
    })
    if (result) {
      if (!result.model) result.model = getClaudeTabModel(chat)
      result.thinking = Boolean(chat.thinking)
      // 不先 reset 再 assign——先 reset 会导致切换 tab 时闪烁归零
      Object.assign(metricsData.value, result)
      syncMetricsTimerForClaudeTab(chat, result.durationMs || 0)
    } else {
      resetMetrics()
    }
  } catch (_) {
    resetMetrics()
  } finally {
    _refreshingMetrics = false
    stop()
  }
}

const activeProject = computed(() => projects.value.find(p => p.id === activeProjectId.value) || null)

// 判断消息是否为等待用户响应的工具调用（权限询问 / AskUserQuestion）
function isPendingTool(msg) {
  if (!msg || msg.status !== 'pending') return false
  // 有 requestId 的是权限询问，toolName 为 AskUserQuestion 的是问答
  return !!msg.requestId || String(msg.toolName) === 'AskUserQuestion'
}

// ── 统一 project tab summary（Phase 2）──
// 单一 computed 同时供：本面板 ProjectTabs、CodeHub expose、notification watcher
const projectTabSummaries = computed(() => {
  const stop = perfStart('claude.projectTabSummaries')
  const result = projects.value.map(p =>
    buildProjectTabSummary(p, {
      isPendingTool,
      getName: (proj) => getCwdBasename(proj.cwd) || t('codehub.noFolder'),
    })
  )
  stop({ projects: result.length })
  return result
})

// ── 侧边栏「项目」通知指示器 ──
// 直接维护 Main.vue 提供的 codehubHasNotification，确保 keep-alive 失活时仍能更新
// (codeHub 中的 computed+watch 在失活时会暂停，因此通知必须在这里直推)
const codehubHasNotification = inject('codehubHasNotification', null)
watch(
  () => projectTabSummaries.value.some(t => t.hasDoneNotification),
  (has) => {
    if (codehubHasNotification) codehubHasNotification.value = has
  },
  { immediate: true }
)

const activeTab = computed(() => {
  const p = activeProject.value
  if (!p) return null
  return (p.chats || []).find(c => c.id === activeChatId.value) || null
})

const activeTaskState = computed(() => {
  const tab = activeTab.value
  if (!tab) return createEmptyTaskState()
  return readTaskState(tab)
})

const activeTaskViewModel = computed(() => getTaskViewModel(activeTab.value))
const activePlanTaskItems = computed(() => activeTaskViewModel.value.planItems || [])
const activeExecutionTaskItems = computed(() => activeTaskViewModel.value.executionItems || [])
const activeTaskPhase = computed(() => activeTaskState.value.phase || 'idle')
const activeTaskCollapsed = computed(() => Boolean(activeTaskState.value.collapsed))
const taskBarVisible = computed(() => {
  const state = activeTaskState.value
  if (!state || state.dismissed || !state.visible) return false
  return activePlanTaskItems.value.length > 0 || activeExecutionTaskItems.value.length > 0
})

function dismissActiveTaskBar() {
  const tab = activeTab.value
  if (!tab) return
  dismissClaudeTaskBar(tab, Date.now())
  saveHistory({ immediate: true })
}

function toggleActiveTaskBarCollapsed() {
  const tab = activeTab.value
  if (!tab) return
  toggleClaudeTaskBarCollapsed(tab, undefined, Date.now())
  saveHistory()
}

function findClaudeChatById(chatId) {
  if (!chatId) return null
  for (const project of projects.value || []) {
    const chat = (project?.chats || []).find(c => c.id === chatId)
    if (chat) return chat
  }
  return null
}

const sessionDraft = useSessionDraft({
  inputText,
  getActiveChat: () => activeTab.value,
})
const persistActiveInputDraft = sessionDraft.persistActiveDraftNow

// 同步活跃消息容器 ref 给 useScrollBottom hook
watch(activeChatId, (id, oldId) => {
  void sessionDraft.persistDraftForChat(findClaudeChatById(oldId), inputText.value)
  activeMsgContainer.value = id ? msgRefs[id] : null
  const chat = id ? (activeProject.value?.chats || []).find(c => c.id === id) || null : null
  const stopDraft = perfStart('claude.sessionDraft.loadDraftForChat')
  void sessionDraft.loadDraftForChat(chat).finally(() => {
    nextTick(() => textareaAutosize.resizeNow())
    stopDraft()
  })
  resetHistory()
  refreshMetricsForChat(chat)
  void refreshActiveSessionInstructionState()
}, { immediate: true })

watch(inputText, (value) => {
  if (!activeTab.value) return
  sessionDraft.scheduleActiveDraftPersist()
})

watch(() => activeTab.value?.sessionId, () => {
  void refreshActiveSessionInstructionState()
}, { immediate: true })

// 同步 tab._compacting 到 metricsData，驱动状态栏圆环动画
watch(() => activeTab.value?._compacting, (val) => {
  metricsData.value.compacting = !!val
})

const canSend = computed(() => {
  const tab = activeTab.value
  if (!tab) return false
  if (!activeProject.value?.cwdLocked) return false
  const hasText = inputText.value.trim().length > 0
  const hasAttachments = pendingImages.value.length > 0
  return hasText || hasAttachments
})

function imageDataUrlToBase64(dataUrl = '') {
  if (!dataUrl || typeof dataUrl !== 'string') return ''
  const idx = dataUrl.indexOf('base64,')
  if (idx < 0) return ''
  return dataUrl.slice(idx + 'base64,'.length)
}

function buildUserContentBlocks(text, imgs = [], files = []) {
  const blocks = []
  const t = (text || '').trim()
  if (t) blocks.push({ type: 'text', text: t })

  for (const img of Array.isArray(imgs) ? imgs : []) {
    const data = imageDataUrlToBase64(img?.dataUrl || '')
    if (!data) continue
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img?.mediaType || 'image/png',
        data,
      },
    })
  }

  for (const f of Array.isArray(files) ? files : []) {
    blocks.push({
      type: 'file',
      source: {
        filename: f?.name || t('agent.file'),
        size: f?.size || 0,
      },
    })
  }
  return blocks
}

function normalizeSessionTextContentToString(content) {
  if (Array.isArray(content)) return content.filter(b => b.type === 'text' && b.text).map(b => b.text).join('\n')
  if (typeof content === 'string') return content
  return ''
}

// 检测文本是否为 compact summary（SDK compact 后写入 session 文件的 user 消息）
function isCompactSummaryText(text) {
  if (!text || typeof text !== 'string') return false
  const s = text.trim()
  return /^This session is being continued from a previous conversation/i.test(s)
    || /^本会话从之前的对话延续/i.test(s)
    || (/Summary:/i.test(s) && /context|compact|conversation|对话|压缩|上下文/i.test(s) && s.length > 200)
}

// 从 compact summary 文本中提取摘要内容
function extractCompactSummary(text) {
  const s = String(text || '').trim()
  const match = /Summary:\s*\n([\s\S]*)$/i.exec(s)
  if (match) return match[1].trim()
  const lines = s.split('\n')
  if (lines.length > 2) return lines.slice(1).join('\n').trim()
  return s
}

// 开关：从用户消息文本中剥离 compact 上下文（compact 前缀 + 摘要），只保留真实用户输入
let STRIP_COMPACT_FROM_USER = true

// 从用户消息文本中提取真实用户输入（剥离 compact 摘要上下文）
// compact 后 SDK 可能在用户文本前注入源码、配置等系统上下文，导致 isCompactSummaryText 开头匹配失败
// 使用 lastIndexOf 搜索分隔符（用户输入在文本末尾，避免摘要内部误匹配）
function extractRealUserInput(text) {
  if (!text || typeof text !== 'string') return text
  const s = text.trim()
  if (!s) return text

  // 中文分隔符：用 lastIndexOf 取最后一个，确保取到的是用户输入而非摘要内部的引用
  const cnDelimiters = ['\n用户当前问题：', '用户当前问题：']
  for (const delim of cnDelimiters) {
    const idx = s.lastIndexOf(delim)
    if (idx !== -1) {
      const after = s.substring(idx + delim.length).trim()
      return after || '' // 分隔符后无内容 → 返回空
    }
  }

  // 英文分隔符：找最后一个匹配
  const enDelimiters = [
    /\nuser'?s?\s+current\s+(?:question|problem|task|message|query|input)[：:]/gi,
    /\ncurrent\s+user\s+(?:question|problem|task|message|query)[：:]/gi,
  ]
  for (const pat of enDelimiters) {
    let lastMatch = null; let m
    while ((m = pat.exec(s)) !== null) lastMatch = m
    if (lastMatch) {
      const after = s.substring(lastMatch.index + lastMatch[0].length).trim()
      return after || ''
    }
  }

  // 没找到分隔符但文本包含 compact 标记 → 整段不可靠，返回空
  const hasCompactMarker = /以下是上一会话压缩后的上下文摘要/.test(s)
    || /本会话从之前的对话延续/.test(s)
    || /^This session is being continued from a previous conversation/im.test(s)
  if (hasCompactMarker) return ''

  // 无 compact 标记，原样返回
  return text
}

// 对 user 消息的 joined text + userBlocks 应用 compact 剥离
// 返回清洗后的 { text, blocks }，调用方直接用返回值替换原来的 t/userBlocks
function applyCompactStripping(t, userBlocks) {
  if (!STRIP_COMPACT_FROM_USER || !t) return { text: t, blocks: userBlocks }
  const cleaned = extractRealUserInput(t)
  if (cleaned === t) return { text: t, blocks: userBlocks }
  // 文本被修改了，同步更新 blocks（保留图片/文件等非文本 block）
  const nonTextBlocks = (userBlocks || []).filter(b => b.type !== 'text')
  const blocks = cleaned
    ? [{ type: 'text', text: cleaned }, ...nonTextBlocks]
    : nonTextBlocks
  return { text: cleaned || '', blocks }
}

// 检测是否为 SDK 本地命令的内部包装消息（不应显示给用户）
function isLocalCommandWrapper(text) {
  if (!text || typeof text !== 'string') return false
  const s = text.trim()
  return s.startsWith('<local-command-caveat>')
    || s.startsWith('<command-name>')
    || s.startsWith('<local-command-stdout>')
    || s.startsWith('<local-command-stderr>')
}

// 从 local-command 标签中提取纯文本内容
function stripLocalCommandTags(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g, '$1')
    .replace(/<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/g, '$1')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .trim()
}

// 移除 SDK 注入到 user 消息中的系统上下文标签
// 委托给 helpers.js 共享实现，与 CodeX 保持同步（避免白名单漂移）
function stripSystemContextTags(text) {
  if (!text || typeof text !== 'string') return ''
  return stripSystemContextTagsShared(text)
}

function applyToolResultToHistoryMessages(messages, toolUseId, content, isErrorFlag) {
  applyToolResult(messages, toolUseId, content, isErrorFlag, {
    inferToolFailureFromText,
    isBashTool,
    isReadTool,
    isWriteTool,
    isEditTool,
  })
}

// Phase 4：此函数公式与 tokenMetrics/normalizer.normalizeClaudeUsage 完全一致。
// 由于历史恢复在 renderer 进程中运行，无法直接 require Node.js 模块，
// 此处保持内联公式。若修改 native/third-party 判断逻辑，须同步更新 normalizer。
function readClaudeCompactBoundaryTokens(entry = {}) {
  const meta = entry?.compactMetadata || entry?.compact_metadata || {}
  return {
    pre: Number(meta.preTokens ?? meta.pre_tokens ?? 0),
    post: Number(meta.postTokens ?? meta.post_tokens ?? 0),
  }
}

function attachClaudeHistoryTurnTokens(messages, entry) {
  const turnTokens = entry?._turnTokens
  if (!turnTokens) return
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role !== 'assistant') continue
    message._turnTokens = turnTokens
    return
  }
}

function normalizeSessionEventsToUiMessages(rawData, { recoverDanglingTools = false } = {}) {
  const out = []
  let currentAssistantId = null

  function splitBracketMetaLines(text) {
    const s = String(text || '').replace(/\r\n/g, '\n')
    const lines = s.split('\n')
    const meta = []
    const keep = []
    for (const line of lines) {
      const t = line.trim()
      const isBracket = /^\[[^\]]+\]$/.test(t)
      const looksMeta = /request|interrupted|cancel|aborted|tool/i.test(t)
      if (isBracket && looksMeta) meta.push(t)
      else keep.push(line)
    }
    return { text: keep.join('\n').trim(), meta }
  }

  for (const entry of Array.isArray(rawData) ? rawData : []) {
    if (!entry) continue
    // 兼容部分 session 文件使用 _source_type 而非 type
    const entryType = entry.type || entry._source_type || ''

    // assistant：拆 content blocks，生成 assistant 文本 + tool 卡片 + specialItems(thinking/ide_*)
    if (entryType === 'assistant') {
      const content = entry.message?.content
      // 兼容 content 为字符串的情况
      if (typeof content === 'string') {
        const { text: t, meta } = splitBracketMetaLines(content)
        for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
        if (t) out.push({ id: nextMsgId(), role: 'assistant', text: t, specialItems: [] })
        if (t) attachClaudeHistoryTurnTokens(out, entry)
        continue
      }
      if (!Array.isArray(content)) continue

      for (const block of content) {
        if (!block) continue

        if (block.type === 'text' && block.text) {
          const { text: cleaned, meta } = splitBracketMetaLines(block.text)
          for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
          if (!cleaned) continue
          if (currentAssistantId === null) {
            currentAssistantId = nextMsgId()
            out.push({ id: currentAssistantId, role: 'assistant', text: cleaned, specialItems: [] })
          } else {
            const m = out.find(m => m.id === currentAssistantId)
            if (m) m.text = (m.text || '') + cleaned
          }
        }
        else if (block.type === 'tool_use') {
          currentAssistantId = null
          const input = block.input || {}
          const name = block.name
          const nameLower = (name || '').toLowerCase()
          const filePath = input.path || input.file_path || input.filename || ''
          const isBash = nameLower === 'bash' || nameLower === 'execute' || nameLower === 'run_command'
          const isAskQ = nameLower === 'askquestion' || nameLower === 'ask_user_question'
          const bashCmd = isBash ? (input.command || input.cmd || '') : ''
          const defaultExpanded = isWriteTool(name) || isEditTool(name) || isBash || isAskQ
          out.push(createToolMessage({
            toolName: name,
            status: 'running',
            toolUseId: block.id,
            filePath,
            bashCmd,
            bashCwd: isBash ? (activeProject.value?.cwd || '') : '',
            text: JSON.stringify(input, null, 2),
            expanded: defaultExpanded,
            newContent: input.content || input.new_content || input.file_content || input.new_string || '',
            _diffInput: (isEditTool(name) || isWriteTool(name)) ? {
              oldStr: input.old_string || input.old_str || input.old_content || '',
              newStr: isWriteTool(name) && input._oldContent ? (input.content || input.new_content || '') : (input.new_string || input.new_str || input.new_content || ''),
            } : null,
          }))
        }
        else {
          // 统一：将 thinking / ide_* / 其他特殊块也拆成 tool 卡片，避免刷新回显走 SpecialContentCard
          currentAssistantId = null
          const tname = block.type || 'special'
          // thinking 默认折叠，其他 block 保留原展开状态
          const expanded = tname === 'thinking' ? false : (block.expanded !== false)
          let rawText = ''
          try { rawText = JSON.stringify(block, null, 2) } catch (_) { rawText = String(block) }
          out.push(createToolMessage({
            toolName: tname,
            status: 'done',
            expanded,
            text: rawText,
          }))
        }
      }
      attachClaudeHistoryTurnTokens(out, entry)
      continue
    }

    // tool_result：更新最近的 tool message（同实时逻辑）
    if (entryType === 'tool_result') {
      applyToolResultToHistoryMessages(out, entry.tool_use_id, entry.content, entry.is_error === true)
      continue
    }

    // queue-operation：CLI session 常见的”用户发起操作/提问”记录，映射成 user 文本
    if (entryType === 'queue-operation') {
      currentAssistantId = null
      const text = typeof entry.content === 'string' ? entry.content : ''
      if (text && text.trim()) {
        const { text: t, meta } = splitBracketMetaLines(text)
        for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
        if (!t) continue
        out.push({
          id: nextMsgId(),
          role: 'user',
          text: t,
          content: [{ type: 'text', text: t }],
          specialItems: [],
        })
      }
      continue
    }

    // user：主要关心 tool_result blocks（session 文件里可能包在 user.message.content）
    if (entryType === 'user') {
      if (isClaudeMetaUserEntry(entry)) {
        continue
      }
      currentAssistantId = null
      const content = entry.message?.content
      // 跳过 SDK 内部的 command 标签消息（/compact 等本地命令的 caveat/command 包装）
      const rawContentStr = typeof content === 'string' ? content : (typeof entry.content === 'string' ? entry.content : '')
      if (rawContentStr && isLocalCommandWrapper(rawContentStr)) {
        continue
      }
      // 跳过中断提示消息
      if (rawContentStr && rawContentStr.trim() === '[Request interrupted by user]') {
        continue
      }
      // 跳过纯系统上下文消息（整条消息只有 <ide_* / <system-reminder / <environment_context 等标签，没有真实用户输入）
      if (Array.isArray(content)) {
        const hasRealText = content.some(b => {
          if (b?.type !== 'text' || !b.text) return false
          const stripped = stripSystemContextTags(b.text).trim()
          if (!stripped) return false
          if (stripped.startsWith('<system-reminder') || stripped.startsWith('<environment_context') || stripped.startsWith('<ide_')) return false
          return stripped !== '[Request interrupted by user]'
        })
        const hasNonText = content.some(b => b?.type === 'tool_result' || b?.type === 'image' || b?.type === 'file')
        if (!hasRealText && !hasNonText) continue
      }
      // 常见：user.message.content 为 blocks（含 text / tool_result）
      if (Array.isArray(content)) {
        const texts = []
        const userBlocks = []
        for (const block of content) {
          if (!block) continue
          if (block.type === 'text' && block.text) {
            const stripped = stripSystemContextTags(block.text)
            const { text: cleaned, meta } = splitBracketMetaLines(stripped)
            for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
            if (cleaned) {
              texts.push(cleaned)
              userBlocks.push({ type: 'text', text: cleaned })
            }
          }
          else if (block.type === 'image' && block.source) {
            userBlocks.push({ type: 'image', source: block.source })
          }
          else if (block.type === 'file' && block.source) {
            userBlocks.push({ type: 'file', source: block.source })
          }
          else if (block.type === 'tool_result') {
            applyToolResultToHistoryMessages(out, block.tool_use_id, block.content, block.is_error === true)
          }
        }
        const rawText = texts.join('').trim()
        const { text: t, blocks: displayBlocks } = applyCompactStripping(rawText, userBlocks)
        // 检测 compact summary：SDK compact 后写入的 user 消息
        if (t && isCompactSummaryText(t)) {
          const summary = extractCompactSummary(t)
          out.push({ id: nextMsgId(), role: 'system', text: t('agent.contextCompacted'), compactTitle: t('agent.contextCompacted'), compactSummary: summary, expanded: false, _isCompact: true })
        } else if (t || displayBlocks.length) {
          out.push({
            id: nextMsgId(),
            role: 'user',
            text: t,
            content: displayBlocks.length ? displayBlocks : [{ type: 'text', text: t }],
            specialItems: [],
          })
        }
        continue
      }
      // 兼容：content/entry.content 直接是字符串
      const text = normalizeSessionTextContentToString(content) || (typeof entry.content === 'string' ? entry.content : '')
      const textStripped = stripSystemContextTags(text)
      if (textStripped && textStripped.trim()) {
        const { text: rawT, meta } = splitBracketMetaLines(textStripped)
        for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
        if (!rawT) continue
        const t = STRIP_COMPACT_FROM_USER ? extractRealUserInput(rawT) : rawT
        if (!t) continue // compact 上下文但无用户输入 → 跳过
        // 检测 compact summary
        if (isCompactSummaryText(t)) {
          const summary = extractCompactSummary(t)
          out.push({ id: nextMsgId(), role: 'system', text: t('agent.contextCompacted'), compactTitle: t('agent.contextCompacted'), compactSummary: summary, expanded: false, _isCompact: true })
        } else {
          out.push({
            id: nextMsgId(),
            role: 'user',
            text: t,
            content: [{ type: 'text', text: t }],
            specialItems: [],
          })
        }
      }
      continue
    }

    // system：尽量保留文本，避免回显缺失关键提示
    if (entryType === 'system') {
      const subtype = entry.subtype || ''
      if (subtype === 'init') continue

      // local_command：提取标签内文本，跳过无意义的包装
      if (subtype === 'local_command' || subtype === 'local_command_output') {
        const raw = (typeof entry.content === 'string' ? entry.content : normalizeSessionTextContentToString(entry.message?.content) || '').trim()
        if (!raw) continue
        const extracted = stripLocalCommandTags(raw)
        if (!extracted) continue
        const summaryMatch = /\nSummary:\s*\n([\s\S]*)$/i.exec(extracted)
        if (summaryMatch) {
          const summary = summaryMatch[1].trim()
          const compactTitle = extracted.split('\n')[0]?.trim() || 'Compacted chat'
          out.push({ id: nextMsgId(), role: 'system', text: compactTitle, compactTitle, compactSummary: summary, expanded: false, _isCompact: true })
        } else {
          out.push({ id: nextMsgId(), role: 'system', text: extracted })
        }
        continue
      }
      if (subtype === 'compact_boundary') {
        const { pre, post } = readClaudeCompactBoundaryTokens(entry)
        const saved = pre > 0 && post > 0 ? Math.max(0, pre - post) : 0
        const compactTitle = pre > 0 && post > 0
          ? t('agent.compactTokens', { pre, post, saved })
          : t('agent.contextCompacted')
        out.push({ id: nextMsgId(), role: 'system', text: compactTitle, compactTitle, compactSummary: '', expanded: false, _isCompact: true })
        continue
      }
      if (subtype === 'compact_summary') {
        const raw = normalizeSessionTextContentToString(entry.message?.content) || entry.content || entry.compact_summary || ''
        const summary = raw.replace(/^压缩摘要：\n?/i, '').trim()
        if (summary) {
          const last = out[out.length - 1]
          if (last?._isCompact && !last.compactSummary) {
            last.compactSummary = summary
          } else {
            out.push({ id: nextMsgId(), role: 'system', text: t('agent.contextCompacted'), compactTitle: t('agent.contextCompacted'), compactSummary: summary, expanded: false, _isCompact: true })
          }
        }
        continue
      }

      const text = normalizeSessionTextContentToString(entry.message?.content) || (typeof entry.content === 'string' ? entry.content : '')
      const textStripped = stripSystemContextTags(text)
      if (textStripped && textStripped.trim()) out.push({ id: nextMsgId(), role: 'system', text: textStripped.trim() })
      continue
    }
  }

  if (recoverDanglingTools) {
    markDanglingClaudeToolsInterrupted(out, analyzeClaudeSessionIntegrity(rawData), { nextId: nextMsgId })
  }
  return out
}

// 扁平 session：{ role, content:[...], _source_type } —— 将 tool_use / tool_result 也拆成与实时流一致的 UI 消息
function normalizeFlatSessionMessagesToUiMessages(rawData, { recoverDanglingTools = false } = {}) {
  const out = []
  let currentAssistantId = null

  function splitBracketMetaLines(text) {
    const s = String(text || '').replace(/\r\n/g, '\n')
    const lines = s.split('\n')
    const meta = []
    const keep = []
    for (const line of lines) {
      const t = line.trim()
      const isBracket = /^\[[^\]]+\]$/.test(t)
      const looksMeta = /request|interrupted|cancel|aborted|tool/i.test(t)
      if (isBracket && looksMeta) meta.push(t)
      else keep.push(line)
    }
    return { text: keep.join('\n').trim(), meta }
  }

  for (const entry of Array.isArray(rawData) ? rawData : []) {
    if (!entry) continue
    const role = entry.role || (entry._source_type || entry.type)

    // assistant：把 text 拼到 assistant bubble，把 tool_use 拆成 tool message，把其他块留给 SpecialContentCard
    if (role === 'assistant') {
      // 每遇到新的 assistant entry 先重置，避免跨轮对话的气泡合并
      currentAssistantId = null
      const content = entry.content
      if (!Array.isArray(content)) {
        const raw = typeof entry.content === 'string' ? entry.content : ''
        const { text, meta } = splitBracketMetaLines(raw)
        for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
        if (text) out.push({ id: nextMsgId(), role: 'assistant', text, specialItems: [] })
        if (text) attachClaudeHistoryTurnTokens(out, entry)
        continue
      }

      for (const block of content) {
        if (!block) continue
        if (block.type === 'text' && block.text) {
          const { text: cleaned, meta } = splitBracketMetaLines(block.text)
          for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
          if (!cleaned) continue
          if (currentAssistantId === null) {
            currentAssistantId = nextMsgId()
            out.push({ id: currentAssistantId, role: 'assistant', text: cleaned, specialItems: [] })
          } else {
            const m = out.find(m => m.id === currentAssistantId)
            if (m) m.text = (m.text || '') + cleaned
          }
        }
        else if (block.type === 'tool_use') {
          currentAssistantId = null
          const input = block.input || {}
          const name = block.name || block.tool_name || ''
          const nameLower = (name || '').toLowerCase()
          const filePath = input.path || input.file_path || input.filename || ''
          const isBash = nameLower === 'bash' || nameLower === 'execute' || nameLower === 'run_command'
          const isAskQ = nameLower === 'askquestion' || nameLower === 'ask_user_question'
          const bashCmd = isBash ? (input.command || input.cmd || '') : ''
          const defaultExpanded = isWriteTool(name) || isEditTool(name) || isBash || isAskQ
          out.push(createToolMessage({
            toolName: name,
            status: 'running',
            toolUseId: block.id || null,
            filePath,
            bashCmd,
            bashCwd: isBash ? (activeProject.value?.cwd || '') : '',
            text: JSON.stringify(input, null, 2),
            expanded: defaultExpanded,
            newContent: input.content || input.new_content || input.file_content || input.new_string || '',
            _diffInput: (isEditTool(name) || isWriteTool(name)) ? {
              oldStr: input.old_string || input.old_str || input.old_content || '',
              newStr: isWriteTool(name) && input._oldContent ? (input.content || input.new_content || '') : (input.new_string || input.new_str || input.new_content || ''),
            } : null,
          }))
        }
        else {
          // 统一：扁平 session 中的 thinking / ide_* / 其他特殊块也拆成 tool 卡片
          currentAssistantId = null
          const tname = block.type || 'special'
          // thinking 默认折叠，其他 block 保留原展开状态
          const expanded = tname === 'thinking' ? false : (block.expanded !== false)
          let rawText = ''
          try { rawText = JSON.stringify(block, null, 2) } catch (_) { rawText = String(block) }
          out.push(createToolMessage({
            toolName: tname,
            status: 'done',
            expanded,
            text: rawText,
          }))
        }
      }
      attachClaudeHistoryTurnTokens(out, entry)
      continue
    }

    // user：把 text/image/file 组装成 content blocks（保持与实时发送一致）
    if (role === 'user') {
      if (isClaudeMetaUserEntry(entry)) {
        continue
      }
      currentAssistantId = null
      const content = entry.content
      // 跳过 SDK 内部的 command 标签消息（/compact 等本地命令的 caveat/command 包装）
      if (typeof content === 'string' && isLocalCommandWrapper(content)) {
        continue
      }
      // 跳过纯系统上下文消息（整条消息只有 <ide_* / <system-reminder / <environment_context 等标签，没有真实用户输入）
      if (Array.isArray(content)) {
        const hasRealText = content.some(b => {
          if (b?.type !== 'text' || !b.text) return false
          const stripped = stripSystemContextTags(b.text).trim()
          if (!stripped) return false
          if (stripped.startsWith('<system-reminder') || stripped.startsWith('<environment_context') || stripped.startsWith('<ide_')) return false
          return stripped !== '[Request interrupted by user]'
        })
        const hasNonText = content.some(b => b?.type === 'tool_result' || b?.type === 'image' || b?.type === 'file')
        if (!hasRealText && !hasNonText) continue
      }
      if (Array.isArray(content)) {
        const texts = []
        const userBlocks = []
        for (const block of content) {
          if (!block) continue
          if (block.type === 'text' && block.text) {
            const stripped = stripSystemContextTags(block.text)
            const { text: cleaned, meta } = splitBracketMetaLines(stripped)
            for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
            if (cleaned) { texts.push(cleaned); userBlocks.push({ type: 'text', text: cleaned }) }
          }
          else if (block.type === 'image' && block.source) userBlocks.push({ type: 'image', source: block.source })
          else if (block.type === 'file' && block.source) userBlocks.push({ type: 'file', source: block.source })
          else if (block.type === 'tool_result') {
            applyToolResultToHistoryMessages(out, block.tool_use_id || block.toolUseId, block.content, block.is_error === true)
          }
        }
        const rawText = texts.join('').trim()
        const { text: t, blocks: displayBlocks } = applyCompactStripping(rawText, userBlocks)
        if (t && isCompactSummaryText(t)) {
          const summary = extractCompactSummary(t)
          out.push({ id: nextMsgId(), role: 'system', text: t('agent.contextCompacted'), compactTitle: t('agent.contextCompacted'), compactSummary: summary, expanded: false, _isCompact: true })
        } else if (t || displayBlocks.length) {
          out.push({ id: nextMsgId(), role: 'user', text: t, content: displayBlocks.length ? displayBlocks : [{ type: 'text', text: t }], specialItems: [] })
        }
        continue
      }

      const raw = typeof content === 'string' ? content : (typeof entry.text === 'string' ? entry.text : '')
      // 跳过纯系统上下文字符串（stripSystemContextTags 移除系统标签后再判断）
      const rawStripped = stripSystemContextTags(raw)
      if (rawStripped && rawStripped.trim()) {
        const rawTrim = rawStripped.trim()
        if (rawTrim === '[Request interrupted by user]') continue
        const { text: rawT, meta } = splitBracketMetaLines(rawStripped)
        for (const m of meta) out.push({ id: nextMsgId(), role: 'system', text: m })
        if (!rawT) continue
        const t = STRIP_COMPACT_FROM_USER ? extractRealUserInput(rawT) : rawT
        if (!t) continue
        if (t && isCompactSummaryText(t)) {
          const summary = extractCompactSummary(t)
          out.push({ id: nextMsgId(), role: 'system', text: t('agent.contextCompacted'), compactTitle: t('agent.contextCompacted'), compactSummary: summary, expanded: false, _isCompact: true })
        } else if (t) {
          out.push({ id: nextMsgId(), role: 'user', text: t, content: [{ type: 'text', text: t }], specialItems: [] })
        }
      }
      continue
    }

    // tool_result：顶层出现时也尝试更新最近 tool message
    if ((entry._source_type || entry.type) === 'tool_result') {
      applyToolResultToHistoryMessages(out, entry.tool_use_id || entry.toolUseId, entry.content, entry.is_error === true)
      continue
    }

    // system：尽量保留
    if (role === 'system') {
      const subtype = entry.subtype || ''
      if (subtype === 'init') continue

      // local_command：提取标签内文本，跳过无意义的包装
      if (subtype === 'local_command' || subtype === 'local_command_output') {
        const raw = (typeof entry.content === 'string' ? entry.content : normalizeSessionTextContentToString(entry.message?.content) || '').trim()
        if (!raw) continue
        const extracted = stripLocalCommandTags(raw)
        if (!extracted) continue
        const summaryMatch = /\nSummary:\s*\n([\s\S]*)$/i.exec(extracted)
        if (summaryMatch) {
          const summary = summaryMatch[1].trim()
          const compactTitle = extracted.split('\n')[0]?.trim() || 'Compacted chat'
          out.push({ id: nextMsgId(), role: 'system', text: compactTitle, compactTitle, compactSummary: summary, expanded: false, _isCompact: true })
        } else {
          out.push({ id: nextMsgId(), role: 'system', text: extracted })
        }
        continue
      }
      if (subtype === 'compact_boundary') {
        const { pre, post } = readClaudeCompactBoundaryTokens(entry)
        const saved = pre > 0 && post > 0 ? Math.max(0, pre - post) : 0
        const compactTitle = pre > 0 && post > 0
          ? t('agent.compactTokens', { pre, post, saved })
          : t('agent.contextCompacted')
        out.push({ id: nextMsgId(), role: 'system', text: compactTitle, compactTitle, compactSummary: '', expanded: false, _isCompact: true })
        continue
      }
      if (subtype === 'compact_summary') {
        const raw = normalizeSessionTextContentToString(entry.message?.content) || (typeof entry.content === 'string' ? entry.content : '') || entry.compact_summary || ''
        const summary = raw.replace(/^压缩摘要：\n?/i, '').trim()
        if (summary) {
          const last = out[out.length - 1]
          if (last?._isCompact && !last.compactSummary) {
            last.compactSummary = summary
          } else {
            out.push({ id: nextMsgId(), role: 'system', text: t('agent.contextCompacted'), compactTitle: t('agent.contextCompacted'), compactSummary: summary, expanded: false, _isCompact: true })
          }
        }
        continue
      }

      const text = typeof entry.content === 'string' ? entry.content : normalizeSessionTextContentToString(entry.message?.content)
      const textStripped = stripSystemContextTags(text)
      if (textStripped && textStripped.trim()) out.push({ id: nextMsgId(), role: 'system', text: textStripped.trim() })
      continue
    }
  }

  if (recoverDanglingTools) {
    markDanglingClaudeToolsInterrupted(out, analyzeClaudeSessionIntegrity(rawData), { nextId: nextMsgId })
  }
  return out
}
const activeRunMode = computed({
  get: () => activeTab.value?.runMode || 'edit_automatically',
  set: (v) => {
    const tab = activeTab.value
    if (!tab) return
    tab.runMode = v || 'edit_automatically'
    // 通知主进程实时更新运行中的 session 模式
    if (tab.sessionId) {
      window.electronAPI.claudeAgentUpdateRunMode(tab.sessionId, tab.runMode)
    }
    saveHistory()
  },
})
const mentionSuggestions = ref([])
const mentionIdx = ref(0)
let mentionReqSeq = 0
let mentionRefreshTimer = null
const mentionFlatMode = ref(false)
const allFilesCache = ref(null)
const MENTION_REFRESH_DEBOUNCE_MS = 150

function toggleMentionFlatMode() {
  mentionFlatMode.value = !mentionFlatMode.value
  allFilesCache.value = null
  const curQuery = extractMentionQuery(inputText.value || '', inputEl.value?.selectionStart)
  if (curQuery != null) refreshMentionSuggestions(curQuery)
}

function extractMentionQuery(text, caretPos) {
  const pos = Number.isInteger(caretPos) ? caretPos : text.length
  const beforeCaret = (text || '').slice(0, pos)
  const match = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match) return null
  return match[1] || ''
}

async function refreshMentionSuggestions(rawQuery) {
  const tab = activeTab.value
  const cwd = activeProject.value?.cwd || ''
  if (!tab || tab.thinking || !cwd) {
    mentionSuggestions.value = []
    mentionIdx.value = 0
    return
  }
  const query = typeof rawQuery === 'string' ? rawQuery : ''
  const seq = ++mentionReqSeq
  try {
    // ── 平铺模式：一次拉取全量文件，后续本地过滤 ──
    if (mentionFlatMode.value && window.electronAPI?.localSearchFiles) {
      if (!allFilesCache.value) {
        const result = await window.electronAPI.localSearchFiles({ cwd, query: '', fileEnumLimit: 5000 })
        if (seq !== mentionReqSeq) return
        if (result?.ok && Array.isArray(result?.files)) {
          const cwdNorm = cwd.replace(/\\/g, '/').replace(/\/$/, '') + '/'
          allFilesCache.value = result.files.map(f => {
            let p = String(f).replace(/\\/g, '/')
            if (p.toLowerCase().startsWith(cwdNorm.toLowerCase())) {
              p = p.slice(cwdNorm.length)
            }
            return p
          })
        } else {
          allFilesCache.value = []
        }
      }
      if (seq !== mentionReqSeq) return
      const lowerQuery = query.toLowerCase()
      let filtered = allFilesCache.value
      if (lowerQuery) {
        filtered = allFilesCache.value.filter(f => f.toLowerCase().includes(lowerQuery))
      }
      mentionSuggestions.value = filtered.slice(0, 20)
      mentionIdx.value = 0
      return
    }
    // ── 逐级模式：localSearchFiles 优先，claudeListFiles 兜底 ──
    let list = []
    if (window.electronAPI?.localSearchFiles) {
      const result = await window.electronAPI.localSearchFiles({ cwd, query, maxResults: 10 })
      if (seq !== mentionReqSeq) return
      if (result?.ok && Array.isArray(result?.suggestions)) {
        list = result.suggestions
      }
    }
    if (!list.length && window.electronAPI?.claudeListFiles) {
      list = await window.electronAPI.claudeListFiles({ cwd, query })
      if (seq !== mentionReqSeq) return
    }
    if (seq !== mentionReqSeq) return
    mentionSuggestions.value = Array.isArray(list) ? list : []
    mentionIdx.value = 0
  } catch (_) {
    if (seq !== mentionReqSeq) return
    mentionSuggestions.value = []
    mentionIdx.value = 0
  }
}

function refreshMentionSuggestionsDebounced(rawQuery) {
  if (mentionRefreshTimer) clearTimeout(mentionRefreshTimer)
  mentionRefreshTimer = setTimeout(() => {
    mentionRefreshTimer = null
    refreshMentionSuggestions(rawQuery)
  }, MENTION_REFRESH_DEBOUNCE_MS)
}

function clearMentionSuggestions() {
  if (mentionRefreshTimer) {
    clearTimeout(mentionRefreshTimer)
    mentionRefreshTimer = null
  }
  mentionReqSeq += 1
  mentionSuggestions.value = []
  mentionIdx.value = 0
  allFilesCache.value = null
}

function onInputChange(e) {
  onInput(e)
  const query = extractMentionQuery(inputText.value || '', e?.target?.selectionStart)
  if (query == null) {
    clearMentionSuggestions()
    return
  }
  refreshMentionSuggestionsDebounced(query)
}

function onCompositionStart() {
  isComposing.value = true
}

function onCompositionEnd(e) {
  isComposing.value = false
  // IME 结束时，确保联想/提及基于最终文本刷新
  onInputChange(e)
}

function applyMention(item) {
  const text = inputText.value || ''
  const el = inputEl.value
  const caretPos = Number.isInteger(el?.selectionStart) ? el.selectionStart : text.length
  const beforeCaret = text.slice(0, caretPos)
  const afterCaret = text.slice(caretPos)
  const match = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match) return
  const prefix = beforeCaret.slice(0, beforeCaret.length - match[0].length)
  const lead = match[0].startsWith(' ') ? ' ' : ''
  const isDir = item.endsWith('/')
  const name = isDir ? item.slice(0, -1) : item
  inputText.value = `${prefix}${lead}@${name}${isDir ? '/' : ''}${afterCaret}`

  if (isDir) {
    // 文件夹：保持弹窗，钻入下一级
    const dirQuery = name + '/'
    nextTick(() => {
      if (inputEl.value) {
        const cursor = (prefix + lead + '@' + dirQuery).length
        inputEl.value.focus()
        inputEl.value.setSelectionRange(cursor, cursor)
        textareaAutosize.resizeNow()
      }
      refreshMentionSuggestions(dirQuery)
    })
    return
  }
  // 文件：关闭弹窗
  clearMentionSuggestions()
  nextTick(() => {
    const cursor = (prefix + lead + '@' + name).length
    if (inputEl.value) {
      inputEl.value.focus()
      inputEl.value.setSelectionRange(cursor, cursor)
      textareaAutosize.resizeNow()
    }
  })
}
function triggerMention() {
  const text = inputText.value || ''
  const el = inputEl.value
  const caretPos = Number.isInteger(el?.selectionStart) ? el.selectionStart : text.length
  const charBefore = caretPos > 0 ? text[caretPos - 1] : ''
  const needsSpace = charBefore !== '' && charBefore !== ' ' && charBefore !== '\n'
  insertTextAtCaret(needsSpace ? ' @' : '@')
  nextTick(() => {
    refreshMentionSuggestions('')
    inputEl.value?.focus()
  })
}

function triggerSlashMenu() {
  inputText.value = '/'
  loadModelPanelState()
  nextTick(() => {
    inputEl.value?.focus()
    slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith('/'))
    slashIdx.value = 0
    refreshSlashCommands(true)
  })
}

async function openModelPicker() {
  resetSlashSuggestions()
  inputText.value = ''
  const tab = activeTab.value
  const result = await selectModelRef.value?.open?.({
    model: getClaudeTabModel(tab),
    effort: getClaudeTabEffort(tab),
    tier: normalizeClaudeModelTier(tab?.modelTier),
  })
  if (result && tab) {
    tab.model = result.model
    tab.effort = normalizeClaudeEffort(result.effort) || getClaudeTabEffort(tab)
    tab.modelTier = normalizeClaudeModelTier(result.key) || tab.modelTier || null
    persistClaudeTabMeta(tab)
    metricsData.value.model = result.model
    const effortNote = result.effortLabel ? t('agent.switchedModelEffort', { effort: result.effortLabel }) : ''
    pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('agent.switchedModel', { label: result.label, model: result.model }) + effortNote })
    scrollBottom(tab.id)
    slashModelName.value = result.model
    slashEffortLevel.value = result.effort || slashEffortLevel.value
  }
}

function openPlugins() {
  managePluginsRef.value?.open?.()
}
function openSkills() {
  manageSkillsRef.value?.open?.()
}

function openSessionInstruction() {
  if (!activeTab.value?.sessionId) return
  sessionInstructionRef.value?.open?.(activeTab.value.sessionId)
}

async function loadSessionInstructionForTab(tab) {
  if (!tab?.sessionId) return null
  try {
    const instruction = await window.electronAPI?.getSessionInstruction?.(tab.sessionId)
    console.log('[cc] loadSessionInstructionForTab:', { sessionId: tab.sessionId, enabled: instruction?.enabled, contentLen: String(instruction?.content || '').length })
    if (!instruction?.enabled || !String(instruction.content || '').trim()) return null
    return instruction
  } catch (_) {
    return null
  }
}

async function refreshActiveSessionInstructionState() {
  const stop = perfStart('claude.refreshActiveSessionInstructionState')
  const chatKey = activeTab.value?.sessionId
  if (!chatKey) {
    activeSessionInstructionEnabled.value = false
    stop()
    return
  }
  try {
    const instruction = await window.electronAPI?.getSessionInstruction?.(chatKey)
    console.log('[cc] refreshActiveSessionInstructionState:', { chatKey, enabled: instruction?.enabled, contentLen: String(instruction?.content || '').length })
    activeSessionInstructionEnabled.value = Boolean(instruction?.enabled)
  } catch (_) {
    activeSessionInstructionEnabled.value = false
  }
  stop()
}

async function setActiveSessionInstructionEnabled(enabled) {
  const chatKey = activeTab.value?.sessionId
  if (!chatKey) return
  debugLog('sessionInstruction', 'setActiveSessionInstructionEnabled', { chatKey, enabled: Boolean(enabled) })
  activeSessionInstructionEnabled.value = Boolean(enabled)
  try {
    const current = await window.electronAPI?.getSessionInstruction?.(chatKey)
    console.log('[cc] setActiveSessionInstructionEnabled current:', { enabled: current?.enabled, contentLen: String(current?.content || '').length })
    const result = await window.electronAPI?.setSessionInstruction?.({
      chatKey,
      instruction: {
        ...(current || {}),
        enabled: Boolean(enabled),
      },
    })
    console.log('[cc] setActiveSessionInstructionEnabled result:', { ok: result?.ok, returnedEnabled: result?.instruction?.enabled })
    await refreshActiveSessionInstructionState()
  } catch (_) {
    await refreshActiveSessionInstructionState()
  }
}

/** 仍在等待首条助手回复（含首次冷启动），用于提示与限制切换对话/目录 */
const firstAwaitingAssistant = computed(() => {
  const t = activeTab.value
  if (!t?.thinking) return false
  return !t.messages.some(m => m.role === 'assistant')
})

// ─── 持久化 / 历史恢复（抽到 composable）────────────────────────
const {
  getLastProjectCwd,
  setLastProjectCwd,
  saveHistory,
  flushHistoryOnUnload,
  loadHistory,
} = useClaudeHistory({
  projects,
  setProjects: (v) => { projects.value = v },
  getProjectCounter: () => projectCounter,
  setProjectCounter: (v) => { projectCounter = v },
  getChatCounter: () => chatCounter,
  setChatCounter: (v) => { chatCounter = v },
  getMsgId: () => msgId,
  setMsgId: (v) => { msgId = v },
  getActiveProjectId: () => activeProjectId.value,
  setActiveProjectId: (v) => { activeProjectId.value = v },
  getActiveChatId: () => activeChatId.value,
  setActiveChatId: (v) => { activeChatId.value = v },
  makeRestoredChat: (c, restoredMessages) => {
    const msgs = restoredMessages || []
    const n = Math.min(MAX_MESSAGES, msgs.length)
    return {
      ...c,
      metrics: sanitizeClaudePersistedMetrics(c.metrics),
      messages: msgs.slice(-n),
      thinking: false,
      currentAssistantId: null,
      model: c.model || null,
      effort: normalizeClaudeEffort(c.effort) || null,
      modelTier: normalizeClaudeModelTier(c.modelTier) || null,
      taskState: ensureTaskState({ taskState: c.taskState }),
      titleSource: c.titleSource || (c._userRenamed ? 'user' : ''),
      _taskToolUseIds: new Set(),
    }
  },
})
// ─── 项目/对话管理（替代旧的 useClaudeTabs）──────────────────────
const sidebarOpen = ref(true)
const sidebarLoading = ref(false)
const sidebarRefreshing = ref(false)

function createChat() {
  const id = nextChatId()
  // T130: `sessionId` is the legacy renderer/runtime chat key. It exists before
  // Claude creates a real CLI session; disk artifacts must use cliSessionId/filePath.
  return {
    id,
    name: t('chat.newChat'),
    sessionId: `session-${id}-${Date.now()}`,
    createdAt: Date.now(),
    fileSize: null,
    model: claudeDefaultModel.value || null,
    effort: claudeDefaultEffort.value || 'medium',
    modelTier: null,
    runMode: 'edit_automatically',
    draftText: '',
    inputHistory: [],
    thinking: false,
    messages: [],
    currentAssistantId: null,
    cliSessionId: null,
    filePath: '',
    _pendingSessionBinding: true,
    taskState: createEmptyTaskState(),
    _taskToolUseIds: new Set(),
    metrics: {},
  }
}

function createProject() {
  const id = nextProjectId()
  return { id, name: t('agent.newProject'), cwd: '', cwdLocked: false, chats: [], hasDoneNotification: false }
}

function teardownHistoryTopObserver() {
  if (historyTopObserver) {
    historyTopObserver.disconnect()
    historyTopObserver = null
  }
  historyTopSentinelRef.value = null
}

function newProject() {
  const p = createProject()
  // 未选择文件夹前不默认创建对话；选择目录后由 selectDir 或用户点击「新建对话」再创建
  teardownHistoryTopObserver()
  projects.value.push(p)
  activeProjectId.value = p.id
  activeChatId.value = null
  // 同步清理输入区状态，避免“新 tab 仍显示上一 tab 的输入/联想”
  inputText.value = ''
  pendingImages.value = []
  slashSuggestions.value = []
  resetSlashSuggestions?.()
  clearMentionSuggestions()
  resetMetrics()
  saveHistory()
  nextTick(() => inputEl.value?.focus())
}

// 根据首页/外部跳转指定的会话标识（sessionId 优先，chatId 兜底）查找目标会话
function findPreferredChat(chats, preferred) {
  if (!preferred || !chats?.length) return null
  const { chatId, sessionId } = preferred
  if (sessionId) {
    const bySession = chats.find(c => c.cliSessionId === sessionId || c.sessionId === sessionId)
    if (bySession) return bySession
  }
  if (chatId != null && chatId !== '') {
    const byId = chats.find(c => String(c.id) === String(chatId))
    if (byId) return byId
  }
  return null
}

async function switchProject(id, preferredChat = null) {
  const stop = perfStart('claude.switchProject')
  // 顶部项目 Tab 始终可切换；首条回复等待中仍可能锁住侧栏/工具栏，但不把用户困在当前 Tab
  try {
  teardownHistoryTopObserver()
  activeProjectId.value = id
  const p = activeProject.value
  if (p) p.hasDoneNotification = false
  const preferred = findPreferredChat(p?.chats, preferredChat)
  if (!p?.cwdLocked || !p?.cwd) {
    const firstChatId = preferred?.id || p?.chats?.[0]?.id || null
    if (firstChatId) switchChat(firstChatId)
    return
  }

  // 外部显式指定了会话（如首页项目条目点击）：优先于运行中会话
  if (preferred) {
    switchChat(preferred.id)
    saveHistory()
    nextTick(() => inputEl.value?.focus())
    return
  }

  // 有正在运行的对话：保留现有 chats，直接切换到运行中的那个，不扫描文件
  const runningChat = p.chats?.find(c => c.thinking) || null
  if (runningChat) {
    switchChat(runningChat.id)
    saveHistory()
    return
  }

  // 立即用缓存渲染侧栏（0 延迟）
  if (p.chats?.length) {
    const firstChatId = p.chats[0]?.id || null
    if (firstChatId) switchChat(firstChatId)
    nextTick(() => inputEl.value?.focus())
  }
  } finally { stop() }
}

async function refreshProjectSessionsInBackground(p) {
  const stop = perfStart('claude.refreshProjectSessionsInBackground')
  if (!p?.cwd || !window.electronAPI?.claudeScanProjectsSessions) { stop(); return null }
  let newCount = 0
  let changedCount = 0
  try {
    const scanned = await window.electronAPI.claudeScanProjectsSessions(p.cwd)
    if (!Array.isArray(scanned) || !scanned.length) {
      if (!p.chats?.length) {
        const c = createChat()
        p.chats = [c]
        switchChat(p.chats[0].id)
      }
      return { newCount: 0, changedCount: 0, totalCount: p.chats?.length || 0 }
    }
    // 如果切换期间用户已切走，放弃更新
    if (p.id !== activeProjectId.value) return null

    // 建立缓存索引：filePath -> chat，同时用 cliSessionId(即文件名不含扩展名) 做备用索引
    const cacheByPath = {}
    const cacheBySid = {}
    for (const c of p.chats || []) {
      const sessionFilePath = getClaudeSessionFilePath(c)
      const cliSessionId = getClaudeCliSessionId(c)
      if (sessionFilePath) cacheByPath[sessionFilePath] = c
      if (cliSessionId) cacheBySid[cliSessionId] = c
    }

    // 处理新增文件 和 fileSize 变化的文件（不再读文件，标题来自 scan）
    // 竞态防护：如果项目中有 thinking 但尚未拿到 cliSessionId 的聊天，
    // 说明 SDK 刚在磁盘上创建了会话文件但 onAgentDone 还没到。此时扫描
    // 会因无法匹配而误创建重复条目（"会话 XXXXXXXX"）。跳过新文件发现，
    // 等 onAgentDone 填充 cliSessionId/filePath 后下次扫描自然匹配。
    // 注意：循环内领养后会重新计算，避免预计算过时导致合法新 JSONL 被忽略
    let hasPendingNewChat = hasUnboundClaudeSessionPendingAdoption(p.chats || [])
    for (const s of scanned) {
      if (p.id !== activeProjectId.value) return
      const scannedCliSessionId = s.cliSessionId || s.id || ''
      const normalizedPath = (s.filePath || '').replace(/\\/g, '/')
      const cached = cacheByPath[normalizedPath] || cacheBySid[scannedCliSessionId] || null
      const rawTitle = s.title || ''
      const name = rawTitle
        ? rawTitle.slice(0, 35).trim() + (rawTitle.length > 35 ? '...' : '')
        : `${t('chat.sessionPrefix')}${String(scannedCliSessionId || '').slice(0, 8)}`
      const pendingChat = !cached
        ? findPendingClaudeSessionForAdoption(p.chats || [], { activeChatId: activeChatId.value, scannedSessionId: scannedCliSessionId })
        : null

      if (!cached) {
        if (pendingChat) {
          changedCount++
          adoptScannedClaudeSession(pendingChat, s, name)
          // 如果被领养的 pending chat 正是当前活跃对话，清除中断恢复后的残存消息，
          // 因为 _messagesLoaded 已被 adoptScannedClaudeSession 置为 false，
          // 下次 switchChat 或后续 reload 会自动从磁盘加载完整消息
          if (pendingChat.id === activeChatId.value) {
            pendingChat.messages = []
          }
          const pendingChatKey = getClaudeChatKey(pendingChat)
          const pendingCliSessionId = getClaudeCliSessionId(pendingChat)
          if (pendingChatKey && pendingCliSessionId) {
            window.electronAPI?.claudeRegisterCliSessions?.({ [pendingChatKey]: pendingCliSessionId })
          }
          // 领养后重新计算 pending 状态，避免过时的 hasPendingNewChat 阻止后续合法 JSONL
          hasPendingNewChat = hasUnboundClaudeSessionPendingAdoption(p.chats || [])
          continue
        }
        if (hasPendingNewChat) continue  // 等 onAgentDone 填充 cliSessionId 后再匹配
        newCount++
        const inheritedRunMode = getInheritedClaudeRunMode(p)
        // 新增会话：插入到列表中（按最新对话时间倒序）
        const newChat = {
          id: nextChatId(),
          name,
          sessionId: s.chatKey || nextSessionId(),
          cliSessionId: scannedCliSessionId || null,
          createdAt: s.createdAt || null,
          updatedAt: s.updatedAt || null,
          fileSize: s.fileSize || null,
          model: s.model || claudeDefaultModel.value || null,
          effort: normalizeClaudeEffort(s.effort || claudeDefaultEffort.value) || 'medium',
          modelTier: normalizeClaudeModelTier(s.modelTier) || null,
          runMode: inheritedRunMode,
          thinking: false,
          messages: [],
          currentAssistantId: null,
          filePath: s.filePath || '',
          _pendingSessionBinding: false,
          titleSource: s.titleSource || (s.isCustomTitle ? 'provider' : ''),
          _userRenamed: s.titleSource === 'user' || Boolean(s._userRenamed),
          taskState: createEmptyTaskState(),
          _taskToolUseIds: new Set(),
          metrics: {},
        }
        const insertAt = p.chats.findIndex(c => {
          const ct = c.updatedAt || c.createdAt
          const st = s.updatedAt || s.createdAt
          const ctTime = ct ? new Date(ct).getTime() : 0
          const stTime = st ? new Date(st).getTime() : 0
          return ctTime < stTime
        })
        if (insertAt === -1) p.chats.push(newChat)
        else p.chats.splice(insertAt, 0, newChat)
        const newChatKey = getClaudeChatKey(newChat)
        const newCliSessionId = getClaudeCliSessionId(newChat)
        if (newChatKey && newCliSessionId) {
          window.electronAPI?.claudeRegisterCliSessions?.({ [newChatKey]: newCliSessionId })
        }
      } else if (s.fileSize != null && cached.fileSize !== s.fileSize) {
        changedCount++
        // fileSize 变化：更新 fileSize、updatedAt 和 name
        cached.fileSize = s.fileSize
        cached.model = s.model || cached.model || null
        cached.effort = normalizeClaudeEffort(s.effort || cached.effort) || null
        cached.modelTier = normalizeClaudeModelTier(s.modelTier) || cached.modelTier || null
        if (s.updatedAt) cached.updatedAt = s.updatedAt
        if (!cached._userRenamed) {
          cached.name = name
        }
        cached._pendingSessionBinding = false
        // 自卫补充 filePath：新建对话可能未设置，从扫描器补回来
        if (!cached.filePath && s.filePath) {
          cached.filePath = s.filePath
          debugLog('sessionRefresh', 'filePath healed (fileSize-branch)', { name: s.name, filePath: s.filePath })
        }
        const canReloadMessages = shouldReloadClaudeChatFromDisk(cached)
        // 如果该会话是当前正在查看的对话，重置加载状态并清空消息，让 UI 重新加载最新内容
        if (canReloadMessages && cached.id === activeChatId.value) {
          cached._messagesLoaded = false
          if (shouldResetMessagesForDiskReload(cached)) cached.messages = []
          // 标记需要在刷新结束后重新加载当前对话
          s._needReloadActiveChat = true
        } else if (canReloadMessages && (!cached.messages || cached.messages.length === 0)) {
          if (shouldResetMessagesForDiskReload(cached)) cached.messages = []
          cached._messagesLoaded = false
        }
      } else {
        // 已有会话且 fileSize 未变化：更新元信息（名称、时间）
        if (s.updatedAt) cached.updatedAt = s.updatedAt
        if (!cached._userRenamed) {
          cached.name = name
        }
        cached._pendingSessionBinding = false
        // 自卫补充 filePath：新建对话可能未设置，从扫描器补回来
        if (!cached.filePath && s.filePath) {
          cached.filePath = s.filePath
          debugLog('sessionRefresh', 'filePath healed (nochange-branch)', { name: s.name, filePath: s.filePath })
        }
      }
    }

    // 如果有当前活跃对话的消息被清空了，主动触发重新加载
    const needReload = scanned.find(s => s._needReloadActiveChat)
    if (needReload) {
      const activeChat = p.chats?.find(c => c.id === activeChatId.value) || null
      // 注意：不用 messages.length 判断——中断恢复后内存中可能有部分消息，也需覆盖
      if (activeChat?.filePath && !activeChat._messagesLoaded) {
        activeChat._loadingMessages = true
        void ensureChatMessagesLoaded(activeChat).finally(() => {
          activeChat._loadingMessages = false
          requestAnimationFrame(() => { setupHistoryTopObserver(); scrollBottom() })
        })
      }
    }

    // 刷新后按最新时间重排
    p.chats.sort((a, b) => {
      const rawA = a.updatedAt || a.createdAt
      const rawB = b.updatedAt || b.createdAt
      const timeA = rawA ? new Date(rawA).getTime() : 0
      const timeB = rawB ? new Date(rawB).getTime() : 0
      return timeB - timeA
    })
    const sanitized = sanitizeClaudeProjectsForPersistence({
      projects: [p],
      activeProjectId: p.id,
      activeChatId: activeChatId.value,
    })
    const sanitizedProject = sanitized.projects[0]
    if (sanitizedProject) {
      p.chats = sanitizedProject.chats || []
      if (activeProjectId.value === p.id) {
        activeChatId.value = sanitized.activeChatId
      }
    }
    saveHistory()
    return { newCount, changedCount, totalCount: p.chats?.length || 0 }
  } catch (_) {}
  return null
}

function sortChatsByRecency(chats = []) {
  return chats.sort((a, b) => {
    const rawA = a.updatedAt || a.createdAt
    const rawB = b.updatedAt || b.createdAt
    const timeA = rawA ? new Date(rawA).getTime() : 0
    const timeB = rawB ? new Date(rawB).getTime() : 0
    return timeB - timeA
  })
}

async function handleRefreshSessions({ silent = false } = {}) {
  const stop = perfStart('claude.handleRefreshSessions')
  const p = activeProject.value
  if (!p?.cwd || sidebarRefreshing.value) { stop(); return }
  if (!silent && !(p?.chats?.length)) sidebarLoading.value = true
  sidebarRefreshing.value = true
  try {
    await refreshProjectSessionsInBackground(p)
  } finally {
    if (!silent) sidebarLoading.value = false
    sidebarRefreshing.value = false
    stop()
  }
}

// 会话刷新增强：窗口聚焦自动刷新 + 键盘快捷键
// 嵌入模式下不注册 focus 自动刷新（避免非活跃 Tab 时浪费性能）
// 侧边栏手动刷新按钮仍然直接调用 handleRefreshSessions
if (!embedded) {
  useSessionRefresh(handleRefreshSessions)
}

/** 追加消息到 messages */
function touchChatUpdatedAt(tab) {
  if (tab) tab.updatedAt = Date.now()
}

function pushTabMessage(tab, msg) {
  if (!tab) return
  tab.messages.push(msg)
  touchChatUpdatedAt(tab)
  bumpScrollCount()
}

let newChatLock = false
function newChat() {
  if (newChatLock) return
  const p = activeProject.value
  if (!p || !p.cwdLocked) return
  newChatLock = true
  try {
    const c = createChat()
    p.chats.unshift(c)
    activeChatId.value = c.id
    resetMetrics()
    saveHistory()
    nextTick(() => inputEl.value?.focus())
  } finally {
    // 延迟解锁，防止双击/事件冒泡导致重复创建
    setTimeout(() => { newChatLock = false }, 300)
  }
}

function switchChat(id) {
  const stop = perfStart('claude.switchChat')
  activeChatId.value = id
  const chat = activeProject.value?.chats?.find(c => c.id === id) || null
  // 实时更新斜杠面板的模型/effort显示
  loadModelPanelState()
  // 同步更新状态栏模型名（refreshMetricsForChat 会异步补齐正确的值）
  // 切换时如果消息超限，先截断再保存
  if (chat) trimMessages(chat)
  resetScrollPrev()
  refreshMetricsForChat(chat)
  // 有 filePath 且未从磁盘加载过时，从文件加载
  // 注意：不用 messages.length 判断——中断恢复后内存中可能有部分消息，也需覆盖
  if (chat?.filePath && !chat._messagesLoaded && canHydrateChatFromDisk(chat)) {
    chat._loadingMessages = true
    void ensureChatMessagesLoaded(chat).finally(() => {
      chat._loadingMessages = false
      requestAnimationFrame(() => { setupHistoryTopObserver(); scrollBottom(); inputEl.value?.focus() })
    })
  } else {
    requestAnimationFrame(() => { setupHistoryTopObserver(); scrollBottom(); inputEl.value?.focus() })
  }
  stop()
}

async function ensureChatMessagesLoaded(chat) {
  const stop = perfStart('claude.ensureChatMessagesLoaded')
  if (!chat?.filePath || !window.electronAPI?.claudeReadSessionFileRange) { stop(); return }
  
  try {
    // 初始加载最后 30 条消息
    const rawData = await window.electronAPI.claudeReadSessionFileRange({
      filePath: chat.filePath,
      page: 0,  // 最近的页面
      pageSize: 60
    })
    if (!rawData?.messages?.length) return
    if (!canHydrateChatFromDisk(chat, { hasIncomingDiskMessages: true })) return
    const looksLikeFlatMessages = rawData.messages.some(e =>
      e && (typeof e.role === 'string' || Array.isArray(e.content) || typeof e.content === 'string')
    )

    const integrity = analyzeClaudeSessionIntegrity(rawData.messages)
    const allMessages = looksLikeFlatMessages
      ? normalizeFlatSessionMessagesToUiMessages(rawData.messages, { recoverDanglingTools: true })
        .filter(msg => msg && (msg.role || msg.specialItems?.length > 0))
      : normalizeSessionEventsToUiMessages(rawData.messages, { recoverDanglingTools: true })
        .filter(msg => msg && (msg.role || msg.specialItems?.length > 0))

    const n = Math.min(MAX_MESSAGES, allMessages.length)
    chat.messages = allMessages.slice(-n)
    chat.hasMoreHistory = rawData.hasMore
    chat.currentPage = 0
    chat.pageSize = 60
    chat._sessionIntegrity = integrity
    chat._hasDanglingToolRecovery = Boolean(integrity.hasDanglingToolUse)
    if (integrity.hasDanglingToolUse) {
      markClaudeIdle(chat)
      chat._pendingSessionBinding = false
    }
    chat._messagesLoaded = true
  } catch (e) {
    console.warn('[ensureChatMessagesLoaded] failed:', e?.message || e)
  } finally {
    stop()
  }
}

async function requestDeleteChat(chat) {
  const p = activeProject.value
  if (!p || !chat) return
  const ok = await confirmDialogRef.value?.open(chat.filePath
    ? {
        message: '此操作会永久删除该 Claude 会话及底层官方历史（JSONL transcript），删除后无法恢复。是否永久删除？',
        okText: t('common.delete'),
        cancelText: t('common.cancel'),
      }
    : { message: t('agent.confirmDeleteChat') })
  if (!ok) return
  window.electronAPI.claudeAgentAbort?.(chat.sessionId)
  // 删除 SDK 持久化的 .jsonl 文件
  if (chat.filePath) {
    await window.electronAPI.claudeDeleteSessionFile?.(chat.filePath)
  }
  p.chats = p.chats.filter(c => c.id !== chat.id)
  if (activeChatId.value === chat.id) {
    activeChatId.value = p.chats[0]?.id || null
    const next = p.chats.find(c => c.id === activeChatId.value) || null
    refreshMetricsForChat(next)
  }
  // 删除是破坏性操作：立即落盘，避免 debounce 导致”关掉后立刻重开”丢历史
  saveHistory({ immediate: true })
}

async function handleRenameChat(session, newName) {
  const p = activeProject.value
  if (!p) return
  const chat = p.chats.find(c => c.id === session.id)
  if (!chat) return
  if (!chat.cliSessionId && !chat.filePath) {
    ElMessage.warning(t('agent.renameFirst'))
    return
  }
  try {
    const result = await window.electronAPI?.setSessionTitle?.({
      agent: 'claude',
      chatKey: chat.sessionId,
      title: newName,
      cwd: p.cwd,
      cliSessionId: chat.cliSessionId,
      filePath: chat.filePath,
      model: chat.model,
      effort: chat.effort,
      modelTier: chat.modelTier,
    })
    if (!result?.ok) {
      ElMessage.error(result?.error || t('agent.renameFailed'))
      return
    }
    chat.name = newName
    chat._userRenamed = true
    chat.titleSource = 'user'
    saveHistory({ immediate: true })
  } catch (e) {
    ElMessage.error(e?.message || t('agent.renameFailed'))
  }
}

async function requestDeleteProject(project) {
  if (!project) return
  // 从 projects.value 查找完整 project（ProjectTabs 传的是 summary，不含 chats）
  const full = projects.value.find(p => p.id === project.id)
  if (!full) return
  // 有运行中对话时提示，否则直接关闭
  const hasRunning = (full.chats || []).some(c => c.thinking)
  if (hasRunning) {
    const ok = await confirmDialogRef.value?.open({
      message: t('agent.closeProjectTab'),
    })
    if (!ok) return
  }
  for (const c of full.chats || []) window.electronAPI.claudeAgentAbort?.(c.sessionId)
  projects.value = projects.value.filter(p => p.id !== project.id)

  if (activeProjectId.value === project.id) {
    const fallback = projects.value[projects.value.length - 1] || null
    activeProjectId.value = fallback?.id || null
    activeChatId.value = fallback?.chats?.[fallback.chats.length - 1]?.id || null
    resetMetrics()
  }
  // T015: 不再自动创建新项目，关闭最后一个 tab 后由 codeHub 显示空状态欢迎页
  // 删除是破坏性操作：立即落盘，避免 debounce 导致”关掉后立刻重开”丢历史
  saveHistory({ immediate: true })
}

function closeAllProjects() {
  for (const p of projects.value) {
    for (const c of p.chats || []) window.electronAPI.claudeAgentAbort?.(c.sessionId)
  }
  projects.value = []
  activeProjectId.value = null
  activeChatId.value = null
  resetMetrics()
  saveHistory({ immediate: true })
}

function reorderProjects({ fromIndex, toIndex }) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= projects.value.length || toIndex >= projects.value.length) return
  if (fromIndex === toIndex) return
  const item = projects.value.splice(fromIndex, 1)[0]
  projects.value.splice(toIndex, 0, item)
  saveHistory({ immediate: true })
}

async function selectDir(project, onAfterSelect) {
  if (!project || project.cwdLocked) return
  if (!window.electronAPI?.claudeSelectDirectory) return
  let dir
  try {
    dir = await window.electronAPI.claudeSelectDirectory()
  } catch (e) {
    console.warn('[selectDir] failed:', e?.message || e)
    return
  }
  if (!dir) return
  project.cwd = dir
  project.cwdLocked = true
  setLastProjectCwd(dir)
  if (!(project.chats?.length)) sidebarLoading.value = true
  try {
    const sessions = await loadProjectSessions(dir)
    if (Array.isArray(sessions) && sessions.length) {
      const inheritedRunMode = getInheritedClaudeRunMode(project)
      project.chats = sessions.map(s => {
        const cliSessionId = s.cliSessionId || s.id || ''
        const chatKey = s.chatKey || nextSessionId()
        return {
          id: nextChatId(),
          name: s.name || `${t('chat.sessionPrefix')}${String(cliSessionId || '').slice(0, 8)}`,
          sessionId: chatKey,
          cliSessionId: cliSessionId || null,
          createdAt: s.createdAt || null,
          updatedAt: s.updatedAt || null,
          fileSize: s.fileSize || null,
          model: s.model || claudeDefaultModel.value || null,
          effort: normalizeClaudeEffort(s.effort || claudeDefaultEffort.value) || 'medium',
          modelTier: normalizeClaudeModelTier(s.modelTier) || null,
          runMode: inheritedRunMode,
          thinking: false,
          messages: [],
          currentAssistantId: null,
          filePath: s.filePath || '',
          _pendingSessionBinding: false,
          titleSource: s.titleSource || (s._userRenamed ? 'user' : ''),
          _userRenamed: s.titleSource === 'user' || Boolean(s._userRenamed),
          taskState: createEmptyTaskState(),
          _taskToolUseIds: new Set(),
          metrics: {},
        }
      })
      const firstChatId = project.chats[0]?.id || null
      if (firstChatId) switchChat(firstChatId)
      // 注册 cliSessionId 到主进程，使得在历史对话上发送消息时能 resume 旧会话
      const sessionMap = {}
      for (const c of project.chats) {
        const chatKey = getClaudeChatKey(c)
        const cliSessionId = getClaudeCliSessionId(c)
        if (chatKey && cliSessionId) sessionMap[chatKey] = cliSessionId
      }
      if (Object.keys(sessionMap).length) {
        window.electronAPI?.claudeRegisterCliSessions?.(sessionMap)
      }
    } else if (!project.chats.length) {
      const c = createChat()
      if (onAfterSelect) {
        const msg = onAfterSelect(t('agent.workDirSet', { dir }))
        c.messages.push(msg)
        touchChatUpdatedAt(c)
      }
      project.chats.push(c)
      switchChat(c.id)
    }
  } finally {
    sidebarLoading.value = false
  }
  saveHistory()
  nextTick(() => inputEl.value?.focus())
}
let sessionCounter = 0
const nextSessionId = () => `session-${++sessionCounter}-${Date.now()}`

async function loadProjectSessions(cwd) {
  if (!cwd || !window.electronAPI?.claudeScanProjectsSessions) return
  try {
    const sessions = await window.electronAPI.claudeScanProjectsSessions(cwd)
    if (Array.isArray(sessions)) {
      return sessions.map(s => {
        const rawTitle = s.title || ''
        const cliSessionId = s.cliSessionId || s.id || ''
        const name = rawTitle
          ? rawTitle.slice(0, 35).trim() + (rawTitle.length > 35 ? '...' : '')
          : `${t('chat.sessionPrefix')}${String(cliSessionId || '').slice(0, 8)}`
        return {
          id: cliSessionId || nextSessionId(),
          chatKey: s.chatKey || '',
          cliSessionId: cliSessionId || null,
          createdAt: s.createdAt || null,
          updatedAt: s.updatedAt || null,
          filePath: s.filePath || '',
          fileSize: s.fileSize || null,
          model: s.model || null,
          effort: normalizeClaudeEffort(s.effort) || null,
          modelTier: normalizeClaudeModelTier(s.modelTier) || null,
          messages: [],
          name,
          titleSource: s.titleSource || (s.isCustomTitle ? 'provider' : ''),
          _userRenamed: s.titleSource === 'user' || Boolean(s._userRenamed),
          metrics: {},
        }
      })
    }
  } catch (e) {
    console.error('[claude-code] 加载历史会话失败:', e)
  }
  return []
}

// ─── 图片（抽到 composable）────────────────────────────────────
const {
  pendingImages,
  imageLightboxSrc,
  dragging,
  fileInputRef,
  addImageClick,
  onFileSelect,
  onDrop,
  onPaste: onPasteAttachments,
  addImages,
  getFilesText,
  removeAt,
  openImageLightbox,
  closeImageLightbox,
  dispose: disposeImageAttachments,
} = useImageAttachments({ getActiveTab: () => activeTab.value })

function insertTextAtCaret(insertText) {
  const el = inputEl.value
  const value = inputText.value || ''
  const start = Number.isInteger(el?.selectionStart) ? el.selectionStart : value.length
  const end = Number.isInteger(el?.selectionEnd) ? el.selectionEnd : value.length
  inputText.value = value.slice(0, start) + insertText + value.slice(end)
  nextTick(() => {
    if (!inputEl.value) return
    const pos = start + insertText.length
    inputEl.value.focus()
    inputEl.value.setSelectionRange(pos, pos)
    textareaAutosize.resizeNow()
  })
}

function looksLikeCodePaste(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trimEnd()
  if (t.includes('```')) return false
  if (t.split('\n').length >= 3) return true
  if (t.includes('\t')) return true
  if (/;\s*$/.test(t) || /^\s*(import|export|function|class|const|let|var)\b/m.test(t)) return true
  if (/^\s*#include\b/m.test(t) || /^\s*(def|class)\b/m.test(t)) return true
  if (/^\s*<\w+[\s>]/m.test(t) && t.includes('</')) return true
  return false
}

function onPaste(e) {
  // 1) 先处理图片/文件粘贴（会 preventDefault）
  onPasteAttachments?.(e)
  if (e?.defaultPrevented) return
  if (activeTab.value?.thinking) return

  // 2) 处理纯文本/代码粘贴
  const text = e?.clipboardData?.getData?.('text/plain')
  if (!text) return

  if (looksLikeCodePaste(text)) {
    e.preventDefault()
    const trimmed = text.replace(/\r\n/g, '\n').replace(/\s+$/g, '')
    insertTextAtCaret(`\n\`\`\`\n${trimmed}\n\`\`\`\n`)
  }
}

// ─── slash 命令（抽到 composable）──────────────────────────────
const {
  slashCommands,
  slashSuggestions,
  slashIdx,
  slashLoadingRemote,
  slashModelName,
  slashEffortLevel,
  slashThinkingEnabled,
  refreshSlashCommands,
  loadModelPanelState,
  setEffortLevel,
  toggleThinking,
  onInput,
  onKeydown: onSlashKeydown,
  applySlash,
  resetSuggestions: resetSlashSuggestions,
} = useSlashCommands({
  getActiveTab: () => activeTab.value,
  getCwd: () => activeProject.value?.cwd || '',
  getInputText: () => inputText.value,
  setInputText: (v) => { inputText.value = v },
  focusInput: () => nextTick(() => inputEl.value?.focus()),
  autosizeSchedule: textareaAutosize.scheduleResize,  // Phase 5: rAF 合并
})

function setupHistoryTopObserver() {
  // 虚拟列表下 sentinel 被 paddingTop 遮挡，IntersectionObserver 不再可靠
  // 历史加载由 onMessagesScroll (scrollTop <= 40) 和 onMessagesWheel 处理
  if (historyTopObserver) {
    historyTopObserver.disconnect()
    historyTopObserver = null
  }
}

function setHistoryTopSentinelRef(el) {
  historyTopSentinelRef.value = el || null
  // 不在这里触发 observer，由 switchChat 的 requestAnimationFrame 统一调度
}

function setMsgRef(id, el) {
  if (!el) {
    if (id != null) delete msgRefs[id]
    return
  }
  msgRefs[id] = el
  if (id === activeChatId.value) {
    activeMsgContainer.value = el
    // 不在此触发 observer，由 switchChat 统一调度
  }
}

function scrollBottom(tabId, force = false) {
  const id = tabId || activeChatId.value
  requestAnimationFrame(() => {
    const el = msgRefs[id]
    if (!el) return
    // 用 scrollTo 设大值避免读 scrollHeight 强制 reflow
    // 使用 'instant' 而非 'auto' 来减少 CLS
    el.scrollTo({ top: 999999, behavior: 'instant' })
  })
}

/** 消息滑动窗口：超过上限时丢弃最早的消息 */
function trimMessages(tab, skipScrollCompensation) {
  if (tab.messages.length > MAX_MESSAGES) {
    const overflow = tab.messages.length - MAX_MESSAGES
    tab.messages.splice(0, overflow)

    // 重置分页状态，下次滚动到顶部时从 page 1 重新加载
    tab.currentPage = 0
    if (tab.filePath) {
      tab.hasMoreHistory = true
    }
    tab.pageSize = tab.pageSize || 60

    // 如果不做 scrollBottom 补偿，则手动恢复滚动位置
    if (!skipScrollCompensation) {
      const scrollEl = msgRefs[tab.id]
      const oldScrollHeight = scrollEl ? scrollEl.scrollHeight : 0
      const oldScrollTop = scrollEl ? scrollEl.scrollTop : 0
      nextTick(() => {
        if (scrollEl) {
          const newScrollHeight = scrollEl.scrollHeight
          scrollEl.scrollTop = oldScrollTop - (oldScrollHeight - newScrollHeight)
        }
      })
    }
  }
}

/** 加载更多历史消息（滚动到顶部时触发） */
async function loadMoreHistory(scrollEl) {
  const chat = activeTab.value
  if (!chat || !chat.hasMoreHistory || chat.loadingMore || !chat.filePath) return
  if (loadMoreCooldownTimer) return
  loadMoreCooldownTimer = setTimeout(() => { loadMoreCooldownTimer = null }, 1000)

  chat.loadingMore = true
  try {
    // 加载前记录容器高度，用于加载后补偿滚动位置
    const oldScrollHeight = scrollEl ? scrollEl.scrollHeight : 0
    const rawData = await window.electronAPI.claudeReadSessionFileRange({
      filePath: chat.filePath,
      page: chat.currentPage + 1,
      pageSize: chat.pageSize
    })
    if (!rawData?.messages?.length) {
      chat.hasMoreHistory = false
      return
    }

    const moreMessages = rawData.messages.some(e =>
      e && (typeof e.role === 'string' || Array.isArray(e.content) || typeof e.content === 'string')
    )
      ? normalizeFlatSessionMessagesToUiMessages(rawData.messages, { recoverDanglingTools: false })
        .filter(msg => msg && (msg.role || msg.specialItems?.length > 0))
      : normalizeSessionEventsToUiMessages(rawData.messages, { recoverDanglingTools: false })
        .filter(msg => msg && (msg.role || msg.specialItems?.length > 0))

    // 用 unshift 批量插入，减少数组重建开销
    chat.messages.unshift(...moreMessages)
    chat.hasMoreHistory = rawData.hasMore
    chat.currentPage++

    // 加载后补偿滚动位置，保持视觉不变
    nextTick(() => {
      if (scrollEl) {
        const newScrollHeight = scrollEl.scrollHeight
        scrollEl.scrollTop = newScrollHeight - oldScrollHeight
      }
    })
  } catch (e) {
    console.warn('[loadMoreHistory] failed:', e?.message || e)
  } finally {
    chat.loadingMore = false
  }
}

function onMessagesScroll(e) {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => { scrollThrottleTimer = null }, 50)
  const tab = activeTab.value
  updateScrollPrevBtn()
  onScrollBottomHook()
  // currentTarget 才是绑定的滚动容器，target 可能是子元素
  if (tab && e.currentTarget.scrollTop === 0 && tab.hasMoreHistory && !tab.loadingMore) {
    loadMoreHistory(e.currentTarget)
  }
}

function onMessagesWheel(e) {
  if (wheelThrottleTimer) return
  wheelThrottleTimer = setTimeout(() => { wheelThrottleTimer = null }, 50)
  const tab = activeTab.value
  updateScrollPrevBtn()
  onScrollBottomHook()
  // currentTarget 才是绑定的滚动容器，target 可能是子元素
  if (tab && e.deltaY < 0 && e.currentTarget.scrollTop === 0 && tab.hasMoreHistory && !tab.loadingMore) {
    loadMoreHistory(e.currentTarget)
  }
}

function handleScrollBottom() {
  scrollToBottomActive(true)
  resetScrollPrev()
}

function openSettings() {
  if (embedded) {
    openSharedSettings?.()
  } else {
    apiSettingRef.value?.openSettings()
  }
}

function handleProviderActivated() {
  // 遍历所有项目的所有对话，重置状态并重新注册 cliSessionId 映射
  // 主进程 resetAgentRuntime 已将 SDK 重置，但保留 cliSessionIds Map（见 claudeAgent.js 注释）
  // 这里需要为所有聊天恢复状态，而不只是活跃 tab
  const allRegistrations = {}
  for (const p of projects.value) {
    if (!p?.chats) continue
    for (const chat of p.chats) {
      // 清 currentAssistantId，避免 abort 后残存的流式消息追加到旧气泡
      markClaudeIdle(chat)
      const chatKey = getClaudeChatKey(chat)
      const cliSessionId = getClaudeCliSessionId(chat)
      if (chatKey && cliSessionId) {
        allRegistrations[chatKey] = cliSessionId
      }
    }
  }
  if (Object.keys(allRegistrations).length) {
    window.electronAPI?.claudeRegisterCliSessions?.(allRegistrations)
  }

  const tab = activeTab.value
  if (!tab) return
  window.electronAPI?.claudeAgentAbort?.(tab.sessionId)
  // 同步更新状态栏模型显示
  window.electronAPI?.claudeGetModel?.().then(m => {
    metricsData.value.model = m
  })
  pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.switchedApi') })
  saveHistory()
}

function abortSession() {
  const tab = activeTab.value
  if (!tab) return
  window.electronAPI.claudeAgentAbort?.(tab.sessionId)
  markClaudeAbortRequested(tab)
  metricsData.value.thinking = false
  stopMetricsLiveTimer()
  markClaudeAborted(tab)
  pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.aborted') })
  trimMessages(tab, true)
  scrollBottom(tab.id)
  saveHistory()
}

function sendFromStatusBar(text) {
  // 压缩中不允许再次触发压缩
  if (text === '/compact' && metricsData.value.compacting) return
  if (inputEl.value) inputEl.value.value = text
  sendMessage()
}

async function sendMessage() {
  const tab = activeTab.value
  if (isComposing.value) return
  // 点击发送时优先用 DOM 值，避免 IME 合成阶段 v-model 未提交导致读取为空
  const raw = (inputEl.value && typeof inputEl.value.value === 'string')
    ? inputEl.value.value
    : inputText.value
  if (raw !== inputText.value) inputText.value = raw
  const text = (raw || '').trim()
  const hasAttachments = pendingImages.value.length > 0
  if ((!text && !hasAttachments) || !tab) return
  sessionDraft.clearTimer()
  if (!activeProject.value?.cwdLocked) return
  beginTaskBatch(tab, { reason: 'user_turn', now: Date.now() })

  // 正在回复中：SDK 原生 streamInput 立即中断（CLI 终端行为）
  // 不需要排队等 done——SDK 自动打断当前生成，处理新消息后继续流式输出
  if (isClaudeTurnLocked(tab)) {
    const imgs = pendingImages.value.filter(i => i.isImage).map(({ dataUrl, mediaType }) => ({
      dataUrl,
      mediaType: mediaType || 'image/png',
    }))
    const filesText = await getFilesText()
    const files = pendingImages.value.filter(i => !i.isImage).map(({ name, size }) => ({ name, size }))
    let promptToSend = text
    if (filesText) {
      promptToSend = [filesText, '', text].join('\n')
    }
    // compact 上下文注入（新会话首轮）
    if (text && !text.startsWith('/') && tab._carryCompactSummary) {
      const compactPart = [
        '以下是上一会话压缩后的上下文摘要，请作为当前会话背景：',
        tab._carryCompactSummary,
      ].join('\n')
      promptToSend = filesText
        ? [filesText, '', compactPart, '', '用户当前问题：', text].join('\n')
        : [compactPart, '', '用户当前问题：', text].join('\n')
      tab._carryCompactSummary = ''
    }

    // push 普通用户气泡（无 queued 标记）
    const userContent = buildUserContentBlocks(text, imgs, files)
    trimMessages(tab, true)
    pushTabMessage(tab,{
      id: nextMsgId(),
      role: 'user',
      text,
      content: userContent,
      images: imgs,
      files,
    })
    // 第一条消息自动作为标题（除非用户已手动重命名）
    if (countVisibleClaudeUserMessages(tab.messages) === 1 && !tab._userRenamed) {
      tab.name = text ? text.slice(0, 24) + (text.length > 24 ? '…' : '') : files.map(f => f.name).join(', ')
    }
    scrollBottom(tab.id, true)
    pendingImages.value = []
    if (!Array.isArray(tab.inputHistory)) tab.inputHistory = []
    pushToHistory(text, tab.inputHistory)
    inputText.value = ''
    void sessionDraft.clearDraftForChat(tab)
    saveHistory({ immediate: true })
    nextTick(() => { if (inputEl.value) textareaAutosize.resizeNow() })
    // fire-and-forget：消息通过 claude-agent-message 事件通道回来
    // 主进程 existing 分支命中 → streamInput → SDK 中断并处理
    window.electronAPI.claudeAgentQuery({
      prompt: promptToSend, images: imgs,
      cwd: activeProject.value?.cwd || undefined,
      sessionId: tab.sessionId,
      model: getClaudeTabModel(tab),
      effort: getClaudeTabEffort(tab),
      modelTier: normalizeClaudeModelTier(tab.modelTier) || undefined,
      runMode: tab.runMode || 'edit_automatically',
      sessionInstruction: await loadSessionInstructionForTab(tab),
    })
    return
  }

  // slash 命令：仅保留少量本地命令，其余 /xxx 透传给 Claude（skills/commands）
  if (text && text.startsWith('/')) {
    const [cmd] = text.split(/\s+/)
    inputText.value = ''
    slashSuggestions.value = []
    void sessionDraft.clearDraftForChat(tab)
    if (cmd === '/clear') {
      pushTabMessage(tab, {
        id: nextMsgId(),
        role: 'system',
        text: '/clear 已停用。请使用新建会话或删除会话。',
      })
      scrollBottom(tab.id)
      return
    }
    if (cmd === '/plugins') {
      managePluginsRef.value?.open?.()
      return
    }
    if (cmd === '/model') {
      const result = await selectModelRef.value?.open?.({
        model: getClaudeTabModel(tab),
        effort: getClaudeTabEffort(tab),
        tier: normalizeClaudeModelTier(tab?.modelTier),
      })
      if (result) {
        tab.model = result.model
        tab.effort = normalizeClaudeEffort(result.effort) || getClaudeTabEffort(tab)
        tab.modelTier = normalizeClaudeModelTier(result.key) || tab.modelTier || null
        persistClaudeTabMeta(tab)
        metricsData.value.model = result.model
        const effortNote = result.effortLabel ? t('agent.switchedModelEffort', { effort: result.effortLabel }) : ''
        pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('agent.switchedModel', { label: result.label, model: result.model }) + effortNote })
        scrollBottom(tab.id)
        slashEffortLevel.value = result.effort || slashEffortLevel.value
      }
      return
    }
    if (cmd === '/memory') {
      const cwd = activeProject.value?.cwd || ''
      const args = text.slice('/memory'.length).trim().split(/\s+/)
      const isSystem = args.includes('--system') || args.includes('-s')
      const filteredArgs = args.filter(a => a !== '--system' && a !== '-s')
      const subCmd = filteredArgs[0] || ''
      const scope = isSystem ? 'system' : undefined

      if (!subCmd || subCmd === 'list') {
        // /memory 或 /memory list — 显示所有记忆
        const projectMems = await window.electronAPI.claudeMemoryList?.(cwd) || []
        const systemMems = await window.electronAPI.claudeMemoryList?.(cwd, 'system') || []
        const mode = await window.electronAPI.claudeMemoryGetInjectMode?.() || 'system'
        const systemListRows = [{ type: 'title', text: `Memory · inject: ${mode}` }]
        if (systemMems.length) {
          systemListRows.push({ type: 'section', text: `── System (${systemMems.length}) ──` })
          for (const m of systemMems) {
            systemListRows.push({ type: 'row', cmd: m.filename, meta: m.type, desc: `${m.name}: ${m.description}` })
          }
        }
        if (projectMems.length) {
          systemListRows.push({ type: 'section', text: `── Project (${projectMems.length}) ──` })
          for (const m of projectMems) {
            systemListRows.push({ type: 'row', cmd: m.filename, meta: m.type, desc: `${m.name}: ${m.description}` })
          }
        }
        if (!systemMems.length && !projectMems.length) {
          systemListRows.push({ type: 'empty', text: t('agent.memory.noMemories') })
        }
        const lines = systemListRows.map(r => {
          if (r.type === 'title' || r.type === 'empty') return r.text
          return `  [${r.meta}] ${r.cmd}  ·  ${r.desc}`
        })
        pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: lines.join('\n'), systemListBlock: true, systemListRows })
        scrollBottom(tab.id)
        saveHistory()
        return
      }

      if (subCmd === 'add') {
        const type = filteredArgs[1] || 'project'
        const name = filteredArgs[2] || ''
        if (!name) {
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.addUsage') })
          scrollBottom(tab.id)
          return
        }
        const body = filteredArgs.slice(3).join(' ') || ''
        if (!body) {
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.needContent', { type, name }) })
          scrollBottom(tab.id)
          return
        }
        const filename = `${type}_${name}`
        const res = await window.electronAPI.claudeMemoryWrite?.({ cwd, filename, name, description: body.slice(0, 60), type, body, scope })
        const msg = res?.ok ? t('agent.memory.saved', { scope: isSystem ? t('agent.memory.scopeSystem') : t('agent.memory.scopeProject'), filename: res.filename }) : t('agent.memory.saveFailed', { message: res?.message || t('agent.memory.unknownError') })
        pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: msg })
        scrollBottom(tab.id)
        saveHistory()
        return
      }

      if (subCmd === 'delete' || subCmd === 'rm') {
        const filename = filteredArgs[1] || ''
        if (!filename) {
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.deleteUsage') })
          scrollBottom(tab.id)
          return
        }
        const res = await window.electronAPI.claudeMemoryDelete?.({ cwd, filename, scope })
        const msg = res?.ok ? t('agent.memory.deleted', { scope: isSystem ? t('agent.memory.scopeSystem') : t('agent.memory.scopeProject'), filename }) : t('agent.memory.deleteFailed')
        pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: msg })
        scrollBottom(tab.id)
        saveHistory()
        return
      }

      if (subCmd === 'show') {
        const filename = filteredArgs[1] || ''
        if (!filename) {
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.showUsage') })
          scrollBottom(tab.id)
          return
        }
        const mem = await window.electronAPI.claudeMemoryRead?.({ cwd, filename, scope })
        if (!mem) {
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.notFound', { filename }) })
        } else {
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: `[${mem.type}] ${mem.name}\n${mem.description}\n---\n${mem.body}` })
        }
        scrollBottom(tab.id)
        saveHistory()
        return
      }

      if (subCmd === 'inject') {
        const mode = filteredArgs[1] || ''
        if (!['system', 'user', 'off'].includes(mode)) {
          const current = await window.electronAPI.claudeMemoryGetInjectMode?.() || 'system'
          pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.injectUsage', { current }) })
          scrollBottom(tab.id)
          return
        }
        await window.electronAPI.claudeMemorySetInjectMode?.(mode)
        pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.injectSwitched', { mode }) })
        scrollBottom(tab.id)
        saveHistory()
        return
      }

      // 未知子命令
      pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.memory.helpText') })
      scrollBottom(tab.id)
      return
    }
    if (cmd === '/skills') {
      openSkills()
      pushTabMessage(tab, {
        id: nextMsgId(), role: 'system',
        text: t('agent.openingSkills'),
      })
      scrollBottom(tab.id)
      saveHistory()
      return
    }
    if (cmd === '/commands') {
      const localSkills = await window.electronAPI.claudeListLocalSkills?.({
        cwd: activeProject.value?.cwd || undefined,
      })
      const remote = await window.electronAPI.claudeListSlashCommands?.({
        cwd: activeProject.value?.cwd || undefined,
        sessionId: tab.sessionId || undefined,
      })
      /** 与 CLI 一致：同名时优先保留官方命令，避免本地 skill 名叫 memory 时挤掉 /memory */
      const normName = (n) => String(n || '').trim().replace(/^\//, '')
      const all = []
      const seen = new Set()
      for (const c of (remote || [])) {
        const n = normName(c?.name)
        if (!n) continue
        if (n === 'clear') continue
        all.push({ name: n, desc: c.description || '', source: 'command' })
        seen.add(n)
      }
      for (const s of [...(localSkills?.system || []), ...(localSkills?.project || [])]) {
        const n = normName(s?.name)
        if (!n || seen.has(n)) continue
        if (n === 'clear') continue
        all.push({ name: n, desc: s.description || '', source: 'skill' })
        seen.add(n)
      }
      // 加上本地内置命令
      const builtins = [
        { name: 'model', desc: t('slashCmd.modelDesc') },
        { name: 'skills', desc: t('slashCmd.skills') },
        { name: 'commands', desc: t('slashCmd.commandsDesc') },
      ]
      for (const b of builtins) {
        const n = normName(b.name)
        if (seen.has(n)) continue
        all.push({ name: b.name, desc: b.desc, source: 'local' })
        seen.add(n)
      }
      const systemListRows = [{ type: 'title', text: `Commands (${all.length})` }]
      for (const item of all) {
        const n = (item.name || '').trim()
        const cmdStr = n.startsWith('/') ? n : `/${n}`
        systemListRows.push({ type: 'row', cmd: cmdStr, meta: item.source, desc: item.desc || '' })
      }
      if (!all.length) systemListRows.push({ type: 'empty', text: t('agent.noCommands') })
      const lines = systemListRows.map((r) => {
        if (r.type === 'title' || r.type === 'empty') return r.text
        return `  ${r.cmd}  ·  ${r.meta}  ·  ${r.desc}`
      })
      pushTabMessage(tab,{
        id: nextMsgId(), role: 'system',
        text: lines.join('\n'),
        systemListBlock: true,
        systemListRows,
      })
      scrollBottom(tab.id)
      saveHistory()
      return
    }
    if (cmd === '/compact') {
      // compact 完成后重建会话，避免后续继续沿用压缩前超大上下文。
      tab._awaitingCompactResult = true
    }
    inputText.value = text
  }

  // 必须转成普通对象再 IPC：ref 里的项是 Vue Proxy，structured clone 会报"could not be cloned"
  const imgs = pendingImages.value.filter(i => i.isImage).map(({ dataUrl, mediaType }) => ({
    dataUrl,
    mediaType: mediaType || 'image/png',
  }))
  // 读取非图片文件内容，拼接到 prompt
  const filesText = await getFilesText()
  const files = pendingImages.value.filter(i => !i.isImage).map(({ name, size }) => ({ name, size }))
  let promptToSend = text
  if (filesText) {
    promptToSend = [filesText, '', text].join('\n')
  }
  pendingImages.value = []
  if (!Array.isArray(tab.inputHistory)) tab.inputHistory = []
  pushToHistory(text, tab.inputHistory)
  inputText.value = ''
  nextTick(() => { if (inputEl.value) textareaAutosize.resizeNow() })

  const userContent = buildUserContentBlocks(text, imgs, files)
  trimMessages(tab, true)
  pushTabMessage(tab,{
    id: nextMsgId(),
    role: 'user',
    text, // 兼容旧渲染
    content: userContent,
    images: imgs, // 兼容旧逻辑（如后续发送复用）
    files, // 兼容旧逻辑
  })
  // 第一条消息自动作为标题（除非用户已手动重命名）
  if (countVisibleClaudeUserMessages(tab.messages) === 1 && !tab._userRenamed) {
    tab.name = text ? text.slice(0, 24) + (text.length > 24 ? '…' : '') : files.map(f => f.name).join(', ')
  }
  scrollBottom(tab.id)
  tab.metrics = {
    ...buildNewClaudeTurnMetrics(tab),
    sessionId: tab.sessionId,
    model: getClaudeTabModel(tab),
    thinking: true,
  }
  Object.assign(metricsData.value, {
    ...buildNewClaudeTurnMetrics(tab),
    sessionId: tab.sessionId,
    model: getClaudeTabModel(tab),
    thinking: true,
    compacting: !!tab._compacting,
    gitBranch: tab.metrics?.gitBranch || '',
    gitChanges: tab.metrics?.gitChanges || 0,
    usageApiSessionPct: tab.metrics?.usageApiSessionPct ?? null,
  })
  markClaudeTurnStarting(tab)
  // 关键：用户消息入列后立刻落盘，避免”刚聊几句就关掉/重开”导致只有新对话
  saveHistory({ immediate: true })

  if (text && !text.startsWith('/') && tab._carryCompactSummary) {
    const compactPart = [
      '以下是上一会话压缩后的上下文摘要，请作为当前会话背景：',
      tab._carryCompactSummary,
    ].join('\n')
    promptToSend = filesText
      ? [filesText, '', compactPart, '', '用户当前问题：', text].join('\n')
      : [compactPart, '', '用户当前问题：', text].join('\n')
    // 新会话首轮注入一次即可，避免重复占用 token。
    tab._carryCompactSummary = ''
  }

  try {
    const rawPayload = {
      prompt: promptToSend, images: imgs,
      cwd: activeProject.value?.cwd || undefined,
      sessionId: tab.sessionId,
      model: getClaudeTabModel(tab),
      effort: getClaudeTabEffort(tab),
      modelTier: normalizeClaudeModelTier(tab.modelTier) || undefined,
      runMode: tab.runMode || 'edit_automatically',
      sessionInstruction: await loadSessionInstructionForTab(tab),
    }
    const payload = safeIpcPayload(rawPayload, 'claudeAgentQuery')
    await window.electronAPI.claudeAgentQuery(payload)
  } catch (e) {
    markClaudeIdle(tab)
    pushTabMessage(tab,{ id: nextMsgId(), role: 'system', text: t('agent.sendFailed', { message: e.message }) })
    scrollBottom(tab.id)
  }
}

// ─── IPC 消息处理 ────────────────────────────────────────────
// ─── Tool helpers (backed by shared toolMeta.js) ──────────
function isWriteTool(name) {
  const meta = resolveToolMeta(name)
  return meta.group === 'write'
}
function isEditTool(name) {
  const meta = resolveToolMeta(name)
  return meta.group === 'edit'
}
function isBashTool(name) {
  if (!name) return false
  const n = name.toLowerCase()
  return n === 'bash' || n === 'execute' || n === 'run_command'
}
function isReadTool(name) {
  const meta = resolveToolMeta(name)
  return meta.group === 'read'
}

function toolIcon(name) {
  return resolveToolIconKey(name)
}
function toolLabel(name) {
  return resolveToolLabel(name) || name || t('agent.toolLabel')
}

// ─── diff 构建（行级 LCS diff）────────────────────────────────
function inferToolFailureFromText(text) {
  if (!text || typeof text !== 'string') return false
  const s = text.toLowerCase()
  if (s.includes('eacces') || s.includes('eperm')) return true
  if (s.includes('permission denied')) return true
  if (s.includes("haven't granted") || s.includes('尚未授予') || s.includes('未授予')) return true
  if (s.includes('requested permissions')) return true
  if (s.includes('outside the workspace') || s.includes('not allowed to')) return true
  if (s.includes('enoent')) return true
  return false
}

function createToolMessage({
  toolName,
  status = 'running',
  toolUseId = null,
  requestId = null,
  sessionId = null,
  permDesc = '',
  filePath = '',
  bashCmd = '',
  bashCwd = '',
  text = '',
  newContent = '',
  diffLines = [],
  _diffInput = null,
  expanded = false,
} = {}) {
  return {
    id: nextMsgId(),
    role: 'tool',
    toolName: toolName || '',
    status,
    expanded: Boolean(expanded),

    // 关联信息
    toolUseId,
    requestId,
    sessionId,
    permDesc,

    // 展示字段（统一协议）
    filePath: filePath || '',
    bashCmd: bashCmd || '',
    bashCwd: bashCwd || '',
    bashOutput: '',
    readContent: '',
    toolError: '',
    text: text || '',
    newContent: newContent || '',
    diffLines: Array.isArray(diffLines) ? diffLines : [],
    _diffInput,
  }
}



const {
  onAgentMessage,
  onAgentPermission,
  onAgentAskQuestion,
  onAgentDone,
  onEarlyCliSession,
} = useClaudeAgentStream({
  tabs: computed(() => projects.value.flatMap(p => p.chats || [])),
  projects,
  getActiveProjectId: () => activeProjectId.value, isPanelActive,
  scrollBottom: smartScrollToBottom,
  saveHistory,
  nextMsgId,
  isWriteTool,
  isEditTool,
  isBashTool,
  isReadTool,
  inferToolFailureFromText,
  createToolMessage,
  onCompactBoundary(postTokens) {
    const tab = activeTab.value
    const contextWindow = (tab?.metrics?.contextWindow || metricsData.value.contextWindow || 200000)
    if (tab) {
      tab.metrics = {
        ...(tab.metrics || {}),
        contextUsage: postTokens,
        contextWindow,
      }
    }
    metricsData.value.contextUsage = postTokens
    metricsData.value.contextWindow = contextWindow
  },
  onNewMessage: bumpScrollCount,
  trimMessages,
  onPendingApproval: playAskSound,
  onBackgroundTaskDone() {
    // 直推侧边栏通知：绕开 keep-alive 失活时 codeHub 的 watcher 暂停问题
    if (codehubHasNotification) codehubHasNotification.value = true
  },
})

function respondPermission(toolMsg, allowed) {
  if (!toolMsg.requestId) {
    toolMsg.status = 'denied'
    toolMsg.expanded = false
    return
  }
  toolMsg.status = allowed ? 'done' : 'denied'
  toolMsg.expanded = false
  window.electronAPI.claudePermissionResponse({
    sessionId: toolMsg.sessionId,
    requestId: toolMsg.requestId,
    allowed,
  })
}

// AskQuestion 弹窗状态
const askDialogVisible = ref(false)
const askDialogQuestions = ref([])
const askDialogToolMsg = ref(null)
const askDialogRef = ref(null)
const askDialogAnswers = ref({})
// 失活/超时保护
const _hadAskDialogOnDeactivate = ref(false)
const _hadPlanReviewOnDeactivate = ref(false)
let _askTimeout = null
let _planReviewTimeout = null
const ASK_TIMEOUT_MS = 10 * 60 * 1000  // 10 分钟超时自动应答

function parseAskQuestions(msg) {
  try {
    const obj = JSON.parse(msg.text || '{}')
    const questions = Array.isArray(obj?.questions) ? obj.questions : []
    return questions.map(q => ({
      id: q?.id || '',
      prompt: q?.question || q?.prompt || '',
      header: q?.header || '',
      options: Array.isArray(q?.options) ? q.options : [],
    }))
  } catch (_) { return [] }
}

function respondAskQuestion(toolMsg, question, option) {
  if (!toolMsg.requestId) return
  toolMsg.askAnswered = true
  toolMsg.status = 'done'
  askDialogVisible.value = false
  const answers = {}
  answers[question.prompt || question.header || 'q'] = option.label
  window.electronAPI.claudeAskQuestionResponse({
    requestId: toolMsg.requestId,
    answers,
  })
}

function handleAskDialogAnswer(question, option) {
  if (!askDialogToolMsg.value) return
  const key = question.prompt || question.header || 'q'
  askDialogAnswers.value[key] = option.label
  const total = askDialogQuestions.value.length
  const answered = Object.keys(askDialogAnswers.value).length
  if (answered >= total) {
    const toolMsg = askDialogToolMsg.value
    toolMsg.askAnswered = true
    toolMsg.askAnswerText = Object.entries(askDialogAnswers.value).map(([k, v]) => `${k}: ${v}`).join('; ')
    toolMsg.status = 'done'
    askDialogVisible.value = false
    _clearAskTimeout()
    window.electronAPI.claudeAskQuestionResponse({
      requestId: toolMsg.requestId,
      answers: { ...askDialogAnswers.value },
    })
  }
}

function _clearAskTimeout() {
  if (_askTimeout) { clearTimeout(_askTimeout); _askTimeout = null }
}
function _clearPlanReviewTimeout() {
  if (_planReviewTimeout) { clearTimeout(_planReviewTimeout); _planReviewTimeout = null }
}

// 供 ToolAskQuestion 的"回答"按钮调用，通过 provide/inject 传递
function reopenAskDialog(toolMsg) {
  if (!toolMsg || toolMsg.askAnswered) return
  const questions = parseAskQuestions(toolMsg)
  if (questions.length) showAskDialog(toolMsg, questions)
}
provide('reopenAskDialog', reopenAskDialog)

function showAskDialog(toolMsg, questions) {
  askDialogToolMsg.value = toolMsg
  askDialogQuestions.value = questions
  askDialogAnswers.value = {}
  askDialogVisible.value = true
  askDialogRef.value?.reset?.()
  // 10 分钟超时自动应答，防止 Agent 永久挂起
  _clearAskTimeout()
  _askTimeout = setTimeout(() => {
    if (askDialogVisible.value) {
      handleAskDialogClose()
    }
  }, ASK_TIMEOUT_MS)
}

function handleAskDialogClose() {
  // 关闭弹窗：未回答的问题自动选第一个选项
  const questions = askDialogQuestions.value
  for (const q of questions) {
    const key = q.prompt || q.header || 'q'
    if (!askDialogAnswers.value[key]) {
      const firstOpt = q.options?.[0]
      askDialogAnswers.value[key] = firstOpt?.label || ''
    }
  }
  const toolMsg = askDialogToolMsg.value
  if (toolMsg) {
    toolMsg.askAnswered = true
    toolMsg.askAnswerText = Object.entries(askDialogAnswers.value).map(([k, v]) => `${k}: ${v}`).join('; ')
    toolMsg.status = 'done'
    _clearAskTimeout()
    window.electronAPI?.claudeAskQuestionResponse?.({
      requestId: toolMsg.requestId,
      answers: { ...askDialogAnswers.value },
    })
  }
  askDialogVisible.value = false
}

// PlanReview 弹窗状态
const planReviewVisible = ref(false)
const planReviewPlan = ref('')
const planReviewFilePath = ref('')
const planReviewRequestId = ref('')
const planReviewSessionId = ref('')
const planReviewToolMsg = ref(null)

function showPlanReviewDialog(data) {
  planReviewPlan.value = data.plan || ''
  planReviewFilePath.value = data.planFilePath || ''
  planReviewRequestId.value = data.requestId || ''
  planReviewSessionId.value = data.sessionId || ''
  planReviewVisible.value = true
  // 超时保护：10 分钟后自动拒绝计划（默认安全策略），防止 Agent 永久挂起
  _clearPlanReviewTimeout()
  _planReviewTimeout = setTimeout(() => {
    if (planReviewVisible.value) {
      finishPlanReview({ type: 'reject', reason: 'timeout' })
    }
  }, ASK_TIMEOUT_MS)
}

function finishPlanReview(action) {
  _clearPlanReviewTimeout()
  const toolMsg = planReviewToolMsg.value
  if (toolMsg) {
    if (action.type === 'accept') {
      toolMsg.status = 'done'
    } else if (action.type === 'reject') {
      toolMsg.status = 'denied'
    } else if (action.type === 'feedback') {
      toolMsg.status = 'done'
      toolMsg._planFeedback = action.feedback || ''
    }
    toolMsg.expanded = true
  }
  planReviewVisible.value = false
  window.electronAPI.claudePlanReviewResponse({
    requestId: planReviewRequestId.value,
    sessionId: planReviewSessionId.value,
    action,
  })
}

function handlePlanAccept() {
  finishPlanReview({ type: 'accept' })
}

function handlePlanReject() {
  finishPlanReview({ type: 'reject' })
}

function handlePlanFeedback(feedbackText) {
  finishPlanReview({ type: 'feedback', feedback: feedbackText })
}

function onKeydown(e) {
  if (e?.isComposing || isComposing.value) return
  if (mentionSuggestions.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx.value = (mentionIdx.value + 1) % mentionSuggestions.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionIdx.value = (mentionIdx.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length; return }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      applyMention(mentionSuggestions.value[mentionIdx.value])
      return
    }
    if (e.key === 'Escape') {
      clearMentionSuggestions()
      return
    }
  }
  const tab = activeTab.value
  if (tab && !Array.isArray(tab.inputHistory)) tab.inputHistory = []
  if (tab && handleHistoryKeydown(e, inputEl.value, tab.inputHistory, (val) => { inputText.value = val })) return
  onSlashKeydown(e, { onSend: sendMessage })
}

async function checkFirstTimeSetup() {
  try {
    const [env, key, settingsJson] = await Promise.all([
      window.electronAPI?.claudeCheckEnvironment?.(),
      window.electronAPI?.claudeGetKey?.(),
      window.electronAPI?.claudeReadSettingsJson?.(),
    ])
    const missing = []
    if (!env?.claude?.installed) missing.push(t('agent.claudeNotInstalled'))
    // key 可能存在于 app 存储或 settings.json
    const hasKey = (key?.trim()) ||
      settingsJson?.env?.ANTHROPIC_AUTH_TOKEN ||
      settingsJson?.primaryApiKey ||
      settingsJson?.apiKey
    if (!hasKey) missing.push(t('agent.apiKeyNotConfigured'))
    if (!missing.length) return
    const ok = await confirmDialogRef.value?.open({
      message: t('agent.missingItemsDialog', { items: missing.map(m => '• ' + m).join('\n') }),
      okText: t('settings.goToSettings'),
      cancelText: t('settings.later'),
    })
    if (ok) openSettings()
  } catch (_) {}
}

// ─── 生命周期 ────────────────────────────────────────────────
// keep-alive 失活时关闭弹窗但不自动应答（保留 pending 状态）
// 用户回来时看到蓝色 pending-dot + 消息卡"等待回答中"，手动点击"回答"按钮重新打开
onDeactivated(() => {
  if (askDialogVisible.value) {
    _hadAskDialogOnDeactivate.value = true
    askDialogVisible.value = false
  }
  if (planReviewVisible.value) {
    _hadPlanReviewOnDeactivate.value = true
    planReviewVisible.value = false
  }
})

onActivated(() => {
  _hadAskDialogOnDeactivate.value = false
  _hadPlanReviewOnDeactivate.value = false
  // 不自动恢复弹窗：用户通过蓝色 pending-dot + 消息感知，手动点击"回答"按钮打开
  // 恢复后滚动到底部：keep-alive 恢复时 ResizeObserver 不触发，需手动滚到底
  nextTick(() => scrollToBottomActive(true))
})

onMounted(() => {
  // ─── 性能检测：首次进入页面 ───
  // 关键路径：立即注册监听器和基础初始化，不阻塞首屏渲染
  window.addEventListener('beforeunload', persistActiveInputDraft)
  window.addEventListener('beforeunload', flushHistoryOnUnload)
  window.electronAPI.onClaudeAgentMessage(onAgentMessage)
  window.electronAPI.onClaudeAgentDone(onAgentDone)
  window.electronAPI.onClaudeAgentPermission(onAgentPermission)
  window.electronAPI.onClaudeAgentEarlyCliSession?.(onEarlyCliSession)
  window.electronAPI.onClaudeAgentAskQuestion?.((data) => {
    playAskSound()
    onAgentAskQuestion(data)
    nextTick(() => {
      const tab = projects.value.flatMap(p => p.chats || []).find(c => c.sessionId === data.sessionId)
      if (!tab) return
      const lastMsg = tab.messages[tab.messages.length - 1]
      if (lastMsg && lastMsg.toolName === 'AskUserQuestion' && lastMsg.requestId) {
        const questions = parseAskQuestions(lastMsg)
        showAskDialog(lastMsg, questions)
      }
    })
  })
  window.electronAPI.onClaudeAgentPlanReview?.((data) => {
    playAskSound()
    const tab = projects.value.flatMap(p => p.chats || []).find(c => c.sessionId === data.sessionId)
    if (!tab) return
    markClaudeStreamActivity(tab, data)
    const toolMsg = createToolMessage({
      toolName: data.toolName || 'exitplanmode',
      status: 'pending',
      toolUseId: null,
      requestId: data.requestId,
      sessionId: data.sessionId,
      permDesc: '',
      filePath: '',
      bashCmd: '',
      text: JSON.stringify(data.input || { plan: data.plan, planFilePath: data.planFilePath }, null, 2),
      newContent: '',
      diffLines: [],
      expanded: true,
    })
    tab.messages.push(toolMsg)
    touchChatUpdatedAt(tab)
    onNewMessage?.()
    planReviewToolMsg.value = toolMsg
    showPlanReviewDialog(data)
    scrollBottom(tab.id)
  })
  window.electronAPI.onClaudeAgentMetrics?.(onMetricsUpdate)
  _unregAgentEvent = window.electronAPI.onAgentEvent((event) => {
    const { shouldPlay } = shouldPlayNotificationSound(event)
    if (shouldPlay) playDoneSound()
  })
  loadClaudeModelDefaults()
  // 默认模型初始化（非阻塞）
  window.electronAPI.claudeGetModel?.().then(m => {
    if (m) claudeDefaultModel.value = String(m || '').trim()
    if (m && !metricsData.value.model) metricsData.value.model = m
  })
  refreshSlashCommands(false)

  // 非关键路径：历史加载、环境检查等推迟到首屏渲染后
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => initNonCritical())
  } else {
    setTimeout(() => initNonCritical(), 0)
  }

})

function initNonCritical() {
  const t0 = performance.now()
  // 历史加载不阻塞首屏
  loadHistory().then(restored => {
    if (!restored) {
      if (!embedded) newProject()  // 独立模式才自动创建空项目
    }
    else {
      const restoredSelection = resolveClaudeHistorySelection(
        projects.value,
        activeProjectId.value,
        activeChatId.value,
      )
      activeProjectId.value = restoredSelection.activeProjectId
      if (restoredSelection.activeProject) {
        const targetProject = projects.value.find(project => project.id === restoredSelection.activeProject.id)
        if (targetProject) targetProject.chats = restoredSelection.activeProject.chats
      }
      activeChatId.value = restoredSelection.activeChatId
      const sessionMap = {}
      for (const c of projects.value.flatMap(pp => pp.chats || [])) {
        const chatKey = getClaudeChatKey(c)
        const cliSessionId = getClaudeCliSessionId(c)
        if (chatKey && cliSessionId) sessionMap[chatKey] = cliSessionId
      }
      if (Object.keys(sessionMap).length) window.electronAPI?.claudeRegisterCliSessions?.(sessionMap)
      nextTick(() => scrollBottom())
    }
    isReady.value = true
    // 历史加载完成后，后台扫描锁定项目
    for (const p of projects.value) {
      if (!p?.cwdLocked || !p?.cwd) continue
      void refreshProjectSessionsInBackground(p)
    }
    initializing.value = false
  }).catch(() => {
    // 加载失败时创建新项目（仅独立模式）
    if (!embedded && !projects.value.length) newProject()
    isReady.value = true
    initializing.value = false
  })

  checkFirstTimeSetup()
}

// --- expose for codeHub unified tabs ---
defineExpose({
  // Phase 2: 复用统一 projectTabSummaries，不再重复扫描 chats/messages
  projectTabData: projectTabSummaries,
  activeProjectId,
  createProject() { newProject(); return activeProjectId.value },
  switchProject,
  deleteProject(id) { const p = projects.value.find(x => x.id === id); if (p) requestDeleteProject(p) },
  refreshSessions() { handleRefreshSessions() },
  ready: isReady,
})

onUnmounted(() => {
  if (mentionRefreshTimer) {
    clearTimeout(mentionRefreshTimer)
    mentionRefreshTimer = null
  }
  if (historyTopObserver) {
    historyTopObserver.disconnect()
    historyTopObserver = null
  }
  if (loadMoreCooldownTimer) { clearTimeout(loadMoreCooldownTimer); loadMoreCooldownTimer = null }
  _clearAskTimeout()
  _clearPlanReviewTimeout()
  window.removeEventListener('beforeunload', persistActiveInputDraft)
  window.removeEventListener('beforeunload', flushHistoryOnUnload)
  void persistActiveInputDraft()
  flushHistoryOnUnload()
  sessionDraft.dispose()
  disposeImageAttachments()
  _unregAgentEvent?.()
  window.electronAPI.offClaudeAgentListeners?.()
})
</script>

<style>
/* 滚动条统一样式 — 作用域限定在 .cc-wrap 内 */
.cc-wrap {
  --scrollbar-size: 6px;
  --scrollbar-radius: 4px;
  --scrollbar-track: transparent;
  --scrollbar-thumb: var(--cc-scrollbar-thumb);
  --scrollbar-thumb-hover: var(--cc-scrollbar-thumb-hover);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.cc-wrap *{
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.cc-wrap ::-webkit-scrollbar{
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
  background-color: transparent;
}
.cc-wrap ::-webkit-scrollbar-track{
  background: var(--scrollbar-track);
}
.cc-wrap ::-webkit-scrollbar-thumb{
  background: var(--scrollbar-thumb);
  border-radius: var(--scrollbar-radius);
}
.cc-wrap ::-webkit-scrollbar-thumb:hover{
  background: var(--scrollbar-thumb-hover);
}
/* Teleport 出去的弹窗也需要滚动条样式 */
[class*="cc-theme-"] ::-webkit-scrollbar{
  width: 6px; height: 6px; background-color: transparent;
}
[class*="cc-theme-"] ::-webkit-scrollbar-track{ background: transparent; }
[class*="cc-theme-"] ::-webkit-scrollbar-thumb{
  background: var(--cc-scrollbar-thumb); border-radius: 4px;
}
[class*="cc-theme-"] ::-webkit-scrollbar-thumb:hover{
  background: var(--cc-scrollbar-thumb-hover);
}

.cc-wrap {
  display: flex; flex-direction: column; width: 100%; height: 100%;
  background: var(--cc-bg); color: var(--cc-text); overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;
}

/* ── 内容区域（侧边栏 + 主区域）─ */
.cc-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
.cc-sidebar-wrapper {
  width: 260px;
  flex-shrink: 0;
  height: 100%;
}

/* ── 主区域 ── */
.cc-main {
  flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; position: relative;
}
.cc-init-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--cc-bg) 86%, transparent);
  backdrop-filter: blur(6px);
}
.cc-init-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 280px;
  max-width: 360px;
  padding: 22px 24px;
  border: 1px solid var(--cc-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--cc-bg-secondary) 92%, transparent);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
}
.cc-init-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--cc-border) 75%, transparent);
  border-top-color: var(--cc-primary);
  animation: cc-init-spin var(--mc-loading-spinner-duration) linear infinite;
}
.cc-init-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--cc-text);
}
.cc-init-sub {
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--cc-text-muted);
}
@keyframes cc-init-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 首次连接：禁止切换侧边栏/目录；消息区仍可滚动与处理工具权限 */
.cc-wrap.cc-first-query-lock :deep(.cc-sidebar),
.cc-wrap.cc-first-query-lock :deep(.cc-toolbar) {
  pointer-events: none;
  opacity: 0.52;
  user-select: none;
  filter: saturate(0.7);
  overflow: hidden;
}

/* 消息滚动容器 */
.cc-messages-area {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

/* ── 消息区 ── */
.cc-messages-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
  background: var(--cc-bg);
  display: flex;
  flex-direction: column;
}
/* 任务追踪面板：固定在消息区顶部 */
.tracking-panel-sticky {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}
.cc-messages {
  position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; padding: 12px 0 8px;
}
.cc-messages-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  user-select: none;
}
.cc-messages-placeholder-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 280px;
  text-align: center;
}
.cc-ph-icon { font-size: 28px; color: var(--cc-primary); opacity: 0.45; }
.cc-ph-title { font-size: 14px; font-weight: 600; color: var(--cc-ph-title); }
.cc-ph-sub { margin: 0; font-size: 12px; line-height: 1.5; color: var(--cc-ph-sub); }
.cc-browse-btn {
  display: flex; align-items: center; gap: 10px;
  margin-top: 16px; padding: 14px 32px;
  background: var(--cc-primary); color: var(--cc-btn-primary-text);
  border: none; border-radius: 10px;
  font-size: 16px; font-weight: 700;
  cursor: pointer; pointer-events: auto;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
.cc-browse-btn:hover {
  background: var(--cc-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 18px rgba(0,0,0,0.22);
}
.cc-browse-btn svg { flex-shrink: 0; opacity: 0.9; }

/* ── 输入区 ── */
.cc-input-area {
  padding: 8px 10px 10px;
  flex-shrink: 0;
  background: var(--cc-bg);
  border-top: 1px solid var(--cc-border-light);
  position: relative;
  width: 100%;
  box-sizing: border-box;
  max-height: none;
}
.input-box {
  display: flex; align-items: flex-end; gap: 5px;
  background: var(--cc-bg-secondary); border: 1px solid var(--cc-border); border-radius: 10px;
  padding: 6px 6px 6px 11px; transition: border-color 0.15s;
  min-height: 26px;
  margin-bottom: 4px;
  max-height: 200px;
  flex: none;
}
.input-box:focus-within {
  border-color: var(--cc-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cc-primary) 22%, transparent);
}
.cc-textarea:focus { box-shadow: none !important; }
.input-box.disabled { border-color: var(--cc-border); }
.input-box.disabled .cc-textarea,
.input-box.disabled .attach-btn {
  opacity: 0.42;
  pointer-events: none;
}
.cc-textarea {
  flex: 1; background: none; border: none; outline: none;
  color: var(--cc-text); font-size: 13px; line-height: 1.5; resize: none;
  min-height: 22px; max-height: 160px; font-family: inherit; padding: 0;
}
.cc-textarea::placeholder { color: var(--cc-text-placeholder); }
.input-actions { display: flex; align-items: flex-end; gap: 3px; }
.attach-btn {
  width: 27px; height: 27px; border-radius: 6px; background: none; border: none;
  color: var(--cc-icon-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: color 0.12s;
}
.attach-btn:hover:not(:disabled) { color: var(--cc-primary); }
.attach-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.send-btn {
  width: 28px; height: 28px; border-radius: 6px; background: var(--cc-primary); border: none;
  color: var(--cc-btn-primary-text); cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.12s;
}
.send-btn:disabled { background: var(--cc-btn-disabled-bg); color: var(--cc-btn-disabled-text); cursor: default; }
.send-btn:not(:disabled):hover { background: var(--cc-primary-hover); }
/* 中断：勿放在 .input-box.disabled 的降透明度子元素里，单独高对比样式 */
.abort-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--cc-primary);
  border: none;
  color: var(--cc-btn-primary-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s, transform 0.08s;
}
.abort-btn:hover { background: var(--cc-primary-hover); }
.abort-btn:active { transform: scale(0.96); }

/* ── 拖拽遮罩 ── */
.drop-mask {
  position: fixed; inset: 0; background: var(--cc-drop-mask-bg);
  border: 2px dashed var(--cc-primary); z-index: 100;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; color: var(--cc-primary); pointer-events: none;
}

/* 统一覆盖 highlight.js 默认主题 */
.cc-wrap .hljs {
  background: transparent !important;
  color: var(--cc-hljs-text) !important;
}
.cc-wrap .hljs-keyword { color: var(--cc-hljs-keyword) !important; }
.cc-wrap .hljs-built_in { color: var(--cc-hljs-built-in) !important; }
.cc-wrap .hljs-string { color: var(--cc-hljs-string) !important; }
.cc-wrap .hljs-number { color: var(--cc-hljs-number) !important; }
.cc-wrap .hljs-comment { color: var(--cc-hljs-comment) !important; font-style: italic; }
.cc-wrap .hljs-function { color: var(--cc-hljs-function) !important; }
.cc-wrap .hljs-title { color: var(--cc-hljs-function) !important; }
.cc-wrap .hljs-params { color: var(--cc-hljs-params) !important; }
.cc-wrap .hljs-variable { color: var(--cc-hljs-params) !important; }
.cc-wrap .hljs-attr { color: var(--cc-hljs-params) !important; }
.cc-wrap .hljs-name { color: var(--cc-hljs-type) !important; }
.cc-wrap .hljs-tag { color: var(--cc-hljs-tag) !important; }
.cc-wrap .hljs-type { color: var(--cc-hljs-type) !important; }
.cc-wrap .hljs-literal { color: var(--cc-hljs-tag) !important; }
.cc-wrap .hljs-operator { color: var(--cc-hljs-operator) !important; }
.cc-wrap .hljs-punctuation { color: var(--cc-hljs-operator) !important; }

/* Teleport 弹窗中的 hljs 高亮 */
[class*="cc-theme-"] .hljs-keyword { color: var(--cc-hljs-keyword) !important; }
[class*="cc-theme-"] .hljs-built_in { color: var(--cc-hljs-built-in) !important; }
[class*="cc-theme-"] .hljs-string { color: var(--cc-hljs-string) !important; }
[class*="cc-theme-"] .hljs-number { color: var(--cc-hljs-number) !important; }
[class*="cc-theme-"] .hljs-comment { color: var(--cc-hljs-comment) !important; font-style: italic; }
[class*="cc-theme-"] .hljs-function { color: var(--cc-hljs-function) !important; }
[class*="cc-theme-"] .hljs-title { color: var(--cc-hljs-function) !important; }
[class*="cc-theme-"] .hljs-params { color: var(--cc-hljs-params) !important; }
[class*="cc-theme-"] .hljs-variable { color: var(--cc-hljs-params) !important; }
[class*="cc-theme-"] .hljs-attr { color: var(--cc-hljs-params) !important; }
[class*="cc-theme-"] .hljs-name { color: var(--cc-hljs-type) !important; }
[class*="cc-theme-"] .hljs-tag { color: var(--cc-hljs-tag) !important; }
[class*="cc-theme-"] .hljs-type { color: var(--cc-hljs-type) !important; }
[class*="cc-theme-"] .hljs-literal { color: var(--cc-hljs-tag) !important; }
[class*="cc-theme-"] .hljs-operator { color: var(--cc-hljs-operator) !important; }
[class*="cc-theme-"] .hljs-punctuation { color: var(--cc-hljs-operator) !important; }
</style>
