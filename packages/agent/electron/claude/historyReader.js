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
const { normalizeClaudeUsage } = require('../tokenMetrics/normalizer')

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

  try {
    fd = fs.openSync(filePath, 'r')
    fileSize = fs.fstatSync(fd).size
    let pos = fileSize
    let carry = Buffer.alloc(0)

    while (pos > 0 && linesNewestFirst.length < maxLinesToRead) {
      const toRead = Math.min(chunkSize, pos)
      pos -= toRead
      const buf = Buffer.allocUnsafe(toRead)
      const bytesRead = fs.readSync(fd, buf, 0, toRead, pos)
      if (bytesRead <= 0) break
      bytesScanned += bytesRead

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
    const hasMore = linesNewestFirst.length > newestToSkip + safePageSize
    return {
      lines: pageLinesNewestFirst.reverse().map(line => line.toString('utf8')),
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
  readJsonlPageLinesFromTail,
}
