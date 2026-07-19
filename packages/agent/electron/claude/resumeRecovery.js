'use strict'

const fs = require('fs')

const INITIAL_TAIL_BYTES = 256 * 1024
const MAX_TARGETED_TAIL_BYTES = 4 * 1024 * 1024

function getEntryType(entry) {
  return String(entry?.type || entry?._source_type || '')
}

function getEntryRole(entry) {
  return String(entry?.message?.role || '')
}

function isAssistantEntry(entry) {
  const type = getEntryType(entry)
  return type === 'assistant' || (type === 'message' && getEntryRole(entry) === 'assistant')
}

function isUserEntry(entry) {
  const type = getEntryType(entry)
  return type === 'user' || (type === 'message' && getEntryRole(entry) === 'user')
}

function getMessageContent(entry) {
  return entry?.message?.content
}

function getToolUseBlocks(entry) {
  if (!isAssistantEntry(entry) || !Array.isArray(getMessageContent(entry))) return []
  return getMessageContent(entry).filter(block => block?.type === 'tool_use' && block.id)
}

function getToolResultBlocks(entry) {
  if (!isUserEntry(entry) || !Array.isArray(getMessageContent(entry))) return []
  return getMessageContent(entry).filter(block => block?.type === 'tool_result' && block.tool_use_id)
}

function isRealAssistant(entry) {
  return isAssistantEntry(entry) && entry?.message?.model !== '<synthetic>'
}

function isSafeAssistantCheckpoint(entry) {
  return isRealAssistant(entry) && Boolean(entry?.uuid) && getToolUseBlocks(entry).length === 0
}

function isOrphanedBackgroundNotification(entry) {
  if (!isUserEntry(entry) || entry?.origin?.kind !== 'task-notification') return false
  const content = getMessageContent(entry)
  return typeof content === 'string' &&
    content.includes('No completion record was found') &&
    content.includes('previous session')
}

function findSafeAssistantBefore(entry, entriesByUuid) {
  const visited = new Set()
  let parentUuid = entry?.parentUuid || ''

  while (parentUuid && !visited.has(parentUuid)) {
    visited.add(parentUuid)
    const parent = entriesByUuid.get(parentUuid)
    if (!parent) return null
    if (isSafeAssistantCheckpoint(parent)) return parent
    parentUuid = parent.parentUuid || ''
  }

  return null
}

function findBackgroundTaskOrigin(danglingToolUse, entries, entriesByUuid) {
  const taskId = String(danglingToolUse?.block?.input?.task_id || '')
  if (!taskId || String(danglingToolUse?.block?.name || '').toLowerCase() !== 'taskoutput') {
    return danglingToolUse.entry
  }

  for (let index = danglingToolUse.index - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (String(entry?.toolUseResult?.backgroundTaskId || '') !== taskId) continue
    const sourceUuid = String(entry?.sourceToolAssistantUUID || '')
    if (sourceUuid && entriesByUuid.has(sourceUuid)) return entriesByUuid.get(sourceUuid)
  }

  return danglingToolUse.entry
}

function analyzeClaudeResumeRecoveryEntries(entries) {
  const entriesByUuid = new Map()
  const openToolUses = new Map()
  let latestOrphanedNotificationIndex = -1

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry?.uuid) entriesByUuid.set(entry.uuid, entry)
    if (isOrphanedBackgroundNotification(entry)) latestOrphanedNotificationIndex = index

    if (getEntryType(entry) === 'result') {
      openToolUses.clear()
      continue
    }

    for (const block of getToolUseBlocks(entry)) {
      openToolUses.set(String(block.id), { entry, block, index })
    }
    for (const block of getToolResultBlocks(entry)) {
      openToolUses.delete(String(block.tool_use_id))
    }
  }

  const dangling = [...openToolUses.values()].sort((a, b) => b.index - a.index)[0]
  if (!dangling) {
    const latestSafeAssistant = entries.findLast(isSafeAssistantCheckpoint)
    if (latestSafeAssistant) {
      return {
        checkpoint: {
          resumeSessionAt: latestSafeAssistant.uuid,
          interruptedToolName: '',
        },
        needsMoreHistory: false,
      }
    }
    const orphanHasLaterRealAssistant = entries.some(
      (entry, index) => index > latestOrphanedNotificationIndex && isRealAssistant(entry),
    )
    return {
      checkpoint: null,
      needsMoreHistory: latestOrphanedNotificationIndex >= 0 && !orphanHasLaterRealAssistant,
    }
  }

  const latestSafeAssistantAfterDangling = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => index > dangling.index && isSafeAssistantCheckpoint(entry))
    .at(-1)?.entry

  if (latestSafeAssistantAfterDangling) {
    return {
      checkpoint: {
        resumeSessionAt: latestSafeAssistantAfterDangling.uuid,
        interruptedToolName: String(dangling.block?.name || ''),
      },
      needsMoreHistory: false,
    }
  }

  const recoveryOrigin = findBackgroundTaskOrigin(dangling, entries, entriesByUuid)
  const safeAssistant = findSafeAssistantBefore(recoveryOrigin, entriesByUuid)
  if (!safeAssistant) return { checkpoint: null, needsMoreHistory: true }

  return {
    checkpoint: {
      resumeSessionAt: safeAssistant.uuid,
      interruptedToolName: String(dangling.block?.name || ''),
    },
    needsMoreHistory: false,
  }
}

function parseJsonlTail(buffer, startsAtFileBeginning) {
  let text = buffer.toString('utf8')
  if (!startsAtFileBeginning) {
    const firstNewline = text.indexOf('\n')
    if (firstNewline < 0) return []
    text = text.slice(firstNewline + 1)
  }

  const entries = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    try { entries.push(JSON.parse(line)) } catch (_) {}
  }
  return entries
}

async function readJsonlTailEntries(filePath, byteCount, fileSize) {
  const size = Math.min(byteCount, fileSize)
  const start = Math.max(0, fileSize - size)
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await handle.read(buffer, 0, size, start)
    return parseJsonlTail(buffer.subarray(0, bytesRead), start === 0)
  } finally {
    await handle.close()
  }
}

async function inspectClaudeResumeRecovery(filePath) {
  try {
    if (!filePath) return null
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile() || stat.size <= 0) return null

    const sizes = [
      INITIAL_TAIL_BYTES,
      1024 * 1024,
      MAX_TARGETED_TAIL_BYTES,
      stat.size,
    ].map(size => Math.min(size, stat.size))

    for (const byteCount of [...new Set(sizes)]) {
      const entries = await readJsonlTailEntries(filePath, byteCount, stat.size)
      const analysis = analyzeClaudeResumeRecoveryEntries(entries)
      if (analysis.checkpoint) return analysis.checkpoint
      if (!analysis.needsMoreHistory && entries.some(isAssistantEntry)) return null
    }
  } catch (_) {}

  return null
}

module.exports = {
  analyzeClaudeResumeRecoveryEntries,
  inspectClaudeResumeRecovery,
}
