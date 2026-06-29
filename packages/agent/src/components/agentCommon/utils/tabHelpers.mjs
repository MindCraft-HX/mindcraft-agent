/**
 * Tab helper pure functions — extracted from useClaudeTabs / useCodexTabs.
 * These are stateless, no Vue dependency, no IPC.
 */

/**
 * Compute which tab ID should become active after a tab is deleted.
 *
 * @param {Array<{id: string}>} tabs - remaining tabs AFTER splice
 * @param {number} deletedIndex - index of the deleted tab (before splice)
 * @param {boolean} wasActive - whether the deleted tab was the active one
 * @returns {{ activeId: string|null, shouldCreateNew: boolean }}
 *   - activeId: the new active tab id, or null if none
 *   - shouldCreateNew: true if all tabs were deleted and a new one should be created
 */
export function computeNextActiveTab(tabs, deletedIndex, wasActive) {
  if (!wasActive) {
    return { activeId: null, shouldCreateNew: false }
  }
  if (!tabs.length) {
    return { activeId: null, shouldCreateNew: true }
  }
  return {
    activeId: tabs[Math.max(0, deletedIndex - 1)]?.id || null,
    shouldCreateNew: false,
  }
}

/**
 * Sanitize a tab name for display/storage.
 *
 * @param {string} name - raw name input
 * @returns {{ value: string, isValid: boolean }}
 *   - value: trimmed name, or empty string
 *   - isValid: true if the name is non-empty after trimming
 */
export function sanitizeTabName(name) {
  const value = typeof name === 'string' ? name.trim() : ''
  return { value, isValid: value.length > 0 }
}
