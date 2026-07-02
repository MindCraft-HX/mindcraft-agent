<template>
  <div class="codehub-wrap" :class="themeClass">
    <!-- ===== 统一 Tab 栏 ===== -->
    <div class="codehub-unified-tabs" v-if="initDone && unifiedTabs.length > 0">
      <div
        v-for="(tab, idx) in unifiedTabs"
        :key="tab.id"
        class="codehub-tab"
        :class="{
          active: tab.id === activeTabId,
          'task-done': tab.hasDoneNotification && tab.id !== activeTabId,
          'session-running': tab.runningCount > 0,
          'session-pending': tab.hasPendingTool,
          'drag-over': dragOverTabIdx === idx,
          dragging: dragTabIdx === idx,
        }"
        draggable="true"
        @click="activateTab(tab)"
        @contextmenu.prevent="openContextMenu($event, tab)"
        @dragstart="onDragStart($event, idx)"
        @dragover.prevent="onDragOver($event, idx)"
        @dragleave="onDragLeave"
        @dragend="onDragEnd($event)"
        @drop="onDrop($event, idx)"
        :title="tab.cwd || $t('codehub.noFolder')"
      >
        <span class="codehub-tab-agent-icon" :class="tab.iconClass" :style="tab.iconStyle"></span>
        <span class="codehub-tab-name">
          <span v-if="tab.runningCount === 1" class="running-dot" :title="$t('codehub.running')"></span>
          <span v-else-if="tab.runningCount >= 2" class="running-badge" :title="$t('codehub.sessionsRunning', { n: tab.runningCount })">{{ tab.runningCount }}</span>
          <span v-else-if="tab.hasPendingTool" class="pending-dot" :title="$t('codehub.waitingUser')"></span>
          {{ tab.name }}
        </span>
        <button class="codehub-tab-close" @click.stop="closeTab(tab)" :title="$t('codehub.close')">×</button>
      </div>
      <button class="codehub-tab-add" @click="openAgentPicker('user')" :title="$t('codehub.newTab')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/></svg>
      </button>
    </div>

    <!-- ===== Context Menu ===== -->
    <div
      v-if="ctxMenu.visible"
      class="codehub-ctx-menu"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
    >
      <div class="codehub-ctx-item" @click="ctxCloseThis">
        <span class="codehub-ctx-icon">✕</span> {{ $t('codehub.closeTab') }}
      </div>
      <div class="codehub-ctx-item" @click="ctxCloseAll">
        <span class="codehub-ctx-icon">✖</span> {{ $t('codehub.closeAllTabs') }}
      </div>
    </div>

    <!-- ===== 内容区：始终渲染 Agent 组件 ===== -->
    <div class="codehub-content">
      <div v-if="!initDone" class="codehub-init-overlay">
        <div class="codehub-init-card">
          <div class="codehub-init-spinner"></div>
          <div class="codehub-init-title">{{ $t('agent.restoringSession') }}</div>
          <div class="codehub-init-sub">{{ $t('agent.restoringSessionHint') }}</div>
        </div>
      </div>
      <template v-for="agent in agents" :key="agent.key">
        <component
          v-if="mountedMap[agent.key]"
          v-show="activeAgent === agent.key"
          :is="agent.component"
          :ref="(el) => { if (el) panelRefs[agent.key] = el }"
        />
      </template>

      <!-- 局部空状态：只在内容区显示 -->
      <div v-if="showEmptyOverlay" class="codehub-empty-overlay">
        <div class="codehub-empty">
          <div class="codehub-empty-icon mindcraft-flow-win-iconfont icon-mindcraft-claude1"></div>
          <div class="codehub-empty-title">{{ $t('codehub.title') }}</div>
          <div class="codehub-empty-sub">{{ $t('codehub.selectHint') }}</div>
          <button class="codehub-empty-btn" @click="openAgentPicker('user')">{{ $t('codehub.selectAgentBtn') }}</button>
        </div>
      </div>
    </div>

    <!-- ===== 内联 Agent 选择界面（只在对话区域显示） ===== -->
    <div v-if="showAgentPicker" class="codehub-picker-local" @click.self="closeAgentPicker">
      <div class="codehub-picker-card" :class="themeClass" @click.stop>
        <div class="codehub-picker-head">
          <div class="codehub-picker-title">{{ $t('codehub.selectAgent') }}</div>
          <button v-if="unifiedTabs.length > 0" class="codehub-picker-close" @click="closeAgentPicker">×</button>
        </div>
        <div class="codehub-picker-list">
          <div v-for="agent in agents" :key="agent.key"
               class="codehub-picker-option" @click="onAgentSelected(agent.key)">
            <div class="picker-option-icon">
              <div :class="agent.iconClass" :style="agent.iconStyle"></div>
            </div>
            <div class="picker-option-info">
              <div class="picker-option-name">{{ agent.name }}</div>
              <div class="picker-option-desc">{{ $t(agent.descriptionKey) }}</div>
            </div>
            <svg class="picker-option-arrow" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
    <SharedSettings ref="sharedSettingsRef" />
  </div>
