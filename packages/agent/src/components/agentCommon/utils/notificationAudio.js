let audioContext = null
let nextStartAt = 0
let unlockInstalled = false

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return null
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextCtor()
  }
  return audioContext
}

function clampVolume(volume) {
  const normalized = Number(volume)
  if (!Number.isFinite(normalized)) return 0.14
  return Math.min(Math.max(normalized, 0.0001), 1)
}

export function installNotificationAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true

  const unlock = async () => {
    try {
      const ctx = getAudioContext()
      if (ctx?.state === 'suspended') {
        await ctx.resume()
      }
    } catch (_) {
      // Notification sounds are best-effort only.
    }
  }

  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchstart', unlock, { passive: true })
}

function setGainEnvelope(gainNode, at, volume, duration) {
  const safeVolume = clampVolume(volume)
  gainNode.gain.cancelScheduledValues(at)
  gainNode.gain.setValueAtTime(0.0001, at)
  gainNode.gain.exponentialRampToValueAtTime(safeVolume, at + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, at + duration)
}

export async function playToneSequence(tones = []) {
  try {
    installNotificationAudioUnlock()
    const ctx = getAudioContext()
    if (!ctx || !tones.length) return
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime
    const startAt = Math.max(now, nextStartAt)
    let sequenceEnd = startAt

    for (const tone of tones) {
      const offset = Number(tone.offset || 0)
      const duration = Math.max(Number(tone.duration || 0.12), 0.02)
      const at = startAt + offset
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = tone.type || 'sine'
      osc.frequency.setValueAtTime(Number(tone.frequency || 880), at)
      if (tone.toFrequency) {
        osc.frequency.exponentialRampToValueAtTime(Number(tone.toFrequency), at + duration)
      }

      osc.connect(gain)
      gain.connect(ctx.destination)
      setGainEnvelope(gain, at, Number(tone.volume || 0.14), duration)
      osc.start(at)
      osc.stop(at + duration + 0.02)
      sequenceEnd = Math.max(sequenceEnd, at + duration)
    }

    nextStartAt = sequenceEnd + 0.04
  } catch (_) {
    // Notification sounds are best-effort only.
  }
}
