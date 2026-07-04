/**
 * useChunkedHistoryMount — 分片挂载历史消息（T177-P2 Phase 1）
 *
 * 解决 ensureChatMessagesLoaded 中 chat.messages = allMessages.slice(-60)
 * 一次性挂载导致 2.3s RunTask 的问题。
 *
 * 设计原则：
 *  - 首屏同步挂最新 10 条，剩余用 requestIdleCallback 分批 prepend 补齐
 *  - pending 存 chat._chunk.pending（非闭包），切走 pause 不清空，切回 resume
 *  - _messagesLoaded 表示"磁盘已加载"，不等 DOM 补齐
 *  - 每批按 8ms 时间预算 + deadline.timeRemaining() 控制，非固定条数
 *  - 先组 batch 再一次 unshift，不逐条 mutation
 *  - 禁止 flushAll 一次性补齐
 *
 * 用法：
 *   const { mountStaged, pauseMount, resumeMount, hasPendingMount } =
 *     useChunkedHistoryMount({ getScrollEl, getActiveChatId })
 *
 *   // 首次加载（ensureChatMessagesLoaded 中）：
 *   await mountStaged(chat, allMessages, { maxMessages: MAX_MESSAGES })
 *   // Promise resolve 表示全部 DOM 补齐完成
 *
 *   // 切走（switchChat 中）：
 *   pauseMount(oldChat)  // 保留 pending，切回后 resume
 *
 *   // 切回时：
 *   if (hasPendingMount(chat)) {
 *     await resumeMount(chat)
 *   }
 *   // 之后再做 restoreChatScroll
 */

import { nextTick } from 'vue'

const INITIAL_BATCH = 10 // 首屏条数
const BUDGET_MS = 8 // 每批时间预算（ms）
const MIN_BATCH = 2 // 最小每批条数（即使还有预算，重消息也不能太少）
const IDLE_TIMEOUT = 50 // ms — idle callback 最大等待

export function useChunkedHistoryMount({ getScrollEl, getActiveChatId } = {}) {
  /**
   * 首屏 + 分批挂载。返回 Promise，resolve 时全部 batch 完成。
   */
  function mountStaged(chat, allMessages, { maxMessages = 60 } = {}) {
    if (!chat || !allMessages?.length) return Promise.resolve()

    // 先清理旧的 pending（新数据来了，旧的不需要了）
    discardMount(chat)

    const n = Math.min(maxMessages, allMessages.length)

    // 首屏同步挂载
    const initial = Math.min(INITIAL_BATCH, n)
    chat.messages = allMessages.slice(-initial)

    // 剩余待补齐
    const pending = allMessages.slice(0, n - initial)
    if (pending.length === 0) return Promise.resolve()

    // pending 存到 chat 上
    if (!chat._chunk) chat._chunk = {}
    chat._chunk.pending = pending
    chat._chunk.active = true

    return new Promise((resolve) => {
      chat._chunk._doneResolve = resolve
      scheduleBatch(chat)
    })
  }

  function scheduleBatch(chat) {
    if (!chat?._chunk?.active || !chat._chunk?.pending?.length) return

    const doBatch = (deadline) => {
      if (!chat._chunk?.active || !chat._chunk.pending?.length) return

      // Active guard：非 active chat 暂停
      if (getActiveChatId?.() !== chat.id) {
        chat._chunk.active = false
        // pending 保留在 chat._chunk.pending，切回后 resume 用
        return
      }

      const scrollEl = getScrollEl?.(chat.id)
      const oldHeight = scrollEl?.scrollHeight || 0

      const pending = chat._chunk.pending

      // 时间预算：从 pending 尾部挑一批，超预算就停
      // 使用 deadline.timeRemaining() 如果可用（idle callback），否则用固定 BUDGET_MS
      const timeLimit = deadline?.timeRemaining
        ? Math.min(deadline.timeRemaining(), BUDGET_MS)
        : BUDGET_MS

      const batch = []
      const t0 = performance.now()
      while (
        pending.length > 0 &&
        (performance.now() - t0) < timeLimit &&
        (batch.length < MIN_BATCH || (performance.now() - t0) < timeLimit * 0.8)
      ) {
        batch.push(pending.pop())
      }

      if (batch.length === 0) {
        // 完全没取到，说明时间预算已经用完，等待下一帧
        scheduleNext(chat)
        return
      }

      // 一次 unshift，不逐条 mutation
      // batch 由 pop() 构建是倒序（最新在前），reverse 恢复时间序
      chat.messages.unshift(...batch.reverse())

      // Scroll 补偿：nextTick 内重新获取 scrollEl（Vue patch 可能替换了 DOM 元素）
      if (scrollEl && oldHeight > 0) {
        nextTick(() => {
          if (getActiveChatId?.() === chat.id) {
            const el = getScrollEl?.(chat.id)
            if (el) {
              const newHeight = el.scrollHeight
              el.scrollTop += (newHeight - oldHeight)
            }
          }
        })
      }

      if (pending.length > 0 && chat._chunk.active && getActiveChatId?.() === chat.id) {
        scheduleNext(chat)
      } else {
        finishMount(chat)
      }
    }

    // 优先 requestIdleCallback，传入 deadline
    if (typeof requestIdleCallback !== 'undefined') {
      chat._chunk.idleId = requestIdleCallback(doBatch, { timeout: IDLE_TIMEOUT })
    } else {
      chat._chunk.idleId = setTimeout(() => doBatch(null), 0)
    }
  }

  function scheduleNext(chat) {
    scheduleBatch(chat)
  }

  function finishMount(chat) {
    if (!chat?._chunk) return
    chat._chunk.active = false
    chat._chunk.pending = null
    chat._chunk.idleId = null

    if (chat._chunk._doneResolve) {
      chat._chunk._doneResolve()
      chat._chunk._doneResolve = null
    }
  }

  /**
   * 暂停分片（用户切走时）。保留 pending，切回后 resume。
   */
  function pauseMount(chat) {
    if (!chat?._chunk) return
    if (chat._chunk.idleId != null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(chat._chunk.idleId)
      } else {
        clearTimeout(chat._chunk.idleId)
      }
      chat._chunk.idleId = null
    }
    chat._chunk.active = false
    // pending 保留，_doneResolve 保留
  }

  /**
   * 恢复分片（切回时）。从 chat._chunk.pending 继续。
   * 返回 Promise，resolve 时全部 batch 完成。
   */
  function resumeMount(chat) {
    if (!chat?._chunk?.pending?.length) return Promise.resolve()

    chat._chunk.active = true

    return new Promise((resolve) => {
      // 如果之前的 _doneResolve 还存在，链式包装
      const prevResolve = chat._chunk._doneResolve
      chat._chunk._doneResolve = () => {
        prevResolve?.()
        resolve()
      }
      scheduleBatch(chat)
    })
  }

  /**
   * 是否有待补齐的消息
   */
  function hasPendingMount(chat) {
    return !!(chat?._chunk?.pending?.length)
  }

  /**
   * 彻底丢弃（新数据加载、删除 session 时）。清除 pending + resolve。
   */
  function discardMount(chat) {
    if (!chat?._chunk) return
    if (chat._chunk.idleId != null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(chat._chunk.idleId)
      } else {
        clearTimeout(chat._chunk.idleId)
      }
      chat._chunk.idleId = null
    }
    chat._chunk.active = false
    chat._chunk.pending = null
    if (chat._chunk._doneResolve) {
      chat._chunk._doneResolve()
      chat._chunk._doneResolve = null
    }
  }

  return { mountStaged, pauseMount, resumeMount, hasPendingMount, discardMount }
}
