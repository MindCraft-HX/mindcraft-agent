import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 划词复制 Composable
 * 鼠标拖动选中文本后，在选区末尾浮出复制按钮
 *
 * 用法：
 *   const { showBtn, btnStyle, copied, copySelection, dismiss } = useSelectionCopy(containerRef)
 *   模板中放置 <SelectionCopyBtn :show="showBtn" :style="btnStyle" :copied="copied" @copy="copySelection" />
 *
 * @param {import('vue').Ref<HTMLElement|null>} containerRef  监听的容器元素
 */
export function useSelectionCopy(containerRef) {
  const showBtn = ref(false)
  const btnStyle = ref({ top: '0px', left: '0px' })
  const copied = ref(false)

  /** 计算选区末尾的屏幕坐标，返回按钮应放置的 top/left */
  function calcBtnPos() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null

    const range = sel.getRangeAt(0)
    const rects = range.getClientRects()
    if (!rects.length) return null

    const lastRect = rects[rects.length - 1]
    const top = lastRect.top - 36
    const left = lastRect.right + 4

    return { top: `${top}px`, left: `${left}px` }
  }

  /** 检查选区是否在容器内 */
  function isSelectionInContainer() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false

    const container = containerRef.value
    if (!container) return false

    const range = sel.getRangeAt(0)
    const text = sel.toString().trim()
    if (!text.length) return false

    return container.contains(range.startContainer)
  }

  function updateBtn() {
    if (!isSelectionInContainer()) {
      showBtn.value = false
      copied.value = false
      return
    }
    const pos = calcBtnPos()
    if (!pos) {
      showBtn.value = false
      copied.value = false
      return
    }
    btnStyle.value = pos
    showBtn.value = true
  }

  let rafId = 0
  function onMouseUp() {
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(updateBtn)
  }

  /** selectionchange 兜底：键盘选择（Shift+Arrow）、双击选词等 */
  function onSelectionChange() {
    if (showBtn.value) return
    updateBtn()
  }

  /** 点击复制 */
  async function copySelection() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const text = sel.toString()
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      setTimeout(() => {
        showBtn.value = false
        copied.value = false
      }, 800)
    } catch {
      // 降级：无 clipboard 权限时静默失败
    }
  }

  /** 外部调用：手动关闭按钮 */
  function dismiss() {
    showBtn.value = false
    copied.value = false
  }

  // 滚动时隐藏（捕获阶段监听，覆盖所有子元素滚动）
  function onScroll() {
    if (showBtn.value) dismiss()
  }

  // mousedown 外部点击隐藏（命名函数以便解绑）
  function onDocMouseDown(e) {
    if (showBtn.value && containerRef.value && !containerRef.value.contains(e.target)) {
      dismiss()
    }
  }

  onMounted(() => {
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('selectionchange', onSelectionChange)
    document.removeEventListener('mousedown', onDocMouseDown)
    document.removeEventListener('scroll', onScroll, { capture: true })
    cancelAnimationFrame(rafId)
  })

  return { showBtn, btnStyle, copied, copySelection, dismiss }
}
