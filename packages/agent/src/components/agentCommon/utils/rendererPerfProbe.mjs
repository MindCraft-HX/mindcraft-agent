/**
 * Renderer 高频链路性能探针 — Phase 0
 *
 * 只在 import.meta.env.DEV 或 window.__MCPF_PERF__ 下启用。
 * 聚合统计调用次数和耗时，每 30s 输出一次摘要，不刷屏。
 * 不输出消息内容、路径、API key。
 *
 * 可单独 revert。
 */

const enabled =
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
  (typeof window !== 'undefined' && Boolean(window.__MCPF_PERF__))

const counters = new Map()       // label → count
const timers = new Map()         // label → { count, total, min, max }

let dumpHandle = null
const DUMP_MS = 30_000

// ── public API ──────────────────────────────────────────

/** 递增计数 */
export function perfCount(label, n = 1) {
  if (!enabled) return
  counters.set(label, (counters.get(label) || 0) + n)
  scheduleDump()
}

/**
 * 计时同步代码块。返回 stop(meta?) 函数。
 * 用法：
 *   const stop = perfStart('projectTabs')
 *   // ... 计算 ...
 *   stop({ projects: 5, chats: 12, messages: 340 })
 */
export function perfStart(label) {
  if (!enabled) return () => {}
  const t0 = performance.now()
  return (meta) => {
    const elapsed = performance.now() - t0
    record(label, elapsed, meta)
  }
}

/** 强制输出当前聚合摘要 */
export function perfDump() {
  if (!enabled) return
  flush()
}

// ── internal ────────────────────────────────────────────

function record(label, elapsedMs, meta = {}) {
  const entry = timers.get(label) || { count: 0, total: 0, min: Infinity, max: 0, meta: {} }
  entry.count++
  entry.total += elapsedMs
  if (elapsedMs < entry.min) entry.min = elapsedMs
  if (elapsedMs > entry.max) entry.max = elapsedMs
  // 合并 meta：只记录 max（不存内容）
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'number') {
      entry.meta[k] = Math.max(entry.meta[k] || 0, v)
    }
  }
  timers.set(label, entry)
  scheduleDump()
}

function scheduleDump() {
  if (dumpHandle != null) return
  dumpHandle = setTimeout(flush, DUMP_MS)
}

function flush() {
  if (dumpHandle != null) {
    clearTimeout(dumpHandle)
    dumpHandle = null
  }

  if (counters.size === 0 && timers.size === 0) return

  const lines = ['[perf] ── ' + new Date().toLocaleTimeString() + ' ──']

  // counters
  if (counters.size) {
    for (const [label, n] of counters) {
      lines.push(`[perf]   count: ${label}  x${n}`)
    }
    counters.clear()
  }

  // timers
  if (timers.size) {
    for (const [label, e] of timers) {
      const avg = (e.total / e.count).toFixed(2)
      const metaStr = Object.entries(e.meta)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      const extra = metaStr ? ` (${metaStr})` : ''
      lines.push(
        `[perf]   timer: ${label}  calls=${e.count}  avg=${avg}ms  min=${e.min.toFixed(2)}ms  max=${e.max.toFixed(2)}ms${extra}`
      )
    }
    timers.clear()
  }

  console.debug(lines.join('\n'))
}
