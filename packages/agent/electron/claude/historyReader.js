'use strict';

/**
 * Claude history JSONL reading & turn-token annotation helpers.
 *
 * Extracted from claudeAgent.js as part of Batch 2.
 *
 * Classification:
 *   - buildClaudeHistoryTurnTokensFromEntry  — pure transform
 *   - annotateClaudeHistoryEntryWithTurnTokens — pure transform
 *   - readJsonlPageLinesFromTail            — IO without mutable state
 *
 * Responsibilities:
 *   - Build turn-token objects from raw history entries
 *   - Annotate parsed messages with _turnTokens
 *   - Read paginated JSONL lines from the tail of a session file
 */

const fs = require('fs')
const { perfStartIpc } = require('../shared/mainPerfProbe')
const { normalizeClaudeUsage } = require('../tokenMetrics/normalizer')

function parseTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function isToolResultOnlyContent(content) {
  return Array.isArray(content) && content.length > 0 && content.every(block => block?.type === 'tool_result')
}

function isRealUserTurnBoundary(entry = {}) {
  if (entry?.type === 'queue-operation' && typeof entry.content === 'string' && entry.content.trim()) return true
  if (entry?.type !== 'user') return false
  const content = entry?.message?.content ?? entry?.content
  if (isToolResultOnlyContent(content)) return false
  if (typeof content === 'string') {
    const text = content.trim()
    return text && text !== '[Request interrupted by user]'
  }
  if (!Array.isArray(content)) return false
  return content.some(block => {
    if (block?.type !== 'text' || !block.text) return false
    const text = String(block.text).trim()
    if (!text || text === '[Request interrupted by user]') return false
    if (text.startsWith('<system-reminder') || text.startsWith('<environment_context') || text.startsWith('<ide_')) return false
    return true
  })
}

function addTurnTokens(target, source) {
  if (!target || !source) return
  target.inputTokens += Number(source.inputTokens || 0)
  target.outputTokens += Number(source.outputTokens || 0)
  target.cacheReadTokens += Number(source.cacheReadTokens || 0)
  target.cacheCreationTokens += Number(source.cacheCreationTokens || 0)
  target.costUsd += Number(source.costUsd || 0)
}

function hasMeaningfulTurnTokens(tokens = {}) {
  return Number(tokens.inputTokens || 0) > 0 ||
    Number(tokens.outputTokens || 0) > 0 ||
    Number(tokens.cacheReadTokens || 0) > 0 ||
    Number(tokens.cacheCreationTokens || 0) > 0 ||
    Number(tokens.durationMs || 0) > 0 ||
    Number(tokens.costUsd || 0) > 0
}

/**
 * Build a turn-token summary from a raw Claude history entry.
 * Returns null when all token/duration values are zero (not meaningful).
 *
 * @param {object} entry — raw JSONL row with message.usage
 * @returns {{inputTokens:number, outputTokens:number, cacheReadTokens:number, cacheCreationTokens:number, durationMs:number}|null}
 */
function buildClaudeHistoryTurnTokensFromEntry(entry) {
  const usage = entry?.message?.usage
  if (!usage || typeof usage !== 'object') return null
  const model = entry?.message?.model || entry?.model || ''
  const normalized = normalizeClaudeUsage(usage, model)
  const durationMs = Number(entry?.duration_ms || 0)
  if (
    (normalized.inputTokens || 0) <= 0
    && (normalized.outputTokens || 0) <= 0
    && (normalized.cacheReadTokens || 0) <= 0
    && (normalized.cacheCreationTokens || 0) <= 0
    && durationMs <= 0
  ) {
    return null
  }
  return {
    inputTokens: normalized.inputTokens || 0,
    outputTokens: normalized.outputTokens || 0,
    cacheReadTokens: normalized.cacheReadTokens || 0,
    cacheCreationTokens: normalized.cacheCreationTokens || 0,
    durationMs,
  }
}

/**
 * Annotate a parsed history message with `_turnTokens` from its raw entry.
 * Returns `msgData` unchanged when no meaningful tokens are found.
 *
 * @param {object} msgData — already-parsed message object
 * @param {object} entry  — raw JSONL entry with message.usage
 * @returns {object} msgData (mutated in-place)
 */
function annotateClaudeHistoryEntryWithTurnTokens(msgData, entry) {
  const turnTokens = buildClaudeHistoryTurnTokensFromEntry(entry)
  if (!turnTokens || !msgData || typeof msgData !== 'object') return msgData
  msgData._turnTokens = turnTokens
  return msgData
}

