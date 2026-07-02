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
 *     threshold: 200,  // 与 useScrollBottom 默认值对齐，距底部此像素内视为 atBottom
 *   })
 *
 *   // switchChat 中:
 *   if (activeChatId.value) saveScroll(activeChatId.value)
 *   activeChatId.value = newId
 *   // ... rAF 中:
 *   restoreScroll(newId)
 */

export function useChatScrollState({ getScrollEl, syncLayout, threshold = 200 } = {}) {
  /** @type {Map<string, { scrollTop: number, atBottom: boolean }>} */
  const scrollStates = new Map()

  /**
   * 检测元素是否在底部（与 useScrollBottom 同阈值，避免保存/恢复行为不一致）
   */
  function _calcAtBottom(el) {
    const maxScroll = el.scrollHeight - el.clientHeight
    return maxScroll <= 0 || el.scrollTop >= maxScroll - threshold
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
   * - 无记录或 atBottom：用真实 maxScroll 滚到底（超大 session 也能到）。
   * - 有记录且非底部：恢复 scrollTop 并 clamp 到可滚动范围。
   * - 恢复后调用 syncLayout（如提供）同步 useScrollBottom 缓存。
   * @param {string} chatKey
   */
  function restoreScroll(chatKey) {
    if (!chatKey) return
    const el = getScrollEl(chatKey)
    if (!el) return
    const saved = scrollStates.get(chatKey)
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    if (!saved || saved.atBottom) {
      el.scrollTop = maxScroll
    } else {
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
