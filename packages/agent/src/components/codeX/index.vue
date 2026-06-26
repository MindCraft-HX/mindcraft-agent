<template>
  <div
    class="cc-wrap"
    :class="[themeClass, { 'cc-first-query-lock': firstAwaitingAssistant }]"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <ProjectTabs
      v-if="!embedded"
      :projects="projectTabs"
      :activeProjectId="activeProjectId"
      @switchProject="switchProject"
      @deleteProject="requestDeleteProject"
      @newProject="newProject"
      @closeAll="closeAllProjects"
      @reorderProjects="reorderProjects"
    />

    <div class="cc-content">
      <HistorySidebar
        :sessions="activeProject?.chats || []"
        :activeId="activeChatId"
        v-model:sidebarOpen="sidebarOpen"
        :newChatDisabled="!activeProject?.cwdLocked"
        :loading="sidebarLoading"
        :refreshing="sidebarRefreshing"
        :project-cwd="activeProject?.cwd || ''"
        :project-additional-dirs="activeProject?.additionalDirectories || []"
        @switchTab="switchChat"
        @requestDelete="requestDeleteChat"
        @openSettings="openSettings"
        @newChat="newChat"
        @refresh="handleRefreshSessions"
        @rename="handleRenameChat"
        @addDirectory="addProjectDirectory"
        @removeDirectory="removeProjectDirectory"
      />

      <div class="cc-main">
        <div v-if="initializing" class="cc-init-overlay">
          <div class="cc-init-card">
            <div class="cc-init-spinner"></div>
            <div class="cc-init-title">{{ $t('agent.restoringSession') }}</div>
            <div class="cc-init-sub">{{ $t('agent.restoringSessionHint') }}</div>
          </div>
        </div>
        <APISetting ref="apiSettingRef" @providerActivated="handleProviderActivated"></APISetting>
        <ManagePlugins ref="codexPluginsRef" api-prefix="codexPlugins" />
        <ManageSkills ref="codexSkillsRef" api-prefix="codexSkills" :cwd="activeProject?.cwd || ''" />

        <CodexToolbar
          :cwd="activeProject?.cwd || ''"
          :locked="firstAwaitingAssistant || Boolean(activeProject?.cwdLocked)"
          @select-dir="() => selectDir(activeProject)"
          @switch-agent="switchToClaude"
        />

        <div class="cc-messages-wrap">
        <div class="cc-messages-area">
          <template v-for="t in activeTab ? [activeTab] : []" :key="t.id">
            <div
              v-if="!isActiveTabHistoryDeferred"
              class="cc-messages cc-messages-body"
              :ref="el => setMsgRef(t.id, el)"
              @scroll.passive="onMessagesScroll"
              @wheel.passive="onMessagesWheel"
            >
              <MessageList
                :tab="t"
                :project-cwd="activeProject?.cwd || ''"
                :currentPlanOverview="currentPlanOverview"
                :firstAwaitingAssistant="firstAwaitingAssistant"
                :setHistoryTopSentinelRef="setHistoryTopSentinelRef"
                :toolIcon="toolIcon"
                :toolLabel="toolLabel"
                :isWriteTool="isWriteTool"
                :isEditTool="isEditTool"
                :isBashTool="isBashTool"
                :isReadTool="isReadTool"
                @openImage="openImageLightbox"
                @jumpToMessage="jumpToMessage"
                @dismissPlanOverview="dismissPlanOverview"
              />
            </div>
          </template>
          <ScrollToPrevMsg :show="showScrollPrevBtn" @scroll-prev="handleScrollPrev" />
          <ScrollToBottom :show="showScrollBottomBtn" :newMsgCount="newMsgCount" @scroll="handleScrollBottom" />

          <div v-if="isActiveTabHistoryDeferred" class="cc-messages cc-messages-placeholder">
            <div class="cc-messages-placeholder-inner">
              <div class="cc-ph-icon mindcraft-flow-win-iconfont icon-mindcraft-codex1"></div>
              <div class="cc-ph-title">{{ $t('agent.safeMode') }}</div>
              <p class="cc-ph-sub">{{ $t('agent.safeModeHint') }}</p>
              <p class="cc-ph-sub cc-ph-sub-quiet">{{ deferredHistoryHint }}</p>
              <div class="cc-ph-actions">
                <button class="cc-browse-btn" type="button" @click="loadDeferredHistory(activeTab)">
                  {{ $t('agent.loadHistory') }}
                </button>
                <button class="cc-secondary-btn" type="button" @click="newChat">
                  {{ $t('chat.newChat') }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="!activeTab" class="cc-messages cc-messages-placeholder">
            <div class="cc-messages-placeholder-inner">
              <div class="cc-ph-icon mindcraft-flow-win-iconfont icon-mindcraft-codex1"></div>
              <div class="cc-ph-title">Codex</div>
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
        </div>
        </div>

        <ImageAttachmentBar :images="pendingImages" @preview="openImageLightbox" @remove="(idx) => removeAt(idx)" />

        <div class="cc-input-area">
          <SlashPopup
            v-if="slashSuggestions.length || (inputText === '/' && slashModelName)"
            :showModelGroup="inputText === '/'"
            :modelName="slashModelName"
            :effortLevel="slashEffortLevel"
            :suggestions="slashSuggestions"
            :activeIdx="slashIdx"
            @openModelPicker="openModelPicker"
            @setEffortLevel="setSlashEffortLevel"
            @applySlash="applySlash"
          />
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
              :placeholder="!activeProject?.cwdLocked ? $t('agent.selectFolderFirst') : (!activeTab ? $t('agent.selectOrNewChat') : (activeTab.thinking ? $t('agent.queueMsg') : $t('agent.sendMsgCodex')))"
              :disabled="!activeProject?.cwdLocked || !activeTab || isActiveTabHistoryDeferred"
              @keydown="onKeydown"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd"
              @input="onInputChange"
              @paste="onPaste($event)"
              rows="1"
            ></textarea>
            <div class="input-actions">
              <button v-if="activeTab?.thinking" type="button" class="abort-btn" @click="abortSession" :title="$t('agent.abortShort')">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5h6A1.5 1.5 0 0112.5 5v6a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 11V5A1.5 1.5 0 015 3.5z"/></svg>
              </button>
              <button class="send-btn" :disabled="!canSend" :title="isCodexTurnLocked(activeTab) ? $t('agent.queueSend') : $t('chat.sendShort')" @click="sendMessage">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M15.964.686a.5.5 0 00-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 00-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 00.886-.083l6-15Zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 00-.154-.154l-.338-.215 7.494-7.494 1.178-.471-.47 1.178z"/></svg>
              </button>
            </div>
          </div>
          <InputToolbar
            :disabled="!activeProject?.cwdLocked || !activeTab || isActiveTabHistoryDeferred"
            :network-access="activeTab?.networkAccessEnabled ?? codexConfigStore.defaultNetworkAccess"
            :web-search="activeTab?.webSearchMode ?? codexConfigStore.defaultWebSearch"
            :sandbox-mode="activeTab?.sandboxMode ?? codexConfigStore.sandboxMode"
            :instruction-enabled="activeSessionInstructionEnabled"
            @addFile="addImageClick"
            @triggerMention="triggerMention"
            @triggerSlash="triggerSlashMenu"
            @openPlugins="() => codexPluginsRef?.open?.()"
            @openSkills="() => codexSkillsRef?.open?.()"
            @openInstruction="openSessionInstruction"
            @toggleInstruction="setActiveSessionInstructionEnabled"
            @update:networkAccess="setSessionNetworkAccess"
            @update:webSearch="setSessionWebSearch"
            @update:sandboxMode="setSessionSandbox"
          />
          <input ref="fileInputRef" type="file" multiple style="display:none" @change="onFileSelect" />
        </div>

        <div v-if="dragging" class="drop-mask">{{ $t('agent.dragFile') }}</div>
        <ImageLightbox :src="imageLightboxSrc" @close="closeImageLightbox" />
        <StatusBarMetrics :metrics="metricsData" :liveDurationMs="metricsLiveDurationMs" :compacting="metricsData.compacting" @send-message="sendFromStatusBar" />
        <ConfirmDialog ref="confirmDialogRef" />
        <SelectModel ref="selectModelRef" />
        <SessionInstructionDialog ref="sessionInstructionRef" :theme-class="themeClass" @saved="refreshActiveSessionInstructionState" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, nextTick, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Conf } from 'electron-conf/renderer'
import { ElMessage } from 'element-plus'


defineOptions({ name: 'codex' })
const embedded = inject('codehubEmbedded', false)
const openSharedSettings = inject('codehubOpenSharedSettings', null)
const codehubActiveAgent = inject('codehubActiveAgent', null)
const isPanelActive = computed(() => !codehubActiveAgent || codehubActiveAgent.value === 'codex')
const isReady = ref(false)

// Codex 前端 debug 输出开关（需要查看详细日志时改为 true）
const CODEX_DEBUG = false

// Codex UI components
import ProjectTabs from './components/ProjectTabs.vue'
import InputToolbar from './components/InputToolbar.vue'
import ConfirmDialog from '../agentCommon/components/ConfirmDialog.vue'
import APISetting from './components/APISetting.vue'
import HistorySidebar from './components/HistorySidebar.vue'
import CodexToolbar from './components/CodexToolbar.vue'
import ManagePlugins from '../claudeCode/components/ManagePlugins.vue'
import ManageSkills from '../claudeCode/components/ManageSkills.vue'
import MentionPopup from './components/MentionPopup.vue'
import SlashPopup from './components/SlashPopup.vue'
import SelectModel from './components/SelectModel.vue'
import SessionInstructionDialog from '../agentCommon/components/SessionInstructionDialog.vue'
import ImageAttachmentBar from '../agentCommon/components/ImageAttachmentBar.vue'
import ImageLightbox from '../agentCommon/components/ImageLightbox.vue'
import MessageList from './components/messages/MessageList.vue'
import StatusBarMetrics from './components/StatusBarMetrics.vue'
import ScrollToBottom from '../agentCommon/components/ScrollToBottom.vue'
import ScrollToPrevMsg from '../agentCommon/components/ScrollToPrevMsg.vue'

// Codex-specific composables
import { useCodexAgentStream } from './composables/useCodexAgentStream.js'
import { useCodexTabs } from './composables/useCodexTabs.js'
import { useCodexHistory } from './composables/useCodexHistory.js'
import { useSessionRefresh } from '../agentCommon/composables/useSessionRefresh'
import { buildHistoryLoadGuard } from './utils/historyLoadSafety.mjs'
import { canFlushQueuedInputTarget, resolveQueuedInputFlushTarget, shouldQueueRejectedCodexInput, shouldRetryRejectedCodexInput } from './utils/queuedInputFlush.mjs'
import {
  applyCodexMetrics,
  markCodexAborted,
  markCodexAbortRequested,
  markCodexIdle,
  markCodexQueued,
  markCodexTurnAccepted,
  markCodexTurnStarting,
  isCodexTurnLocked,
  mergeScannedChatsPreservingRuntime,
  shouldHydrateHistoryFromDisk,
} from './utils/codexRuntimeState.mjs'
import {
  isCodeXEditToolName,
  isCodeXReadToolName,
  isCodeXWriteToolName,
} from './utils/toolNameMatchers.mjs'

// Shared composables
import { useScrollBottom } from '../agentCommon/composables/useScrollBottom.js'
import { useImageAttachments } from '../agentCommon/composables/useImageAttachments.js'
import { findLatestActiveUpdatePlan } from './components/messages/tools/updatePlanOverview.mjs'
import {
  resolvePlanOverviewDismissedState,
  shouldRenderPlanOverviewForTurn,
  shouldRenderPlanOverview,
} from './components/messages/tools/currentPlanOverviewState.mjs'
import { mergeCodexMetrics } from './utils/codexMetricsMerge.mjs'
import { useClaudeThemeStore } from '../../stores/claudeTheme.js'
import { useCodexConfigStore } from '../../stores/codexConfig.js'
import { countVisibleCodexUserMessages, isVisibleCodexUserMessage } from './utils/visibleUserMessages.mjs'
import { resolveToolMeta, resolveToolLabel, resolveToolIconKey } from '../agentCommon/tools/toolMeta.js'
import { safeIpcPayload, stripSystemContextTags as stripSystemContextTagsShared } from '../agentCommon/utils/helpers.js'
import { playDoneSound } from '../agentCommon/utils/playDoneSound.js'
import { shouldPlayNotificationSound } from '../agentCommon/runtime/agentNotificationGate.mjs'
import { isValidSandboxMode, migrateSandboxValue } from '../agentCommon/utils/sandboxHelpers.js'
import { normalizeCodexReasoningEffort } from './utils/providerToml.mjs'
import { buildCodexModelSlots } from './utils/modelSlots.mjs'

const themeStore = useClaudeThemeStore()
const codexConfigStore = useCodexConfigStore()
const themeClass = computed(() => `cc-theme-${themeStore.theme}`)
const router = useRouter()
const { t } = useI18n()
const codexSafeModeEnabled = ref(false)
const codexDefaultModel = ref('')
const codexDefaultReasoningEffort = ref('')

async function loadCodexModelDefaults() {
  try {
    const [model, effort] = await Promise.all([
      window.electronAPI?.codexGetModel?.() || Promise.resolve(''),
      window.electronAPI?.codexGetReasoningEffort?.() || Promise.resolve(''),
    ])
    codexDefaultModel.value = String(model || '').trim()
    codexDefaultReasoningEffort.value = normalizeCodexReasoningEffort(effort) || ''
  } catch (_) {
    codexDefaultModel.value = ''
    codexDefaultReasoningEffort.value = ''
  }
}

