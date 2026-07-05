/**
 * T183 Phase 1: Shared file-derived read-through cache helper.
 *
 * Standardizes the repeated `Map + mtimeMs[+size] + clone + ENOENT evict`
 * pattern used across homeMetrics, claudeMetrics, and codexAgent.
 *
 * Each call to createFileDerivedCache() returns an independent instance —
 * no global singleton, no cross-cache state sharing.
 *
 * @module localDerivedCache
 */

const fs = require('fs')

/**
 * @typedef {'mtimeMs'|'mtimeMs+size'} SignatureMode
 *   'mtimeMs'       — invalidate on mtimeMs change only
 *   'mtimeMs+size'  — invalidate on either mtimeMs or size change (dual-signature)
 *
 * @typedef {Object} FileDerivedCacheOptions
 * @property {SignatureMode} [signature='mtimeMs+size']
 * @property {Function|boolean} [clone]
 *   - Function: called as clone(value) on every get() hit
 *   - true:      shallow spread clone ({...value}) — only for plain objects
 *   - falsy:     return raw reference (caller must not mutate)
 */

/**
 * Create a file-derived cache instance.
 *
 * @param {FileDerivedCacheOptions} options
 * @returns {{ get, set, has, delete, clear }}
 */
function createFileDerivedCache(options = {}) {
  const {
    signature = 'mtimeMs+size',
    clone: _clone,
  } = options

  const _map = new Map()
  const _useSize = signature === 'mtimeMs+size'

  function _cloneValue(v) {
    if (typeof _clone === 'function') return _clone(v)
    if (_clone === true) return { ...v }
    return v
  }

  function _buildKey(stat) {
    if (!stat || typeof stat.mtimeMs !== 'number') return null
    if (_useSize) {
      return `${stat.mtimeMs}::${typeof stat.size === 'number' ? stat.size : 0}`
    }
    return `${stat.mtimeMs}`
  }

  /**
   * Get cached value if the file on disk matches the stored signature.
   * Returns the cloned value on hit, null on miss.
   * Auto-evicts the entry if the file is missing (ENOENT) or signature mismatches.
   *
   * @param {string} filePath - Absolute path to the file
   * @returns {*|null} cloned cached value, or null
   */
  function get(filePath) {
    const entry = _map.get(filePath)
    if (!entry) return null

    let stat
    try {
      stat = fs.statSync(filePath)
    } catch (_) {
      // File gone (ENOENT, EPERM, etc.) — evict and return null
      _map.delete(filePath)
      return null
    }

    const key = _buildKey(stat)
    if (key === null || entry._key !== key) {
      // Signature mismatch (file modified) — evict
      _map.delete(filePath)
      return null
    }

    return _cloneValue(entry._value)
  }

  /**
   * Store a value in the cache, keyed by filePath with current stat signature.
   * Silently no-ops if fs.statSync fails (file missing, permission error, etc.).
   *
   * @param {string} filePath - Absolute path to the file
   * @param {*} value - Value to cache (stored as-is; clone is applied on get())
   */
  function set(filePath, value) {
    try {
      const stat = fs.statSync(filePath)
      const key = _buildKey(stat)
      if (key !== null) {
        _map.set(filePath, { _key: key, _value: value })
      }
    } catch (_) {
      // File not accessible — don't cache
    }
  }

  /**
   * Check if a valid (non-stale) entry exists for the given filePath.
   * Performs a stat check — returns false if file is missing or signature mismatches.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  function has(filePath) {
    const entry = _map.get(filePath)
    if (!entry) return false

    let stat
    try {
      stat = fs.statSync(filePath)
    } catch (_) {
      _map.delete(filePath)
      return false
    }

    const key = _buildKey(stat)
    if (key === null || entry._key !== key) {
      _map.delete(filePath)
      return false
    }

    return true
  }

  /**
   * Remove a single entry from the cache.
   * @param {string} filePath
   */
  function _delete(filePath) {
    _map.delete(filePath)
  }

  /**
   * Clear all entries from the cache.
   */
  function clear() {
    _map.clear()
  }

  return { get, set, has, delete: _delete, clear }
}

/**
 * Track an in-flight promise in a deduplication map, with optional timeout.
 *
 * Stores {promise} at {map}[{key}] immediately. When the promise settles
 * OR the timeout fires (whichever comes first), the entry is removed from
 * the map — releasing the dedup slot so a subsequent caller can start a
 * new operation for the same key.
 *
 * If the timeout fires first, the underlying promise keeps running
 * (no abort) — only the dedup slot is released.
 *
 * @param {Map} map   - Dedup map (key → Promise)
 * @param {*} key     - Map key (typically a filePath string)
 * @param {Promise} promise - The in-flight async operation
 * @param {number} [timeoutMs=60000] - Max time (ms) before the dedup slot
 *   is released. Pass 0 to disable (cleanup only on settle).
 * @returns {Promise} The original promise, so callers can await if needed.
 */
function trackDedup(map, key, promise, timeoutMs = 60000) {
  map.set(key, promise)

  let timer = null

  const cleanup = () => {
    if (timer !== null) { clearTimeout(timer); timer = null }
    // Identity guard: only delete if the slot still holds THIS promise.
    // Without this, a timed-out (stale) promise settling after a new
    // promise has taken the same key would delete the new promise's slot.
    if (map.get(key) === promise) map.delete(key)
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timer = null
      // Timeout: release the slot only if it still belongs to this promise.
      if (map.get(key) === promise) map.delete(key)
    }, timeoutMs)
  }

  // Clean up on settle regardless of timeout — identity guard keeps it safe.
  promise.finally(cleanup)

  return promise
}

module.exports = { createFileDerivedCache, trackDedup }
