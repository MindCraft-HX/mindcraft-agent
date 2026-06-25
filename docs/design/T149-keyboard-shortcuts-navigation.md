# T149: CodeHub 快捷键导航系统

> 创建：2026-06-25 | 修订：2026-06-25（Codex 审阅后修正）
> 状态：设计中
> 关联：T138 / T148
> 审阅：Codex 评分 7/10 → 修正后重新发布

## 0. Codex 审阅结论 & 关键修正

原文档方向可用（架构 D：集中式注册中心 + composable），但存在以下必须修正的问题：

| # | 问题 | 严重程度 | 修正方式 |
|---|------|----------|----------|
| 1 | Mac Cmd+Tab 设计不成立 | 🔴 阻断 | 一期统一用 Ctrl（双平台通用）；移除"内部存 Control / Mac 显示 Cmd"的错误假设；`eventToKeyCombo` 保留 Meta 检测能力但默认键位全部用 Ctrl |
| 2 | HistorySidebar 伪代码 API 与真实组件不一致 | 🔴 阻断 | 全部替换为真实 API：`sidebarOpen` / `activeId` / `visibleDateGroups` / `emit('switchTab', session.id)` / `.sidebar-item` |
| 3 | `await nextTick()` 在非 async handler 中 | 🔴 编译错误 | handler 改为 `async () => { ... }`，store 调用 handler 时不 await（fire-and-forget） |
| 4 | CodeHub v-show 导致非活跃 HistorySidebar 仍注册 | 🔴 语义错误 | `register(actionId, handler, { enabled })` — enabled 为 `() => isPanelActive`，非活跃面板的 handler 跳过 |
| 5 | `Ctrl+1`~`Ctrl+9` / `Ctrl+Tab` 可能被 Chromium 消费 | 🟡 需手测 | 优先在 renderer `window keydown` capture phase 拦截；若 Chromium 先消费，改用 Electron `before-input-event` 转发 |
| 6 | `Date.now()` 做优先级不可靠 | 🟡 架构缺陷 | 改为显式 `priority` 数字：HistorySidebar = 100，CodeHub = 10 |
| 7 | 按键配置用数组 `['Control', 'Tab']` 不便读写 | 🟡 工程体验 | 改为字符串 `'Ctrl+Tab'`，内部 parse 后标准化比较 |
| 8 | Modal guard 用 `.el-overlay` 太粗糙 | 🟡 误杀风险 | 改为精确匹配 `.el-dialog__wrapper` / `.el-drawer__wrapper` 可见性 |
| 9 | 缺少 `.cm-editor` 等编辑器容器判断 | 🟡 漏判风险 | editable guard 补齐 `.cm-editor` `.CodeMirror` `.monaco-editor` |
| 10 | HistorySidebar 高亮未处理搜索/activeId 变化清除 | 🟡 交互瑕疵 | 在 `watch(searchQuery)` 和 `watch(activeId)` 中清除 `keyboardHighlightedId` |

---

## 1. 需求概述

1. `Ctrl+Tab` / `Ctrl+Shift+Tab` 切换 CodeHub 项目 Tab
2. `Ctrl+1` ~ `Ctrl+9` 直接跳转到第 N 个 Tab
3. `Ctrl+↑` / `Ctrl+↓` 在历史会话列表中导航
4. `Ctrl+Enter` 打开当前高亮的历史会话
5. 设置页可配置所有快捷键（二期）

> **设计原则**：导航全部走 `Ctrl` 修饰键家族。`Ctrl+Tab` 水平切 Tab，`Ctrl+↑/↓` 垂直切会话，`Ctrl+Enter` 打开——肌肉记忆统一。

> **平台说明**：一期默认键位统一用 `Ctrl`。在 Mac 上 `Ctrl+Tab` / `Ctrl+数字` 在 Electron renderer 内可用（`Cmd+Tab` 是系统应用切换器，不可用于应用内快捷键）。二期设置页用户可自行改为 `Cmd` 组合。

---

## 2. 真实组件 API 速查

实现前必须确认的真实 API（与文档伪代码对照）：

### 2.1 HistorySidebar（ClaudeCode / CodeX 一致）