async function loadGlobalCodexSafeMode() {
  try {
    const conf = new Conf()
    const value = await conf.get('codexSafeModeEnabled')
    codexSafeModeEnabled.value = typeof value === 'boolean' ? value : false
  } catch (_) {
    codexSafeModeEnabled.value = false
  }
}

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

const codehubSwitchToAgent = inject('codehubSwitchToAgent', null)
const initializing = ref(true)

function switchToClaude() {
  if (codehubSwitchToAgent) {
    codehubSwitchToAgent('claudeCode')
  } else {
    router.push('/main/claudeCode')
  }
}

/** 会话级：切换网络访问 */
function setSessionNetworkAccess(val) {
  const tab = activeTab.value
  if (!tab) return
  tab.networkAccessEnabled = !!val
}

/** 会话级：切换网页搜索 */
function setSessionWebSearch(mode) {
  const tab = activeTab.value
  if (!tab) return
  tab.webSearchMode = mode
}

/** 会话级：切换 sandbox 文件权限（下个 turn 自动生效，立即落盘防止重启丢失） */
function setSessionSandbox(mode) {
  const tab = activeTab.value
  if (!tab || !isValidSandboxMode(mode)) return
  // workspace-write 因单向 stdin 架构无法处理审批，暂不可用
  if (mode === 'workspace-write') return
  tab.sandboxMode = mode
  saveHistory()
}

/** 项目级：更新额外目录 */
async function setProjectAdditionalDirs(dirs) {
  const project = activeProject.value
  if (!project?.cwd) return
  project.additionalDirectories = [...dirs]
  await window.electronAPI?.codexSetProjectSettings?.(project.cwd, {
    additionalDirectories: project.additionalDirectories,
  })
}

/** 添加额外目录 */
async function addProjectDirectory() {
  const project = activeProject.value
  if (!project?.cwd) return
  try {
    const dir = await window.electronAPI?.codexSelectDirectory?.()
    if (!dir) return
    const dirs = [...(project.additionalDirectories || []), dir]
    await setProjectAdditionalDirs(dirs)
  } catch (_) {}
}

/** 移除额外目录 */
async function removeProjectDirectory(index) {
  const project = activeProject.value
  if (!project?.cwd) return
  const dirs = [...(project.additionalDirectories || [])]
  dirs.splice(index, 1)
  await setProjectAdditionalDirs(dirs)
}

/** 从 IPC 加载项目设置并应用到当前项目 */
async function loadProjectSettings(project) {
  if (!project?.cwd || !window.electronAPI?.codexGetProjectSettings) return
  try {
    const settings = await window.electronAPI.codexGetProjectSettings(project.cwd)
    if (!settings) return
    if (settings.additionalDirectories?.length) project.additionalDirectories = settings.additionalDirectories
  } catch (_) {}
}

const MAX_MESSAGES = 60
let projectCounter = 0
let chatCounter = 0
let msgId = 0

const nextMsgId = () => ++msgId
function touchChatUpdatedAt(tab) {
  if (tab) tab.updatedAt = Date.now()
}

function pushTabMessage(tab, msg) {
  if (!tab) return
  tab.messages.push(msg)
  touchChatUpdatedAt(tab)
  bumpScrollCount()
}
const nextProjectId = () => `proj-${++projectCounter}`
const nextChatId = () => `chat-${++chatCounter}`
const nextTabId = () => nextChatId()

// ── Slash 命令 prompt 模板（精确复刻 CodeX CLI 源码）──
// 来源: codex-rs/tui/prompt_for_init_command.md
const INIT_PROMPT = `Generate a file named AGENTS.md that serves as a contributor guide for this repository.
Your goal is to produce a clear, concise, and well-structured document with descriptive headings and actionable explanations for each section.
Follow the outline below, but adapt as needed — add sections if relevant, and omit those that do not apply to this project.

Document Requirements

- Title the document "Repository Guidelines".
- Use Markdown headings (#, ##, etc.) for structure.
- Keep the document concise. 200-400 words is optimal.
- Keep explanations short, direct, and specific to this repository.
- Provide examples where helpful (commands, directory paths, naming patterns).
- Maintain a professional, instructional tone.

Recommended Sections

Project Structure & Module Organization

- Outline the project structure, including where the source code, tests, and assets are located.

Build, Test, and Development Commands

- List key commands for building, testing, and running locally (e.g., npm test, make build).
- Briefly explain what each command does.

Coding Style & Naming Conventions

- Specify indentation rules, language-specific style preferences, and naming patterns.
- Include any formatting or linting tools used.

Testing Guidelines

- Identify testing frameworks and coverage requirements.
- State test naming conventions and how to run tests.

Commit & Pull Request Guidelines

- Summarize commit message conventions found in the project's Git history.
- Outline pull request requirements (descriptions, linked issues, screenshots, etc.)

(Optional) Add other sections if relevant, such as Security & Configuration Tips, Architecture Overview, or Agent-Specific Instructions.`

// 来源: codex-rs/collaboration-mode-templates/templates/plan.md (精简)
const PLAN_MODE_INSTRUCTIONS = `# Plan Mode

You work in 3 phases, and you should *chat your way* to a great plan before finalizing it.
You are in **Plan Mode** until explicitly told to exit.

## Execution rules
- **Allowed**: reading files, searching, static analysis, dry-run commands, tests/builds that write to caches but not repo files
- **Not allowed**: editing/writing files, applying patches, running formatters that rewrite files, any action that "does the work" rather than "plans the work"

## PHASE 1 — Ground in the environment
Explore first, ask second. Eliminate unknowns through inspection before asking the user. Silent exploration between turns is encouraged.

## PHASE 2 — Intent chat
Keep asking until you can clearly state: goal + success criteria, audience, in/out of scope, constraints, current state, and key tradeoffs.

## PHASE 3 — Implementation chat
Once intent is stable, keep asking until the spec is decision complete: approach, interfaces, data flow, edge cases, testing, rollout.

## Finalization
Only output the final plan when it is decision complete. Wrap it in <proposed_plan>...</proposed_plan> tags.

## Asking questions
Prefer using request_user_input tool for multiple-choice questions. Only ask questions that materially change the plan or choose between meaningful tradeoffs.`

// 来源: codex-rs/core/src/review_prompts.rs
const REVIEW_PROMPT_UNCOMMITTED = 'Review the current code changes (staged, unstaged, and untracked files) and provide prioritized findings.'

const projects = ref([])
const activeProjectId = ref(null)
const activeChatId = ref(null)
const inputText = ref('')
const inputEl = ref(null)
const isComposing = ref(false)
const mentionSuggestions = ref([])
const mentionIdx = ref(0)
let mentionReqSeq = 0
let mentionRefreshTimer = null
const mentionFlatMode = ref(false)
const allFilesCache = ref(null)  // null=未加载, []=空
let allFilesCacheTime = 0
const ALL_FILES_CACHE_TTL = 30000  // 30 秒过期
const MENTION_REFRESH_DEBOUNCE_MS = 150

function toggleMentionFlatMode() {
  mentionFlatMode.value = !mentionFlatMode.value
  allFilesCache.value = null
  allFilesCacheTime = 0
  // 重新触发当前查询的补全
  const curQuery = extractMentionQuery(inputText.value || '', inputEl.value?.selectionStart)
  if (curQuery != null) refreshMentionSuggestions(curQuery)
}
let newChatLock = false
const slashCommands = ref([
  { cmd: '/new', desc: t('slashCmd.new') },
  { cmd: '/model', desc: t('slashCmd.model') },
  { cmd: '/plan', desc: t('slashCmd.plan') },
  { cmd: '/init', desc: t('slashCmd.agents') },
  { cmd: '/review', desc: t('slashCmd.review') },
  { cmd: '/diff', desc: t('slashCmd.diff') },
  { cmd: '/status', desc: t('slashCmd.status') },
  { cmd: '/goal', desc: t('slashCmd.goal') },
  { cmd: '/rename', desc: t('slashCmd.rename') },
  { cmd: '/memories', desc: t('slashCmd.memory') },
  { cmd: '/permissions', desc: t('slashCmd.permissions') },
  { cmd: '/skills', desc: t('slashCmd.skills') },
])
const slashSuggestions = ref([])
const slashIdx = ref(0)
const slashModelName = ref('')
const slashEffortLevel = ref('medium')
let slashLocalRefreshTimer = null
let _unregAgentEvent = null
const SLASH_LOCAL_REFRESH_DEBOUNCE_MS = 220
const planModeActive = ref(false)  // /plan 切换的计划模式状态
const msgRefs = {}
const historyTopSentinelRef = ref(null)

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
      // 缓存未加载或已过期时重新拉取
      if (!allFilesCache.value || Date.now() - allFilesCacheTime > ALL_FILES_CACHE_TTL) {
        const result = await window.electronAPI.localSearchFiles({ cwd, query: '', fileEnumLimit: 5000 })
        if (seq !== mentionReqSeq) return
        if (result?.ok && Array.isArray(result?.files)) {
          const cwdNorm = cwd.replace(/\\/g, '/').replace(/\/$/, '') + '/'
          allFilesCache.value = result.files.map(f => {
            let p = String(f).replace(/\\/g, '/')
            // PowerShell 回退路径可能是绝对路径，转为相对 cwd
            if (p.toLowerCase().startsWith(cwdNorm.toLowerCase())) {
              p = p.slice(cwdNorm.length)
            }
            return p
          })
          allFilesCacheTime = Date.now()
        } else {
          allFilesCache.value = []
          allFilesCacheTime = Date.now()
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
    // ── 逐级模式：保持原逻辑 ──
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

function clearMentionSuggestions() {
  if (mentionRefreshTimer) {
    clearTimeout(mentionRefreshTimer)
    mentionRefreshTimer = null
  }
  mentionReqSeq += 1
  mentionSuggestions.value = []
  mentionIdx.value = 0
  allFilesCache.value = null
  allFilesCacheTime = 0
}

function refreshMentionSuggestionsDebounced(rawQuery) {
  if (mentionRefreshTimer) clearTimeout(mentionRefreshTimer)
  mentionRefreshTimer = setTimeout(() => {
    mentionRefreshTimer = null
    refreshMentionSuggestions(rawQuery)
  }, MENTION_REFRESH_DEBOUNCE_MS)
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
        inputEl.value.style.height = 'auto'
        inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 160) + 'px'
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
      inputEl.value.style.height = 'auto'
      inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 160) + 'px'
    }
  })
}

function insertTextAtCaret(insertText) {
  const el = inputEl.value
  if (!el) {
    inputText.value = (inputText.value || '') + insertText
    return
  }
  const start = Number.isInteger(el.selectionStart) ? el.selectionStart : (inputText.value || '').length
  const end = Number.isInteger(el.selectionEnd) ? el.selectionEnd : start
  const text = inputText.value || ''
  inputText.value = text.slice(0, start) + insertText + text.slice(end)
  nextTick(() => {
    const cursor = start + insertText.length
    el.focus()
    el.setSelectionRange(cursor, cursor)
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

function applySlash(s) {
  inputText.value = `${s.cmd} `
  slashSuggestions.value = []
  nextTick(() => inputEl.value?.focus())
}

// ─── 命令路由中间层 ─────────────────────────────────────────
// Codex CLI 有两种命令处理方式：
//   TUI 模式：Rust 层拦截 dispatch（/vim /theme /quit 等）
//   SDK/exec 模式：prompt 原样发给模型，模型按 system prompt 响应
//
// 路由类型：
//   'local'  → 应用拦截执行本地逻辑，return { action: 'done' }
//   'inject' → 拦截后改写 prompt 再发给模型，return { action: 'inject', prompt }
//   未注册  → 原样透传给模型（null）

const SLASH_ROUTES = {
  '/new': 'local',
  '/model': 'local',
  '/diff': 'local',
  '/plan': 'local',
  '/plugins': 'local',
  '/skills': 'local',
  '/init': 'inject',
  '/review': 'inject',
}

function dispatchLocalSlashCommand(firstToken, fullText) {
  if (firstToken === '/clear') {
    const tab = activeTab.value
    slashSuggestions.value = []
    if (!tab) return { action: 'done' }
    pushTabMessage(tab, {
      id: nextMsgId(),
      role: 'system',
      text: '/clear 已停用。请使用新建会话或删除会话。',
    })
    scrollBottom(tab.id)
    return { action: 'done' }
  }

  const route = SLASH_ROUTES[firstToken]
  if (!route) return null
  const tab = activeTab.value
  slashSuggestions.value = []
  if (!tab) return { action: 'done' }

  if (route === 'local') {
    if (firstToken === '/new') { newChat(); return { action: 'done' } }
    if (firstToken === '/model') { openModelPicker(); return { action: 'done' } }
    if (firstToken === '/plugins') { codexPluginsRef.value?.open?.(); return { action: 'done' } }
    if (firstToken === '/skills') { codexSkillsRef.value?.open?.(); return { action: 'done' } }

    // /plan — 切换计划模式，注入/移除 plan mode 指令
    if (firstToken === '/plan') {
      planModeActive.value = !planModeActive.value
      pushTabMessage(tab, {
        id: nextMsgId(),
        role: 'system',
        text: planModeActive.value
          ? t('agent.planModeActivated')
          : t('agent.planModeDeactivated'),
      })
      saveHistory()
      scrollBottom(tab.id)
    }

    // /diff — 跑 git diff 并展示结果（与 CodeX CLI 源码 get_git_diff.rs 一致）
    if (firstToken === '/diff') {
      ;(async () => {
        pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('agent.fetchingGitDiff') })
        scrollBottom(tab.id)
        try {
          const cwd = activeProject.value?.cwd || undefined
          const result = await window.electronAPI.codexRunGitDiff?.(cwd)
          if (!result?.isGitRepo) {
            pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: '`/diff` — ' + t('slashCmd.noGit') })
          } else if (!result?.diff) {
            pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: '`/diff` — ' + t('slashCmd.noChanges') })
          } else {
            pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: result.diff, _isDiffBlock: true })
          }
        } catch (e) {
          pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('slashCmd.diffFailed') + ': ' + (e?.message || e) })
        }
        saveHistory()
        scrollBottom(tab.id)
      })()
    }
    return { action: 'done' }
  }

  if (route === 'inject') {
    // /init — 发送 AGENTS.md 生成 prompt（与 CodeX CLI prompt_for_init_command.md 一致）
    if (firstToken === '/init') {
      return { action: 'inject', prompt: INIT_PROMPT }
    }

    // /review — 获取 git diff 后拼 review prompt（与 CodeX CLI review_prompts.rs 一致）
    if (firstToken === '/review') {
      const rest = (fullText || '').slice(firstToken.length).trim()
      if (rest) {
        // /review <自定义指令> → 直接发指令（ReviewTarget::Custom 路径）
        return { action: 'inject', prompt: rest }
      }
      // /review（无参）→ 异步获取 diff 后发送 review prompt
      return { action: 'inject_async', handler: async () => {
        const cwd = activeProject.value?.cwd || undefined
        let diffText = ''
        try {
          const result = await window.electronAPI.codexRunGitDiff?.(cwd)
          if (result?.isGitRepo && result?.diff) {
            diffText = `\n\nGit diff:\n\`\`\`diff\n${result.diff}\n\`\`\``
          }
        } catch (_) {}
        return `${REVIEW_PROMPT_UNCOMMITTED}${diffText}`
      }}
    }
  }

  return null
}

