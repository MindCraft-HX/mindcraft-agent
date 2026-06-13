/**
 * 审批/询问提示音 — 短促双音 "叮~咚~"
 *
 * 区别于完成音 playDoneSound 的单音上升 "叮~"，
 * 此处用两个短音（先低后高）让用户一听就知道是"需要你回答"。
 *
 * 使用持久 AudioContext（不反复创建/销毁），
 * 播放前显式 resume() 规避浏览器/Electron 的自动播放策略限制，
 * 确保窗口失焦或切换 Tab 时也能正常发声。
 */

let _ctx = null

function getCtx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _ctx
}

export async function playAskSound() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime

    // 第一声：短促的 660Hz "叮"
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(660, now)
    gain1.gain.setValueAtTime(0.16, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    osc1.start(now)
    osc1.stop(now + 0.12)

    // 第二声：稍高的 880Hz "咚"（延时 0.1s 起）
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.1)
    gain2.gain.setValueAtTime(0.16, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24)
    osc2.start(now + 0.1)
    osc2.stop(now + 0.24)

    // 不手动 close() — 保持 AudioContext 存活，避免下次播放被 autoplay 策略拦截
  } catch (_) {
    // 静默失败：提示音只是辅助，不应影响主流程
  }
}
