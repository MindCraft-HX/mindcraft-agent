import { onMounted, onUnmounted } from 'vue'

/**
 * 会话列表刷新增强 Composable
 *
 * 提供键盘快捷键 Ctrl+Shift+R — 无需鼠标点击刷新按钮。
 * （T182: 窗口聚焦自动刷新已移除，改为发送后即时排序 + agent done 更新 fileSize）
 *
 * 用法：
 *   ```js
 *   useSessionRefresh(handleRefreshSessions)
 *   ```
 *
 * @param {() => Promise<any>} onRefresh
 */
export function useSessionRefresh(onRefresh) {
  function onGlobalKeydown(e) {
    const el = document.activeElement
    const tag = el?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'r') {
      e.preventDefault()
      onRefresh({ force: true })
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onGlobalKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
  })
}