async function refreshSlashCommands() {
  try {
    // 精选自 Codex CLI 44 个 slash command（tui/src/slash_command.rs）
    // 仅包含 SDK/exec 模式下模型能识别的 core conversational 命令
    // 排除 TUI 专属命令（/vim /theme /quit /raw /copy /ps /stop 等）
    // 处理方式：SLASH_ROUTES 标记 'local' 的由应用拦截，其余透传给模型
    const local = [
      { cmd: '/new', desc: t('slashCmd.new') },
      { cmd: '/model', desc: t('slashCmd.model') },
      { cmd: '/plan', desc: t('slashCmd.plan') },
      { cmd: '/init', desc: t('slashCmd.agents') },
      { cmd: '/review', desc: t('slashCmd.review') },
      { cmd: '/diff', desc: t('slashCmd.diff') },
      { cmd: '/status', desc: t('slashCmd.status') },
      { cmd: '/goal', desc: t('slashCmd.goal') },
      { cmd: '/rename', desc: t('slashCmd.rename') },
      { cmd: '/memories', desc: t('slashCmd.memory') },
      { cmd: '/permissions', desc: t('slashCmd.permissions') },
      { cmd: '/plugins', desc: t('slashCmd.plugins') },
      { cmd: '/skills', desc: t('slashCmd.skills') },
    ]
    const merged = [...local]

    const cwd = activeProject.value?.cwd || undefined
    const sid = activeTab.value?.cliSessionId || activeTab.value?.sessionId || undefined

    // SDK 动态命令：补充 supportedCommands() 返回的任何不在本地列表中的命令
    const remote = await window.electronAPI.codexListSlashCommands?.({ cwd, sessionId: sid })
    for (const c of (remote || [])) {
      const n = (c?.name || '').trim()
      if (!n) continue
      const cmd = n.startsWith('/') ? n : `/${n}`
      if (cmd === '/clear') continue
      if (merged.some(x => x.cmd === cmd)) continue
      merged.push({ cmd, desc: c?.description || t('agent.codexCommand') })
    }

    // 本地 skills
    const localSkills = await window.electronAPI.codexListLocalSkills?.({ cwd })
    for (const s of [...(localSkills?.system || []), ...(localSkills?.project || [])]) {
      const n = (s?.name || '').trim()
      if (!n) continue
      const cmd = n.startsWith('/') ? n : `/${n}`
      if (cmd === '/clear') continue
      if (merged.some(x => x.cmd === cmd)) continue
      merged.push({ cmd, desc: t('agent.skillPrefix') + (s?.description || n) })
    }

    slashCommands.value = merged
  } catch (_) {}
}

function refreshSlashCommandsLocalDebounced() {
  if (slashLocalRefreshTimer) clearTimeout(slashLocalRefreshTimer)
  slashLocalRefreshTimer = setTimeout(async () => {
    await refreshSlashCommands().catch(() => {})
    const val = inputText.value || ''
    if (val.startsWith('/') && !val.includes(' ')) {
      slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith(val))
    }
  }, SLASH_LOCAL_REFRESH_DEBOUNCE_MS)
}

function triggerSlashMenu() {
  inputText.value = '/'
  // 加载当前模型名和 effort 用于内联显示
  const tab = activeTab.value
  if (tab?.model && !slashModelName.value) {
    slashModelName.value = tab.model
  }
  if (tab?.reasoningEffort) {
    slashEffortLevel.value = normalizeCodexReasoningEffort(tab.reasoningEffort)
  } else {
    window.electronAPI?.codexGetReasoningEffort?.().then(e => {
      if (e) slashEffortLevel.value = normalizeCodexReasoningEffort(e)
    })
  }
  nextTick(() => {
    inputEl.value?.focus()
    slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith('/'))
    slashIdx.value = 0
    refreshSlashCommands()
  })
}

/** 补全 file_change 消息的 _fileChanges 字段（历史加载和实时流都适用） */
function hasRichNormalizedFileChanges(fileChanges) {
  if (!Array.isArray(fileChanges) || !fileChanges.length) return false
  return fileChanges.some(change => Boolean(
    change?.unified_diff
    || (Array.isArray(change?.diffLines) && change.diffLines.length)
    || (Array.isArray(change?.diffHunks) && change.diffHunks.length)
    || (Array.isArray(change?._diffHunks) && change._diffHunks.length)
    || change?._oldStr
    || change?._newStr
  ))
}

function normalizeFileChangeMessages(messages) {
  if (!messages?.length) return
  for (const msg of messages) {
    if (msg.role !== 'tool') continue
    const rawType = String(msg.rawType || msg.toolName || '')
    let parsedText = null
    try {
      parsedText = typeof msg.text === 'string' ? JSON.parse(msg.text) : msg.text
    } catch (_) {}
    const isFileChange = rawType === 'file_change'
    const isApplyPatch = rawType === 'apply_patch'
      || String(msg.toolName || '') === 'apply_patch'
      || parsedText?.name === 'apply_patch'
    if (!isFileChange && !isApplyPatch) continue
    if (hasRichNormalizedFileChanges(msg._fileChanges)) continue // 已由实时流 handler 补全

    // 从 text 字段中解析 changes（file_change 格式）
    let changes = null
    try {
      if (parsedText?.changes) changes = parsedText.changes
    } catch (_) {}
    if (changes && Array.isArray(changes)) {
      msg.filePath = changes.map(c => c.path).filter(Boolean).join('\n')
      msg._fileChanges = changes.map(c => ({
        path: c.path || '',
        operation: c.operation || c.kind || '',
        unified_diff: c.unified_diff || '',
        _diffSource: c._diffSource || '',
        _noDiffReason: c._noDiffReason || '',
        _oldStr: '',
        _newStr: '',
        diffLines: [],
      }))
      if (hasRichNormalizedFileChanges(msg._fileChanges) || !isApplyPatch) continue
    }

    // apply_patch 回退：从 text.input 中解析 patch 文本
    if (isApplyPatch && msg.text) {
      try {
        const input = parsedText?.input || parsedText?._inputText || ''
        if (input && typeof input === 'string') {
          const fileChanges = parseApplyPatchForNormalize(input)
          if (fileChanges.length) {
            msg._fileChanges = fileChanges
            msg.filePath = fileChanges.map(c => c.path).filter(Boolean).join('\n')
          }
        }
      } catch (_) {}
    }
  }
}

/** 从 apply_patch input 文本中提取 _fileChanges（供 normalizeFileChangeMessages 用） */
function parseApplyPatchForNormalize(input) {
  const lines = input.split(/\r?\n/)
  const result = []
  let curDel = []
  let curAdd = []

  function parsePatchFileHeader(line) {
    const match = line.match(/^\*\*\*\s+(Update|Add|Delete) File:\s*(.+)$/)
    if (!match) return null
    const [, kind, rawPath] = match
    return {
      path: rawPath.trim(),
      operation: kind === 'Add' ? 'add' : kind === 'Delete' ? 'delete' : 'modify',
    }
  }

  function flushHunk() {
    if (curDel.length || curAdd.length) {
      const last = result[result.length - 1]
      if (last) last.diffHunks.push({ del: [...curDel], add: [...curAdd] })
    }
    curDel = []
    curAdd = []
  }

  for (const line of lines) {
    const fileHeader = parsePatchFileHeader(line)
    if (fileHeader) {
      flushHunk()
      result.push({ path: fileHeader.path, operation: fileHeader.operation, unified_diff: '', diffHunks: [] })
    } else if (line.startsWith('***')) {
      // 忽略标记
    } else if (line.startsWith('@@')) {
      flushHunk()
    } else if (line.startsWith('-')) {
      curDel.push(line.slice(1))
    } else if (line.startsWith('+')) {
      curAdd.push(line.slice(1))
    }
  }
  flushHunk()

  // 兜底：有 *** Update File: 但无 diff 内容
  if (!result.length) {
    const match = input.match(/\*\*\*\s+(Update|Add|Delete) File:\s*(.+)/)
    if (match) {
      const [, kind, rawPath] = match
      result.push({
        path: rawPath.trim(),
        operation: kind === 'Add' ? 'add' : kind === 'Delete' ? 'delete' : 'modify',
        unified_diff: '',
        diffHunks: [],
      })
    }
  }
  return result
}

function makeRestoredChat(c, messages) {
  const restoredMessages = Array.isArray(messages) ? messages : []
  const n = Math.min(MAX_MESSAGES, restoredMessages.length)
  const msgs = restoredMessages.slice(-n)
  normalizeFileChangeMessages(msgs)
  const historyLoadGuard = buildHistoryLoadGuard({
    fileSize: c.fileSize,
    ...(c.historyLoadGuard || {}),
  })
  return {
    id: c.id, name: c.name, sessionId: c.sessionId,
    thinking: false, messages: msgs, currentAssistantId: null,
    metrics: c.metrics || null,
    model: c.model || c.metrics?.model || null,
    reasoningEffort: normalizeCodexReasoningEffort(c.reasoningEffort) || null,
    sandboxMode: resolveRestoredSandboxMode(c),
    networkAccessEnabled: resolveRestoredNetworkAccess(c),
    webSearchMode: resolveRestoredWebSearch(c),
    _thinkingStart: c._thinkingStart || null,
    // 冷启动恢复时不能延续上次进程内的 turn lock，否则异常退出后会把历史会话永久锁死。
    _awaitingDone: false,
    cliSessionId: c.cliSessionId, filePath: c.filePath,
    createdAt: c.createdAt ?? null, updatedAt: c.updatedAt ?? null, fileSize: c.fileSize ?? null,
    titleSource: c.titleSource || (c._userRenamed ? 'user' : ''),
    _userRenamed: Boolean(c._userRenamed),
    _resumeAllowed: c._resumeAllowed !== false,
    hasMoreHistory: Boolean(c.filePath),
    currentPage: 0,
    pageSize: 60,
    historyLoadGuard,
    _historyLoadDeferred: Boolean(c.filePath) && codexSafeModeEnabled.value && historyLoadGuard.shouldDefer,
    _historyLoadRequested: false,
  }
}

