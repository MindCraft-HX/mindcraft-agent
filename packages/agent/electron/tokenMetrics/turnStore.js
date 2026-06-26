/**
 * Token Turn Store (Phase 2)
 *
 * 为每个 chatKey 维护统一的 turn 级 token 状态。
 *
 * 核心规则：
 * - sdk-live/token-count 只能更新当前 turn 的 live snapshot
 * - sdk-result finalizes 当前 turn，之后 live/poll 不能再覆盖 in/out/cache
 * - jsonl-poll 对 current turn 默认只更新 context/duration
 * - final 后的 turn 存入历史，不可变
 *
 * 这是 StatusBar、footer、history restore 的唯一 token 数据源。
 */

const { normalizeUsage } = require('./normalizer')

// ==================== Store ====================

/** @type {Map<string, { currentTurn: TurnState | null, turns: Map<string, FinalSnapshot> }>} */
const stores = new Map()

/**
 * @typedef {Object} TurnState
 * @property {string} turnId
 * @property {string} provider
 * @property {string} chatKey
 * @property {string} providerSessionId
 * @property {number} startedAt
 * @property {LiveSnapshot | null} liveSnapshot
 * @property {FinalSnapshot | null} finalized
 */

/**
 * @typedef {Object} LiveSnapshot
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheCreationTokens
 * @property {number} contextUsage
 * @property {number} contextWindow
 * @property {number} durationMs
 * @property {number} costUsd
 * @property {string[]} sources
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} FinalSnapshot
 * @property {string} turnId
 * @property {string} provider
 * @property {string} chatKey
 * @property {string} providerSessionId
 * @property {'final'} phase
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheCreationTokens
 * @property {number} contextUsage
 * @property {number} contextWindow
 * @property {number} durationMs
 * @property {number} costUsd
 * @property {string[]} sources
 * @property {number} updatedAt
 * @property {number} finalizedAt
 */

// ==================== Private Helpers ====================

let _turnIdCounter = 0

function nextTurnId() {
  _turnIdCounter += 1
  return `turn_${Date.now()}_${_turnIdCounter}`
}

function getOrCreateStore(chatKey) {
  let s = stores.get(chatKey)
  if (!s) {
    s = { currentTurn: null, turns: new Map() }
    stores.set(chatKey, s)
  }
  return s
}

function buildLiveSnapshot(sample) {
  return {
    inputTokens: sample.inputTokens ?? 0,
    outputTokens: sample.outputTokens ?? 0,
    cacheReadTokens: sample.cacheReadTokens ?? 0,
    cacheCreationTokens: sample.cacheCreationTokens ?? 0,
    contextUsage: sample.contextUsage ?? 0,
    contextWindow: sample.contextWindow ?? 0,
    durationMs: sample.durationMs ?? 0,
    costUsd: sample.costUsd ?? 0,
    sources: [sample.source || 'unknown'],
    updatedAt: Date.now(),
  }
}

function pickSessionMetricValue(nextValue, previousValue) {
  const next = Number(nextValue)
  if (Number.isFinite(next) && next > 0) return next
  const previous = Number(previousValue)
  return Number.isFinite(previous) && previous > 0 ? previous : 0
}

function buildFinalSnapshot(turn, sample) {
  const live = turn.liveSnapshot || {}
  const now = Date.now()
  // sdk-result 优先，fallback live snapshot
  return {
    turnId: turn.turnId,
    provider: turn.provider,
    chatKey: turn.chatKey,
    providerSessionId: turn.providerSessionId,
    phase: 'final',
    inputTokens: sample.inputTokens ?? live.inputTokens ?? 0,
    outputTokens: sample.outputTokens ?? live.outputTokens ?? 0,
    cacheReadTokens: sample.cacheReadTokens ?? live.cacheReadTokens ?? 0,
    cacheCreationTokens: sample.cacheCreationTokens ?? live.cacheCreationTokens ?? 0,
    contextUsage: pickSessionMetricValue(sample.contextUsage, live.contextUsage),
    contextWindow: pickSessionMetricValue(sample.contextWindow, live.contextWindow),
    durationMs: sample.durationMs ?? live.durationMs ?? 0,
    costUsd: sample.costUsd ?? live.costUsd ?? 0,
    sources: [...new Set([...(live.sources || []), sample.source || 'unknown'])],
    updatedAt: now,
    finalizedAt: now,
  }
}

