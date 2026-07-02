import { onUnmounted } from 'vue'

/**
 * textarea autosize rAF 合并 — Phase 5
 *
 * 同一帧内多次输入只 resize 一次，避免每次 input 事件中同步读写 layout。
 * 保留 paste / send clear 等场景的显式 resizeNow()。
 *
 * 用法：
 *   const autosize = useTextareaAutosize()
 *   autosize.bindTextarea(inputEl.value)     // 绑定 DOM 元素（自动 resize 已有内容）
 *   autosize.scheduleResize()                // rAF 合并的 resize（input handler 中调用）
 *   autosize.resizeNow()                     // 立即 resize（粘贴/清空/mention 后调用）
 */

export function useTextareaAutosize({ maxHeight = 160 } = {}) {
  let el = null
  let rafId = null

  /** 绑定 textarea DOM 元素，并立即 resize 适配已有内容（如 draft 恢复） */
  function bindTextarea(textarea) {
    el = textarea
    resizeNow()
  }

  /** rAF 合并 resize — 同一帧内多次调用只执行一次 */
  function scheduleResize() {
    if (rafId != null || !el) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (!el) return
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
    })
  }

  /** 立即 resize — 用于粘贴 / 发送清空 / applyMention 等需同步高度的场景 */
  function resizeNow() {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }

  onUnmounted(() => {
    if (rafId != null) cancelAnimationFrame(rafId)
    el = null
    rafId = null
  })

  return { bindTextarea, scheduleResize, resizeNow }
}
