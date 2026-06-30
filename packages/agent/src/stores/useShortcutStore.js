/**
 * 快捷键 Store — 全局唯一的 keydown 监听 + handler 注册中心
 *
 * 整个应用只有一个 window.addEventListener('keydown', ..., true)
 * 组件通过 register(actionId, handler, opts) 接入，返回 unregister 函数
 *
 * 三条防线保证不出屎山：
 * 1. 入口唯一 — 不在组件里各自监听键盘
 * 2. 关注点分离 — 配置/机制/接入三层独立
 * 3. 扩展点预留 — enabled/priority/userOverrides 不侵入一期代码
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_SHORTCUTS } from '../settings/defaultShortcuts.js'

// ─── IME 自愈机制 ───
// 某些 Linux IME (fcitx/ibus) 可能在 compositionend 后不复位 isComposing，
// 导致所有快捷键永久失效。这里自己维护 composition 状态，不依赖浏览器标志位。

let _isComposing = false
let _compositionTimer = null

if (typeof document !== 'undefined') {
  document.addEventListener('compositionstart', () => {
    _isComposing = true
    clearTimeout(_compositionTimer)
    _compositionTimer = null
  })
  document.addEventListener('compositionend', () => {
    // 延迟 300ms 复位：compositionend 后可能紧跟着 keydown（Enter 提交），
    // 此时快捷键不应触发（用户还在输入流程中）
    _compositionTimer = setTimeout(() => {
      _isComposing = false
      _compositionTimer = null
    }, 300)
  })
}

// ─── 调试开关 ───
// 在浏览器 console 执行 window.__mc_shortcut_debug = true 即可开启诊断日志
// 输出格式：[Shortcut] combo="Ctrl+Tab" skip=reason 或 [Shortcut] combo="Ctrl+Tab" FIRE actionId=codehub.nextTab

// ─── 辅助函数 ───

/**
 * 标准化按键名
 * 左右修饰键统一，数字键盘数字统一
 */
function normalizeKey(key) {
  const map = {
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    ShiftLeft: 'Shift', ShiftRight: 'Shift',
    AltLeft: 'Alt', AltRight: 'Alt',
    MetaLeft: 'Meta', MetaRight: 'Meta',
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
 * KeyboardEvent → 标准化 combo 字符串
 * 格式：'Ctrl+Shift+Tab'（修饰键按固定顺序，非修饰键在后）
 * 返回 null 表示不应触发（纯修饰键、输入法组合中等）
 */
function eventToKeyCombo(event) {
  // 输入法组合中不触发（使用自己维护的标志位，避免浏览器 isComposing 卡住）
  if (_isComposing || event.isComposing) {
    _debugLog(null, event.key || event.code || '', 'isComposing')
    return null
  }

  const mods = []
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (event.metaKey) mods.push('Meta')

  const key = normalizeKey(event.key || event.code)

  // 纯修饰键不触发
  if (['Ctrl', 'Alt', 'Shift', 'Meta'].includes(key)) return null

  return [...mods, key].join('+')
}

/**
 * 标准化 combo 字符串用于比较
 * 'Shift+Ctrl+Tab' → 'Ctrl+Shift+Tab'
 */
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta']

function normalizeCombo(combo) {
  if (!combo) return ''
  const parts = combo.split('+').map(p => p.trim()).filter(Boolean)
  const mods = parts.filter(p => MODIFIER_ORDER.includes(p))
    .sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  const others = parts.filter(p => !MODIFIER_ORDER.includes(p)).sort()
  return [...mods, ...others].join('+')
}

/**
 * 焦点是否在可编辑元素中
 */
function isEditableFocused() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.getAttribute('role') === 'textbox') return true
  // 编辑器容器
  try {
    if (el.closest?.('.cm-editor, .CodeMirror, .monaco-editor')) return true
  } catch { /* el.closest 可能不存在 */ return false }
  return false
}

/**
 * 是否有 Element Plus 弹窗/抽屉打开
 * 精确匹配可见的 dialog/drawer/message-box wrapper
 * 不用 .el-overlay（会误杀 tooltip、message、notification）
 */
function isModalOpen() {
  const check = (selector) => {
    return document.querySelector(`${selector}:not([style*="display: none"]):not([style*="display:none"])`)
  }
  return Boolean(
    check('.el-dialog__wrapper') ||
    check('.el-drawer__wrapper') ||
    check('.el-message-box__wrapper')
  )
}

// ─── 调试工具 ───

function _debugLog(actionId, combo, reason) {
  if (window.__mc_shortcut_debug) {
    const a = actionId ? ` actionId=${actionId}` : ''
    const r = reason ? ` skip=${reason}` : ''
    console.log(`[Shortcut] combo="${combo}"${a}${r}`)
  }
}

// ─── Store ───