function mergeLiveSnapshot(existing, sample) {
  const sources = new Set(existing.sources || [])
  if (sample.source) sources.add(sample.source)

  return {
    inputTokens: Math.max(existing.inputTokens || 0, sample.inputTokens || 0),
    outputTokens: Math.max(existing.outputTokens || 0, sample.outputTokens || 0),
    cacheReadTokens: Math.max(existing.cacheReadTokens || 0, sample.cacheReadTokens || 0),
    cacheCreationTokens: Math.max(existing.cacheCreationTokens || 0, sample.cacheCreationTokens || 0),
    // context/duration/cost 覆写（取最新值）
    contextUsage: pickSessionMetricValue(sample.contextUsage, existing.contextUsage),
    contextWindow: pickSessionMetricValue(sample.contextWindow, existing.contextWindow),
    durationMs: sample.durationMs ?? existing.durationMs ?? 0,
    costUsd: sample.costUsd ?? existing.costUsd ?? 0,
    sources: [...sources],
    updatedAt: Date.now(),
  }
}

// ==================== Public API ====================

/**
 * 开始新 turn。
 *
 * @param {Object} opts
 * @param {'claude'|'codex'} opts.provider
 * @param {string} opts.chatKey
 * @param {string} [opts.providerSessionId]
 * @param {number} [opts.startedAt]
 * @returns {string} turnId
 */
function beginTurn({ provider, chatKey, providerSessionId, startedAt } = {}) {
  if (!chatKey) throw new Error('beginTurn: chatKey is required')
  const s = getOrCreateStore(chatKey)
  const turnId = nextTurnId()
  s.currentTurn = {
    turnId,
    provider: provider || 'unknown',
    chatKey,
    providerSessionId: providerSessionId || '',
    startedAt: startedAt || Date.now(),
    liveSnapshot: null,
    finalized: null,
  }
  return turnId
}

/**
 * 投喂一个 normalized sample。
 *
 * @param {NormalizedMetricSample} sample
 * @returns {{ accepted: boolean, reason?: string }}
 */
function applySample(sample = {}) {
  const { chatKey, source, provider, providerSessionId } = sample
  if (!chatKey) return { accepted: false, reason: 'missing chatKey' }

  const s = getOrCreateStore(chatKey)
  const turn = s.currentTurn

  // 没有 active turn 时，不允许 live/poll 创建（应由 beginTurn 显式创建）
  if (!turn) {
    if (source === 'sdk-result' || source === 'token-count' || source === 'sdk-live') {
      // 自动 begin
      beginTurn({ provider, chatKey, providerSessionId })
      return applySample(sample)
    }
    return { accepted: false, reason: 'no active turn' }
  }

  // jsonl-poll：只能补 context/duration，绝不覆盖 in/out/cache
  if (source === 'jsonl-poll') {
    if (turn.finalized) return { accepted: false, reason: 'turn already finalized' }
    if (!turn.liveSnapshot) {
      turn.liveSnapshot = buildLiveSnapshot({ ...sample, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })
    } else {
      // 只更新 context/duration
      turn.liveSnapshot.contextUsage = pickSessionMetricValue(sample.contextUsage, turn.liveSnapshot.contextUsage)
      turn.liveSnapshot.contextWindow = pickSessionMetricValue(sample.contextWindow, turn.liveSnapshot.contextWindow)
      turn.liveSnapshot.durationMs = sample.durationMs ?? turn.liveSnapshot.durationMs ?? 0
      turn.liveSnapshot.costUsd = sample.costUsd ?? turn.liveSnapshot.costUsd ?? 0
      if (sample.source) {
        const srcSet = new Set(turn.liveSnapshot.sources || [])
        srcSet.add(sample.source)
        turn.liveSnapshot.sources = [...srcSet]
      }
      turn.liveSnapshot.updatedAt = Date.now()
    }
    return { accepted: true, phase: 'live' }
  }

  // sdk-live / token-count：更新 live snapshot
  if (source === 'sdk-live' || source === 'token-count') {
    if (turn.finalized) return { accepted: false, reason: 'turn already finalized' }
    if (turn.liveSnapshot) {
      turn.liveSnapshot = mergeLiveSnapshot(turn.liveSnapshot, sample)
    } else {
      turn.liveSnapshot = buildLiveSnapshot(sample)
    }
    return { accepted: true, phase: 'live' }
  }

  // sdk-result：finalize
  if (source === 'sdk-result') {
    if (turn.finalized) return { accepted: false, reason: 'turn already finalized' }
    const final = buildFinalSnapshot(turn, sample)
    turn.finalized = final
    turn.liveSnapshot = final // live snapshot 收敛到 final
    s.turns.set(turn.turnId, final)
    return { accepted: true, phase: 'final' }
  }

  return { accepted: false, reason: `unknown source: ${source}` }
}

