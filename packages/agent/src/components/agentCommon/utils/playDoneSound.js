import { playToneSequence } from './notificationAudio.js'

export async function playDoneSound() {
  await playToneSequence([
    { frequency: 660, toFrequency: 820, duration: 0.16, volume: 0.42, type: 'sine' },
    { frequency: 820, toFrequency: 980, offset: 0.11, duration: 0.20, volume: 0.36, type: 'sine' },
  ])
}
