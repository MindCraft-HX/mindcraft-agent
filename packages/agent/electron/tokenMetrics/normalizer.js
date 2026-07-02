/**
 * Token Metrics Normalizer (Phase 1)
 *
 * 所有 provider → UI 语义的唯一归一化入口。
 *
 * 统一语义：
 *   in = 常规输入 + cache creation
 *   cache = cache read
 *
 * Provider mapping rules are defined in docs/token-metrics-contract.md.
 */

/**
 * @typedef {Object} NormalizedUsage
 * @property {number} inputTokens   — UI in (常规输入 + cache creation)
 * @property {number} outputTokens  — UI out
 * @property {number} cacheReadTokens   — UI cache (cache read only)
 * @property {number} cacheCreationTokens — 保留给 debug/cost，不展示为 cache
 * @property {number} [contextUsage]  — context 占用，Claude 可见
 */

const { normalizeClaudeUsage, isNativeClaudeModel, toSafeInt } = require('../../src/components/claudeCode/utils/normalizeClaudeUsage.cjs')

/**
 * 归一化 CodeX usage → 统一 UI 语义。
 *
 * CodeX 的 cached_input_tokens 是 input_tokens 的子集（cache read）。
 *
 * @param {Object} usage — CodeX token_count usage 或 turn.completed usage
 * @returns {NormalizedUsage}
 */
function normalizeCodexUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  }

  const rawInput = toSafeInt(usage.input_tokens)

  // cacheRead 优先级：cache_read_input_tokens > cached_input_tokens > input_tokens_details.cached_tokens
  let cacheRead = toSafeInt(usage.cache_read_input_tokens)
  if (!cacheRead) cacheRead = toSafeInt(usage.cached_input_tokens)
  if (!cacheRead) cacheRead = toSafeInt(usage.input_tokens_details?.cached_tokens)

  const cacheCreation = toSafeInt(usage.cache_creation_input_tokens)

  const inputTokens = Math.max(0, rawInput - cacheRead) + cacheCreation

  return {
    inputTokens,
    outputTokens: toSafeInt(usage.output_tokens),
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
  }
}

// ==================== Unified Normalizer ====================

/**
 * 统一归一化入口。
 *
 * @param {Object} options
 * @param {'claude'|'codex'} options.provider
 * @param {Object} options.usage        — provider 原始 usage 对象
 * @param {string} [options.model]      — Claude 模型标识（仅 claude 需要）
 * @returns {NormalizedUsage}
 */
function normalizeUsage({ provider, usage, model } = {}) {
  if (!provider || !usage) {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  }

  switch (provider) {
    case 'claude':
      return normalizeClaudeUsage(usage, model)
    case 'codex':
      return normalizeCodexUsage(usage)
    default:
      return {
        inputTokens: toSafeInt(usage.input_tokens),
        outputTokens: toSafeInt(usage.output_tokens),
        cacheReadTokens: toSafeInt(usage.cache_read_input_tokens || usage.cached_input_tokens),
        cacheCreationTokens: toSafeInt(usage.cache_creation_input_tokens),
      }
  }
}

// ==================== Backward-compat aliases ====================

// 兼容 claudeMetrics.normalizeClaudeUsageForUi() 调用点
const normalizeClaudeUsageForUi = normalizeClaudeUsage

module.exports = {
  // 核心入口
  normalizeUsage,
  normalizeClaudeUsage,
  normalizeCodexUsage,

  // 兼容别名（逐步迁移后可删除）
  normalizeClaudeUsageForUi,

  // 工具
  isNativeClaudeModel,
  toSafeInt,
}
