const HEAVY_TAIL_FILE_SIZE = 512 * 1024
const HEAVY_TAIL_MAX_OUTPUT = 20000
const HEAVY_TAIL_OUTPUT_COUNT = 1

export function buildHistoryLoadGuard(meta = {}) {
  const fileSize = Number(meta.fileSize) || 0
  const tailLargeOutputCount = Number(meta.tailLargeOutputCount) || 0
  const tailMaxOutputChars = Number(meta.tailMaxOutputChars) || 0

  const hasHeavyTailOutput = tailLargeOutputCount >= HEAVY_TAIL_OUTPUT_COUNT
    || tailMaxOutputChars >= HEAVY_TAIL_MAX_OUTPUT
  const shouldDefer = fileSize >= HEAVY_TAIL_FILE_SIZE && hasHeavyTailOutput

  return {
    shouldDefer,
    reason: shouldDefer ? 'heavy-tail-output' : 'normal',
    fileSize,
    tailLargeOutputCount,
    tailMaxOutputChars,
  }
}

export function shouldPersistInlineMessages(chat = {}) {
  return !chat?.filePath
}

export function shouldRestoreInlineMessages(chat = {}) {
  return !chat?.filePath
}