```js
// Props
props: {
  sessions: Array,           // 原始 session 列表
  activeId: String,          // 当前活跃 session id  ← 不是 activeSessionId
  loading: Boolean,
  sidebarOpen: Boolean,      // true=展开(220px) false=折叠(36px)  ← 不是 collapsed
  newChatDisabled: Boolean,
  refreshing: Boolean,
  locked: Boolean,
  // CodeX 额外有: projectCwd, projectAdditionalDirs
}

// Emits
emit('update:sidebarOpen', !sidebarOpen)  // 切换折叠
emit('switchTab', session.id)             // 切换会话 ← 不是 emit('switch', session)
emit('requestDelete', session)
emit('newChat')
emit('refresh')
emit('rename', session, newName)
// CodeX 额外有: emit('addDirectory'), emit('removeDirectory', index)

// 内部 computed（组件内部暴露，外部不可直接修改）
// visibleDateGroups: { key, label, items[] }[]   ← 不是 sessionGroups
// searchQuery: ref
// renamingId: ref
```

**session item 模板（真实结构）**：
```html
<div
  class="sidebar-item"          <!-- ← 不是 .session-item -->
  :class="{ active: session.id === activeId }"
  @click="!loading && emit('switchTab', session.id)"
>
```

### 2.2 CodeHub

```js
// v-show 模式 — 非活跃 agent 仍保持挂载
<component v-show="activeAgent === agent.key" :is="agent.component" ... />

// provide 给子组件
provide('codehubActiveAgent', activeAgent)       // computed → 当前活跃 agent key
provide('codehubEmbedded', true)
provide('codehubSwitchAgent', activateTab)
provide('codehubSwitchToAgent', (agentKey) => ...)

// 关键方法
activateTab(tab)       // 设置 activeTabId + 调用 panel.switchProject
unifiedTabs            // computed: 所有已挂载 agent 的 projectTabData 合并
activeAgent            // computed: 当前激活的 agent key
```

---

## 3. 架构方案

### 3.1 集中式快捷键注册中心（方案 D 修正版）

```
┌──────────────────────────────────────────────────────┐
│  settings/defaultShortcuts.js                        │
│  键位用字符串: 'Ctrl+Tab' 'Ctrl+ArrowUp' 'Ctrl+ArrowDown' │
├──────────────────────────────────────────────────────┤
│  stores/useShortcutStore.js  (Pinia)                 │
│  - 全局唯一 window keydown 监听（capture phase）     │
│  - register(actionId, handler, { enabled, priority })│
│  - 集中式焦点/modal guard                            │
│  - key 标准化：'Ctrl+Shift+Tab' ↔ 'Shift+Ctrl+Tab'  │
├──────────────────────────────────────────────────────┤
│  composables/useKeyboardShortcuts.js （薄封装）      │
│  - register(actionId, handler, opts) → unregister    │
├──────────────────────────────────────────────────────┤
│  ShortcutSettings.vue（二期，不在一期范围）           │
└──────────────────────────────────────────────────────┘
```

### 3.2 `register()` 完整签名

```js
/**
 * @param {string}   actionId          'codehub.nextTab'
 * @param {Function} handler           async () => { ... }  允许 Promise
 * @param {Object}   [opts]
 * @param {Function} [opts.enabled]    () => boolean  返回 false 时跳过此 handler
 * @param {number}   [opts.priority]   默认 0，越大越优先；同 key 组合只触发最高优先级
 * @returns {Function} unregister
 */
function register(actionId, handler, opts = {})
```

### 3.3 Handler 优先级规则

- `priority` 显式指定：HistorySidebar = 100（会话导航是局部上下文，优先响应），CodeHub = 10（Tab 切换是全局行为）
- 同一 key 组合匹配多个 actionId 时，只触发 `priority` 最高的那个
- 同优先级时，后注册的优先

---

## 4. 详细实现规格

### 4.1 新增文件：`packages/agent/src/settings/defaultShortcuts.js`

