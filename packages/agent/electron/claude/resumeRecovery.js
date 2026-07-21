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
  if (!isRealAssistant(entry) || !entry?.uuid || getToolUseBlocks(entry).length > 0) return false
  const stopReason = String(entry?.message?.stop_reason || '')
  if (stopReason && stopReason !== 'end_turn' && stopReason !== 'stop_sequence') return false
  const content = getMessageContent(entry)
  return Array.isArray(content) && content.some(
    block => block?.type === 'text' && String(block.text || '').trim().length > 0,
  )
}

function readTaskNotification(entry) {
  if (!isUserEntry(entry)) return null
  const content = getMessageContent(entry)
  if (typeof content !== 'string' || !content.includes('<task-notification>')) return null
  const taskIds = [...content.matchAll(/<task-id>([^<]+)<\/task-id>/g)]
    .map(match => String(match[1] || '').trim())
    .filter(Boolean)
  const status = String(content.match(/<status>([^<]+)<\/status>/)?.[1] || '').trim().toLowerCase()
  return taskIds.length > 0 ? { taskIds, status } : null
}

function getBackgroundLaunch(entry, entriesByUuid) {
  const result = entry?.toolUseResult
  const taskId = String(result?.agentId || result?.backgroundTaskId || '')
  if (!taskId || (!result?.isAsync && !result?.backgroundTaskId)) return null
  const sourceUuid = String(entry?.sourceToolAssistantUUID || '')
  const source = sourceUuid ? entriesByUuid.get(sourceUuid) : null
  return { taskId, source }
}

function buildCurrentBranch(entries, entriesByUuid) {
  const latest = entries.findLast(entry => Boolean(entry?.uuid))
  if (!latest) return { entries: [], complete: true }

  const branch = []
  const visited = new Set()
  let current = latest

  while (current?.uuid && !visited.has(current.uuid)) {
    visited.add(current.uuid)
    branch.push(current)
    const parentUuid = String(current.parentUuid || '')
    if (!parentUuid) return { entries: branch.reverse(), complete: true }
    current = entriesByUuid.get(parentUuid)
    if (!current) return { entries: branch.reverse(), complete: false }
  }

  return { entries: branch.reverse(), complete: false }
}

function findUnresolvedBackgroundOrigin(branch, entriesByUuid) {
  const launches = new Map()
  const statuses = new Map()

  for (let index = 0; index < branch.length; index += 1) {
    const entry = branch[index]
    const launch = getBackgroundLaunch(entry, entriesByUuid)
    if (launch) launches.set(launch.taskId, { ...launch, index })
    const notification = readTaskNotification(entry)
    if (notification) {
      for (const taskId of notification.taskIds) statuses.set(taskId, notification.status)
    }
  }

  const missingLaunch = [...statuses.entries()].some(
    ([taskId, status]) => status === 'stopped' && !launches.has(taskId),
  ) || [...launches.values()].some(launch => !launch.source)
  if (missingLaunch) return { origin: null, needsMoreHistory: true }

  const origin = [...launches.values()]
    .filter(launch => statuses.get(launch.taskId) !== 'completed')
    .sort((a, b) => a.index - b.index)[0] || null
  return { origin, needsMoreHistory: false }
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

function findBackgroundTaskOrigin(danglingToolUse, branch, entriesByUuid) {
  const taskId = String(danglingToolUse?.block?.input?.task_id || '')
  if (!taskId || String(danglingToolUse?.block?.name || '').toLowerCase() !== 'taskoutput') {
    return danglingToolUse.entry
  }

  for (let index = danglingToolUse.index - 1; index >= 0; index -= 1) {
    const entry = branch[index]
    if (String(entry?.toolUseResult?.backgroundTaskId || '') !== taskId) continue
    const sourceUuid = String(entry?.sourceToolAssistantUUID || '')
    if (sourceUuid && entriesByUuid.has(sourceUuid)) return entriesByUuid.get(sourceUuid)
  }

  return danglingToolUse.entry
}

function analyzeClaudeResumeRecoveryEntries(entries) {
  const entriesByUuid = new Map()

  for (const entry of entries) {
    if (entry?.uuid) entriesByUuid.set(entry.uuid, entry)
  }

  const currentBranch = buildCurrentBranch(entries, entriesByUuid)
  const branch = currentBranch.entries
  if (branch.length === 0) return { checkpoint: null, needsMoreHistory: false }

  const openToolUses = new Map()
  for (let index = 0; index < branch.length; index += 1) {
    const entry = branch[index]
    for (const block of getToolUseBlocks(entry)) {
      openToolUses.set(String(block.id), { entry, block, index })
    }
    for (const block of getToolResultBlocks(entry)) {
      openToolUses.delete(String(block.tool_use_id))
    }
  }
  const dangling = [...openToolUses.values()].sort((a, b) => b.index - a.index)[0]

  const backgroundRecovery = findUnresolvedBackgroundOrigin(branch, entriesByUuid)
  if (backgroundRecovery.needsMoreHistory) return { checkpoint: null, needsMoreHistory: true }
  if (backgroundRecovery.origin) {
    const safeAssistant = findSafeAssistantBefore(backgroundRecovery.origin.source, entriesByUuid)
    if (!safeAssistant) return { checkpoint: null, needsMoreHistory: true }
    return {
      checkpoint: {
        resumeSessionAt: safeAssistant.uuid,
        interruptedToolName: String(
          dangling?.block?.name || getToolUseBlocks(backgroundRecovery.origin.source)[0]?.name || 'background',
        ),
      },
      needsMoreHistory: false,
    }
  }

  if (dangling) {
    const latestSafeAssistantAfterDangling = branch
      .slice(dangling.index + 1)
      .findLast(isSafeAssistantCheckpoint)
    if (latestSafeAssistantAfterDangling) {
      return {
        checkpoint: {
          resumeSessionAt: latestSafeAssistantAfterDangling.uuid,
          interruptedToolName: String(dangling.block?.name || ''),
        },
        needsMoreHistory: false,
      }
    }

    const recoveryOrigin = findBackgroundTaskOrigin(dangling, branch, entriesByUuid)
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

  const latestSafeAssistant = branch.findLast(isSafeAssistantCheckpoint)
  if (latestSafeAssistant) {
    return {
      checkpoint: {
        resumeSessionAt: latestSafeAssistant.uuid,
        interruptedToolName: '',
      },
      needsMoreHistory: false,
    }
  }

  return { checkpoint: null, needsMoreHistory: !currentBranch.complete }
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
