'use strict'

const fs = require('fs')

const DEFAULT_DEBOUNCE_MS = 150

function sameSignature(left, right) {
  return Boolean(left && right
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
    && left.ino === right.ino)
}

function isValidIdentity(identity) {
  return Boolean(identity
    && typeof identity.filePath === 'string' && identity.filePath
    && typeof identity.canonicalDocumentKey === 'string' && identity.canonicalDocumentKey)
}

/**
 * Watches file-backed documents for external changes, deduped by canonical
 * document key. Notifications carry the fresh identity so the renderer can
 * route them through documentController.refreshForExternalChange.
 *
 * - Self-write token: DOCUMENT_WRITE success records the new signature via
 *   noteSelfWrite; the next matching event is swallowed (and remembered as
 *   last-notified so duplicate fs events from the same write stay silent).
 * - Rearm: the repository writes atomically (temp + rename), which replaces
 *   the inode; every handled event re-creates the watcher or Linux inotify
 *   would go silent after the first save.
 */
function createDocumentWatchManager({
  watch = (filePath, listener) => fs.watch(filePath, listener),
  describe,
  send,
  debounceMs = DEFAULT_DEBOUNCE_MS,
} = {}) {
  if (typeof describe !== 'function' || typeof send !== 'function') {
    throw new Error('document watch manager requires describe and send')
  }

  const watchers = new Map()

  function armWatcher(entry) {
    try { entry.watcher?.close?.() } catch (_) {}
    try {
      const watcher = watch(entry.filePath, () => scheduleNotify(entry))
      watcher?.on?.('error', () => {})
      entry.watcher = watcher
    } catch (_) {
      entry.watcher = null
    }
  }

  function scheduleNotify(entry) {
    if (!watchers.has(entry.canonicalDocumentKey)) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      notify(entry)
    }, debounceMs)
    entry.timer.unref?.()
  }

  function notify(entry) {
    if (!watchers.has(entry.canonicalDocumentKey)) return
    armWatcher(entry)
    const current = describe(entry.filePath)
    if (!current?.ok) {
      send({
        canonicalDocumentKey: entry.canonicalDocumentKey,
        filePath: entry.filePath,
        identity: null,
        reason: current?.reason || 'describe-failed',
      })
      return
    }
    const signature = current.signature
    if (sameSignature(signature, entry.selfWriteSignature)) {
      entry.selfWriteSignature = null
      entry.lastNotifiedSignature = signature
      return
    }
    if (sameSignature(signature, entry.lastNotifiedSignature)) return
    entry.lastNotifiedSignature = signature
    send({
      canonicalDocumentKey: entry.canonicalDocumentKey,
      filePath: current.filePath,
      identity: current,
      reason: 'changed',
    })
  }

  function watchDocument(identity) {
    if (!isValidIdentity(identity)) return { ok: false, reason: 'invalid-identity' }
    const key = identity.canonicalDocumentKey
    const existing = watchers.get(key)
    if (existing) {
      if (identity.signature) existing.lastNotifiedSignature = identity.signature
      return { ok: true, alreadyWatching: true }
    }
    const entry = {
      canonicalDocumentKey: key,
      filePath: identity.filePath,
      watcher: null,
      timer: null,
      lastNotifiedSignature: identity.signature || null,
      selfWriteSignature: null,
    }
    watchers.set(key, entry)
    armWatcher(entry)
    if (!entry.watcher) {
      watchers.delete(key)
      return { ok: false, reason: 'watch-failed' }
    }
    return { ok: true, alreadyWatching: false }
  }

  function noteSelfWrite(canonicalDocumentKey, signature) {
    const entry = watchers.get(canonicalDocumentKey)
    if (!entry || !signature) return false
    entry.selfWriteSignature = signature
    return true
  }

  function unwatchDocument(canonicalDocumentKey) {
    const entry = watchers.get(canonicalDocumentKey)
    if (!entry) return false
    if (entry.timer) clearTimeout(entry.timer)
    try { entry.watcher?.close?.() } catch (_) {}
    watchers.delete(canonicalDocumentKey)
    return true
  }

  function dispose() {
    for (const key of [...watchers.keys()]) unwatchDocument(key)
  }

  return {
    watchDocument,
    unwatchDocument,
    noteSelfWrite,
    dispose,
    get size() { return watchers.size },
  }
}

module.exports = { createDocumentWatchManager }
