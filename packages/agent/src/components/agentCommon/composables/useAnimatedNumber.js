import { ref, onUnmounted } from 'vue'

/**
 * 平滑数字动画：用 requestAnimationFrame 在两帧之间渐进递增显示值。
 *
 * 用法：
 *   const { display, update } = useAnimatedNumber()
 *   watch(() => sourceValue, (nv) => update(nv))
 *   模板中：{{ fmtK(display) }}
 *
 * 行为：
 *   - 首次 update / reset 后首次增长：直接同步显示值（无基线不猜速率）
 *   - 正常增长：根据时间差算速率，rAF 逐帧追赶目标（值始终取整）
 *   - 重置/切 tab（newTarget < display）：立即同步，不播放递减动画
 *   - 同一值重复 update：无操作
 */
export function useAnimatedNumber() {
  const display = ref(0)
  let target = 0
  let rate = 0 // tokens per ms
  let lastTime = 0
  let rafId = null

  function tick(now) {
    const elapsed = now - lastTime
    lastTime = now
    if (display.value < target) {
      display.value = Math.min(target, Math.round(display.value + rate * elapsed))
    }
    if (display.value >= target) {
      display.value = target
      rafId = null
      return
    }
    rafId = requestAnimationFrame(tick)
  }

  function update(newTarget) {
    const now = performance.now()

    // 重置/切 tab → 立即同步
    if (newTarget < display.value) {
      display.value = newTarget
      target = newTarget
      rate = 0
      lastTime = now
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      return
    }

    // 值未变 → 跳过
    if (newTarget === target) return

    // 首次调用 / reset 后首次增长 → 直接同步（无基线不猜速率）
    if (lastTime === 0 || target === 0) {
      display.value = newTarget
      target = newTarget
      lastTime = now
      return
    }

    // 正常增长：用时间差算速率
    const delta = newTarget - target
    const deltaMs = Math.max(1, now - lastTime)
    rate = delta / deltaMs
    target = newTarget

    // rAF 已在跑 → 新 rate 下一帧自动生效；未在跑 → 启动
    if (!rafId) {
      lastTime = now
      rafId = requestAnimationFrame(tick)
    }
  }

  function reset() {
    if (rafId) cancelAnimationFrame(rafId)
    display.value = 0
    target = 0
    rate = 0
    lastTime = 0
    rafId = null
  }

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId)
  })

  return { display, update, reset }
}
