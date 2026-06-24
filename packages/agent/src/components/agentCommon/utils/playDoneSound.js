import { playToneSequence } from './notificationAudio.js'

export async function playDoneSound() {
  await playToneSequence([
    { frequency: 880, toFrequency: 1175, duration: 0.34, volume: 0.40, type: 'sine' },
  ])
}
