/**
 * Token Metrics Normalizer (Phase 1)
 *
 * 所有 provider → UI 语义的唯一归一化入口。
 *
 * 统一语义：
 *   in = 常规输入 + cache creation
 *   cache = cache read
 *
 * Provider 映射规则见 docs/token-metrics.md §0。
 */

/**
 * @typedef {Object} NormalizedUsage
 * @property {number} inputTokens   — UI in (常规输入 + cache creation)
 * @property {number} outputTokens  — UI out
 * @property {number} cacheReadTokens   — UI cache (cache read only)
 * @property {number} cacheCreationTokens — 保留给 debug/cost，不展示为 cache
 * @property {number} [contextUsage]  — context 占用，Claude 可见
 */

// ==================== Helpers ====================

function toSafeInt(v) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * 判断是否为原生 Claude 模型（SDK 直接调用 Anthropic API）。
 * 原生 Claude 的 input_tokens 已包含 cache_read + cache_creation，
 * 第三方 provider 则分开上报。
 *
 * 与 claudeMetrics.js 中的判断逻辑保持一致。
 */
function isNativeClaudeModel(model) {
  const lower = String(model || '').toLowerCase()
  if (!lower) return false
  return lower.includes('claude') ||
    lower.includes('sonnet') ||
    lower.includes('opus') ||
    lower.includes('haiku')
}

// ==================== Provider Normalizers ====================

/**
 * 归一化 Claude SDK usage → 统一 UI 语义。
 *
 * @param {Object} usage  — SDK 返回的 usage 对象
 * @param {string} [model] — 模型标识，用于区分原生/第三方
 * @returns {NormalizedUsage}
 */
function normalizeClaudeUsage(usage, model) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  }

  const rawInput = toSafeInt(usage.input_tokens)
  const cacheRead = toSafeInt(usage.cache_read_input_tokens)
  const cacheCreation = toSafeInt(usage.cache_creation_input_tokens)

  const inputTokens = isNativeClaudeModel(model)
    ? Math.max(0, rawInput - cacheRead)
    : rawInput + cacheCreation

  return {
    inputTokens,
    outputTokens: toSafeInt(usage.output_tokens),
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
  }
}

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
