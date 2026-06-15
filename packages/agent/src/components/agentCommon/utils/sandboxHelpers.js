/**
 * CodeX sandboxMode 共享常量/函数
 *
 * 被 codexConfig.js store 和 codeX/index.vue 会话层引用。
 * 避免两处各自维护相同的值域和迁移映射。
 */

/** CodeX SDK 原生 sandboxMode 合法值 */
export const VALID_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

/**
 * 旧 ClaudeCode 式 permissionPolicy 值 → CodeX SDK 原生 sandboxMode 值迁移映射
 *
 * 历史：早期实现套用了 ClaudeCode 的命名（read_only/ask/allow_all），
 * 重构后改用 SDK 原生值。此映射用于向后兼容迁移旧持久化数据。
 */
export const SANDBOX_MIGRATE_MAP = {
  read_only: 'read-only',
  ask: 'workspace-write',
  allow_all: 'danger-full-access',
}

/**
 * 判断是否为合法的 sandboxMode 值
 */
export function isValidSandboxMode(mode) {
  return VALID_SANDBOX_MODES.includes(mode)
}

/**
 * 旧值迁移：如果 raw 是旧值则返回新值，非法值返回 null
 *
 * @param {string|null|undefined} raw - 可能是旧值或新值的原始字符串
 * @returns {string|null} 合法的新值，或 null
 */
export function migrateSandboxValue(raw) {
  if (!raw) return null
  if (isValidSandboxMode(raw)) return raw
  if (SANDBOX_MIGRATE_MAP[raw]) return SANDBOX_MIGRATE_MAP[raw]
  return null
}