function annotateClaudeHistoryMessagesWithTurnTokens(messages, entries) {
  if (!Array.isArray(messages) || !Array.isArray(entries) || messages.length === 0) return messages
  let currentTurn = null
  const finalized = []

  function finalizeTurn() {
    if (!currentTurn) return
    if (currentTurn.lastAssistantMessage && hasMeaningfulTurnTokens(currentTurn.tokens)) {
      if (currentTurn.userTs !== null && currentTurn.lastAssistantTs !== null && currentTurn.lastAssistantTs >= currentTurn.userTs) {
        currentTurn.tokens.durationMs = currentTurn.lastAssistantTs - currentTurn.userTs
      }
      finalized.push({
        message: currentTurn.lastAssistantMessage,
        tokens: { ...currentTurn.tokens },
      })
    }
    currentTurn = null
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    const message = messages[i]
    if (!entry || !message) continue
    if (isRealUserTurnBoundary(entry)) {
      finalizeTurn()
      currentTurn = {
        userTs: parseTimestampMs(entry.timestamp),
        lastAssistantTs: null,
        lastAssistantMessage: null,
        tokens: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: 0,
          costUsd: 0,
        },
      }
      continue
    }
    const sourceType = message._source_type || entry.type
    if (sourceType !== 'assistant') continue
    const turnTokens = buildClaudeHistoryTurnTokensFromEntry(entry)
    if (!turnTokens) continue
    if (!currentTurn) {
      currentTurn = {
        userTs: null,
        lastAssistantTs: null,
        lastAssistantMessage: null,
        tokens: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: 0,
          costUsd: 0,
        },
      }
    }
    addTurnTokens(currentTurn.tokens, turnTokens)
    currentTurn.lastAssistantTs = parseTimestampMs(entry.timestamp)
    currentTurn.lastAssistantMessage = message
    if (Number(turnTokens.durationMs || 0) > 0) currentTurn.tokens.durationMs = Number(turnTokens.durationMs || 0)
  }
  finalizeTurn()

  for (const item of finalized) {
    item.message._turnTokens = item.tokens
  }
  return messages
}

/**
 * Read a page of JSONL lines from the tail of a session file.
 *
 * Scans backwards from EOF in 64 KiB chunks, collecting complete lines
 * newest-first, then returns the requested page (oldest-first).
 *
 * @param {string} filePath  — absolute path to the JSONL session file
 * @param {number} [page=0]  — zero-based page index
 * @param {number} [pageSize=60] — lines per page (1–200)
 * @returns {{lines:string[], hasMore:boolean, totalPages:number, fileSize:number, bytesScanned:number, linesScanned:number}}
 */
function readJsonlPageLinesFromTail(filePath, page = 0, pageSize = 60) {
  const stop = perfStartIpc('claude.readJsonlPageLinesFromTail', { page, pageSize })
  const safePage = Math.max(0, Number(page) || 0)
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 60))
  const newestToSkip = safePage * safePageSize
  const wanted = safePageSize + 1
  const maxLinesToRead = newestToSkip + wanted
  const chunkSize = 64 * 1024
  const linesNewestFirst = []
  let fd = null
  let fileSize = 0
  let bytesScanned = 0
  let chunksRead = 0

  try {
    const tOpen = Date.now()
    fd = fs.openSync(filePath, 'r')
    fileSize = fs.fstatSync(fd).size
    const openMs = Date.now() - tOpen

    let pos = fileSize
    let carry = Buffer.alloc(0)

    while (pos > 0 && linesNewestFirst.length < maxLinesToRead) {
      const toRead = Math.min(chunkSize, pos)
      pos -= toRead
      const buf = Buffer.allocUnsafe(toRead)
      const bytesRead = fs.readSync(fd, buf, 0, toRead, pos)
      if (bytesRead <= 0) break
      bytesScanned += bytesRead
      chunksRead++

      let end = bytesRead
      for (let i = bytesRead - 1; i >= 0; i--) {
        if (buf[i] !== 0x0a) continue
        const part = buf.subarray(i + 1, end)
        const lineBuf = carry.length ? Buffer.concat([part, carry]) : part
        if (lineBuf.length > 0 && lineBuf.toString('utf8').trim()) {
          linesNewestFirst.push(lineBuf)
          if (linesNewestFirst.length >= maxLinesToRead) break
        }
        carry = Buffer.alloc(0)
        end = i
      }
      if (end > 0 && linesNewestFirst.length < maxLinesToRead) {
        const prefix = buf.subarray(0, end)
        carry = carry.length ? Buffer.concat([prefix, carry]) : Buffer.from(prefix)
      }
    }

    if (carry.length > 0 && linesNewestFirst.length < maxLinesToRead && carry.toString('utf8').trim()) {
      linesNewestFirst.push(carry)
    }

    const pageLinesNewestFirst = linesNewestFirst.slice(newestToSkip, newestToSkip + safePageSize)
    const parsedLines = pageLinesNewestFirst.reverse().map(line => line.toString('utf8'))
    const hasMore = linesNewestFirst.length > newestToSkip + safePageSize

    stop({
      fileSizeKB: Math.round(fileSize / 1024),
      openMs,
      chunksRead,
      bytesScannedKB: Math.round(bytesScanned / 1024),
      linesTotal: linesNewestFirst.length,
      pageLines: parsedLines.length,
      hasMore: hasMore ? 1 : 0,
    })
    return {
      lines: parsedLines,
      hasMore,
      totalPages: hasMore ? safePage + 2 : safePage + 1,
      fileSize,
      bytesScanned,
      linesScanned: linesNewestFirst.length,
    }
  } finally {
    if (fd != null) {
      try { fs.closeSync(fd) } catch (_) {}
    }
  }
}

module.exports = {
  buildClaudeHistoryTurnTokensFromEntry,
  annotateClaudeHistoryEntryWithTurnTokens,
  annotateClaudeHistoryMessagesWithTurnTokens,
  readJsonlPageLinesFromTail,
}