export const useShortcutStore = defineStore('shortcut', () => {
  // --- 状态 ---

  /** 用户自定义覆盖（二期持久化到 localStorage） */
  const userOverrides = ref(loadUserOverrides())

  /**
   * 已注册的 handler
   * Map<actionId, Array<{ handler, enabled, priority }>>
   *
   * 同一 actionId 可被多个组件注册（如 ClaudeCode/CodeX 的 HistorySidebar），
   * 匹配时按 enabled/priority 动态选择，未被启用的自动跳过。
   */
  const registrations = ref(new Map())

  let _listenerMounted = false

  // --- 计算 ---

  /** 合并 default + user override 后的最终快捷键配置 */
  const resolvedShortcuts = computed(() => {
    const result = {}
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      const override = userOverrides.value[id]
      if (override === null) {
        result[id] = null
      } else if (typeof override === 'string') {
        result[id] = { ...def, keys: override }
      } else {
        result[id] = { ...def }
      }
    }
    return result
  })

  /** keyCombo → actionId[] 索引，O(1) 匹配 */
  const comboIndex = computed(() => {
    const index = {}
    for (const [id, def] of Object.entries(resolvedShortcuts.value)) {
      if (!def || !def.keys) continue
      const normalized = normalizeCombo(def.keys)
      if (!index[normalized]) index[normalized] = []
      index[normalized].push(id)
    }
    return index
  })

  // --- 持久化 ---

  function loadUserOverrides() {
    try {
      const raw = localStorage.getItem('mc_shortcut_overrides')
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }

  function saveUserOverrides() {
    try {
      localStorage.setItem('mc_shortcut_overrides', JSON.stringify(userOverrides.value))
    } catch { /* quota exceeded or private mode */ }
  }

  // --- 注册/注销 ---

  /**
   * @param {string}   actionId   'codehub.nextTab'
   * @param {Function} handler    async () => { ... }  允许返回 Promise
   * @param {Object}   [opts]
   * @param {Function} [opts.enabled]  () => boolean  返回 false 跳过
   * @param {number}   [opts.priority] 默认 0，越大越优先
   * @returns {Function} unregister
   */
  function register(actionId, handler, opts = {}) {
    const { enabled, priority = 0 } = opts
    const entry = { handler, enabled: enabled || null, priority }

    if (!registrations.value.has(actionId)) {
      registrations.value.set(actionId, [])
    }
    const list = registrations.value.get(actionId)
    list.push(entry)

    _ensureListener()
    return () => {
      const idx = list.indexOf(entry)
      if (idx >= 0) list.splice(idx, 1)
      if (list.length === 0) registrations.value.delete(actionId)
    }
  }

  function _ensureListener() {
    if (_listenerMounted) return
    _listenerMounted = true
    window.addEventListener('keydown', _onGlobalKeydown, true)
  }

  function _onGlobalKeydown(event) {
    // 先计算 combo，判断是否匹配已注册的快捷键
    const combo = eventToKeyCombo(event)
    if (!combo) return

    const normalized = normalizeCombo(combo)
    const candidates = comboIndex.value[normalized]
    if (!candidates || !candidates.length) return

    _debugLog(null, normalized, 'comboMatch candidates=' + candidates.join(','))

    // Guard 1: 可编辑元素焦点
    // 带 Ctrl/Alt/Meta 修饰键的组合是命令，不会插入文本 → 放行
    // 无修饰键或纯 Shift 修饰会插入字符 → 拦截
    if (isEditableFocused() && !event.ctrlKey && !event.altKey && !event.metaKey) {
      _debugLog(null, normalized, 'editableFocused')
      return
    }

    // Guard 2: 弹窗/抽屉打开
    if (isModalOpen()) {
      _debugLog(null, normalized, 'modalOpen')
      return
    }

    // Guard 3: 快捷键录制模式
    if (window.__mc_recording_shortcut) {
      _debugLog(null, normalized, 'recording')
      return
    }

    // 找到已注册 + enabled + 最高 priority
    // 同一 actionId 可能有多个注册（如两个 HistorySidebar），遍历所有
    let bestEntry = null
    let bestActionId = null
    let bestPriority = -Infinity
    for (const actionId of candidates) {
      const list = registrations.value.get(actionId)
      if (!list || !list.length) continue
      for (const entry of list) {
        if (entry.enabled && !entry.enabled()) {
          _debugLog(actionId, normalized, 'disabled')
          continue
        }
        if (entry.priority > bestPriority) {
          bestPriority = entry.priority
          bestEntry = entry
          bestActionId = actionId
        }
      }
    }

    if (!bestEntry) {
      _debugLog(null, normalized, 'noEnabledHandler')
      return
    }

    _debugLog(bestActionId, normalized, 'FIRE')
    event.preventDefault()
    event.stopPropagation()

    // fire-and-forget: 不 await handler 返回值，避免阻塞事件处理
    try {
      const result = bestEntry.handler()
      if (result && typeof result.catch === 'function') {
        result.catch(() => {})
      }
    } catch { /* 静默 */ }
  }

  // ─── 二期方法（设置页用）───

  function updateShortcut(actionId, newKeys) {
    userOverrides.value = {
      ...userOverrides.value,
      [actionId]: newKeys === '' || newKeys === null ? null : newKeys,
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

  function getGroupedShortcuts() {
    const groups = {}
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      const group = def.group || 'other'
      if (!groups[group]) groups[group] = []
      groups[group].push({
        id,
        label: def.label,
        defaultKeys: def.keys,
        currentKeys: resolvedShortcuts.value[id]?.keys || null,
        disabled: resolvedShortcuts.value[id] === null,
      })
    }
    return groups
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
    getGroupedShortcuts,
    // exposed for testing
    _normalizeKey: normalizeKey,
    _eventToKeyCombo: eventToKeyCombo,
    _normalizeCombo: normalizeCombo,
    _isEditableFocused: isEditableFocused,
    _isModalOpen: isModalOpen,
  }
})
