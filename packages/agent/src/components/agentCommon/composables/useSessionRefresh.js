import { onMounted, onUnmounted } from 'vue'

/**
 * 会话列表刷新增强 Composable
 *
 * 提供两个功能：
 *   A. 窗口聚焦自动刷新 — 独立模式下，切到其他应用再切回来自动同步侧边栏
 *   B. 键盘快捷键 Ctrl+Shift+R — 无需鼠标点击刷新按钮
 *
 * 用法：
 *   ```js
 *   useSessionRefresh(handleRefreshSessions)
 *   ```
 *
 * @param {() => Promise<any>} onRefresh
 */
export function useSessionRefresh(onRefresh) {
  const FOCUS_REFRESH_COOLDOWN = 3000
  let _focusRefreshTimer = null

  function onWindowFocus() {
    if (_focusRefreshTimer) return
    _focusRefreshTimer = setTimeout(() => { _focusRefreshTimer = null }, FOCUS_REFRESH_COOLDOWN)
    onRefresh()
  }

  function onGlobalKeydown(e) {
    const el = document.activeElement
    const tag = el?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'r') {
      e.preventDefault()
      onRefresh()
    }
  }

  onMounted(() => {
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('keydown', onGlobalKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', onWindowFocus)
    window.removeEventListener('keydown', onGlobalKeydown)
    if (_focusRefreshTimer) {
      clearTimeout(_focusRefreshTimer)
      _focusRefreshTimer = null
    }
  })
}
