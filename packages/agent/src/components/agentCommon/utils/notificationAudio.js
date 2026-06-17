let audioContext = null
let nextStartAt = 0

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return null
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextCtor()
  }
  return audioContext
}

function setGainEnvelope(gainNode, at, volume, duration) {
  gainNode.gain.cancelScheduledValues(at)
  gainNode.gain.setValueAtTime(0.0001, at)
  gainNode.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), at + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, at + duration)
}

export async function playToneSequence(tones = []) {
  try {
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