```js
/**
 * 默认快捷键配置
 * 
 * 键位格式：'Modifier+Modifier+Key'
 * 修饰键：Ctrl / Alt / Shift / Meta（Meta = Mac Cmd / Win ⊞）
 * 比较时内部 sort 后匹配，'Ctrl+Shift+Tab' ≡ 'Shift+Ctrl+Tab'
 * 
 * 一期默认全部使用 Ctrl（Windows/Linux/Mac 通用的应用内快捷键）
 * 避免使用 Meta+Tab（Mac 系统应用切换器）
 */

export const SHORTCUT_GROUPS = {
  codehub: 'CodeHub Tab',
  history: '历史会话',
}

export const DEFAULT_SHORTCUTS = {
  // ─── CodeHub Tab 切换 ───
  'codehub.nextTab': {
    group: 'codehub',
    label: '下一个 Tab',
    keys: 'Ctrl+Tab',
  },
  'codehub.prevTab': {
    group: 'codehub',
    label: '上一个 Tab',
    keys: 'Ctrl+Shift+Tab',
  },
  'codehub.tab1': { group: 'codehub', label: '跳转到 Tab 1', keys: 'Ctrl+1' },
  'codehub.tab2': { group: 'codehub', label: '跳转到 Tab 2', keys: 'Ctrl+2' },
  'codehub.tab3': { group: 'codehub', label: '跳转到 Tab 3', keys: 'Ctrl+3' },
  'codehub.tab4': { group: 'codehub', label: '跳转到 Tab 4', keys: 'Ctrl+4' },
  'codehub.tab5': { group: 'codehub', label: '跳转到 Tab 5', keys: 'Ctrl+5' },
  'codehub.tab6': { group: 'codehub', label: '跳转到 Tab 6', keys: 'Ctrl+6' },
  'codehub.tab7': { group: 'codehub', label: '跳转到 Tab 7', keys: 'Ctrl+7' },
  'codehub.tab8': { group: 'codehub', label: '跳转到 Tab 8', keys: 'Ctrl+8' },
  'codehub.tab9': { group: 'codehub', label: '跳转到 Tab 9', keys: 'Ctrl+9' },

  // ─── 历史会话导航 ───
  'history.prevSession': {
    group: 'history',
    label: '上一个会话',
    keys: 'Ctrl+ArrowUp',
  },
  'history.nextSession': {
    group: 'history',
    label: '下一个会话',
    keys: 'Ctrl+ArrowDown',
  },
  'history.openSession': {
    group: 'history',
    label: '打开选中会话',
    keys: 'Ctrl+Enter',
  },
}
```

### 4.2 新增文件：`packages/agent/src/stores/useShortcutStore.js`