function getChatSortTime(chat) {
  const value = chat?.updatedAt || chat?.createdAt
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortChatsByRecency(chats = []) {
  return chats.sort((a, b) => getChatSortTime(b) - getChatSortTime(a))
}

function getLatestChatId(chats = []) {
  return sortChatsByRecency([...(chats || [])])[0]?.id || null
}

const activeMsgContainer = ref(null)
const { show: showScrollBottomBtn, newMsgCount, onScroll: onScrollHook, scrollToBottom: scrollToBottomActive, scrollOrBump, bumpCount: bumpScrollCount } = useScrollBottom(activeMsgContainer)
const showScrollPrevBtn = ref(false)
let scrollPrevCurrentId = null
const queuedRetryTimers = new Map()

const activeProject = computed(() => projects.value.find(p => p.id === activeProjectId.value) || null)
const activeTab = computed(() => {
  const p = activeProject.value
  if (!p) return null
  return (p.chats || []).find(c => c.id === activeChatId.value) || null
})
const isActiveTabHistoryDeferred = computed(() =>
  Boolean(
    activeTab.value?._historyLoadDeferred
      && !activeTab.value?._historyLoadRequested
      && !(activeTab.value?.messages || []).length
  )
)
const deferredHistoryHint = computed(() => {
  const guard = activeTab.value?.historyLoadGuard
  if (!guard?.shouldDefer) return ''
  return t('agent.deferredHistoryHint', { size: (guard.fileSize / 1024).toFixed(0), count: guard.tailLargeOutputCount, maxLen: (guard.tailMaxOutputChars / 1024).toFixed(1) })
  return `鏂囦欢 ${(guard.fileSize / 1024).toFixed(0)} KB锛屽熬閮ㄨ秴闀胯緭鍑?${guard.tailLargeOutputCount} 鏉★紝鏈€闀?${(guard.tailMaxOutputChars / 1024).toFixed(1)} KB銆?`
})
const dismissedPlanOverviewSourceMessageId = ref(null)
const rawCurrentPlanOverview = computed(() => findLatestActiveUpdatePlan(activeTab.value?.messages || []))
const currentPlanOverview = computed(() => (
  shouldRenderPlanOverviewForTurn({
    overview: rawCurrentPlanOverview.value,
    dismissedSourceMessageId: dismissedPlanOverviewSourceMessageId.value,
    thinking: activeTab.value?.thinking,
    awaitingDone: activeTab.value?._awaitingDone,
  })
    ? rawCurrentPlanOverview.value
    : null
))

const {
  pendingImages, imageLightboxSrc, dragging, fileInputRef,
  removeAt, openImageLightbox, closeImageLightbox,
  onDrop, dispose, addImageClick, onFileSelect, onPaste,
} = useImageAttachments({ getActiveTab: () => activeTab.value })

function setMsgRef(id, el) {
  if (!el) { if (id != null) delete msgRefs[id]; return }
  msgRefs[id] = el
  if (id === activeChatId.value) {
    activeMsgContainer.value = el
  }
}
function setHistoryTopSentinelRef(el) { historyTopSentinelRef.value = el }

function smartScrollBottom(chatId) {
  const id = chatId || activeChatId.value
  requestAnimationFrame(() => {
    if (id === activeChatId.value) {
      scrollToBottomActive(false)
      return
    }
    const el = msgRefs[id]
    if (!el) return
    el.scrollTo({ top: 999999, behavior: 'instant' })
  })
}

// 智能滚动：活跃 tab 用 scrollOrBump（尊重用户上翻位置），后台 tab 强滚
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

function jumpToMessage(messageId) {
  if (messageId == null) return
  const el = activeMsgContainer.value
  if (!el) return
  const row = el.querySelector(`.msg-row[data-msg-id="${messageId}"]`)
  if (!row) return
  row.scrollIntoView({ behavior: 'auto', block: 'start' })
}

function dismissPlanOverview(messageId) {
  dismissedPlanOverviewSourceMessageId.value = messageId ?? null
}

watch(
  () => rawCurrentPlanOverview.value?.sourceMessageId ?? null,
  (nextSourceMessageId) => {
    dismissedPlanOverviewSourceMessageId.value = resolvePlanOverviewDismissedState({
      previousDismissedSourceMessageId: dismissedPlanOverviewSourceMessageId.value,
      nextSourceMessageId,
    })
  },
  { immediate: true }
)

function getRunningCount(chats) {
  let count = 0
  for (const chat of chats || []) {
    if (chat?.thinking) count += 1
  }
  return count
}

function hasPendingToolInChats(chats) {
  for (const chat of chats || []) {
    const messages = chat?.messages || []
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.status === 'pending') return true
    }
  }
  return false
}

const projectTabs = computed(() =>
  projects.value.map(p => ({
    ...p,
    runningCount: getRunningCount(p.chats || []),
    hasPendingTool: hasPendingToolInChats(p.chats || []),
  }))
)

// Tool helpers
// ─── Tool helpers (backed by shared toolMeta.js + local matchers) ──
function isWriteTool(name) { return isCodeXWriteToolName(name) }
function isEditTool(name) { return isCodeXEditToolName(name) }
function isBashTool(name) { return ['shell', 'bash', 'execute'].includes((name || '').toLowerCase()) }
function isReadTool(name) { return isCodeXReadToolName(name) }

function toolIcon(name) {
  return resolveToolIconKey(name)
}
function toolLabel(name) {
  return resolveToolLabel(name) || name || t('agent.toolLabel')
}

function inferToolFailureFromText(toolName, text) {
  if (!text) return false
  const lower = text.toLowerCase()
  if (isBashTool(toolName)) return /(error|failed|exception|not found|no such)/i.test(lower) && text.length < 500
  return false
}

// migrateSandboxValue / isValidSandboxMode 从 agentCommon/utils/sandboxHelpers.js 导入（共享，去重 T115）

function resolveRestoredSandboxMode(chat) {
  // 先读新字段名，再读旧字段名（兼容历史数据）
  const raw = chat?.sandboxMode || chat?.sandboxLevel
  const valid = migrateSandboxValue(raw)
  if (valid) return valid
  // workspace-write 暂不可用 → 回退到 store 默认值（danger-full-access）
  return codexConfigStore.sandboxMode
}

function resolveRestoredNetworkAccess(chat) {
  if (typeof chat?.networkAccessEnabled === 'boolean') return chat.networkAccessEnabled
  return codexConfigStore.defaultNetworkAccess
}

function resolveRestoredWebSearch(chat) {
  if (typeof chat?.webSearchMode === 'string' && chat.webSearchMode) return chat.webSearchMode
  return codexConfigStore.defaultWebSearch
}

function hasStartedCodexChat(chat) {
  return Boolean(
    chat?.cliSessionId
    || chat?.filePath
    || chat?.updatedAt
    || (Array.isArray(chat?.messages) && chat.messages.length)
  )
}

function createToolMessage(opts) {
  const msg = { id: nextMsgId(), role: 'tool', status: opts.status || 'done', ...opts }
  if (opts.status === 'pending') msg._isPendingPerm = true
  return msg
}

function createNewChat() {
  const id = nextChatId()
  return {
    id, name: t('chat.newChat'), sessionId: `codex-session-${id}-${Date.now()}`,
    cwd: activeProject.value?.cwd || '',
    createdAt: Date.now(),
    draftText: '',
    thinking: false, messages: [], currentAssistantId: null,
    metrics: null,
    model: codexDefaultModel.value || null,
    reasoningEffort: codexDefaultReasoningEffort.value || null,
    sandboxMode: codexConfigStore.sandboxMode,
    networkAccessEnabled: codexConfigStore.defaultNetworkAccess,
    webSearchMode: codexConfigStore.defaultWebSearch,
    _thinkingStart: null,
    _awaitingDone: false,
    hasMoreHistory: false,
    currentPage: 0,
    pageSize: 60,
    historyLoadGuard: buildHistoryLoadGuard(),
    _historyLoadDeferred: false,
    _historyLoadRequested: false,
  }
}

async function buildChatFromSessionSummary(summary) {
  const cNum = parseInt(String(summary.id || '').replace('chat-', '')) || 0
  if (cNum > chatCounter) chatCounter = cNum
  const providerSessionId = summary.providerSessionId || summary.cliSessionId || summary.id || ''
  const chatKey = summary.chatKey || `codex-session-${nextChatId()}-${Date.now()}`
  const chatId = summary.chatKey ? `chat-${summary.chatKey}` : `chat-${providerSessionId || Date.now()}`
  const chat = makeRestoredChat({
    id: chatId,
    name: summary.name || `${t('chat.sessionPrefix')}${String(summary.id || '').slice(0, 8)}`,
    sessionId: chatKey,
    cliSessionId: providerSessionId,
    filePath: summary.filePath,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    fileSize: summary.fileSize,
    model: summary.model || null,
    reasoningEffort: summary.reasoningEffort || null,
    historyLoadGuard: summary.historyLoadGuard,
    metrics: null,
    _thinkingStart: null,
    titleSource: summary.titleSource || (summary._isCustomTitle ? 'provider' : ''),
    _userRenamed: summary.titleSource === 'user' || Boolean(summary._userRenamed),
  }, [])
  return chat
}

function loadDeferredHistory(chat) {
  if (!chat) return
  chat._historyLoadRequested = true
  chat._historyLoadDeferred = false
  switchChat(chat.id)
}

async function loadProjectChatsFromCodexSessions(proj, cwd) {
  const summaries = await window.electronAPI.codexListSessionsByCwd?.(cwd) || []

  // cache 匹配：保留已有 chat 的 _userRenamed / _sdkTaskMap 等前端状态，
  // 避免全量替换导致重命名等用户操作丢失。（与 refreshProjectSessionsInBackground 一致）
  const cacheByPath = {}
  const cacheBySid = {}
  for (const chat of proj.chats || []) {
    if (chat.filePath) cacheByPath[String(chat.filePath).replace(/\\/g, '/')] = chat
    if (chat.cliSessionId) cacheBySid[chat.cliSessionId] = chat
    if (chat.sessionId) cacheBySid[chat.sessionId] = chat
  }

  const nextChats = []
  for (const summary of summaries) {
    const normalizedPath = String(summary.filePath || '').replace(/\\/g, '/')
    const providerSessionId = summary.providerSessionId || summary.cliSessionId || summary.id || ''
    const cached = cacheByPath[normalizedPath] || cacheBySid[summary.chatKey] || cacheBySid[providerSessionId] || null
    const name = summary.name || `${t('chat.sessionPrefix')}${String(summary.id || '').slice(0, 8)}`

    if (cached) {
      if (!cached._userRenamed) cached.name = name
      cached.createdAt = summary.createdAt || null
      cached.updatedAt = summary.updatedAt || null
      cached.filePath = summary.filePath || ''
      cached.cliSessionId = providerSessionId || cached.cliSessionId
      cached.sessionId = cached.sessionId || summary.chatKey || `codex-session-${cached.id}-${Date.now()}`
      cached.model = cached.model || summary.model || cached.metrics?.model || null
      cached.reasoningEffort = normalizeCodexReasoningEffort(cached.reasoningEffort || summary.reasoningEffort) || null
      cached.historyLoadGuard = buildHistoryLoadGuard({
        fileSize: summary.fileSize,
        ...(summary.historyLoadGuard || {}),
      })
      if (!cached._historyLoadRequested) {
        cached._historyLoadDeferred = Boolean(cached.filePath) && codexSafeModeEnabled.value && cached.historyLoadGuard.shouldDefer
      }
      cached.fileSize = summary.fileSize || null
      if (!cached.messages?.length) {
        cached.messages = []
        cached._messagesLoaded = false
      }
      nextChats.push(cached)
      continue
    }

    const chat = await buildChatFromSessionSummary(summary)
    nextChats.push(chat)
  }

  proj.chats = nextChats.length ? sortChatsByRecency(nextChats) : proj.chats

  if (!proj.chats.length) {
    const chat = createNewChat()
    chat.cwd = cwd
    proj.chats = [chat]
  }
  const firstChatId = proj.chats[0]?.id || null
  if (firstChatId) switchChat(firstChatId)
}

async function refreshProjectSessionsInBackground(project) {
  if (!project?.cwd || !window.electronAPI?.codexListSessionsByCwd) return null
  let newCount = 0
  let changedCount = 0
  try {
    const scanned = await window.electronAPI.codexListSessionsByCwd(project.cwd) || []
    if (!Array.isArray(scanned)) return null
    if (project.id !== activeProjectId.value) return null

    if (!scanned.length) {
      if (!project.chats?.length) {
        const chat = createNewChat()
        chat.cwd = project.cwd
        project.chats = [chat]
        switchChat(chat.id)
      }
      // 即使扫描结果为空，也注册已有的 cliSessionId 映射（对齐 T046 修复）
      const sessionMap = {}
      for (const chat of project.chats || []) {
        if (chat.sessionId && chat.cliSessionId && chat._resumeAllowed !== false) sessionMap[chat.sessionId] = chat.cliSessionId
      }
      if (Object.keys(sessionMap).length) window.electronAPI.codexRegisterCliSessions?.(sessionMap)
      return { newCount: 0, changedCount: 0, totalCount: project.chats?.length || 0 }
    }

    const cacheByPath = {}
    const cacheBySid = {}
    for (const chat of project.chats || []) {
      if (chat.filePath) cacheByPath[String(chat.filePath).replace(/\\/g, '/')] = chat
      if (chat.cliSessionId) cacheBySid[chat.cliSessionId] = chat
      if (chat.sessionId) cacheBySid[chat.sessionId] = chat
    }

    // 竞态防护：如果项目中有 thinking 但尚未拿到 cliSessionId 的聊天，
    // 说明 SDK 刚在磁盘上创建了会话文件但 onAgentDone 还没到。此时扫描
    // 会因无法匹配而误创建重复条目。跳过新文件发现，等 onAgentDone 后再匹配。
    const hasPendingNewChat = (project.chats || []).some(
      c => c.thinking && !c.cliSessionId && !c.filePath
    )
    const nextChats = []
    for (const summary of scanned) {
      if (project.id !== activeProjectId.value) return
      const normalizedPath = String(summary.filePath || '').replace(/\\/g, '/')
      const providerSessionId = summary.providerSessionId || summary.cliSessionId || summary.id || ''
      const cached = cacheByPath[normalizedPath] || cacheBySid[summary.chatKey] || cacheBySid[providerSessionId] || null
      const name = summary.name || `${t('chat.sessionPrefix')}${String(summary.id || '').slice(0, 8)}`

      if (cached) {
        if (!cached._userRenamed) cached.name = name
        cached.createdAt = summary.createdAt || null
        cached.updatedAt = summary.updatedAt || null
        cached.filePath = summary.filePath || ''
        cached.cliSessionId = providerSessionId || cached.cliSessionId
        cached.sessionId = cached.sessionId || summary.chatKey || `codex-session-${cached.id}-${Date.now()}`
        cached.model = cached.model || summary.model || cached.metrics?.model || null
        cached.reasoningEffort = normalizeCodexReasoningEffort(cached.reasoningEffort || summary.reasoningEffort) || null
        cached.historyLoadGuard = buildHistoryLoadGuard({
          fileSize: summary.fileSize,
          ...(summary.historyLoadGuard || {}),
        })
        if (!cached._historyLoadRequested) {
          cached._historyLoadDeferred = Boolean(cached.filePath) && codexSafeModeEnabled.value && cached.historyLoadGuard.shouldDefer
        }
        const allowHydrateFromDisk = shouldHydrateHistoryFromDisk(cached)
        if (summary.fileSize != null && cached.fileSize !== summary.fileSize) {
          changedCount++
          // fileSize 变化：更新 fileSize 并清空消息缓存
          console.log('[refresh] fileSize changed for', cached.name, 'from', cached.fileSize, 'to', summary.fileSize)
          cached.fileSize = summary.fileSize
          if (allowHydrateFromDisk && cached.id === activeChatId.value) {
            cached._messagesLoaded = false
            cached.messages = []
            summary._needReloadActiveChat = true
          } else if (allowHydrateFromDisk && (!cached.messages || cached.messages.length === 0)) {
            cached.messages = []
            cached._messagesLoaded = false
          }
        } else {
          cached.fileSize = summary.fileSize || null
          if (allowHydrateFromDisk && !cached.messages?.length) {
            cached.messages = []
            cached._messagesLoaded = false
            if (cached.id === activeChatId.value) {
              summary._needReloadActiveChat = true
            }
          }
        }
        nextChats.push(cached)
        continue
      }

      if (hasPendingNewChat) continue  // 等 onAgentDone 填充 cliSessionId 后再匹配
      newCount++
      const chat = await buildChatFromSessionSummary(summary)
      nextChats.push(chat)
    }

    const mergedChats = mergeScannedChatsPreservingRuntime(project.chats, nextChats, {
      activeChatId: activeChatId.value,
    })
    project.chats = mergedChats.length ? sortChatsByRecency(mergedChats) : project.chats

    const needReload = scanned.find(s => s._needReloadActiveChat)
    if (needReload) {
      const activeChat = project.chats?.find(c => c.id === activeChatId.value) || null
      if (activeChat?._historyLoadDeferred && !activeChat._historyLoadRequested) {
        // 安全模式下等待用户手动触发历史加载。
      } else if (activeChat?.filePath && activeChat.messages.length === 0 && !activeChat._messagesLoaded) {
        activeChat._loadingMessages = true
        void ensureChatMessagesLoaded(activeChat).finally(() => {
          activeChat._loadingMessages = false
          requestAnimationFrame(() => smartScrollBottom())
        })
      }
    }

    if (!project.chats.find(c => c.id === activeChatId.value)) {
      const fallbackChatId = project.chats[0]?.id || null
      if (fallbackChatId) switchChat(fallbackChatId)
      else activeChatId.value = null
    }
    void refreshMetricsForChat(project.chats?.find(c => c.id === activeChatId.value) || null)

    const sessionMap = {}
    for (const chat of project.chats || []) {
      if (chat.sessionId && chat.cliSessionId && chat._resumeAllowed !== false) sessionMap[chat.sessionId] = chat.cliSessionId
    }
    if (Object.keys(sessionMap).length) {
      window.electronAPI.codexRegisterCliSessions?.(sessionMap)
    }

    saveHistory()
    return { newCount, changedCount, totalCount: project.chats?.length || 0 }
  } catch (_) {}
  return null
}