/**
 * 获取当前 turn live snapshot（StatusBar 用）。
 *
 * @param {string} chatKey
 * @returns {TokenTurnSnapshot | null}
 */
function getCurrentSnapshot(chatKey) {
  const s = stores.get(chatKey)
  if (!s?.currentTurn) return null
  const turn = s.currentTurn
  const snap = turn.finalized || turn.liveSnapshot
  if (!snap) return null
  return {
    provider: turn.provider,
    chatKey,
    providerSessionId: turn.providerSessionId,
    turnId: turn.turnId,
    phase: turn.finalized ? 'final' : 'live',
    ...snap,
    updatedAt: snap.updatedAt || 0,
  }
}

/**
 * 获取已完成的 turn final snapshot（footer / history 用）。
 *
 * @param {string} chatKey
 * @param {string} [turnId]
 * @returns {TokenTurnSnapshot | null}
 */
function getFinalSnapshot(chatKey, turnId) {
  const s = stores.get(chatKey)
  if (!s) return null
  if (turnId) {
    const f = s.turns.get(turnId)
    return f ? { ...f } : null
  }
  // 没指定 turnId → 返回当前 turn 的 final（如果有）
  const turn = s.currentTurn
  if (turn?.finalized) return { ...turn.finalized }
  return null
}

/**
 * 清除当前 turn（stream 结束/abort/异常时）。
 *
 * @param {string} chatKey
 */
function clearCurrentTurn(chatKey) {
  const s = stores.get(chatKey)
  if (!s) return
  // 如果当前 turn 未 finalize，丢掉（避免残留）
  if (s.currentTurn && !s.currentTurn.finalized) {
    s.currentTurn = null
  }
}

/**
 * 获取指定 turn 是否已 finalize。
 */
function isTurnFinalized(chatKey) {
  const s = stores.get(chatKey)
  return Boolean(s?.currentTurn?.finalized)
}

/**
 * 清除指定 chatKey 的所有 store 数据（session 关闭时）。
 */
function removeStore(chatKey) {
  stores.delete(chatKey)
}

/**
 * 获取 store 中的 turn 数量（用于诊断）。
 */
function getTurnCount(chatKey) {
  const s = stores.get(chatKey)
  return s ? s.turns.size : 0
}

/**
 * 便捷入口：applySample → 返回 snapshot（供 metrics emitter 使用）。
 *
 * @param {Object} sample — NormalizedMetricSample
 * @returns {{ snapshot: TokenTurnSnapshot | null, accepted: boolean, phase: string }}
 */
function submitSample(sample) {
  const result = applySample(sample)
  const snapshot = getCurrentSnapshot(sample.chatKey)
  return { snapshot, accepted: result.accepted, phase: result.phase || 'unknown' }
}

module.exports = {
  beginTurn,
  applySample,
  getCurrentSnapshot,
  getFinalSnapshot,
  clearCurrentTurn,
  isTurnFinalized,
  removeStore,
  getTurnCount,
  submitSample,
}