```js
/**
 * 快捷键 Store — 全局唯一的 keydown 监听 + handler 注册中心
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_SHORTCUTS } from '../settings/defaultShortcuts.js'

// ─── 辅助函数 ───

/** 标准化单个按键名：左右修饰键统一，数字键盘数字统一 */
function normalizeKey(key) {
  const map = {
    ControlLeft: 'Ctrl',  ControlRight: 'Ctrl',
    ShiftLeft: 'Shift',   ShiftRight: 'Shift',
    AltLeft: 'Alt',       AltRight: 'Alt',
    MetaLeft: 'Meta',     MetaRight: 'Meta',
    // 数字键盘统一
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
    Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
    Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5',
    Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9', Numpad0: '0',
    NumpadEnter: 'Enter',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  }
  return map[key] || key
}

/**
 * 从 KeyboardEvent 生成标准化 combo 字符串
 * 格式：'Ctrl+Shift+Tab'（修饰键在前，字母有序）
 * 返回 null 表示不应触发（纯修饰键、输入法组合键等）
 */
function eventToKeyCombo(event) {
  const parts = []

  // 按固定顺序收集修饰键
  if (event.ctrlKey)  parts.push('Ctrl')
  if (event.altKey)   parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey)  parts.push('Meta')

  const key = normalizeKey(event.key || event.code)

  // 纯修饰键不触发
  if (['Ctrl', 'Alt', 'Shift', 'Meta'].includes(key)) return null

  // 输入法组合中不触发（isComposing = true）
  if (event.isComposing) return null

  parts.push(key)
  return parts.join('+')
}

/**
 * 标准化 combo 字符串用于比较
 * 'Shift+Ctrl+Tab' → 'Ctrl+Shift+Tab'
 */
function normalizeCombo(combo) {
  if (!combo) return ''
  const parts = combo.split('+').map(p => p.trim()).filter(Boolean)
  // 修饰键先按固定顺序，非修饰键再按字母序
  const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta']
  const mods = parts.filter(p => MODIFIER_ORDER.includes(p)).sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  const others = parts.filter(p => !MODIFIER_ORDER.includes(p)).sort()
  return [...mods, ...others].join('+')
}

/** 焦点是否在可编辑元素中 */
function isEditableFocused() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.getAttribute('role') === 'textbox') return true
  // 常见编辑器容器
  if (el.closest('.cm-editor, .CodeMirror, .monaco-editor')) return true
  return false
}

/** 是否有 Element Plus 弹窗/抽屉打开 */
function isModalOpen() {
  // 精确匹配 Element Plus visible dialog/drawer wrapper
  // （不用 .el-overlay，那会误杀 tooltip、message、notification 等）
  const dialog = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]):not([style*="display:none"])')
  const drawer = document.querySelector('.el-drawer__wrapper:not([style*="display: none"]):not([style*="display:none"])')
  const msgBox = document.querySelector('.el-message-box__wrapper:not([style*="display: none"]):not([style*="display:none"])')
  return Boolean(dialog || drawer || msgBox)
}

// ─── Store ───

export const useShortcutStore = defineStore('shortcut', () => {
  // --- 状态 ---

  /** 用户自定义覆盖（二期用，持久化到 localStorage） */
  const userOverrides = ref(loadUserOverrides())

  /**
   * 已注册的 handler
   * Map<actionId, { handler, enabled, priority }>
   */
  const registrations = ref(new Map())

  let _listenerMounted = false

  // --- 计算 ---

  /** 合并后的最终快捷键配置（default + user override） */
  const resolvedShortcuts = computed(() => {
    const result = {}
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      const override = userOverrides.value[id]
      if (override === null) {
        result[id] = null  // 禁用
      } else if (typeof override === 'string') {
        result[id] = { ...def, keys: override }
      } else {
        result[id] = { ...def }
      }
    }
    return result
  })

  /** 构建 keyCombo → actionId 的索引（用于 O(1) 匹配） */
  const comboIndex = computed(() => {
    const index = {}
    for (const [id, def] of Object.entries(resolvedShortcuts.value)) {
      if (!def || !def.keys) continue
      const normalized = normalizeCombo(def.keys)
      if (!index[normalized]) {
        index[normalized] = []
      }
      index[normalized].push(id)
    }
    return index
  })

  // --- 方法 ---

  function loadUserOverrides() {
    try {
      const raw = localStorage.getItem('mc_shortcut_overrides')
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }

  function saveUserOverrides() {
    localStorage.setItem('mc_shortcut_overrides', JSON.stringify(userOverrides.value))
  }

  /**
   * 注册快捷键 handler
   * @returns {Function} unregister
   */
  function register(actionId, handler, opts = {}) {
    const { enabled, priority = 0 } = opts
    registrations.value.set(actionId, { handler, enabled: enabled || null, priority })
    _ensureListener()
    return () => {
      registrations.value.delete(actionId)
    }
  }

  function _ensureListener() {
    if (_listenerMounted) return
    _listenerMounted = true
    // capture phase: 在子元素的 @keydown 之前处理
    window.addEventListener('keydown', _onGlobalKeydown, true)
  }

  function _onGlobalKeydown(event) {
    // Guard 1: 可编辑元素
    if (isEditableFocused()) return

    // Guard 2: 弹窗/抽屉
    if (isModalOpen()) return

    // Guard 3: 快捷键录制模式（二期）
    if (window.__mc_recording_shortcut) return

    const combo = eventToKeyCombo(event)
    if (!combo) return

    const normalized = normalizeCombo(combo)
    const candidates = comboIndex.value[normalized]
    if (!candidates || !candidates.length) return

    // 找出已注册 + enabled + 最高优先级的 action
    let bestActionId = null
    let bestPriority = -Infinity
    for (const actionId of candidates) {
      const reg = registrations.value.get(actionId)
      if (!reg) continue
      if (reg.enabled && !reg.enabled()) continue  // enabled() 返回 false → 跳过
      if (reg.priority > bestPriority) {
        bestPriority = reg.priority
        bestActionId = actionId
      }
    }

    if (!bestActionId) return

    const reg = registrations.value.get(bestActionId)
    if (!reg) return

    event.preventDefault()
    event.stopPropagation()

    // fire-and-forget: 不 await handler 的 Promise（避免阻塞事件处理）
    try {
      const result = reg.handler()
      // 如果返回 Promise 且 reject，静默吞掉（不抛到 window）
      if (result && typeof result.catch === 'function') {
        result.catch(() => {})
      }
    } catch { /* 静默 */ }
  }

  // --- 二期方法（设置页用） ---

  function updateShortcut(actionId, newKeys) {
    if (newKeys === null || newKeys === '') {
      // 禁用
      userOverrides.value = { ...userOverrides.value, [actionId]: null }
    } else {
      userOverrides.value = { ...userOverrides.value, [actionId]: newKeys }
    }
    saveUserOverrides()
  }

  function resetShortcut(actionId) {
    const next = { ...userOverrides.value }
    delete next[actionId]
    userOverrides.value = next
    saveUserOverrides()
  }

  function resetAllShortcuts() {
    userOverrides.value = {}
    saveUserOverrides()
  }

  function findConflicts(actionId, newKeys) {
    const target = normalizeCombo(newKeys)
    const conflicts = []
    for (const [id, def] of Object.entries(resolvedShortcuts.value)) {
      if (id === actionId || !def || !def.keys) continue
      if (normalizeCombo(def.keys) === target) conflicts.push(id)
    }
    return conflicts
  }

  return {
    userOverrides,
    registrations,
    resolvedShortcuts,
    comboIndex,
    register,
    updateShortcut,
    resetShortcut,
    resetAllShortcuts,
    findConflicts,
    // 暴露 helper 给单测
    _normalizeKey: normalizeKey,
    _eventToKeyCombo: eventToKeyCombo,
    _normalizeCombo: normalizeCombo,
    _isEditableFocused: isEditableFocused,
    _isModalOpen: isModalOpen,
  }
})
```