async function handleRefreshSessions({ silent = false } = {}) {
  const project = activeProject.value
  if (!project?.cwd || sidebarRefreshing.value) return
  if (!silent && !(project?.chats?.length)) sidebarLoading.value = true
  sidebarRefreshing.value = true
  try {
    await refreshProjectSessionsInBackground(project)
  } catch (_) {
    // 静默处理刷新失败
  } finally {
    if (!silent) sidebarLoading.value = false
    sidebarRefreshing.value = false
  }
}

// 会话刷新增强：窗口聚焦自动刷新 + 键盘快捷键
// 嵌入模式下不注册 focus 自动刷新（避免非活跃 Tab 时弹 toast）
// 侧边栏手动刷新按钮仍然直接调用 handleRefreshSessions
if (!embedded) {
  useSessionRefresh(handleRefreshSessions)
}

// History composable
const { saveHistory, flushOnUnload, loadHistory, getLastProjectCwd, setLastProjectCwd } = useCodexHistory({
  projects, setProjects: v => { projects.value = v },
  getProjectCounter: () => projectCounter, setProjectCounter: v => { projectCounter = v },
  getChatCounter: () => chatCounter, setChatCounter: v => { chatCounter = v },
  getMsgId: () => msgId, setMsgId: v => { msgId = v },
  makeRestoredChat,
})

const confirmDialogRef = ref(null)
const selectModelRef = ref(null)
const sidebarLoading = ref(false)
const sidebarRefreshing = ref(false)
let scrollThrottleTimer = null
let wheelThrottleTimer = null
let loadMoreCooldownTimer = null

// Tab management
const { sidebarOpen } = useCodexTabs({
  tabs: computed(() => activeProject.value?.chats || []),
  activeId: activeChatId, inputEl, confirmDialogRef,
  saveHistory, scrollBottom: smartScrollBottom, setupHistoryTopObserver: () => {},
  getLastProjectCwd, nextTabId,
})

// Stream handler
const codehubHasNotification = inject('codehubHasNotification', null)

// ── 侧边栏「项目」通知指示器 ──
// P1-3：对齐 ClaudeCode — 复用 projectTabs computed（已含 ...p spread），避免 flatMap 每次创建新数组
watch(
  () => projectTabs.value.some(t => t.hasDoneNotification),
  (has) => {
    if (codehubHasNotification) codehubHasNotification.value = has
  },
  { immediate: true }
)

const { onAgentMessage, onAgentDone } = useCodexAgentStream({
  tabs: computed(() => {
    const p = activeProject.value
    return p ? (p.chats || []) : []
  }),
  projects, getActiveProjectId: () => activeProjectId.value, isPanelActive,
  onBackgroundTaskDone() {
    // 直推侧边栏通知：绕开 keep-alive 失活时 codeHub 的 watcher 暂停问题
    if (codehubHasNotification) codehubHasNotification.value = true
  },
  scrollBottom: smartScrollToBottom, saveHistory, nextMsgId,
  isWriteTool, isEditTool, isBashTool, isReadTool, inferToolFailureFromText, createToolMessage,
  onNewMessage: () => {},
  trimMessages,
  onCompactBoundary(postTokens) {
    metricsData.value.contextUsage = postTokens
  },
})
const firstAwaitingAssistant = ref(false)
watch(() => [activeTab.value?.thinking, activeTab.value?.messages?.length], () => {
  const tab = activeTab.value
  const msgs = tab?.messages || []
  firstAwaitingAssistant.value = Boolean(tab?.thinking && !msgs.length)
})

// Scroll event handlers
function onMessagesScroll(e) {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => { scrollThrottleTimer = null }, 50)
  const tab = activeTab.value
  onScrollHook()
  updateScrollPrevFromScroll(e.target)
  if (tab && e.currentTarget.scrollTop <= 5 && tab.hasMoreHistory && !tab.loadingMore) {
    loadMoreHistory(e.currentTarget)
  }
}

function onMessagesWheel(e) {
  if (wheelThrottleTimer) return
  wheelThrottleTimer = setTimeout(() => { wheelThrottleTimer = null }, 50)
  const tab = activeTab.value
  onScrollHook()
  if (tab && e.deltaY < 0 && e.currentTarget.scrollTop <= 5 && tab.hasMoreHistory && !tab.loadingMore) {
    loadMoreHistory(e.currentTarget)
  }
}

function updateScrollPrevFromScroll(el) {
  const tab = activeTab.value
  if (!tab) return
  const msgEls = el.querySelectorAll('.msg-row.user')
  const scrollTop = el.scrollTop
  let ci = -1
  for (let i = 0; i < msgEls.length; i++) { if (msgEls[i].offsetTop >= scrollTop - 20) { ci = i; break } }
  if (ci < 0) ci = Math.max(0, msgEls.length - 1)
  scrollPrevCurrentId = msgEls[ci]?.dataset.msgId || null
}

function updateScrollPrevBtn() {
  const tab = activeTab.value
  if (!tab) { showScrollPrevBtn.value = false; scrollPrevCurrentId = null; return }
  const userCount = countVisibleCodexUserMessages(tab.messages)
  if (userCount <= 1) { showScrollPrevBtn.value = false; scrollPrevCurrentId = null; return }
  showScrollPrevBtn.value = true
}

function resetScrollPrev() { scrollPrevCurrentId = null; showScrollPrevBtn.value = false }

function handleScrollBottom() { smartScrollBottom(); resetScrollPrev() }
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
  showScrollPrevBtn.value = targetIdx > 0
}

// Project management
function newProject() {
  const id = nextProjectId()
  projects.value.push({ id, name: t('agent.newProject'), cwd: '', cwdLocked: false, chats: [] })
  activeProjectId.value = id
  activeChatId.value = null
  inputText.value = ''
  pendingImages.value = []
  slashSuggestions.value = []
  clearMentionSuggestions()
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

function switchProject(id, preferredChat = null) {
  activeProjectId.value = id
  const p = activeProject.value
  if (p) p.hasDoneNotification = false
  const preferred = findPreferredChat(p?.chats, preferredChat)
  if (preferred) {
    switchChat(preferred.id)
  } else {
    const latestChatId = getLatestChatId(p?.chats || [])
    if (latestChatId) switchChat(latestChatId)
    else activeChatId.value = null
  }
  if (p?.cwdLocked && p?.cwd) {
    if (!p._settingsLoaded) { p._settingsLoaded = true; loadProjectSettings(p) }
    void refreshProjectSessionsInBackground(p)
  }
}

async function requestDeleteProject(project) {
  if (!project) return
  // 有运行中对话时提示，否则直接关闭
  const hasRunning = (project.chats || []).some(c => c.thinking)
  if (hasRunning) {
    const ok = await confirmDialogRef.value?.open({
      message: t('agent.closeProjectTab'),
    })
    if (!ok) return
  }
  const idx = projects.value.findIndex(p => p.id === project.id)
  if (idx < 0) return
  for (const c of project.chats || []) window.electronAPI.codexAgentAbort?.(c.sessionId)
  projects.value.splice(idx, 1)
  if (activeProjectId.value === project.id) {
    activeProjectId.value = projects.value[Math.max(0, idx - 1)]?.id || null
    const p = activeProject.value
    activeChatId.value = getLatestChatId(p?.chats || [])
  }
  // T015: 不再自动创建新项目，关闭最后一个 tab 后由 codeHub 显示空状态欢迎页
  saveHistory()
}

function closeAllProjects() {
  for (const p of projects.value) {
    for (const c of p.chats || []) window.electronAPI.codexAgentAbort?.(c.sessionId)
  }
  projects.value = []
  activeProjectId.value = null
  activeChatId.value = null
  saveHistory()
}

function reorderProjects({ fromIndex, toIndex }) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= projects.value.length || toIndex >= projects.value.length) return
  if (fromIndex === toIndex) return
  const item = projects.value.splice(fromIndex, 1)[0]
  projects.value.splice(toIndex, 0, item)
  saveHistory()
}

function switchChat(id) {
  activeChatId.value = id
  const chat = activeProject.value?.chats?.find(c => c.id === id) || null
  if (chat) trimMessages(chat)
  resetScrollPrev()
  void refreshMetricsForChat(chat)
  // 每次切换都从文件重新加载
  if (chat?._historyLoadDeferred && !chat._historyLoadRequested) {
    requestAnimationFrame(() => {
      activeMsgContainer.value = null
      inputEl.value?.blur?.()
    })
  } else if (chat?.filePath && shouldHydrateHistoryFromDisk(chat)) {
    chat._loadingMessages = true
    void ensureChatMessagesLoaded(chat).finally(() => {
      chat._loadingMessages = false
      requestAnimationFrame(() => {
        activeMsgContainer.value = msgRefs[id] || null
        smartScrollBottom()
        inputEl.value?.focus()
      })
    })
  } else {
    requestAnimationFrame(() => {
      activeMsgContainer.value = msgRefs[id] || null
      smartScrollBottom()
      inputEl.value?.focus()
    })
  }
}

function newChat() {
  if (newChatLock) return
  if (!activeProject.value?.cwdLocked) return
  newChatLock = true
  try {
    const chat = createNewChat()
    activeProject.value.chats.unshift(chat)
    activeChatId.value = chat.id
    saveHistory()
    requestAnimationFrame(() => { inputEl.value?.focus(); smartScrollBottom(); resetScrollPrev() })
  } finally {
    setTimeout(() => { newChatLock = false }, 300)
  }
}

async function requestDeleteChat(chat) {
  if (!chat) return
  const ok = await confirmDialogRef.value?.open(chat.filePath
    ? {
        message: '此操作会永久删除该 Codex 会话及底层官方历史（JSONL transcript），删除后无法恢复。是否永久删除？',
        okText: t('common.delete'),
        cancelText: t('common.cancel'),
      }
    : { message: t('agent.confirmDeleteChat') })
  if (!ok) return
  window.electronAPI.codexAgentAbort?.(chat.sessionId)
  // 删除磁盘上的 JSONL 会话文件，防止刷新时重新出现
  if (chat.filePath) window.electronAPI.codexDeleteSessionFile?.(chat.filePath)
  const p = activeProject.value
  if (!p) return
  const idx = p.chats.findIndex(c => c.id === chat.id)
  p.chats.splice(idx, 1)
  if (activeChatId.value === chat.id) {
    activeChatId.value = p.chats[idx]?.id || p.chats[idx - 1]?.id || null
    if (!p.chats.length) newChat()
  }
  saveHistory()
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
      agent: 'codex',
      chatKey: chat.sessionId,
      title: newName,
      cwd: p.cwd,
      cliSessionId: chat.cliSessionId,
      filePath: chat.filePath,
      model: chat.model,
      reasoningEffort: chat.reasoningEffort,
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

function selectDir(project) {
  const p = project || activeProject.value
  if (!p) return
  const id = p.id
  window.electronAPI.codexSelectDirectory?.().then(async dir => {
    if (!dir) return
    const proj = projects.value.find(pp => pp.id === id)
    if (!proj) return
    proj.cwd = dir
    proj.cwdLocked = true
    setLastProjectCwd(dir)
    loadProjectSettings(proj)
    if (!(proj.chats?.length)) sidebarLoading.value = true
    try {
      await loadProjectChatsFromCodexSessions(proj, dir)
    } finally {
      sidebarLoading.value = false
    }
    saveHistory()
  })
}

function openSettings() {
  if (embedded) {
    openSharedSettings?.()
  } else {
    apiSettingRef.value?.openSettings?.()
  }
}

async function handleProviderActivated() {
  await loadCodexModelDefaults()
  const tab = activeTab.value
  if (!tab) return
  metricsData.value.model = tab.model || tab.metrics?.model || codexDefaultModel.value || ''
  pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('agent.switchedApi') })
  saveHistory()
}

