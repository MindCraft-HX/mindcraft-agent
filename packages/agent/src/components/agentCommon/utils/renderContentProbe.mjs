/**
 * renderContent 量化探针 — T176 Phase 2a-0
 *
 * 不修改渲染行为，只在 perf flag 开启时记录每次 renderContent() 调用。
 * 用于回答：冷挂载总耗时？打字/append 是否触发旧消息重复调用？瓶颈在哪类消息？
 *
 * 启用方式（与 rendererPerfProbe 相同）：
 *   window.__MCPF_PERF__ = true
 *   localStorage mcpf_perf = '1'
 *
 * 输出：
 *   window.__MCPF_RC_STATS__() → 聚合统计
 *   window.__MCPF_RC_CALLS__() → 原始调用记录
 *   window.__MCPF_RC_RESET__() → 清空
 */

import { perfStart, perfCount } from './rendererPerfProbe.mjs'

/** @type {Array<{label:string, textLen:number, durationMs:number, time:number}>} */
const calls = []

/**
 * 在 renderContent 内部调用，记录一次渲染。
 * perf flag 关闭时 perfStart 返回 NOOP → 零开销。
 *
 * @param {string} label  - 调用来源标识，如 'CodeX:AssistantBubble'
 * @param {number} textLen - 原始文本长度
 * @returns {Function} stop() — 调用方在渲染完成后调用
 */
export function startRenderContentRecord(label, textLen) {
  const stop = perfStart(`renderContent:${label}`)
  return () => {
    const elapsed = stop.__elapsed // perfStart NOOP won't have this; we handle below
    // perfStart returns NOOP when disabled — detect via truthiness of stop's return convention
    // Actually, we need the elapsed time. Use our own timer.
  }
}

// perfStart's stop() doesn't return elapsed when it's a NOOP.
// We need the elapsed for our own record. Let's use a simpler approach.

const RC_PROBE_NOOP = () => {}

/**
 * 开始计时一次 renderContent 调用。
 * 返回 stop 函数，调用后记录到 calls 数组。
 */
export function rcProbeStart(label, textLen) {
  if (typeof window === 'undefined') return RC_PROBE_NOOP
  if (!window.__MCPF_PERF__ && (typeof localStorage === 'undefined' || localStorage.getItem('mcpf_perf') !== '1')) {
    return RC_PROBE_NOOP
  }
  const t0 = performance.now()
  return () => {
    const elapsed = performance.now() - t0
    calls.push({ label, textLen, durationMs: elapsed, time: t0 })
    perfCount(`rc:${label}`)
  }
}

/** 获取所有原始调用记录（副本） */
export function getRenderContentCalls() {
  return calls.slice()
}

/** 清空调用记录 */
export function resetRenderContentCalls() {
  calls.length = 0
}

/** 聚合统计 */
export function getRenderContentStats() {
  const groups = {}
  for (const c of calls) {
    const g = groups[c.label] || (groups[c.label] = { count: 0, totalMs: 0, maxMs: 0, totalLen: 0, maxLen: 0 })
    g.count++
    g.totalMs += c.durationMs
    g.maxMs = Math.max(g.maxMs, c.durationMs)
    g.totalLen += c.textLen
    g.maxLen = Math.max(g.maxLen, c.textLen)
  }
  return {
    totalCalls: calls.length,
    totalMs: calls.reduce((s, c) => s + c.durationMs, 0),
    groups,
  }
}

// 挂到 window 方便 console 手动查看
if (typeof window !== 'undefined') {
  window.__MCPF_RC_STATS__ = () => {
    const stats = getRenderContentStats()
    console.table(
      Object.entries(stats.groups).map(([label, g]) => ({
        label,
        calls: g.count,
        'total(ms)': g.totalMs.toFixed(1),
        'max(ms)': g.maxMs.toFixed(2),
        'maxLen(KB)': (g.maxLen / 1024).toFixed(1),
      }))
    )
    console.log(`renderContent total: ${stats.totalCalls} calls, ${stats.totalMs.toFixed(1)}ms`)
    return stats
  }
  window.__MCPF_RC_CALLS__ = () => getRenderContentCalls()
  window.__MCPF_RC_RESET__ = () => resetRenderContentCalls()
}

// 确保 esbuild/rollup 不 tree-shake 上面的副作用赋值
export const _rcProbeWindowApi = typeof window !== 'undefined' ? 1 : 0