### 4.3 新增文件：`packages/agent/src/composables/useKeyboardShortcuts.js`

```js
import { useShortcutStore } from '../stores/useShortcutStore.js'

export function useKeyboardShortcuts() {
  const store = useShortcutStore()

  /** @returns {Function} unregister */
  function register(actionId, handler, opts) {
    return store.register(actionId, handler, opts)
  }

  return { register }
}
```

### 4.4 修改：`packages/agent/src/components/codeHub/index.vue`

在现有 `<script setup>` 中追加（不重复定义 `onMounted`/`onUnmounted`——追加到已有钩子中）：

```js
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts.js'

const { register } = useKeyboardShortcuts()
const _shortcutUnregisters = []

// ── 追加到现有 onMounted() 末尾 ──

// 下一个 Tab（priority = 10）
_shortcutUnregisters.push(register('codehub.nextTab', () => {
  if (!unifiedTabs.value.length) return
  const currentIndex = unifiedTabs.value.findIndex(t => t.id === activeTabId.value)
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % unifiedTabs.value.length
  activateTab(unifiedTabs.value[nextIndex])
}, { priority: 10 }))

// 上一个 Tab
_shortcutUnregisters.push(register('codehub.prevTab', () => {
  if (!unifiedTabs.value.length) return
  const currentIndex = unifiedTabs.value.findIndex(t => t.id === activeTabId.value)
  const prevIndex = currentIndex < 0
    ? unifiedTabs.value.length - 1
    : (currentIndex - 1 + unifiedTabs.value.length) % unifiedTabs.value.length
  activateTab(unifiedTabs.value[prevIndex])
}, { priority: 10 }))

// 跳转到第 1-9 个 Tab
for (let i = 1; i <= 9; i++) {
  _shortcutUnregisters.push(register(`codehub.tab${i}`, () => {
    const index = i - 1
    if (index < unifiedTabs.value.length) {
      activateTab(unifiedTabs.value[index])
    }
  }, { priority: 10 }))
}

// ── 追加到现有 onUnmounted() 末尾 ──
_shortcutUnregisters.forEach(fn => fn())
_shortcutUnregisters.length = 0
```

### 4.5 修改：`packages/agent/src/components/claudeCode/components/HistorySidebar.vue`

**在 `<script setup>` 中新增**（注意所有 API 使用真实命名）：

