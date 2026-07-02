/**
 * 共享 Session 刷新调度器 — T170 Phase 2 (重构)
 *
 * 替代各 provider 中重复的 handleRefreshSessions 去重/延迟/cooldown 逻辑。
 * 按 project 记录 cooldown（而非 panel 全局），避免项目 A 刷过后项目 B 在 15s 内被误判。
 *
 * 注入适配器使 provider 无需关心调度细节：
 *   getActiveProject  — () => project | null
 *   isRefreshing      — Vue ref<boolean>，标记 sidebar 正在刷新
 *   setRefreshing     — (boolean) => void
 *   refreshProject    — async (project) => result
 *   setLoading        — (boolean) => void，控制 sidebar loading 指示器
 *   perfLabel         — perfStart 探针标签前缀
 *
 * 返回 { refreshSessions, cancelScheduledRefresh }，可直接放入 defineExpose。
 * onUnmounted 由调用方负责清理（cancelScheduledRefresh + 清理 _scheduledTimer）。
 */

import { perfStart } from '../utils/rendererPerfProbe.mjs'

export function useScheduledSessionRefresh({
  getActiveProject,
  isRefreshing,
  setRefreshing,
  refreshProject,
  setLoading,
  perfLabel,
  defaultStaleMs = 15000,
} = {}) {
  /** @type {Map<string, number>} projectId → lastRefreshTime */
  const _cooldowns = new Map()
  let _scheduledTimer = null

  function _cancelTimer() {
    if (_scheduledTimer != null) {
      clearTimeout(_scheduledTimer)
      _scheduledTimer = null
    }
  }

  /**
   * 刷新当前 active project 的 session 列表。
   * @param {{ reason?: string, force?: boolean, silent?: boolean, ifStaleMs?: number, deferMs?: number }} opts
   */
  async function refreshSessions({ reason, force, silent, ifStaleMs = defaultStaleMs, deferMs } = {}) {
    const stop = perfStart(`${perfLabel}.handleRefreshSessions`)

    // 取消之前排队的延迟刷新（快速连续切换只保留最后一个）
    _cancelTimer()

    const project = getActiveProject()
    if (!project?.cwd || isRefreshing.value) { stop(); return }

    // 按 project 记录 cooldown（force 跳过）
    if (!force && ifStaleMs > 0) {
      const last = _cooldowns.get(project.id) || 0
      if (Date.now() - last < ifStaleMs) { stop(); return }
    }

    // 延迟执行（tab 激活场景，给 UI 先切换留出时间）
    if (deferMs > 0 && !force) {
      _scheduledTimer = setTimeout(() => {
        _scheduledTimer = null
        void refreshSessions({ reason, force: false, silent, ifStaleMs: 0, deferMs: 0 })
      }, deferMs)
      stop()
      return
    }

    if (!silent && !(project?.chats?.length)) setLoading(true)
    setRefreshing(true)
    try {
      await refreshProject(project)
      _cooldowns.set(project.id, Date.now())
    } catch (_) {
      // 静默处理 — refreshProject 内部已有 try/catch
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
      stop()
    }
  }

  /** 取消待执行的延迟刷新，由 codeHub activateTab 在切 tab 前调用 */
  function cancelScheduledRefresh() {
    _cancelTimer()
  }

  return { refreshSessions, cancelScheduledRefresh }
}
