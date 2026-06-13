/**
 * 任务完成提示音 — 短促的上升音 "叮~"
 *
 * 使用持久 AudioContext（不反复创建/销毁），
 * 播放前显式 resume() 规避浏览器/Electron 的自动播放策略限制，
 * 确保窗口失焦时也能正常发声。
 */

let _ctx = null

function getCtx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _ctx
}

export async function playDoneSound() {
  try {
    const ctx = getCtx()
    // 显式唤醒：规避 AudioContext 被自动播放策略挂起
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
    // 不手动 close() — 保持 AudioContext 存活，避免下次播放被 autoplay 策略拦截
  } catch (_) {
    // 静默失败：提示音只是辅助，不应影响主流程
  }
}
