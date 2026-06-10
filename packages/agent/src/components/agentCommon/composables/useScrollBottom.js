import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export function useScrollBottom(containerRef, { threshold = 200, atBottomRef } = {}) {
  const show = ref(false)
  const newMsgCount = ref(0)

  // 缓存 layout 属性，避免 scroll 事件中读 scrollHeight/clientHeight 触发强制重排
  let cachedScrollHeight = 0
  let cachedClientHeight = 0

  function refreshLayoutCache(el) {
    cachedScrollHeight = el.scrollHeight
    cachedClientHeight = el.clientHeight
  }

  function isAtBottom() {
    return cachedScrollHeight - containerRef.value?.scrollTop - cachedClientHeight <= threshold
  }

  function onScroll() {
    const el = containerRef.value
    if (!el) return
    // scroll 事件里只读 scrollTop（不触发重排），layout 属性已在 ResizeObserver 回调中缓存
    const atBottom = isAtBottom()
    show.value = !atBottom
    if (atBottom) newMsgCount.value = 0
    if (atBottomRef) atBottomRef.value = atBottom
  }

  function scrollToBottom(smooth = true) {
    const el = containerRef.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    // 滚动后立即刷新缓存，避免后续 onScroll 用到旧值
    refreshLayoutCache(el)
    newMsgCount.value = 0
    show.value = false
    if (atBottomRef) atBottomRef.value = true
  }

  function bumpCount() {
    if (show.value) newMsgCount.value++
  }

  function scrollOrBump(smooth = true) {
    const el = containerRef.value
    if (!el) return
    if (!show.value) scrollToBottom(smooth)
    else bumpCount()
  }

  let observer = null
  onMounted(() => {
    watch(containerRef, (el) => {
      observer?.disconnect()
      if (!el) { observer = null; return }
      observer = new ResizeObserver(() => {
        refreshLayoutCache(el)
        onScroll()
      })
      observer.observe(el)
    }, { immediate: true })
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
  })

  return { show, newMsgCount, scrollToBottom, scrollOrBump, onScroll, bumpCount }
}