function openSessionInstruction() {
  if (!activeTab.value?.sessionId) return
  sessionInstructionRef.value?.open?.(activeTab.value.sessionId)
}

async function loadSessionInstructionForTab(tab) {
  if (!tab?.sessionId) return null
  try {
    const instruction = await window.electronAPI?.getSessionInstruction?.(tab.sessionId)
    if (!instruction?.enabled || !String(instruction.content || '').trim()) return null
    return instruction
  } catch (_) {
    return null
  }
}

async function refreshActiveSessionInstructionState() {
  const chatKey = activeTab.value?.sessionId
  if (!chatKey) {
    activeSessionInstructionEnabled.value = false
    return
  }
  try {
    const instruction = await window.electronAPI?.getSessionInstruction?.(chatKey)
    console.log('[cx] refreshActiveSessionInstructionState:', { chatKey, enabled: instruction?.enabled, contentLen: String(instruction?.content || '').length })
    activeSessionInstructionEnabled.value = Boolean(instruction?.enabled)
  } catch (_) {
    activeSessionInstructionEnabled.value = false
  }
}

async function setActiveSessionInstructionEnabled(enabled) {
  const chatKey = activeTab.value?.sessionId
  if (!chatKey) return
  console.log('[cx] setActiveSessionInstructionEnabled:', { chatKey, enabled: Boolean(enabled) })
  activeSessionInstructionEnabled.value = Boolean(enabled)
  try {
    const current = await window.electronAPI?.getSessionInstruction?.(chatKey)
    console.log('[cx] setActiveSessionInstructionEnabled current:', { enabled: current?.enabled, contentLen: String(current?.content || '').length })
    const result = await window.electronAPI?.setSessionInstruction?.({
      chatKey,
      instruction: {
        ...(current || {}),
        enabled: Boolean(enabled),
      },
    })
    console.log('[cx] setActiveSessionInstructionEnabled result:', { ok: result?.ok, returnedEnabled: result?.instruction?.enabled })
    await refreshActiveSessionInstructionState()
  } catch (_) {
    await refreshActiveSessionInstructionState()
  }
}

async function prependSessionInstruction(prompt, instruction) {
  if (!instruction?.enabled) return prompt
  try {
    const block = await window.electronAPI?.buildSessionInstructionPrompt?.(instruction)
    if (!block) return prompt
    return [block, '', '用户当前请求：', prompt].join('\n')
  } catch (_) {
    return prompt
  }
}

async function sendMessage(textOverride = null, targetTab = null) {
  if (isComposing.value) return
  const tab = targetTab || activeTab.value
  const isQueuedFlush = Boolean(targetTab)
  const rawText = typeof textOverride === 'string'
    ? textOverride
    : (inputEl.value?.value || inputText.value || '')
  let text = rawText.trim()
  const composerAttachments = isQueuedFlush ? [] : pendingImages.value
  if ((!text && !composerAttachments.length) || !tab) return
  if (!isQueuedFlush && isActiveTabHistoryDeferred.value) return
  const ownerProject = isQueuedFlush
    ? projects.value.find((project) => (project?.chats || []).some((chat) => chat.id === tab.id)) || null
    : activeProject.value
  if (!ownerProject?.cwdLocked) return
  // 兼容旧历史数据：缺字段时在发送前补齐一次，但新 chat 默认已在创建时初始化。
  if (!tab.sandboxMode) tab.sandboxMode = codexConfigStore.sandboxMode
  if (tab.networkAccessEnabled === undefined) tab.networkAccessEnabled = codexConfigStore.defaultNetworkAccess
  if (!tab.webSearchMode) tab.webSearchMode = codexConfigStore.defaultWebSearch
  if (!tab.model) tab.model = codexDefaultModel.value || null
  if (!tab.reasoningEffort) tab.reasoningEffort = codexDefaultReasoningEffort.value || null

  if (isCodexTurnLocked(tab)) {
    tab._queuedInput = text
    tab.draftText = ''
    if (!isQueuedFlush) inputText.value = ''
    return
  }

  // ── 命令路由中间层 ──
  // 返回值：null → 透传  |  { action:'done' } → 本地已处理  |  { action:'inject', prompt } → 改写 prompt
  let dispatched = null
  if (!isQueuedFlush) {
    const firstToken = text.split(/\s+/, 1)[0] || ''
    dispatched = dispatchLocalSlashCommand(firstToken, text)
  }
  if (dispatched) {
    if (dispatched.action === 'done') {
      inputText.value = ''
      return
    }
    if (dispatched.action === 'inject') {
      // /init 等同步注入：用改写后的 prompt 替换原始文本
      text = dispatched.prompt
    }
    if (dispatched.action === 'inject_async') {
      // /review 等异步注入：展示 loading，获取 diff 后拼 prompt 再发送
      pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('agent.fetchingCodeChanges') })
      scrollBottom(tab.id)
      saveHistory()
      text = await dispatched.handler()
    }
  }

  const imageAttachments = composerAttachments
    .filter(img => img?.isImage)
    .map(({ dataUrl, mediaType, path, name, size }) => ({
      dataUrl,
      mediaType: mediaType || 'image/png',
      path: path || '',
      name: name || '',
      size: size || 0,
    }))
  const fileAttachments = composerAttachments
    .filter(img => !img?.isImage)
    .map(({ name, size, path }) => ({
      name: name || t('agent.file'),
      size: size || 0,
      path: path || '',
    }))
  const queuedInputMessageId = isQueuedFlush ? tab._queuedInputMessageId : null
  const existingQueuedUserMsg = queuedInputMessageId
    ? tab.messages.find(m => m.id === queuedInputMessageId && isVisibleCodexUserMessage(m))
      : null
  const userMsg = existingQueuedUserMsg || {
    id: nextMsgId(),
    role: 'user',
    text,
    content: buildUserContentBlocks(text, imageAttachments, fileAttachments),
    images: imageAttachments,
    files: fileAttachments,
  }
  if (!existingQueuedUserMsg) {
    trimMessages(tab, true)
    tab.messages.push(userMsg)
    touchChatUpdatedAt(tab)
  }
  // 飞行锁 + 乐观 thinking：必须在 await 之前设置 thinking=true。
  // 后端 Promise 在 finally 中 resolve，晚于 codex-agent-done 事件发送。
  // 如果 thinking 在 await 之后才设置，onAgentDone 已将其清为 false 后又被覆盖为 true，导致永不消失。
  markCodexTurnStarting(tab)

  const images = imageAttachments.map(({ dataUrl, mediaType, path, name, size }) => ({
    dataUrl,
    mediaType,
    path: path || '',
    name: name || '',
    size: size || 0,
  }))
  if (!isQueuedFlush) {
    pendingImages.value = []
    tab.draftText = ''
    inputText.value = ''
    // 重置 textarea 高度，避免多行内容发送后输入框被撑大
    nextTick(() => {
      if (inputEl.value) {
        inputEl.value.style.height = 'auto'
      }
    })
  }
  saveHistory({ immediate: true })
  smartScrollBottom()

  // 携带上轮压缩摘要（新会话首个 prompt）
  let finalPrompt = text
  if (tab._carryCompactSummary) {
    finalPrompt = `以下是上一会话压缩后的上下文摘要，请作为当前会话背景：\n${tab._carryCompactSummary}\n\n用户当前问题：\n${text}`
    tab._carryCompactSummary = ''
  }
  // 计划模式：注入 plan mode 指令（/init /review 等特殊 prompt 不叠加）
  if (planModeActive.value && dispatched?.action !== 'inject' && dispatched?.action !== 'inject_async') {
    finalPrompt = `${PLAN_MODE_INSTRUCTIONS}\n\n---\n\n${finalPrompt}`
  }
  const sessionInstruction = await loadSessionInstructionForTab(tab)
  if (sessionInstruction) {
    finalPrompt = await prependSessionInstruction(finalPrompt, sessionInstruction)
  }

  // 防御 Vue reactive Proxy → contextBridge structured clone 失败
  // 手动 JSON 序列化确保传给 IPC 的是纯对象，同时逐字段诊断
  const rawPayload = {
    prompt: finalPrompt, images, cwd: ownerProject?.cwd || '',
    sessionId: tab.sessionId,
    sandboxMode: tab.sandboxMode,
    networkAccessEnabled: tab.networkAccessEnabled,
    webSearchMode: tab.webSearchMode,
    model: tab.model || '',
    reasoningEffort: normalizeCodexReasoningEffort(tab.reasoningEffort),
    additionalDirectories: ownerProject?.additionalDirectories || [],
  }
  const payload = safeIpcPayload(rawPayload, 'codexAgentQuery')
  let accepted = true
  let queryResult = null
  try {
    queryResult = await window.electronAPI.codexAgentQuery?.(payload)
    // result?.accepted === false：结构化拒绝（session_already_running / session_close_timeout）
    // result?.accepted === true：Promise 路径正常完成（result.exitCode 为退出码）
    accepted = queryResult !== 0 && (!queryResult || queryResult.accepted !== false)
  } catch (_) {
    accepted = false
  }
  if (!accepted) {
    // 清除乐观设置的 thinking（await 之前设的），再根据拒绝类型决定是否重新显示
    markCodexIdle(tab)
    stopMetricsTimer()
    if (shouldQueueRejectedCodexInput(queryResult)) {
      markCodexQueued(tab, { text, messageId: userMsg.id })
      tab.metrics = {
        ...buildNewTurnMetrics(tab),
        sessionId: tab.sessionId,
        model: tab.model || tab.metrics?.model || metricsData.value.model || '',
        thinking: true,
      }
      if (tab.id === activeChatId.value) startMetricsTimer(tab._thinkingStart)
      saveHistory()
      if (shouldRetryRejectedCodexInput(queryResult) && !queuedRetryTimers.has(tab.sessionId)) {
        const timer = setTimeout(async () => {
          queuedRetryTimers.delete(tab.sessionId)
          if (!tab._queuedInput) return
          const retryText = tab._queuedInput
          tab._queuedInput = ''
          markCodexIdle(tab)
          await sendMessage(retryText, tab)
        }, 1200)
        queuedRetryTimers.set(tab.sessionId, timer)
      }
      return
    }
    // 非 queueable 拒绝（IPC 异常或意外返回值）：不清除用户消息，仅清理 thinking 状态。
    // 保留用户消息可以避免"消息消失"的恶劣体验；用户看到 toast 后可稍后重试。
    markCodexIdle(tab)
    ElMessage.warning({ message: t('agent.codexBusy'), showClose: true, duration: 5000 })
    saveHistory()
    return
  }
  // IPC 确认接受，thinking 已在 await 之前乐观设置
  if (queuedInputMessageId && tab._queuedInputMessageId === queuedInputMessageId) {
    tab._queuedInputMessageId = null
  }
  if (tab.thinking) {
    markCodexTurnAccepted(tab, {
      ...buildNewTurnMetrics(tab),
      sessionId: tab.sessionId,
      model: tab.metrics?.model || metricsData.value.model || '',
      thinking: true,
    })
    if (tab.id === activeChatId.value) startMetricsTimer(tab._thinkingStart)
  }
}

function sendFromStatusBar(text) {
  if (text === '/compact' && metricsData.value.compacting) return
  inputText.value = String(text || '')
  if (activeTab.value) activeTab.value.draftText = inputText.value
  if (inputEl.value) inputEl.value.value = inputText.value
  sendMessage(inputText.value)
}

async function openModelPicker() {
  if (activeTab.value) activeTab.value.draftText = ''
  inputText.value = ''
  slashSuggestions.value = []
  const tab = activeTab.value
  const sessionModel = String(tab?.model || tab?.metrics?.model || '').trim()
  const runtimeModel = String(await window.electronAPI?.codexGetModel?.() || '').trim()
  const stored = await window.electronAPI?.codexGetProviders?.()
  const { currentModel, items } = buildCodexModelSlots({
    storedProviders: stored,
    sessionModel,
    runtimeModel,
    defaultModel: String(codexDefaultModel.value || '').trim(),
  })
  const labelMap = {
    default: t('agent.defaultModel'),
    alt1: t('agent.altModel1'),
    alt2: t('agent.altModel2'),
    alt3: t('agent.altModel3'),
  }
  const modelItems = items.map(item => ({ id: item.id, label: labelMap[item.slot] || item.slot }))

  const result = await selectModelRef.value?.open?.({
    model: currentModel,
    reasoningEffort: tab?.reasoningEffort || codexDefaultReasoningEffort.value || '',
    modelOptions: modelItems,
  })
  if (!result) return
  if (tab) {
    tab.model = result.model
    tab.reasoningEffort = normalizeCodexReasoningEffort(result.effort)
    codexDefaultModel.value = result.model
    codexDefaultReasoningEffort.value = tab.reasoningEffort || ''
    slashModelName.value = result.label || result.model
    slashEffortLevel.value = normalizeCodexReasoningEffort(result.effort) || slashEffortLevel.value
    metricsData.value.model = result.model
    pushTabMessage(tab, { id: nextMsgId(), role: 'system', text: t('agent.switchedModel', { label: result.label, model: result.model }) })
    scrollBottom(tab.id)
    saveHistory()
  }
}

function setSlashEffortLevel(level) {
  const effort = normalizeCodexReasoningEffort(level)
  slashEffortLevel.value = effort
  window.electronAPI?.codexSetReasoningEffort?.(effort)
  codexDefaultReasoningEffort.value = effort
  const tab = activeTab.value
  if (tab) {
    tab.reasoningEffort = effort
    saveHistory()
  }
}