```js
import { useKeyboardShortcuts } from '../../../composables/useKeyboardShortcuts.js'
import { inject, watch } from 'vue'

const { register } = useKeyboardShortcuts()
const _shortcutUnregisters = []

// ── CodeHub v-show 感知：只在当前 panel 活跃时响应快捷键 ──
// codeHubEmbedded 为 true 时才注入 codehubActiveAgent
// 独立窗口（非 CodeHub）下该 inject 为 undefined，此时始终 enabled
const codehubActiveAgent = inject('codehubActiveAgent', null)
const AGENT_KEY = 'claudeCode'  // ← CodeX 版改为 'codex'

function isPanelActive() {
  if (!codehubActiveAgent) return true  // 非 CodeHub 模式，始终启用
  return codehubActiveAgent.value === AGENT_KEY
}

/** 从 visibleDateGroups 展平为线性列表 */
const flatSessionList = computed(() => {
  const result = []
  if (!props.visibleDateGroups) return result
  for (const g of props.visibleDateGroups) {
    if (!g || !g.items) continue
    for (const s of g.items) {
      if (s && s.id) result.push(s)
    }
  }
  return result
})

/** 键盘导航高亮 id */
const keyboardHighlightedId = ref(null)

/** 确保高亮项在视口内 */
async function scrollToHighlighted() {
  await nextTick()
  const el = document.querySelector(`.sidebar-item[data-kb-sid="${keyboardHighlightedId.value}"]`)
  if (el) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}

/** 打开高亮会话 */
function openHighlightedSession() {
  if (!keyboardHighlightedId.value) return
  // 如果折叠，先展开
  if (!props.sidebarOpen) {
    emit('update:sidebarOpen', true)
  }
  // flatten 中查找 session（不需要完整对象，只需 id）
  const sid = keyboardHighlightedId.value
  const exists = flatSessionList.value.some(s => s.id === sid)
  if (exists) {
    emit('switchTab', sid)
  }
}

/** 清除键盘高亮 */
function clearKeyboardHighlight() {
  keyboardHighlightedId.value = null
}

// 注册快捷键 handlers
function registerHistoryShortcuts() {
  _shortcutUnregisters.push(register('history.nextSession', async () => {
    if (!flatSessionList.value.length) return
    // 折叠时先展开
    if (!props.sidebarOpen) {
      emit('update:sidebarOpen', true)
      await nextTick()
    }
    const idx = keyboardHighlightedId.value
      ? flatSessionList.value.findIndex(s => s.id === keyboardHighlightedId.value)
      : -1
    const nextIdx = idx < flatSessionList.value.length - 1 ? idx + 1 : idx < 0 ? 0 : idx
    if (nextIdx >= 0 && nextIdx < flatSessionList.value.length) {
      keyboardHighlightedId.value = flatSessionList.value[nextIdx].id
      await scrollToHighlighted()
    }
  }, { priority: 100, enabled: isPanelActive }))

  _shortcutUnregisters.push(register('history.prevSession', async () => {
    if (!flatSessionList.value.length) return
    if (!props.sidebarOpen) {
      emit('update:sidebarOpen', true)
      await nextTick()
    }
    const idx = keyboardHighlightedId.value
      ? flatSessionList.value.findIndex(s => s.id === keyboardHighlightedId.value)
      : flatSessionList.value.length
    const prevIdx = idx > 0 ? idx - 1 : idx >= flatSessionList.value.length ? flatSessionList.value.length - 1 : 0
    if (prevIdx >= 0 && prevIdx < flatSessionList.value.length) {
      keyboardHighlightedId.value = flatSessionList.value[prevIdx].id
      await scrollToHighlighted()
    }
  }, { priority: 100, enabled: isPanelActive }))

  _shortcutUnregisters.push(register('history.openSession', () => {
    openHighlightedSession()
  }, { priority: 100, enabled: isPanelActive }))
}

// ── 在 onMounted 中调用（追加到已有钩子） ──
onMounted(() => {
  registerHistoryShortcuts()
})

// ── 在 onUnmounted 中清理（追加到已有钩子） ──
onUnmounted(() => {
  _shortcutUnregisters.forEach(fn => fn())
  _shortcutUnregisters.length = 0
})

// ── 切换搜索 / activeId 时清除键盘高亮 ──
watch(() => props.activeId, () => {
  clearKeyboardHighlight()
})
watch(searchQuery, () => {
  clearKeyboardHighlight()
})
```

**在 `<template>` 中修改 session item**：

```html
<!-- 原来是 -->
<div
  class="sidebar-item"
  :class="{ active: session.id === activeId }"
  @click="!loading && emit('switchTab', session.id)"
>

<!-- 改为（追加 keyboard-highlighted class 和 data-kb-sid 属性） -->
<div
  class="sidebar-item"
  :class="{
    active: session.id === activeId,
    'keyboard-highlighted': session.id === keyboardHighlightedId,
  }"
  :data-kb-sid="session.id"
  @click="!loading && emit('switchTab', session.id); clearKeyboardHighlight()"
>
```

> **注意**：`@click` 中追加 `clearKeyboardHighlight()` 以在鼠标操作时清除键盘高亮。

**在 `<style scoped>` 中追加高亮样式**：

```css
/* 键盘导航高亮 */
.sidebar-item.keyboard-highlighted {
  outline: 2px solid var(--cc-primary);
  outline-offset: -2px;
}
/* active + 高亮同时存在：保持 active 左侧蓝色边框 */
.sidebar-item.active.keyboard-highlighted {
  outline: 2px solid var(--cc-primary);
  outline-offset: -2px;
}
```

> **注意**：项目使用 CSS 变量前缀 `--cc-*`，不是 `--el-*`。

### 4.6 修改：`packages/agent/src/components/codeX/components/HistorySidebar.vue`

与 4.5 的 ClaudeCode 版本改动**完全相同**，唯一差异：

```js
// 第 4.5 节中这一行：
const AGENT_KEY = 'claudeCode'
// CodeX 版改为：
const AGENT_KEY = 'codex'
```

其他所有代码（flatSessionList、keyboardHighlightedId、registerHistoryShortcuts、watch、template data-kb-sid、CSS）完全一致，直接复制。

> CodeX HistorySidebar 额外的 `projectCwd` / `projectAdditionalDirs` / `psExpanded` 不影响快捷键改动。

---

## 5. 交互细节规格

### 5.1 焦点 Guard 精确规则

快捷键只在以下条件**全部满足**时触发：

