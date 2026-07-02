/**
 * Metrics 去重追踪器 — T171
 *
 * 防止同一 session 的 refreshMetricsForChat 并发重复发起 IPC 调用。
 * 切换 tab / 点 session 时 watch + switchChat 可能同时触发，去重后只执行一次。
 *
 * 纯函数，无外部依赖，可单独单测。
 */

export function createMetricsDedupTracker() {
  /** @type {Map<string, Promise<any>>} */
  const _inFlight = new Map()

  return {
    /** 是否有同名 key 的 Promise 正在飞行 */
    has(key) { return _inFlight.has(key) },
    /**
     * 注册一个飞行中的 Promise。
     * Promise resolve/reject 后自动清除。
     */
    track(key, promise) {
      if (!promise || typeof promise.finally !== 'function') return
      _inFlight.set(key, promise)
      promise.finally(() => {
        if (_inFlight.get(key) === promise) _inFlight.delete(key)
      })
    },
  }
}