async function abortSession() {
  const tab = activeTab.value
  if (!tab) return
  if (tab._queuedInput) tab._queuedInput = ''
  if (tab._queuedInputMessageId) tab._queuedInputMessageId = null
  // 立即隐藏停止按钮给予即时反馈，_awaitingDone 阻止 sendMessage
  // 直到后端 abort 完成，避免下一条消息撞上 session_already_running
  markCodexAbortRequested(tab)
  stopMetricsTimer()
  try {
    await window.electronAPI.codexAgentAbort?.(tab.sessionId)
  } catch (_) {
    // abort 失败不阻塞状态清理
  }
  markCodexAborted(tab)
  saveHistory()
}


// IME
function onCompositionStart() { isComposing.value = true }
function onCompositionEnd(e) {
  isComposing.value = false
  onInputChange(e)
}
function onInputChange(e) {
  if (inputEl.value) inputEl.value.style.height = 'auto'
  if (inputEl.value) inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 160) + 'px'
  const query = extractMentionQuery(inputText.value || '', e?.target?.selectionStart)
  if (query == null) {
    clearMentionSuggestions()
  } else {
    refreshMentionSuggestionsDebounced(query)
  }
  const val = inputText.value || ''
  if (val.startsWith('/') && !val.includes(' ')) {
    slashSuggestions.value = slashCommands.value.filter(s => s.cmd.startsWith(val))
    slashIdx.value = 0
    refreshSlashCommandsLocalDebounced()
  } else {
    slashSuggestions.value = []
  }
}

function onKeydown(e) {
  if (e?.isComposing || isComposing.value) return
  if (slashSuggestions.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); slashIdx.value = (slashIdx.value + 1) % slashSuggestions.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); slashIdx.value = (slashIdx.value - 1 + slashSuggestions.value.length) % slashSuggestions.value.length; return }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      applySlash(slashSuggestions.value[slashIdx.value])
      return
    }
    if (e.key === 'Escape') {
      slashSuggestions.value = []
      return
    }
  }
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
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

const defaultMetrics = () => ({
  sessionId: '',
  model: '',
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  contextUsage: 0,
  contextWindow: 0,
  durationMs: 0,
  thinking: false,
  gitBranch: '',
  gitChanges: 0,
  usageApiSessionPct: null,
})

function buildNewTurnMetrics(tab) {
  const previous = tab?.metrics || {}
  return {
    ...previous,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    contextUsage: previous.contextUsage || 0,
    contextWindow: previous.contextWindow || 0,
    durationMs: 0,
    speedOutputPerSec: 0,
  }
}

function hasCodexTurnTokenSample(data = {}) {
  return ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens']
    .some(key => Object.prototype.hasOwnProperty.call(data, key) && Number(data[key]) > 0)
}

function mergeCodexRuntimeMetrics(current = {}, data = {}, tab = null) {
  const next = { ...data }
  if (tab?.thinking && !hasCodexTurnTokenSample(data)) {
    delete next.inputTokens
    delete next.outputTokens
    delete next.cacheReadTokens
    delete next.cacheCreationTokens
  }
  return mergeCodexMetrics(current, next, { sessionId: data.sessionId || current.sessionId || tab?.sessionId || '' })
}

const metricsData = computed(() => {
  const tab = activeTab.value
  if (!tab) return defaultMetrics()
  return {
    ...defaultMetrics(),
    ...(tab.metrics || {}),
    model: tab.model || tab.metrics?.model || '',
    sessionId: tab.sessionId,
    compacting: !!tab._compacting,
  }
})
const metricsLiveDurationMs = ref(0)
let metricsLiveTimer = null

function stopMetricsTimer() {
  if (metricsLiveTimer) {
    clearInterval(metricsLiveTimer)
    metricsLiveTimer = null
  }
  metricsLiveDurationMs.value = 0
}

function startMetricsTimer(start) {
  stopMetricsTimer()
  if (!start) return
  metricsLiveDurationMs.value = Math.max(0, Date.now() - start)
  metricsLiveTimer = setInterval(() => {
    metricsLiveDurationMs.value = Math.max(0, Date.now() - start)
  }, 1000)
}

function syncMetricsTimerForActiveTab() {
  const tab = activeTab.value
  if (!tab?.thinking || !tab._thinkingStart) {
    stopMetricsTimer()
    return
  }
  startMetricsTimer(tab._thinkingStart)
}

async function refreshMetricsForChat(chat) {
  if (!chat) {
    stopMetricsTimer()
    return
  }
  if (chat.thinking && chat._thinkingStart) startMetricsTimer(chat._thinkingStart)
  else stopMetricsTimer()
  if (!window.electronAPI?.codexAgentQueryMetrics) return
  try {
    const result = await window.electronAPI.codexAgentQueryMetrics({
      sessionId: chat.sessionId,
      cliSessionId: chat.cliSessionId,
      filePath: chat.filePath,
      model: chat.model || chat.metrics?.model || metricsData.value.model || '',
      cwd: activeProject.value?.cwd || chat.cwd || '',
    })
    if (!result) return
    onMetricsUpdate({
      ...result,
      sessionId: chat.sessionId,
      thinking: Boolean(chat.thinking),
    })
  } catch (_) {}
}

function onMetricsUpdate(data) {
  if (!data) return
  if (!data.sessionId) return
  const tab = projects.value.flatMap(p => p.chats || []).find(c => c.sessionId === data.sessionId)
  if (!tab) return
  const { thinking: metricsThinking, ...metricsPayload } = data
  tab.metrics = mergeCodexRuntimeMetrics(tab.metrics || {}, metricsPayload, tab)
  if (data.model) tab.model = data.model
  if (typeof metricsThinking === 'boolean') {
    applyCodexMetrics(tab, { ...data, thinking: metricsThinking })
  }
  if (tab.id === activeChatId.value) {
    if (tab.thinking && tab._thinkingStart) startMetricsTimer(tab._thinkingStart)
    else stopMetricsTimer()
  }
}

// Refs
const apiSettingRef = ref(null)
const codexPluginsRef = ref(null)
const codexSkillsRef = ref(null)
const sessionInstructionRef = ref(null)
const activeSessionInstructionEnabled = ref(false)

// 同步活跃 session 的指令启用状态
watch(() => activeTab.value?.sessionId, () => {
  void refreshActiveSessionInstructionState()
}, { immediate: true })

watch(
  () => ({
    id: activeTab.value?.id || '',
    sessionId: activeTab.value?.sessionId || '',
    cliSessionId: activeTab.value?.cliSessionId || '',
    thinking: Boolean(activeTab.value?.thinking),
    thinkingStart: activeTab.value?._thinkingStart || 0,
  }),
  () => {
    const tab = activeTab.value
    inputText.value = typeof tab?.draftText === 'string' ? tab.draftText : ''
    syncMetricsTimerForActiveTab()
    void refreshMetricsForChat(tab)
  },
  { immediate: true }
)

watch(inputText, (value) => {
  const tab = activeTab.value
  if (!tab) return
  const next = typeof value === 'string' ? value : ''
  if (tab.draftText === next) return
  tab.draftText = next
  saveHistory()
})

const canSend = computed(() => {
  if (!activeProject.value?.cwdLocked || !activeTab.value) return false
  if (isActiveTabHistoryDeferred.value) return false
  return Boolean((inputText.value || '').trim() || pendingImages.value.length)
})

function trimMessages(tab, skipScrollCompensation) {
  if (!tab || (tab.messages || []).length <= MAX_MESSAGES) return
  const overflow = tab.messages.length - MAX_MESSAGES
  tab.messages.splice(0, overflow)
  tab.currentPage = 0
  if (tab.filePath) tab.hasMoreHistory = true
  tab.pageSize = tab.pageSize || 60

  if (!skipScrollCompensation) {
    const scrollEl = msgRefs[tab.id]
    const oldScrollHeight = scrollEl ? scrollEl.scrollHeight : 0
    const oldScrollTop = scrollEl ? scrollEl.scrollTop : 0
    nextTick(() => {
      if (!scrollEl) return
      const newScrollHeight = scrollEl.scrollHeight
      scrollEl.scrollTop = oldScrollTop - (oldScrollHeight - newScrollHeight)
    })
  }
}

/** 过滤 Codex session 文件中的系统上下文消息（环境信息、系统提醒等不应在 UI 显示） */
/** 检测消息是否包含项目文档（AGENTS.md / CLAUDE.md）泄漏内容 */
function isAgentDocLeak(m) {
  const text = typeof m?.text === 'string' ? m.text : ''
  const contentText = Array.isArray(m?.content)
    ? m.content.map(b => b?.text || '').join('\n')
    : text
  const t = (text || contentText).trim()
  if (!t) return false
  // 匹配 AGENTS.md / CLAUDE.md 的标志性标题和章节
  const docMarkers = [
    '# MindCraft AGENTS',
    '# MindCraft — Claude Code',
    '# AGENTS.md instructions',
    '## 项目定位',
    '## 关键路径',
    '## 常用命令',
    '## 开发注意事项',
    '## 协作约定',
  ]
  const hitCount = docMarkers.filter(marker => t.includes(marker)).length
  // 同时命中 2 个以上标志性内容，判定为文档泄漏
  return hitCount >= 2
}

// 移除 SDK 注入到 user 消息中的系统上下文标签
// 委托给 helpers.js 共享实现，与 Claude Code 保持同步（避免白名单漂移）
function stripCodexSystemContextTags(text) {
  if (!text || typeof text !== 'string') return ''
  return stripSystemContextTagsShared(text)
}

// 开关：从用户消息文本中剥离 compact 上下文，只保留真实用户输入
let STRIP_COMPACT_FROM_USER = true

// 从用户消息文本中提取真实用户输入（与 Claude Code 共用逻辑）
function extractRealUserInput(text) {
  if (!text || typeof text !== 'string') return text
  const s = text.trim()
  if (!s) return text

  // 中文分隔符：lastIndexOf 取最后一个（用户输入在末尾）
  const cnDelimiters = ['\n用户当前问题：', '用户当前问题：']
  for (const delim of cnDelimiters) {
    const idx = s.lastIndexOf(delim)
    if (idx !== -1) {
      const after = s.substring(idx + delim.length).trim()
      return after || ''
    }
  }

  // 英文分隔符
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

  // 有 compact 标记但无分隔符 → 整段不可靠
  const hasCompactMarker = /以下是上一会话压缩后的上下文摘要/.test(s)
    || /本会话从之前的对话延续/.test(s)
    || /^This session is being continued from a previous conversation/im.test(s)
  if (hasCompactMarker) return ''

  return text
}

function filterCodexSystemMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter(m => {
    // 过滤 init 子系统消息
    if (m?.type === 'system' && m?.subtype === 'init') return false

    // 过滤 role/system 标记的系统消息（含 XML 系统标签的）
    if (m?.role === 'system' || m?.type === 'system') {
      const text = typeof m?.text === 'string' ? m.text : ''
      const stripped = stripCodexSystemContextTags(text)
      if (!stripped) return false
    }

    // 过滤 AGENTS.md / CLAUDE.md 等文档内容泄漏
    if (isAgentDocLeak(m)) return false

    // 过滤纯系统上下文伪装的 user 消息（CodeX 可能将系统指令注入为首条 user 消息）
    if (m?.role === 'user') {
      // 剥离 compact 上下文，只保留真实用户输入
      if (STRIP_COMPACT_FROM_USER) {
        const rawText = typeof m?.text === 'string' ? m.text : ''
        if (rawText) {
          const cleaned = extractRealUserInput(rawText)
          if (cleaned !== rawText) {
            m.text = cleaned
            // 同步更新 content blocks 中的文本
            if (Array.isArray(m?.content)) {
              const nonTextBlocks = m.content.filter(b =>
                b?.type === 'image' || b?.type === 'file' || b?.type === 'input_image' || b?.type === 'input_file'
              )
              m.content = cleaned
                ? [{ type: 'text', text: cleaned }, ...nonTextBlocks]
                : nonTextBlocks
            }
          }
        }
      }

      const text = typeof m?.text === 'string' ? m.text.trim() : ''
      if (!text && !(Array.isArray(m?.content) && m.content.some(b =>
        (b?.type === 'image' && b.source) || (b?.type === 'file' && b.source) ||
        (b?.type === 'input_image' && b.image_url) || (b?.type === 'input_file' && b.file_url)
      ))) return false // 无文本且无附件 → 不显示

      // content blocks 格式：检查是否存在真实用户输入
      if (Array.isArray(m?.content) && m.content.length > 0) {
        const hasRealText = m.content.some(b => {
          if (!b) return false
          if (b.type === 'text' || b.type === 'input_text' || b.type === 'output_text') {
            const stripped = stripCodexSystemContextTags(b.text || '')
            if (!stripped) return false
            return true
          }
          // 图片/文件附件也算有效内容
          if (b.type === 'image' && b.source) return true
          if (b.type === 'file' && b.source) return true
          return false
        })
        if (!hasRealText) return false
      }

      // 剥离注入到 user 消息中的 SDK 系统上下文标签
      // （INSTRUCTIONS / environment_context / task-notification 等）
      // 注：hasRealText 仅用剥离结果做过滤判断，未实际修改消息内容，
      // 导致系统标签残留在 UI 展示中——此处显式剥离
      if (typeof m?.text === 'string') {
        m.text = stripCodexSystemContextTags(m.text)
      }
      if (Array.isArray(m?.content)) {
        m.content = m.content.map(b => {
          if (b && (b.type === 'text' || b.type === 'input_text' || b.type === 'output_text')) {
            return { ...b, text: stripCodexSystemContextTags(b.text || '') }
          }
          return b
        })
      }
      if (!isVisibleCodexUserMessage(m)) return false
    }

    return true
  })
}

