/**
 * Chat scroll state composable — T170 Phase 3
 *
 * Renderer 内存中保存每个 chat 的 { scrollTop, atBottom }，切换 chat 时恢复。
 * 纯内存，不写 session registry。
 *
 * 用法：
 *   const { saveScroll, restoreScroll, clearScroll } = useChatScrollState({
 *     getScrollEl: (chatKey) => msgRefs[chatKey],
 *     syncLayout,  // optional: () => refreshLayoutCache for useScrollBottom sync
 *   })
 *
 *   // switchChat 中:
 *   if (activeChatId.value) saveScroll(activeChatId.value)
 *   activeChatId.value = newId
 *   // ... rAF 中:
 *   restoreScroll(newId)
 */

export function useChatScrollState({ getScrollEl, syncLayout } = {}) {
  /** @type {Map<string, { scrollTop: number, atBottom: boolean }>} */
  const scrollStates = new Map()

  /**
   * 检测元素是否在底部（将 scroll 到最底视作 atBottom，不依赖精确阈值）
   */
  function _calcAtBottom(el) {
    const maxScroll = el.scrollHeight - el.clientHeight
    // 距离底部 2px 以内视为在底部（处理 subpixel 误差）
    return maxScroll <= 0 || el.scrollTop >= maxScroll - 2
  }

  /**
   * 保存当前 chat 的滚动位置
   * @param {string} chatKey
   */
  function saveScroll(chatKey) {
    if (!chatKey) return
    const el = getScrollEl(chatKey)
    if (!el) return
    scrollStates.set(chatKey, {
      scrollTop: el.scrollTop,
      atBottom: _calcAtBottom(el),
    })
  }

  /**
   * 恢复 chat 的滚动位置。
   * - 无记录或 atBottom：滚到底。
   * - 有记录且非底部：恢复 scrollTop 并 clamp 到可滚动范围。
   * - 恢复后调用 syncLayout（如提供）同步 useScrollBottom 缓存。
   * @param {string} chatKey
   */
  function restoreScroll(chatKey) {
    if (!chatKey) return
    const el = getScrollEl(chatKey)
    if (!el) return
    const saved = scrollStates.get(chatKey)
    if (!saved || saved.atBottom) {
      el.scrollTo({ top: 999999, behavior: 'instant' })
    } else {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollTop = Math.min(saved.scrollTop, maxScroll)
    }
    // 同步 useScrollBottom 的缓存/状态，避免按钮闪烁
    syncLayout?.()
  }

  /**
   * 清除 chat 的滚动状态（chat 被删除时调用）
   * @param {string} chatKey
   */
  function clearScroll(chatKey) {
    scrollStates.delete(chatKey)
  }

  return { saveScroll, restoreScroll, clearScroll }
}
