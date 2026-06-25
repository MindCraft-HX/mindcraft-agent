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
  // 输入法组合中不触发
  if (event.isComposing) return null

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

// ─── Store ───

export const useShortcutStore = defineStore('shortcut', () => {
  // --- 状态 ---

  /** 用户自定义覆盖（二期持久化到 localStorage） */
  const userOverrides = ref(loadUserOverrides())

  /**
   * 已注册的 handler
   * Map<actionId, { handler, enabled, priority }>
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
    registrations.value.set(actionId, { handler, enabled: enabled || null, priority })
    _ensureListener()
    return () => {
      registrations.value.delete(actionId)
    }
  }

  function _ensureListener() {
    if (_listenerMounted) return
    _listenerMounted = true
    window.addEventListener('keydown', _onGlobalKeydown, true)
  }

  function _onGlobalKeydown(event) {
    // Guard 1: 可编辑元素焦点
    if (isEditableFocused()) return

    // Guard 2: 弹窗/抽屉打开
    if (isModalOpen()) return

    // Guard 3: 快捷键录制模式（二期设置页）
    if (window.__mc_recording_shortcut) return

    const combo = eventToKeyCombo(event)
    if (!combo) return

    const normalized = normalizeCombo(combo)
    const candidates = comboIndex.value[normalized]
    if (!candidates || !candidates.length) return

    // 找到已注册 + enabled + 最高 priority
    let bestActionId = null
    let bestPriority = -Infinity
    for (const actionId of candidates) {
      const reg = registrations.value.get(actionId)
      if (!reg) continue
      if (reg.enabled && !reg.enabled()) continue
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

    // fire-and-forget: 不 await handler 返回值，避免阻塞事件处理
    try {
      const result = reg.handler()
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