</template>

<script setup>
defineOptions({ name: 'codeHub' })

import { ref, computed, watch, watchEffect, onMounted, onUnmounted, nextTick, reactive, provide, inject } from 'vue'
import { useRoute } from 'vue-router'
import { useClaudeThemeStore } from '../../stores/claudeTheme.js'
import SharedSettings from './SharedSettings.vue'
import { normalizeRequestedAgent, pickInitialCodeHubTab } from './agentRoutePreference.mjs'
import { resolveCodeHubSyncedTabId } from './activeTabSync.mjs'
import { orderCodeHubTabs, reconcileCodeHubTabOrder } from './tabOrder.mjs'
import { shouldAutoShowAgentPicker } from './agentPickerPrompt.mjs'
import { useAgentRegistry } from '../../registry/useAgentRegistry.js'
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts.js'
import { perfStart, perfCount } from '../agentCommon/utils/rendererPerfProbe.mjs'

const claudeTheme = useClaudeThemeStore()
const route = useRoute()
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`)

const { agents, agentKeys, getAgentMeta, isRegistered, createMountedMap } = useAgentRegistry()

const panelRefs = reactive({})
const sharedSettingsRef = ref(null)
const showAgentPicker = ref(false)
const agentPickerOpenReason = ref(null)
const activeTabId = ref(null)
const tabOrder = ref(loadTabOrder())
const { register } = useKeyboardShortcuts()
const _shortcutUnregisters = []
const CODEHUB_TAB_DEBUG = import.meta.env?.DEV
let lastTabDebugSignature = ''

function tabDebugSnapshot(extra = {}) {
  const mounted = Object.fromEntries(Object.keys(mountedMap).map(key => [key, Boolean(mountedMap[key])]))
  const panelState = Object.fromEntries(agentKeys.value.map(key => {
    const panel = panelRefs[key]
    return [key, {
      hasPanel: Boolean(panel),
      ready: Boolean(panel?.ready),
      activeProjectId: panel?.activeProjectId?.value || null,
      projectTabs: Array.isArray(panel?.projectTabData) ? panel.projectTabData.length : null,
    }]
  }))
  return {
    initDone: initDone.value,
    activeTabId: activeTabId.value,
    activeAgent: activeAgent.value,
    tabIds: unifiedTabs.value.map(t => t.id),
    tabOrder: [...tabOrder.value],
    mounted,
    panelState,
    ...extra,
  }
}

function debugCodeHubTabs(event, extra = {}, { force = false } = {}) {
  if (!CODEHUB_TAB_DEBUG) return
  const snapshot = tabDebugSnapshot(extra)
  const signature = JSON.stringify({
    event,
    initDone: snapshot.initDone,
    activeTabId: snapshot.activeTabId,
    tabIds: snapshot.tabIds,
    tabOrder: snapshot.tabOrder,
    mounted: snapshot.mounted,
    panelState: snapshot.panelState,
  })
  if (!force && signature === lastTabDebugSignature) return
  lastTabDebugSignature = signature
  console.log(`[codehub-tabs] ${event}`, snapshot)
}

function loadTabOrder() {
  try {
    const raw = localStorage.getItem('codehub_tab_order')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveTabOrder() {
  localStorage.setItem('codehub_tab_order', JSON.stringify(tabOrder.value))
}

function openAgentPicker(reason = 'user') {
  agentPickerOpenReason.value = reason
  showAgentPicker.value = true
}

function closeAgentPicker() {
  agentPickerOpenReason.value = null
  showAgentPicker.value = false
}

function restoreHints() {
  return {
    savedTabId: localStorage.getItem('codehub_active_tab') || '',
    requestedAgent: normalizeRequestedAgent(route.query?.agent),
    requestedProjectId: route.query?.projectId || '',
    tabOrder: tabOrder.value,
  }
}

function maybeAutoOpenAgentPicker() {
  if (shouldAutoShowAgentPicker({
    tabs: unifiedTabs.value,
    ...restoreHints(),
  })) {
    openAgentPicker('auto-empty')
    return
  }
  if (agentPickerOpenReason.value === 'auto-empty') closeAgentPicker()
}

// 统一 Tab 目前依赖各 Agent panel 暴露的 projectTabData；未挂载的 panel 不会执行 loadHistory。
// 在 CodeHub 级 session index 独立出来前，启动时必须挂载所有已注册 Agent，避免冷启动丢失历史 Tab。
const mountedMap = reactive(createMountedMap(agentKeys.value))

const ctxMenu = reactive({ visible: false, x: 0, y: 0, tab: null })

// ── TAB 拖拽排序 ──
const dragTabIdx = ref(-1)
const dragOverTabIdx = ref(-1)

function onDragStart(e, index) {
  dragTabIdx.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(index))
  if (e.target) e.target.style.opacity = '0.45'
}

function onDragOver(e, index) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverTabIdx.value = index
}

function onDragLeave() {
  dragOverTabIdx.value = -1
}

function onDragEnd(e) {
  if (e.target) e.target.style.opacity = ''
  dragTabIdx.value = -1
  dragOverTabIdx.value = -1
}

function onDrop(e, toIndex) {
  e.preventDefault()
  const fromIndex = dragTabIdx.value
  if (e.target) e.target.style.opacity = ''
  dragTabIdx.value = -1
  dragOverTabIdx.value = -1
  if (fromIndex < 0 || fromIndex === toIndex) return
  reorderUnifiedTab(fromIndex, toIndex)
}

// 统一的 Tab 列表（只从已挂载的 Agent 收集）
function collectTabs(panel, agentType, meta) {
  const stop = perfStart('codehub.collectTabs')
  const data = panel?.projectTabData
  if (!data) { stop({ tabs: 0 }); return [] }
  const result = data.map(p => ({
    ...p,
    projectId: p.id,
    id: `${agentType}:${p.id}`,
    agentType,
    iconClass: meta.iconClass,
    iconStyle: meta.iconStyle,
  }))
  stop({ tabs: result.length })
  return result
}

const unifiedTabs = computed(() => {
  const tabs = []
  for (const key of agentKeys.value) {
    if (mountedMap[key]) {
      const panel = panelRefs[key]
      if (panel) {
        tabs.push(...collectTabs(panel, key, getAgentMeta(key)))
      }
    }
  }
  return orderCodeHubTabs(tabs, tabOrder.value)
})

const activeAgent = computed(() => {
  const tab = unifiedTabs.value.find(t => t.id === activeTabId.value)
  return tab?.agentType || 'claudeCode'
})

const showEmptyOverlay = computed(() => {
  return initDone.value && unifiedTabs.value.length === 0
})

// ── 激活 Tab（核心：同步 activeTabId + 调用 switchProject）──
let _tabActivationInit = true  // 首次恢复时不刷，避免初始 toast
function activateTab(tab, preferredChat = null) {
  debugCodeHubTabs('activateTab:start', { tabId: tab?.id, preferredChat }, { force: true })
  activeTabId.value = tab.id
  localStorage.setItem('codehub_active_tab', tab.id)

  // 如果 Agent 尚未挂载，先挂载，下一帧再切换
  if (!mountedMap[tab.agentType]) {
    mountedMap[tab.agentType] = true
    nextTick(() => doSwitchProject(tab, preferredChat))
    return
  }
  doSwitchProject(tab, preferredChat)
}

function doSwitchProject(tab, preferredChat = null) {
  const panel = getPanel(tab.agentType)
  if (!panel) {
    debugCodeHubTabs('switchProject:missing-panel', { tabId: tab?.id, agentType: tab?.agentType }, { force: true })
    return
  }
  debugCodeHubTabs('switchProject:start', {
    tabId: tab?.id,
    projectId: tab?.projectId,
    agentType: tab?.agentType,
    preferredChat,
  }, { force: true })
  panel.switchProject(tab.projectId, preferredChat)
  if (!_tabActivationInit) {
    nextTick(() => panel.refreshSessions?.())
  }
  _tabActivationInit = false
}

// 从 route query 提取期望激活的会话（来自首页项目条目点击）
function preferredChatFromQuery() {
  const chatId = route.query?.chatId
  const sessionId = route.query?.sessionId
  if (chatId == null && !sessionId) return null
  return { chatId: chatId ?? null, sessionId: sessionId || null }
}

// ── 恢复上次激活的 Tab ──
function restoreActiveTab() {
  const tabs = unifiedTabs.value
  if (!tabs.length) {
    debugCodeHubTabs('restoreActiveTab:empty', {}, { force: true })
    maybeAutoOpenAgentPicker()
    return
  }

  const saved = localStorage.getItem('codehub_active_tab')
  const requestedAgent = normalizeRequestedAgent(route.query?.agent)
  const requestedProjectId = route.query?.projectId || ''

  // 优先匹配 query 指定的 projectId + agent 组合
  if (requestedProjectId && requestedAgent) {
    const exact = tabs.find(t => t.agentType === requestedAgent && String(t.projectId) === String(requestedProjectId))
    if (exact) {
      debugCodeHubTabs('restoreActiveTab:query-exact', { tabId: exact.id }, { force: true })
      activateTab(exact, preferredChatFromQuery())
      return
    }
  }
  if (requestedProjectId) {
    const byProject = tabs.find(t => String(t.projectId) === String(requestedProjectId))
    if (byProject) {
      debugCodeHubTabs('restoreActiveTab:query-project', { tabId: byProject.id }, { force: true })
      activateTab(byProject, preferredChatFromQuery())
      return
    }
  }

  const match = pickInitialCodeHubTab({
    tabs,
    savedTabId: saved,
    requestedAgent,
  })

  if (match) {
    debugCodeHubTabs('restoreActiveTab:matched', { tabId: match.id, saved, requestedAgent }, { force: true })
    activateTab(match)
  } else {
    debugCodeHubTabs('restoreActiveTab:fallback-last', { tabId: tabs[tabs.length - 1]?.id, saved, requestedAgent }, { force: true })
    activateTab(tabs[tabs.length - 1])
  }
}

// 获取已挂载 Agent 的 panel ref（通过 Registry 动态查找）
function getPanel(agentType) {
  return panelRefs[agentType] || null
}

// ── 初始化：等待所有已挂载的 Agent 就绪后再恢复 Tab ──
const initDone = ref(false)
let _initTimer = null

onMounted(() => {
  const stopWatch = watchEffect(() => {
    if (initDone.value) return

    // 只检查已挂载的 Agent
    const pending = Object.keys(mountedMap).filter(k => mountedMap[k])
    if (pending.length === 0) return

    const allReady = pending.every(k => getPanel(k)?.ready)
    if (allReady) {
      initDone.value = true
      debugCodeHubTabs('init:all-ready', { pending }, { force: true })
      if (_initTimer) { clearTimeout(_initTimer); _initTimer = null }
      nextTick(() => {
        if (unifiedTabs.value.length > 0) {
          restoreActiveTab()
        } else {
          maybeAutoOpenAgentPicker()
        }
      })
    }
  })

  // 兜底：5s 后如果还没就绪，直接用现有数据
  _initTimer = setTimeout(() => {
    if (initDone.value) return
    initDone.value = true
    stopWatch()
    debugCodeHubTabs('init:timeout', {}, { force: true })
    if (unifiedTabs.value.length > 0) {
      nextTick(() => restoreActiveTab())
    } else {
      maybeAutoOpenAgentPicker()
    }
  }, 5000)

  // ── 快捷键：Tab 切换 ──
  _shortcutUnregisters.push(register('codehub.nextTab', () => {
    if (!unifiedTabs.value.length) return
    const idx = unifiedTabs.value.findIndex(t => t.id === activeTabId.value)
    const nextIdx = idx < 0 ? 0 : (idx + 1) % unifiedTabs.value.length
    activateTab(unifiedTabs.value[nextIdx])
  }, { priority: 10 }))

  _shortcutUnregisters.push(register('codehub.prevTab', () => {
    if (!unifiedTabs.value.length) return
    const idx = unifiedTabs.value.findIndex(t => t.id === activeTabId.value)
    const prevIdx = idx < 0
      ? unifiedTabs.value.length - 1
      : (idx - 1 + unifiedTabs.value.length) % unifiedTabs.value.length
    activateTab(unifiedTabs.value[prevIdx])
  }, { priority: 10 }))

  for (let i = 1; i <= 9; i++) {
    _shortcutUnregisters.push(register(`codehub.tab${i}`, () => {
      const index = i - 1
      if (index < unifiedTabs.value.length) {
        activateTab(unifiedTabs.value[index])
      }
    }, { priority: 10 }))
  }
})

onUnmounted(() => {
  if (_initTimer) clearTimeout(_initTimer)
  _shortcutUnregisters.forEach(fn => fn())
  _shortcutUnregisters.length = 0
})

// ── 监听 route query 变化（keep-alive 下 onMounted 不会重新触发） ──
watch(() => [route.query?.agent, route.query?.projectId, route.query?.chatId, route.query?.sessionId], ([agent, projectId]) => {
  if (!initDone.value) return
  if (!agent && !projectId) return
  const tab = unifiedTabs.value.find(t => {
    if (agent && projectId) {
      return t.agentType === normalizeRequestedAgent(agent) && String(t.projectId) === String(projectId)
    }
    if (projectId) return String(t.projectId) === String(projectId)
    return false
  })
  if (!tab) return
  const preferredChat = preferredChatFromQuery()
  if (tab.id !== activeTabId.value) {
    activateTab(tab, preferredChat)
  } else if (preferredChat) {
    // Tab 已激活但 query 指定了具体会话：仍需切到该会话
    doSwitchProject(tab, preferredChat)
  }
})

// ── watch tabs 变化：自动 fallback（仅在初始化完成后） ──
watch(() => unifiedTabs.value.length, (len) => {
  if (!initDone.value) return
  debugCodeHubTabs('tabs:length-change', { len })
  if (len === 0) {
    debugCodeHubTabs('tabs:empty-after-init', {}, { force: true })
    activeTabId.value = null
    maybeAutoOpenAgentPicker()
    return
  }
  if (agentPickerOpenReason.value === 'auto-empty') closeAgentPicker()
  // 当前激活的 tab 被删了，fallback 到最后一个
  if (!unifiedTabs.value.find(t => t.id === activeTabId.value)) {
    const last = unifiedTabs.value[unifiedTabs.value.length - 1]
    if (last) activateTab(last)
  }
})

watch(
  () => unifiedTabs.value.map(t => t.id),
  (ids) => {
    if (!initDone.value) return
    const next = reconcileCodeHubTabOrder({
      currentOrder: tabOrder.value,
      visibleTabIds: ids,
      pruneMissing: true,
    })
    if (JSON.stringify(next) === JSON.stringify(tabOrder.value)) return
    debugCodeHubTabs('tabOrder:reconcile', { ids, next }, { force: true })
    tabOrder.value = next
    saveTabOrder()
  },
  { flush: 'post' }
)

watchEffect(() => {
  if (!initDone.value) return

  const agentType = activeAgent.value
  const panel = getPanel(agentType)
  const activeProjectId = panel?.activeProjectId?.value || null
  const syncedTabId = resolveCodeHubSyncedTabId({
    tabs: unifiedTabs.value,
    agentType,
    activeProjectId,
    currentActiveTabId: activeTabId.value,
  })

  if (!syncedTabId || syncedTabId === activeTabId.value) return
  debugCodeHubTabs('activeTab:sync', {
    from: activeTabId.value,
    to: syncedTabId,
    agentType,
    activeProjectId,
  }, { force: true })
  activeTabId.value = syncedTabId
  localStorage.setItem('codehub_active_tab', syncedTabId)
})

// ── Tab 操作 ──
function closeTab(tab) {
  const panel = getPanel(tab.agentType)
  panel?.deleteProject(tab.projectId)
}

function reorderUnifiedTab(fromIndex, toIndex) {
  const tabs = unifiedTabs.value
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= tabs.length || toIndex >= tabs.length) return
  const ids = [...tabOrder.value]
  // 确保当前所有 tab ID 都在 order 中
  const validIds = new Set(tabs.map(t => t.id))
  const order = ids.filter(id => validIds.has(id))
  for (const t of tabs) { if (!order.includes(t.id)) order.push(t.id) }
  const item = order.splice(fromIndex, 1)[0]
  order.splice(toIndex, 0, item)
  tabOrder.value = order
  saveTabOrder()
}

function onAgentSelected(agentKey) {
  closeAgentPicker()
  // 惰性挂载：首次选择该 Agent 时挂载它
  if (!mountedMap[agentKey]) {
    mountedMap[agentKey] = true
  }
  nextTick(() => {
    const panel = getPanel(agentKey)
    const projectId = panel?.createProject()
    if (projectId != null) {
      nextTick(() => {
        const tabId = `${agentKey}:${projectId}`
        const tab = unifiedTabs.value.find(t => t.id === tabId)
        if (tab) activateTab(tab)
      })
    }
  })
}

// ── 右键菜单 ──
function openContextMenu(e, tab) {
  ctxMenu.tab = tab
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY + 30
  ctxMenu.visible = true
  const hide = () => {
    ctxMenu.visible = false
    document.removeEventListener('click', hide)
  }
  setTimeout(() => document.addEventListener('click', hide), 0)
}

function ctxCloseThis() {
  if (ctxMenu.tab) closeTab(ctxMenu.tab)
  ctxMenu.visible = false
}

function ctxCloseAll() {
  ctxMenu.visible = false
  for (const tab of [...unifiedTabs.value]) {
    closeTab(tab)
  }
}

function openSharedSettings() {
  sharedSettingsRef.value?.open()
}

provide('codehubEmbedded', true)
provide('codehubActiveAgent', activeAgent)
provide('codehubSwitchAgent', activateTab)
provide('codehubSwitchToAgent', (agentKey) => {
  const existingTab = unifiedTabs.value.find(t => t.agentType === agentKey)
  if (existingTab) {
    activateTab(existingTab)
  } else {
    onAgentSelected(agentKey)
  }
})
provide('codehubOpenSharedSettings', openSharedSettings)

// ── 侧边栏「项目」通知指示器 ──
// Main.vue 提供此 ref，codeHub 根据 unifiedTabs 中是否有 hasDoneNotification 来更新它
// 当有后台项目完成任务时，侧边栏图标会脉冲提醒
const codehubHasNotification = inject('codehubHasNotification', null)
watch(
  () => unifiedTabs.value.some(t => t.hasDoneNotification),
  (has) => {
    if (codehubHasNotification) codehubHasNotification.value = has
  },
  { immediate: true }
)
</script>

<style>
.codehub-wrap {
  width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden;
}

.codehub-content {
  position: relative;
  flex: 1;
  min-height: 0;
}

.codehub-init-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--cc-bg, #1a1a1a) 86%, transparent);
  backdrop-filter: blur(2px);
}

.codehub-init-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 22px;
  border-radius: 12px;
  border: 1px solid var(--cc-border, #2a2a2a);
  background: var(--cc-bg, #1a1a1a);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
}

.codehub-init-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(198, 97, 63, 0.22);
  border-top-color: var(--cc-primary, #c6613f);
  animation: codehub-init-spin var(--mc-loading-spinner-duration) linear infinite;
}

.codehub-init-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cc-text, #e0e0e0);
}

.codehub-init-sub {
  font-size: 12px;
  color: var(--cc-text-dim, #888);
}

@keyframes codehub-init-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== 统一 Tab 栏（匹配原 claudeCode ProjectTabs 风格） ===== */
.codehub-unified-tabs {
  display: flex; align-items: center;
  background: var(--cc-bg-tertiary);
  border-bottom: 1px solid var(--cc-border);
  min-height: 32px; height: 32px;
  overflow-x: auto; overflow-y: hidden;
  padding: 0 4px; gap: 0;
  flex-shrink: 0; user-select: none;
}
.codehub-tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 8px 0 10px;
  border-radius: 0; border: 0;
  border-right: 1px solid var(--cc-border);
  background: var(--cc-bg-secondary);
  color: var(--cc-text-secondary);
  cursor: pointer; white-space: nowrap;
  min-width: 92px; max-width: 220px;
  transition: background 0.12s, color 0.12s;
  position: relative; flex-shrink: 0;
}
.codehub-tab:hover {
  background: var(--cc-border);
  color: var(--cc-text);
}
.codehub-tab.active {
  background: var(--cc-bg);
  color: var(--cc-btn-text-hover);
  font-weight: 600;
  border-bottom: 2px solid var(--cc-primary);
  box-shadow: 0 -2px 10px var(--cc-shadow);
  z-index: 1;
}
.codehub-tab.session-pending {
  color: var(--cc-attention-text, var(--cc-attention, #38bdf8));
  border-bottom: 2px solid var(--cc-attention, #38bdf8);
  background: var(--cc-attention-bg, rgba(56, 189, 248, 0.1));
}
.codehub-tab.task-done {
  color: var(--cc-warning);
  border-bottom: 2px solid var(--cc-warning);
  animation: tab-done-pulse 1.6s ease-in-out infinite;
}
.codehub-tab.task-done .codehub-tab-name {
  font-weight: 600;
}
.codehub-tab.session-pending.task-done {
  color: var(--cc-attention-text, var(--cc-attention, #38bdf8));
  border-bottom-color: var(--cc-attention, #38bdf8);
  background: var(--cc-attention-bg, rgba(56, 189, 248, 0.1));
  animation: none;
}
@keyframes tab-done-pulse {
  0%, 100% { background: var(--cc-bg-secondary); }
  50% { background: var(--cc-warning-bg); }
}
.codehub-tab-agent-icon {
  font-size: 16px; line-height: 1; flex-shrink: 0;
}
/* Tab 名称区域：与 ProjectTabs 一致使用 inline-flex */
.codehub-tab-name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis;
  font-size: 12px;
  display: inline-flex; align-items: center;
}

/* 运行中小圆点 */
.codehub-tab-name .running-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--cc-warning); margin-right: 6px; flex-shrink: 0;
  animation: running-pulse 1.2s ease-in-out infinite;
}
@keyframes running-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* 多个会话运行中数字徽章 */
.codehub-tab-name .running-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--cc-warning);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  margin-right: 6px;
  flex-shrink: 0;
}

/* 等待用户响应小圆点 */
.codehub-tab-name .pending-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--cc-attention, #38bdf8); margin-right: 6px; flex-shrink: 0;
  animation: pending-pulse 1.4s ease-in-out infinite;
}
@keyframes pending-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}

/* 关闭按钮（hover 时显示） */
.codehub-tab-close {
  width: 18px; height: 18px; border-radius: 0;
  border: none; background: transparent;
  color: var(--cc-text-dim); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; font-size: 12px;
  transition: background 0.12s, color 0.12s;
  opacity: 0;
}
.codehub-tab:hover .codehub-tab-close {
  opacity: 1;
  color: var(--cc-text-tertiary);
}
.codehub-tab-close:hover {
  background: var(--cc-bg); color: var(--cc-btn-text-hover);
}

.codehub-tab.dragging {
  opacity: 0.35;
}
.codehub-tab.drag-over {
  border-left: 2px solid var(--cc-primary);
  background: var(--cc-menu-hover);
}

/* 新建 Tab 按钮 */
.codehub-tab-add {
  width: 28px; height: 28px; border-radius: 4px;
  border: none; background: var(--cc-border); color: var(--cc-text-dim);
  cursor: pointer; display: flex; align-items: center;
  justify-content: center; margin-left: 4px; margin-right: 4px;
  flex-shrink: 0; transition: all 0.1s;
}
.codehub-tab-add:hover {
  background: var(--cc-menu-hover); color: var(--cc-primary);
}

/* ===== Context Menu ===== */
.codehub-ctx-menu {
  position: fixed; z-index: 1000;
  background: var(--cc-menu-bg);
  border: 1px solid var(--cc-menu-border);
  border-radius: 6px; padding: 4px 0; min-width: 140px;
  box-shadow: 0 4px 16px var(--cc-shadow);
}
.codehub-ctx-item {
  padding: 8px 16px; font-size: 12px; color: var(--cc-menu-text);
  cursor: pointer; white-space: nowrap;
  display: flex; align-items: center; gap: 8px;
  transition: background 0.1s;
}
.codehub-ctx-item:hover {
  background: var(--cc-menu-hover);
}
.codehub-ctx-icon {
  color: var(--cc-text-dim);
}

/* ===== 内容区 ===== */
.codehub-content {
  flex: 1; min-height: 0; overflow: hidden;
  position: relative;
}

/* ===== 局部空状态 ===== */
.codehub-empty-overlay {
  position: absolute; inset: 0;
  background: var(--cc-bg);
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; color: var(--cc-text-dim);
  z-index: 10;
}
.codehub-empty-icon { font-size: 48px; color: var(--cc-text-muted); opacity: 0.4; }
.codehub-empty-title { font-size: 18px; font-weight: 600; color: var(--cc-text); }
.codehub-empty-sub { font-size: 13px; color: var(--cc-text-muted); }
.codehub-empty-btn {
  margin-top: 8px; padding: 8px 20px; border: 1px solid var(--cc-primary);
  border-radius: 6px; background: var(--cc-primary);
  color: var(--cc-btn-primary-text); font-size: 13px; cursor: pointer;
  transition: opacity 0.15s;
}
.codehub-empty-btn:hover { opacity: 0.85; }

/* ===== 内联 Agent 选择界面 ===== */
.codehub-picker-local {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 20;
}
.codehub-picker-card {
  width: 480px; max-width: 90vw;
  background: var(--cc-bg); color: var(--cc-text);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 16px 48px rgba(0,0,0,0.45);
  border: 1px solid var(--cc-border);
}
.codehub-picker-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 4px;
}
.codehub-picker-title {
  font-size: 16px; font-weight: 600; color: var(--cc-text);
}
.codehub-picker-close {
  width: 24px; height: 24px; border: none; background: transparent;
  color: var(--cc-text-muted); cursor: pointer; font-size: 16px;
  display: flex; align-items: center; justify-content: center; border-radius: 4px;
}
.codehub-picker-close:hover {
  background: var(--cc-menu-hover); color: var(--cc-text);
}
.codehub-picker-list {
  padding: 8px 14px 14px; display: flex; flex-direction: column; gap: 8px;
}
.codehub-picker-option {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--cc-border); background: var(--cc-panel-bg);
  transition: all 0.15s ease;
}
.codehub-picker-option:hover {
  border-color: var(--cc-primary); background: var(--cc-menu-hover);
  box-shadow: 0 2px 12px rgba(198, 97, 63, 0.2);
}
.picker-option-icon {
  width: 40px; height: 40px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: var(--cc-accent-bg); flex-shrink: 0;
  font-size: 22px;
}
.picker-option-info { flex: 1; min-width: 0; }
.picker-option-name { font-size: 14px; font-weight: 600; color: var(--cc-text); }
.picker-option-desc { font-size: 12px; color: var(--cc-text-muted); }
.picker-option-arrow {
  color: var(--cc-text-muted); flex-shrink: 0; opacity: 0;
  transition: opacity 0.15s, transform 0.15s;
}
.codehub-picker-option:hover .picker-option-arrow {
  opacity: 1; transform: translateX(3px); color: var(--cc-text);
}
</style>