| 条件 | 判定方式 |
|------|----------|
| 焦点不在可编辑元素 | `INPUT/TEXTAREA/SELECT` tag、`isContentEditable`、`role="textbox"`、`.cm-editor` `.CodeMirror` `.monaco-editor` ancestor |
| 没有打开的模态框 | Element Plus `.el-dialog__wrapper` / `.el-drawer__wrapper` / `.el-message-box__wrapper` 可见 |
| 没有输入法组合 | `event.isComposing === false` |
| 没有在录音 | `window.__mc_recording_shortcut !== true`（二期） |

### 5.2 v-show 下的 enabled() 行为

CodeHub 使用 `v-show` 挂载多个 agent panel。非活跃 agent 的 HistorySidebar DOM 存在但 `display: none`。其注册的 handler 会通过 `enabled: isPanelActive` 自动跳过：

```
活跃 agent = claudeCode 时:
  ClaudeCode HistorySidebar 快捷键 → ✅ 响应
  CodeX HistorySidebar 快捷键      → ❌ 跳过（isPanelActive() = false）

切换到 codex Tab:
  ClaudeCode HistorySidebar 快捷键 → ❌ 跳过
  CodeX HistorySidebar 快捷键      → ✅ 响应
```

### 5.3 历史会话键盘高亮行为

| 场景 | 行为 |
|------|------|
| Sidebar 折叠中，按 `Ctrl+↓` | 先 `emit('update:sidebarOpen', true)` 展开，高亮第一个会话 |
| Sidebar 已展开，没有高亮项 | `Ctrl+↓` 高亮第一个，`Ctrl+↑` 高亮最后一个 |
| 已高亮某项，按 `Ctrl+↓` | 高亮下一个（到底部停止，不循环） |
| 已高亮某项，按 `Ctrl+↑` | 高亮上一个（到顶部停止，不循环） |
| 按 `Ctrl+Enter` | 打开当前高亮会话（调用 `emit('switchTab', sid)`） |
| 鼠标点击某个会话 | 清除键盘高亮（`@click` 中调用 `clearKeyboardHighlight()`） |
| 搜索框内容变化 | 清除键盘高亮（`watch(searchQuery, ...)`) |
| activeId 变化（会话被外部切换） | 清除键盘高亮（`watch(activeId, ...)`） |

### 5.4 Tab 切换行为

| 场景 | 行为 |
|------|------|
| `Ctrl+Tab` 在最后一个 Tab | 循环到第一个（环形导航） |
| `Ctrl+Shift+Tab` 在第一个 Tab | 循环到最后一个 |
| `Ctrl+3` 但只有 2 个 Tab | 不触发（index 超出范围） |
| Tab > 9 个 | `Ctrl+1`~`Ctrl+9` 对应前 9 个，第 10 个只用 `Ctrl+Tab` 到达 |

### 5.5 平台差异

| 平台 | `Ctrl` 行为 | `Meta`（Cmd/⊞）行为 |
|------|------------|---------------------|
| Windows | 标准 Ctrl | ⊞+Tab 是系统切换，不可拦截 |
| Linux | 标准 Ctrl | 通常无 Meta 键 |
| Mac | `Ctrl+Tab` 在 Electron renderer 内可用 | `Cmd+Tab` 是系统应用切换器，不可用于应用内 |

一期默认键位全部用 `Ctrl`，双平台通用。二期设置页用户可自行改为 `Meta` 组合（如 `Meta+1`~`Meta+9`）。

### 5.6 Electron `before-input-event` 降级方案

**优先级**：先用 `window keydown` capture phase 拦截。

如果手测发现 `Ctrl+Tab` / `Ctrl+1`~`Ctrl+9` 被 Electron Chromium 消费（不触发 renderer keydown），降级方案：

在 `electron/main.js` 的 `BrowserWindow` 上注册 `before-input-event`：

```js
// electron/main.js — 备选方案（仅在 renderer keydown 不可靠时启用）
mainWindow.webContents.on('before-input-event', (event, input) => {
  // 不做任何处理，仅确保 key 不被 Chromium 消费
  // 实际快捷键匹配仍在 renderer store 中完成
  if ((input.control || input.meta) && input.shift && input.key === 'Tab') {
    // 不阻止默认行为，renderer 自行处理
  }
})
```

此方案不需要 IPC 通道——按键仍流经 renderer，只是确保 Chromium 不提前消费。

---

## 6. 测试矩阵

### 6.1 基础功能

| # | 测试场景 | 预期 |
|---|---------|------|
| 1 | 3 个 Tab，按 `Ctrl+Tab` | Tab1 → Tab2 → Tab3 → Tab1（循环） |
| 2 | Tab1 按 `Ctrl+Shift+Tab` | 切到 Tab3（最后一个） |
| 3 | 2 个 Tab，按 `Ctrl+3` | 不触发（不存在） |
| 4 | 5 个 Tab，`Ctrl+1`~`Ctrl+5` | 分别跳到对应 Tab |
| 5 | 焦点在输入框，按 `Ctrl+Tab` | 不触发 |
| 6 | 弹窗打开中，按 `Ctrl+Tab` | 不触发 |

