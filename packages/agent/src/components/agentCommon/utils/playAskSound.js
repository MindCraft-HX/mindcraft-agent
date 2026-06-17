import { playToneSequence } from './notificationAudio.js'

export async function playAskSound() {
  await playToneSequence([
    { frequency: 1047, duration: 0.12, volume: 0.22, type: 'triangle' },
    { frequency: 784, offset: 0.15, duration: 0.18, volume: 0.2, type: 'triangle' },
  ])
}