async function ensureChatMessagesLoaded(chat) {
  if (CODEX_DEBUG) console.log('ensureChatMessagesLoaded', chat)
  if (!chat?.filePath || !window.electronAPI?.codexReadSessionFileRange) return
  try {
    const rawData = await window.electronAPI.codexReadSessionFileRange({
      filePath: chat.filePath,
      page: 0,
      pageSize: 60,
    })
    if (CODEX_DEBUG) console.log(rawData,'rawData--------------------------')
    if (!rawData?.messages?.length) return
    const allMessages = filterCodexSystemMessages(rawData.messages)
    const n = Math.min(MAX_MESSAGES, allMessages.length)
    chat.messages = allMessages.slice(-n)
    normalizeFileChangeMessages(chat.messages)
    chat.hasMoreHistory = Boolean(rawData.hasMore)
    chat.currentPage = 0
    chat.pageSize = 60
    chat._messagesLoaded = true
    if (chat.id === activeChatId.value) void refreshMetricsForChat(chat)
  } catch (_) {}
}

async function loadMoreHistory(scrollEl) {
  const chat = activeTab.value
  if (!chat || !chat.hasMoreHistory || chat.loadingMore || !chat.filePath) return
  if (loadMoreCooldownTimer) return
  loadMoreCooldownTimer = setTimeout(() => { loadMoreCooldownTimer = null }, 1000)

  chat.loadingMore = true
  try {
    // 加载前记录容器高度，用于加载后补偿滚动位置
    const oldScrollHeight = scrollEl ? scrollEl.scrollHeight : 0
    const rawData = await window.electronAPI.codexReadSessionFileRange({
      filePath: chat.filePath,
      page: chat.currentPage + 1,
      pageSize: chat.pageSize
    })
    if (CODEX_DEBUG) console.log(rawData,'rawData')
    if (!rawData?.messages?.length) {
      chat.hasMoreHistory = false
      return
    }

    // 用 unshift 批量插入，统一使用 filterCodexSystemMessages 过滤系统上下文消息
    const filtered = filterCodexSystemMessages(rawData.messages)
    chat.messages.unshift(...filtered)
    normalizeFileChangeMessages(chat.messages)
    chat.hasMoreHistory = rawData.hasMore
    chat.currentPage++

    // 加载后补偿滚动位置，保持视觉不变
    nextTick(() => {
      if (scrollEl) {
        const newScrollHeight = scrollEl.scrollHeight
        scrollEl.scrollTop = newScrollHeight - oldScrollHeight
      }
    })
    // 注意：不在此调用 trimMessages。unshift 在数组头部添加消息，trimMessages
    // 也从头部删除（splice(0, overflow)），会导致刚加载的历史消息被立即裁剪。
    // 裁剪只在 onAgentDone 时触发（新消息从尾部追加，裁剪头部是安全的）。
  } catch (e) {
    console.warn('[loadMoreHistory] failed:', e?.message || e)
  } finally {
    chat.loadingMore = false
  }
}

onMounted(async () => {
  codexConfigStore.loadSandboxMode()
  codexConfigStore.loadDefaultNetworkAccess()
  codexConfigStore.loadDefaultWebSearch()
  await loadCodexModelDefaults()
  await loadGlobalCodexSafeMode()
  window.addEventListener('beforeunload', flushOnUnload)
  window.addEventListener('codex-open-plugins', () => { codexPluginsRef.value?.open?.() })
  window.electronAPI.onCodexAgentMessage(onAgentMessage)
  window.electronAPI.onCodexAgentDone((payload) => {
    onAgentDone(payload)
    // 若有排队消息，在当前 turn 结束后自动 flush
    const target = resolveQueuedInputFlushTarget({
      payload,
      projects: projects.value,
      activeProject: activeProject.value,
    })
    if (!canFlushQueuedInputTarget(target)) return
    const { tab, text } = target
    tab._queuedInput = ''
    const queuedInputMessageId = tab._queuedInputMessageId || null
    nextTick(async () => {
      // targetTab lets queued flush run without stealing the user's active tab.
      await nextTick()
      await sendMessage(text, tab)
      if (tab._queuedInputMessageId === queuedInputMessageId) tab._queuedInputMessageId = null
    })
  })
  window.electronAPI.onCodexAgentMetrics?.(onMetricsUpdate)
  _unregAgentEvent = window.electronAPI.onAgentEvent((event) => {
    const { shouldPlay } = shouldPlayNotificationSound(event)
    if (shouldPlay) playDoneSound()
  })

  window.electronAPI.codexGetModel?.().then(m => {
    if (!m) return
    codexDefaultModel.value = String(m || '').trim()
    const tab = activeTab.value
    if (!tab) return
    tab.metrics = { ...(tab.metrics || {}), sessionId: tab.sessionId, model: tab.metrics?.model || m }
  })
  await refreshSlashCommands()

  const restored = codexSafeModeEnabled.value ? false : await loadHistory()
  if (!restored) {
    newProject()
  } else {
    activeProjectId.value = projects.value[projects.value.length - 1]?.id || null
    const p = activeProject.value
    // 恢复后重新排序（F001：按最新对话时间）
    if (p?.chats?.length) p.chats = sortChatsByRecency(p.chats)
    const latestChatId = getLatestChatId(p?.chats || [])
    if (latestChatId) switchChat(latestChatId)
    else activeChatId.value = null
    // 恢复后立即注册所有会话的 cliSessionId 映射（对齐 ClaudeCode T046 根因 B 修复）
    // 避免后端 cliSessionIds Map 为空时，下一条消息执行 startThread（创建新会话）而非 resumeThread
    {
      const sessionMap = {}
      for (const c of projects.value.flatMap(pp => pp.chats || [])) {
        if (c.sessionId && c.cliSessionId && c._resumeAllowed !== false) sessionMap[c.sessionId] = c.cliSessionId
      }
      if (Object.keys(sessionMap).length) window.electronAPI.codexRegisterCliSessions?.(sessionMap)
    }
    // T022: 先 await 活跃项目的 session 扫描，确保 resumeThread 映射就绪再允许用户交互
    const activeProj = activeProject.value
    if (activeProj?.cwdLocked && activeProj?.cwd) {
      if (!activeProj._settingsLoaded) { activeProj._settingsLoaded = true; loadProjectSettings(activeProj) }
      await refreshProjectSessionsInBackground(activeProj)
    }
    // 其余项目后台扫描
    for (const project of projects.value) {
      if (project === activeProj || !project?.cwdLocked || !project?.cwd) continue
      if (!project._settingsLoaded) { project._settingsLoaded = true; loadProjectSettings(project) }
      void refreshProjectSessionsInBackground(project)
    }
  }
  isReady.value = true
  initializing.value = false
})

// --- expose for codeHub unified tabs ---
defineExpose({
  projectTabData: computed(() => projects.value.map(p => {
    const chats = p.chats || []
    return {
      id: p.id,
      name: p.cwd ? p.cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || t('codehub.noFolder') : t('codehub.noFolder'),
      cwd: p.cwd || '',
      cwdLocked: Boolean(p.cwdLocked),
      runningCount: getRunningCount(chats),
      hasPendingTool: hasPendingToolInChats(chats),
      hasDoneNotification: Boolean(p.hasDoneNotification),
      createdAt: p.createdAt || 0,
    }
  })),
  activeProjectId,
  createProject() { newProject(); return activeProjectId.value },
  switchProject,
  deleteProject(id) { const p = projects.value.find(x => x.id === id); if (p) requestDeleteProject(p) },
  refreshSessions() { handleRefreshSessions() },
  ready: isReady,
})

onActivated(() => {
  // keep-alive 恢复后滚动到底部：ResizeObserver 不触发，需手动滚到底
  nextTick(() => smartScrollBottom())
})

onUnmounted(() => {
  if (mentionRefreshTimer) {
    clearTimeout(mentionRefreshTimer)
    mentionRefreshTimer = null
  }
  stopMetricsTimer()
  window.removeEventListener('beforeunload', flushOnUnload)
  for (const timer of queuedRetryTimers.values()) clearTimeout(timer)
  queuedRetryTimers.clear()
  flushOnUnload()
  dispose()
  _unregAgentEvent?.()
  window.electronAPI.offCodexAgentListeners?.()
  if (loadMoreCooldownTimer) { clearTimeout(loadMoreCooldownTimer); loadMoreCooldownTimer = null }
  if (scrollThrottleTimer) { clearTimeout(scrollThrottleTimer); scrollThrottleTimer = null }
  if (wheelThrottleTimer) { clearTimeout(wheelThrottleTimer); wheelThrottleTimer = null }
  if (slashLocalRefreshTimer) { clearTimeout(slashLocalRefreshTimer); slashLocalRefreshTimer = null }
})
</script>

<style>
.cc-wrap {
  --scrollbar-size: 6px;
  --scrollbar-radius: 4px;
  --scrollbar-track: transparent;
  --scrollbar-thumb: var(--cc-scrollbar-thumb);
  --scrollbar-thumb-hover: var(--cc-scrollbar-thumb-hover);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.cc-wrap * { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track); }
.cc-wrap ::-webkit-scrollbar { width: var(--scrollbar-size); height: var(--scrollbar-size); background-color: transparent; }
.cc-wrap ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
.cc-wrap ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: var(--scrollbar-radius); }
.cc-wrap ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
[class*="cc-theme-"] ::-webkit-scrollbar { width: 6px; height: 6px; background-color: transparent; }
[class*="cc-theme-"] ::-webkit-scrollbar-track { background: transparent; }
[class*="cc-theme-"] ::-webkit-scrollbar-thumb { background: var(--cc-scrollbar-thumb); border-radius: 4px; }
[class*="cc-theme-"] ::-webkit-scrollbar-thumb:hover { background: var(--cc-scrollbar-thumb-hover); }

.cc-wrap {
  display: flex; flex-direction: column; width: 100%; height: 100%;
  background: var(--cc-bg); color: var(--cc-text); overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;
}
.cc-content { display: flex; flex: 1; overflow: hidden; min-height: 0; }
.cc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; }

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

.cc-wrap.cc-first-query-lock :deep(.cc-toolbar) {
  pointer-events: none; opacity: 0.52; user-select: none; filter: saturate(0.7); overflow: hidden;
}

.cc-messages-area {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.cc-messages-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--cc-bg);
}
.cc-messages { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; padding: 12px 0 8px; transition: padding-top 0.2s ease; }
.cc-messages-placeholder { display: flex; align-items: center; justify-content: center; pointer-events: none; user-select: none; }
.cc-messages-placeholder-inner { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 280px; text-align: center; }
.cc-ph-icon { font-size: 28px; color: var(--cc-primary); opacity: 0.45; }
.cc-ph-title { font-size: 14px; font-weight: 600; color: var(--cc-ph-title); }
.cc-ph-sub { margin: 0; font-size: 12px; line-height: 1.5; color: var(--cc-ph-sub); }
.cc-ph-sub-quiet { opacity: 0.78; }
.cc-ph-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; pointer-events: auto; }
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
.cc-secondary-btn {
  margin-top: 16px; padding: 14px 24px;
  background: var(--cc-bg-secondary); color: var(--cc-text);
  border: 1px solid var(--cc-border); border-radius: 10px;
  font-size: 14px; font-weight: 700; cursor: pointer; pointer-events: auto;
  transition: background 0.15s, border-color 0.15s;
}
.cc-secondary-btn:hover {
  background: var(--cc-menu-hover);
  border-color: var(--cc-border-focus);
}

.cc-input-area {
  padding: 8px 10px 10px; flex-shrink: 0; background: var(--cc-bg);
  border-top: 1px solid var(--cc-border-light); position: relative;
  width: 100%; box-sizing: border-box; max-height: none;
}
.input-box {
  display: flex; align-items: flex-end; gap: 5px; background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border); border-radius: 10px; padding: 6px 6px 6px 11px;
  min-height: 26px; margin-bottom: 4px; max-height: 200px; transition: border-color 0.15s;
}
.input-box:focus-within {
  border-color: var(--cc-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cc-primary) 22%, transparent);
}
.cc-textarea:focus { box-shadow: none !important; }
.input-box.disabled { border-color: var(--cc-border); }
.input-box.disabled .cc-textarea, .input-box.disabled .attach-btn { opacity: 0.42; pointer-events: none; }
.cc-textarea {
  flex: 1; background: none; border: none; outline: none; color: var(--cc-text);
  font-size: 13px; line-height: 1.5; resize: none; min-height: 22px; max-height: 160px;
  font-family: inherit; padding: 0;
}
.cc-textarea::placeholder { color: var(--cc-text-placeholder); }
.input-actions { display: flex; align-items: flex-end; gap: 3px; }
.send-btn {
  width: 28px; height: 28px; border-radius: 6px; background: var(--cc-primary); border: none;
  color: var(--cc-btn-primary-text); cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.12s;
}
.send-btn:disabled { background: var(--cc-btn-disabled-bg); color: var(--cc-btn-disabled-text); cursor: default; }
.send-btn:not(:disabled):hover { background: var(--cc-primary-hover); }
.abort-btn {
  width: 28px; height: 28px; border-radius: 6px; background: var(--cc-primary); border: none;
  color: var(--cc-btn-primary-text); cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, transform 0.08s;
}
.abort-btn:hover { background: var(--cc-primary-hover); }
.abort-btn:active { transform: scale(0.96); }

.drop-mask {
  position: fixed; inset: 0; background: var(--cc-drop-mask-bg);
  border: 2px dashed var(--cc-primary); z-index: 100;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; color: var(--cc-primary); pointer-events: none;
}

.cc-wrap .hljs { background: transparent !important; color: var(--cc-hljs-text) !important; }
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