### 6.2 历史会话导航

| # | 测试场景 | 预期 |
|---|---------|------|
| 7 | Sidebar 展开，5 个会话，按 `Ctrl+↓` | 依次高亮 1→2→3→4→5 |
| 8 | 高亮第 5 项，按 `Ctrl+↓` | 停在第 5 项 |
| 9 | 高亮第 1 项，按 `Ctrl+↑` | 停在第 1 项 |
| 10 | 高亮某项，`Ctrl+Enter` | 切换到该会话 |
| 11 | Sidebar 折叠，按 `Ctrl+↓` | 自动展开 + 高亮第 1 个 |
| 12 | 鼠标点击会话 | 键盘高亮清除 |
| 13 | 搜索框有焦点，按 `Ctrl+↓` | 不触发（INPUT guard） |

### 6.3 v-show / 多 Agent

| # | 测试场景 | 预期 |
|---|---------|------|
| 14 | 两个 agent 都挂载，当前在 ClaudeCode Tab | ClaudeCode 的 HistorySidebar 快捷键响应；CodeX 不响应 |
| 15 | 切到 CodeX Tab | CodeX 的 HistorySidebar 快捷键响应；ClaudeCode 不响应 |
| 16 | 独立窗口（非 CodeHub 模式） | HistorySidebar 快捷键始终响应 |

### 6.4 回归哨兵

| # | 测试场景 | 预期 |
|---|---------|------|
| 17 | `Ctrl+Shift+R`（刷新会话） | 不受影响，正常触发 |
| 18 | `Enter` 发送消息 | 不受影响 |
| 19 | 斜杠命令 `↑↓` 导航 | 不受影响 |
| 20 | inline rename `Enter`/`Esc` | 不受影响 |
| 21 | `Ctrl+C`/`Ctrl+V`/`Ctrl+Z` 等系统快捷键 | 不受影响（editable guard 处理） |

---

## 7. 开发计划

### 7.1 一期 — 快捷键导航功能生效

| 顺序 | 任务 | 文件 | 说明 |
|------|------|------|------|
| 1 | 创建默认快捷键配置 | `settings/defaultShortcuts.js` | 字符串格式键位 |
| 2 | 创建 Pinia Store | `stores/useShortcutStore.js` | 含 guard、combo 标准化、priority 匹配、fire-and-forget handler |
| 3 | 创建 Composable | `composables/useKeyboardShortcuts.js` | 薄封装，透传 opts |
| 4 | CodeHub Tab 快捷键 | `codeHub/index.vue` | register 到已有 onMounted/onUnmounted |
| 5 | ClaudeCode HistorySidebar 快捷键 | `claudeCode/components/HistorySidebar.vue` | enabled=isPanelActive, priority=100, 真实 API |
| 6 | CodeX HistorySidebar 快捷键 | `codeX/components/HistorySidebar.vue` | 同 ClaudeCode，AGENT_KEY='codex' |
| 7 | 手测 Ctrl+Tab 是否被 Chromium 消费 | Electron 窗口 | 若被消费则加 before-input-event 降级 |
| 8 | 单元测试 | `tests/` | normalizeCombo、eventToKeyCombo、guard、priority、unregister |

### 7.2 二期 — 设置页可配置

| 顺序 | 任务 | 文件 |
|------|------|------|
| 1 | 快捷键设置页组件 | `components/agentCommon/components/ShortcutSettings.vue` |
| 2 | 在 SharedSettings 中加 Tab | `codeHub/SharedSettings.vue` |
| 3 | Store 补全方法 | `stores/useShortcutStore.js`（已预留接口） |

---

## 8. 验收标准

1. ✅ CodeHub 页 `Ctrl+Tab`/`Ctrl+Shift+Tab` 循环切换项目 Tab
2. ✅ `Ctrl+1`~`Ctrl+9` 跳转到对应 Tab
3. ✅ 历史会话列表中 `Ctrl+↑/↓` 导航高亮，`Ctrl+Enter` 打开
4. ✅ 输入框、对话框中快捷键不触发
5. ✅ 非活跃 agent 的 HistorySidebar 快捷键不响应
6. ✅ 不影响已有键盘操作（发送消息、斜杠命令、系统快捷键等）
7. ✅ 两个 HistorySidebar 行为一致
8. ✅ 二期设置页可修改快捷键，有冲突检测
