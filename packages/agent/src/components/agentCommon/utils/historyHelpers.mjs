/**
 * History helper pure functions — extracted from useClaudeHistory / useCodexHistory.
 * These are stateless, no Vue dependency, no IPC.
 */

/**
 * Create a cooldown guard that suppresses calls within `cooldownMs`.
 * Used by both ClaudeCode and CodeX history composables to batch rapid-fire
 * save calls during streaming.
 *
 * @param {number} cooldownMs - minimum interval between allowed calls (default 500)
 * @returns {() => boolean} guard function — returns true if within cooldown (should skip)
 */
export function createSaveCooldownGuard(cooldownMs = 500) {
  let lastMs = 0
  return function isInCooldown() {
    const now = Date.now()
    if (now - lastMs < cooldownMs) return true
    lastMs = now
    return false
  }
}

/**
 * Filter out subagent session chats from a restored chat list.
 * Both providers filter chats whose filePath contains 'subagents'.
 *
 * @param {Array<{filePath?: string}>} chats
 * @returns {Array} filtered chats (new array, no mutation)
 */
export function filterSubagentChats(chats) {
  if (!Array.isArray(chats)) return []
  return chats.filter(c => !c?.filePath || !c.filePath.includes('subagents'))
}
