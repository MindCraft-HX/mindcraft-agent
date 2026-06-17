'use strict'

const VALID_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh'])

/**
 * 规范化 CodeX reasoning effort 值：
 * - 'extra_high' / 'max' → 'xhigh'（旧值迁移）
 * - 合法值原样返回
 * - 空值返回 ''
 */
function normalizeCodexReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase()
  if (!effort) return ''
  if (effort === 'extra_high' || effort === 'max') return 'xhigh'
  return VALID_REASONING_EFFORTS.has(effort) ? effort : ''
}

module.exports = { normalizeCodexReasoningEffort }
