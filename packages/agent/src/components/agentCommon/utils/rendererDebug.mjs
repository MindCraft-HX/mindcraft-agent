/**
 * Renderer Debug Helper — T170 Phase 1
 *
 * 统一控制 renderer 端 debug 日志。
 * 默认全关。通过显式 flag 按 namespace 开启：
 *
 *   window.__MCPF_DEBUG__ = { codehubTabs: true, sessionInstruction: true }
 *   localStorage mcpf_debug = 'codehubTabs,sessionInstruction'
 *
 * 支持 namespace：codehubTabs | sessionInstruction | metrics | sessionRefresh
 *
 * 规则：
 *   - console.debug(...) — 调试日志，需要显式开启 namespace
 *   - console.warn(...) / console.error(...) — 始终输出，不拦截
 *   - 不输出消息内容、完整路径、API key
 *
 * 用法：
 *   import { log } from './rendererDebug.mjs'
 *   log('codehubTabs', 'activateTab', { tabId: tab?.id })
 */

const FLAG_NAMESPACES = ['codehubTabs', 'sessionInstruction', 'metrics', 'sessionRefresh']

// 解析启用的 namespace
function getEnabledNamespaces() {
  if (typeof window === 'undefined') return new Set()
  const fromWindow = window.__MCPF_DEBUG__
  if (fromWindow && typeof fromWindow === 'object') {
    return new Set(FLAG_NAMESPACES.filter(ns => Boolean(fromWindow[ns])))
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('mcpf_debug')
    if (raw) {
      return new Set(raw.split(',').map(s => s.trim()).filter(s => FLAG_NAMESPACES.includes(s)))
    }
  }
  return new Set()
}

// 延迟按需解析，避免模块导入时副作用
let _enabledCache = null
function getEnabled() {
  if (_enabledCache === null) _enabledCache = getEnabledNamespaces()
  return _enabledCache
}

/**
 * 按 namespace 输出 debug 日志。
 * @param {string} namespace — codehubTabs | sessionInstruction | metrics | sessionRefresh
 * @param {string} event — 事件名
 * @param {Object} [detail] — 附加信息（不会输出完整路径/key）
 */
export function log(namespace, event, detail) {
  const enabled = getEnabled()
  if (!enabled.has(namespace)) return
  const ts = new Date().toLocaleTimeString()
  const prefix = `[debug:${namespace}]`
  if (detail !== undefined) {
    console.debug(`${prefix} ${event}`, ts, detail)
  } else {
    console.debug(`${prefix} ${event}`, ts)
  }
}

/** 强制刷新 namespace 缓存（flag 动态修改后调用） */
export function refreshDebugFlags() {
  _enabledCache = null
}
