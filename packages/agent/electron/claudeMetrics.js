const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)
const https = require('https')
const { perfStartIpc } = require('./shared/mainPerfProbe')
const { createFileDerivedCache, trackDedup } = require('./shared/localDerivedCache')

// ==================== JSONL 文件定位 ====================

const sessionJsonlCache = new Map() // cliSessionId -> filePath

function resolveJsonlPath(cliSessionId) {
  const stop = perfStartIpc('claude-metrics.resolveJsonlPath')
  if (sessionJsonlCache.has(cliSessionId)) {
    const cached = sessionJsonlCache.get(cliSessionId)
    if (cached && fs.existsSync(cached)) {
      stop({ cacheHit: 1 })
      return cached
    }
  }

  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeProjectsDir)) {
    stop({ cacheHit: 0, found: 0 })
    return null
  }

  const target = `${cliSessionId}.jsonl`

  let dirsScanned = 0
  // 递归扫描所有子目录
  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      dirsScanned++
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const found = scanDir(fullPath)
          if (found) return found
        } else if (entry.name === target) {
          return fullPath
        }
      }
    } catch (e) {
      console.log('[resolveJsonlPath] scanDir error:', e.message)
    }
    return null
  }

  const found = scanDir(claudeProjectsDir)
  if (found) {
    sessionJsonlCache.set(cliSessionId, found)
    stop({ cacheHit: 0, found: 1, dirsScanned })
    return found
  }

  try {
    const entries = fs.readdirSync(claudeProjectsDir, { withFileTypes: true })
    entries.forEach(e => console.log('  ', e.name, e.isDirectory() ? '[dir]' : '[file]'))
  } catch (_) {}

  stop({ cacheHit: 0, found: 0, dirsScanned })
  return null
}

// ==================== JSONL 指标解析 ====================

// T183 Phase 1: migrated to createFileDerivedCache
const jsonlLineCache = createFileDerivedCache({
  signature: 'mtimeMs',
  clone: (v) => ({ lines: [...v.lines] }),
})

// ==================== Aggregate Cache（Phase 1：消除主进程 fs.readFileSync 阻塞）====================
// 与 CodeX _metricsAggregateCache 同模式：filePath + mtimeMs + size 作为缓存 key，
// 缓存 getTokenMetrics + getSpeedMetrics 的合并结果。git 状态不进入缓存（独立 30s TTL）。
// T183 Phase 1: migrated to createFileDerivedCache
const _claudeAggregateCache = createFileDerivedCache({
  signature: 'mtimeMs+size',
  clone: (v) => ({ result: { ...v.result }, cwd: v.cwd || '' }),
})
const _pendingClaudeAggregates = new Map() // filePath -> Promise

function getCachedClaudeAggregate(filePath) {
  if (!filePath) return null
  return _claudeAggregateCache.get(filePath)
}

function computeAndCacheClaudeAggregate(cliSessionId) {
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) return null

  const tokenMetrics = getTokenMetrics(cliSessionId)
  const speedMetrics = getSpeedMetrics(cliSessionId)
  const cwd = getLatestSessionCwd(cliSessionId)

  if (!tokenMetrics) return null

  const result = {
    costUsd: tokenMetrics.costUsd || 0,
    inputTokens: tokenMetrics.inputTokens || 0,
    outputTokens: tokenMetrics.outputTokens || 0,
    cacheReadTokens: tokenMetrics.cacheReadTokens || 0,
    cacheCreationTokens: tokenMetrics.cacheCreationTokens || 0,
    contextUsage: tokenMetrics.contextUsage || 0,
    contextWindow: tokenMetrics.contextWindow || 0,
    durationMs: tokenMetrics.durationMs || 0,
    speedOutputPerSec: speedMetrics?.outputTokensPerSec || 0,
  }

  try {
    _claudeAggregateCache.set(filePath, { cwd: cwd || '', result: { ...result } })
  } catch (_) {}

  return result
}

function scheduleBackgroundClaudeAggregate(cliSessionId) {
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) return null
  // F5 fix: return in-flight promise so callers can await, not just null
  if (_pendingClaudeAggregates.has(filePath)) return _pendingClaudeAggregates.get(filePath)

  const promise = (async () => {
    // yield to event loop before heavy work
    await new Promise(resolve => setImmediate(resolve))
    return computeAndCacheClaudeAggregate(cliSessionId)
  })()

  return trackDedup(_pendingClaudeAggregates, filePath, promise)
}

function clearClaudeMetricsCaches() {
  _claudeAggregateCache.clear()
  jsonlLineCache.clear()
  sessionJsonlCache.clear()
}

function toSafeTokenCount(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function parseClaudeTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function isClaudeToolResultUserContent(content) {
  return Array.isArray(content) && content.length > 0 && content.every(block => block?.type === 'tool_result')
}

function isClaudeRealUserTurnBoundary(entry = {}) {
  if (entry?.type === 'queue-operation' && typeof entry.content === 'string' && entry.content.trim()) return true
  if (entry?.type !== 'user') return false
  const content = entry?.message?.content ?? entry?.content
  if (isClaudeToolResultUserContent(content)) return false
  if (typeof content === 'string') {
    const text = content.trim()
    return text && text !== '[Request interrupted by user]'
  }
  if (!Array.isArray(content)) return false
  return content.some(block => {
    if (block?.type !== 'text' || !block.text) return false
    const text = String(block.text).trim()
    if (!text || text === '[Request interrupted by user]') return false
    if (text.startsWith('<system-reminder') || text.startsWith('<environment_context') || text.startsWith('<ide_')) return false
    return true
  })
}

function getClaudeSystemContextUsageFromData(data) {
  const inputTokens = toSafeTokenCount(data?.input_tokens)
  const cacheReadTokens = toSafeTokenCount(data?.cache_read_input_tokens)
  const cacheCreationTokens = toSafeTokenCount(data?.cache_creation_input_tokens)
  return inputTokens + cacheReadTokens + cacheCreationTokens
}

function normalizeClaudeUsageForUi(usage, model) {
  // Phase 1：委托给统一 normalizer
  const { normalizeClaudeUsage } = require('./tokenMetrics/normalizer')
  return normalizeClaudeUsage(usage, model)
}

function getClaudeContextEstimateFromNormalizedUsage(normalized) {
  if (!normalized || typeof normalized !== 'object') return 0
  return toSafeTokenCount(normalized.inputTokens) +
    toSafeTokenCount(normalized.cacheReadTokens) +
    toSafeTokenCount(normalized.outputTokens)
}

function addNormalizedUsageToTotals(totals, normalized) {
  if (!totals || !normalized) return
  totals.inputTokens += toSafeTokenCount(normalized.inputTokens)
  totals.outputTokens += toSafeTokenCount(normalized.outputTokens)
  totals.cacheReadTokens += toSafeTokenCount(normalized.cacheReadTokens)
  totals.cacheCreationTokens += toSafeTokenCount(normalized.cacheCreationTokens)
}

function readJsonlLines(filePath) {
  const stop = perfStartIpc('claude-metrics.readJsonlLines')
  const cached = jsonlLineCache.get(filePath)
  if (cached) {
    stop({ cacheHit: 1, lines: cached.lines.length })
    return cached.lines
  }
  try {
    const stat = fs.statSync(filePath)
    const raw = fs.readFileSync(filePath, 'utf8')
    const lines = raw.split('\n').filter(line => line.trim())
    jsonlLineCache.set(filePath, { lines })
    stop({ cacheHit: 0, lines: lines.length, fileSizeKB: Math.round(stat.size / 1024) })
    return lines
  } catch (_) {
    stop()
    return []
  }
}

function pickClaudeTurnDurationMs(turnStartTs, turnEndTs, fallbackDurationMs = null) {
  if (typeof turnStartTs === 'number' && typeof turnEndTs === 'number' && turnEndTs >= turnStartTs) {
    return turnEndTs - turnStartTs
  }
  return typeof fallbackDurationMs === 'number' && fallbackDurationMs > 0 ? fallbackDurationMs : null
}

function getTokenMetrics(cliSessionId, options = {}) {
  const stop = perfStartIpc('claude-metrics.getTokenMetrics')
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) { stop({ found: 0 }); return null }

  const lines = readJsonlLines(filePath)
  const result = collectClaudeTokenMetricsFromLines(lines, options)
  stop({ found: 1, lines: lines.length, hasResult: result ? 1 : 0 })
  return result
}

function collectClaudeTokenMetricsFromLines(lines, options = {}) {
  if (lines.length === 0) return null
  const tokenSinceMs = Number.isFinite(options?.tokenSinceMs) ? Number(options.tokenSinceMs) : null
  const latestTurnOnly = tokenSinceMs === null && options?.latestTurnOnly !== false
  let latestTurnStartOrder = -1
  if (latestTurnOnly) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      try {
        const parsed = JSON.parse(lines[lineIndex])
        if (isClaudeRealUserTurnBoundary(parsed)) latestTurnStartOrder = lineIndex
      } catch (_) {}
    }
  }

  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0
  let contextUsage = 0
  let contextWindow = 0
  let lastUserTimestamp = null
  let lastAssistantTimestamp = null
  let lastTurnDurationMs = null
  let lastContextUsage = null
  let lastContextWindow = null
  let lastContextOrder = -1
  let lastContextSource = ''
  let lastContextSampleAt = 0
  let latestUsageContextUsage = 0
  let latestUsageContextWindow = 0
  let latestUsageContextOrder = -1
  let latestUsageContextSampleAt = 0
  let compactBoundaryContextUsage = 0
  let compactBoundaryContextWindow = 0
  let compactBoundarySampleAt = 0
  const turnUsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }

  // 扫描所有 assistant 消息提取 usage
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    try {
      const parsed = JSON.parse(line)
      const ts = parseClaudeTimestampMs(parsed.timestamp)
      if (isClaudeRealUserTurnBoundary(parsed) && typeof ts === 'number') {
        lastUserTimestamp = ts
      }

      // 鎻愬彇 token usage
      if (parsed.type === 'assistant' && parsed.message?.usage) {
        if (typeof ts === 'number') lastAssistantTimestamp = ts
        const usage = parsed.message.usage
        const entryModel = parsed.model_name || parsed.model || parsed.message?.model || ''
        const normalized = normalizeClaudeUsageForUi(usage, entryModel)
        if (tokenSinceMs !== null && (ts === null || ts < tokenSinceMs)) {
          continue
        }
        if (latestTurnOnly && latestTurnStartOrder >= 0 && lineIndex < latestTurnStartOrder) {
          continue
        }
        // inputTokens 鏄?UI 鍙ｅ緞鐨勮緭鍏ヤ晶鎴愭湰锛堝父瑙勮緭鍏?+ cache creation锛夈€?
        const usageContext = getClaudeContextEstimateFromNormalizedUsage(normalized)
        if (usageContext > 0) {
          latestUsageContextUsage = usageContext
          latestUsageContextWindow = getContextWindowForModel(entryModel)
          latestUsageContextOrder = lineIndex
          latestUsageContextSampleAt = typeof ts === 'number' ? ts : 0
        }
        addNormalizedUsageToTotals(turnUsageTotals, normalized)
        inputTokens = turnUsageTotals.inputTokens
        outputTokens = turnUsageTotals.outputTokens
        cacheReadTokens = turnUsageTotals.cacheReadTokens
        cacheCreationTokens = turnUsageTotals.cacheCreationTokens
        // output/cache 鏄?per-round 鍊硷紝浠呬俊浠诲凡瀹屾垚鐨勮疆娆★紙閬垮厤娴佸紡璺冲洖 0锛?
        const stopReason = parsed.message.stop_reason
        if (stopReason) {
          lastTurnDurationMs = pickClaudeTurnDurationMs(lastUserTimestamp, ts, lastTurnDurationMs)
        }
      }

      // 提取 context_window（来自 system context_usage 消息）
      if (parsed.type === 'system' && parsed.subtype === 'context_usage') {
        const data = parsed.data || {}
        if (data.usage) {
          contextUsage = data.usage.total || 0
          contextWindow = data.total_tokens || data.context_window_size || 0
          lastContextUsage = contextUsage
          lastContextWindow = contextWindow
          lastContextOrder = lineIndex
          lastContextSource = 'system-context'
          lastContextSampleAt = typeof ts === 'number' ? ts : 0
        }
        if (data.input_tokens && !data.usage) {
          const model = data.model || data.model_name || parsed.model || parsed.model_name || ''
          contextUsage = getClaudeSystemContextUsageFromData(data)
          contextWindow = data.context_window_size || 0
          lastContextUsage = contextUsage
          lastContextWindow = contextWindow
          lastContextOrder = lineIndex
          lastContextSource = 'system-context'
          lastContextSampleAt = typeof ts === 'number' ? ts : 0
        }
      }

      if (parsed.type === 'system' && parsed.subtype === 'compact_boundary') {
        const meta = parsed.compactMetadata || parsed.compact_metadata || {}
        const preTokens = toSafeTokenCount(meta.preTokens ?? meta.pre_tokens)
        const postTokens = toSafeTokenCount(meta.postTokens ?? meta.post_tokens)
        const compactTokens = postTokens || preTokens
        const compactIsInScope = tokenSinceMs === null || (typeof ts === 'number' && ts >= tokenSinceMs)
        if (compactTokens > 0 && compactIsInScope) {
          compactBoundaryContextUsage = compactTokens
          compactBoundaryContextWindow = getContextWindowForModel('')
          compactBoundarySampleAt = typeof ts === 'number' ? ts : 0
        }
        if (postTokens > 0) {
          contextUsage = postTokens
          contextWindow = getContextWindowForModel('')
          lastContextUsage = contextUsage
          lastContextWindow = contextWindow
          lastContextOrder = lineIndex
          lastContextSource = 'compact-boundary'
          lastContextSampleAt = typeof ts === 'number' ? ts : 0
        } else if (preTokens > 0) {
          contextUsage = preTokens
          contextWindow = getContextWindowForModel('')
          lastContextUsage = contextUsage
          lastContextWindow = contextWindow
          lastContextOrder = lineIndex
          lastContextSource = 'compact-boundary'
          lastContextSampleAt = typeof ts === 'number' ? ts : 0
        }
      }
    } catch (_) {}
  }

  // 如果没有完整的 stop_reason 过滤，统计所有
  if (turnUsageTotals.inputTokens === 0 && turnUsageTotals.outputTokens === 0) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'assistant' && parsed.message?.usage) {
          const ts = parseClaudeTimestampMs(parsed.timestamp)
          if (tokenSinceMs !== null && (ts === null || ts < tokenSinceMs)) continue
          if (latestTurnOnly && latestTurnStartOrder >= 0 && lineIndex < latestTurnStartOrder) continue
          const usage = parsed.message.usage
          // 同上：input/output/cache 均取最后值避免跨轮不对称
          const entryModel = parsed.model_name || parsed.model || parsed.message?.model || ''
          const normalized = normalizeClaudeUsageForUi(usage, entryModel)
          addNormalizedUsageToTotals(turnUsageTotals, normalized)
          inputTokens = turnUsageTotals.inputTokens
          outputTokens = turnUsageTotals.outputTokens
          cacheReadTokens = turnUsageTotals.cacheReadTokens
          cacheCreationTokens = turnUsageTotals.cacheCreationTokens
          lastTurnDurationMs = pickClaudeTurnDurationMs(lastUserTimestamp, ts, lastTurnDurationMs)
        }
      } catch (_) {}
    }
  }

  if (lastTurnDurationMs === null) {
    lastTurnDurationMs = pickClaudeTurnDurationMs(lastUserTimestamp, lastAssistantTimestamp, null)
  }

  // The latest single assistant usage sample may estimate current context.
  // Never accumulate usage samples: repeated cache_read across tool requests
  // is real consumption but not additive context occupancy.
  if (latestUsageContextUsage > 0 && latestUsageContextOrder >= lastContextOrder) {
    contextUsage = latestUsageContextUsage
    contextWindow = latestUsageContextWindow || getContextWindowForModel('')
    lastContextSource = 'usage-estimate'
    lastContextSampleAt = latestUsageContextSampleAt
  } else if (lastContextUsage !== null) {
    contextUsage = lastContextUsage
    contextWindow = lastContextWindow || getContextWindowForModel('')
  } else {
    contextUsage = 0
    contextWindow = 0
  }

  // 如果仍然没有 contextWindow，用默认值兜底
  if (!contextWindow && contextUsage > 0) {
    contextWindow = getContextWindowForModel('')
  }

  const costUsd = estimateCostUsd(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens)

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    contextUsage,
    contextWindow,
    contextSource: lastContextSource || (contextUsage > 0 ? 'usage-estimate' : ''),
    contextSampleAt: lastContextSampleAt || 0,
    compactBoundaryContextUsage,
    compactBoundaryContextWindow,
    compactBoundarySampleAt,
    costUsd,
    durationMs: lastTurnDurationMs,
  }
}

function getLatestSessionCwdFromLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return ''
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i])
      const cwd = typeof parsed?.cwd === 'string' ? parsed.cwd.trim() : ''
      if (cwd) return cwd
    } catch (_) {}
  }
  return ''
}

function getLatestSessionCwd(cliSessionId) {
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) return ''
  const lines = readJsonlLines(filePath)
  return getLatestSessionCwdFromLines(lines)
}

function getSpeedMetrics(cliSessionId) {
  const stop = perfStartIpc('claude-metrics.getSpeedMetrics')
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) { stop({ found: 0 }); return null }

  const lines = readJsonlLines(filePath)
  if (lines.length === 0) { stop({ found: 1, lines: 0 }); return null }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalDurationMs = 0
  let requestCount = 0
  let lastUserTimestamp = null

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)

      if (parsed.type === 'user') {
        const ts = parsed.timestamp
        if (typeof ts === 'number') lastUserTimestamp = ts
      }

      if (parsed.type === 'assistant' && parsed.message?.usage && parsed.message.stop_reason) {
        const usage = parsed.message.usage
        const ts = parsed.timestamp

        totalInputTokens += usage.input_tokens || 0
        totalOutputTokens += usage.output_tokens || 0

        if (lastUserTimestamp !== null && typeof ts === 'number') {
          const intervalMs = ts - lastUserTimestamp
          if (intervalMs > 0) {
            totalDurationMs += intervalMs
            requestCount++
          }
        }

        lastUserTimestamp = null
      }
    } catch (_) {}
  }

  if (totalDurationMs <= 0) {
    stop({ found: 1, lines: lines.length, requestCount: 0 })
    return null
  }

  const totalDurationSec = totalDurationMs / 1000
  stop({ found: 1, lines: lines.length, requestCount })
  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalDurationMs,
    requestCount,
    inputTokensPerSec: Math.round(totalInputTokens / totalDurationSec),
    outputTokensPerSec: Math.round(totalOutputTokens / totalDurationSec),
    totalTokensPerSec: Math.round((totalInputTokens + totalOutputTokens) / totalDurationSec),
  }
}

// ==================== Git 信息 ====================

const gitCache = new Map() // cwd -> { branch, changes, timestamp }
const GIT_CACHE_TTL = 30000 // 30 秒

// P1-4：execFileSync → 异步 execFile，避免 git 操作阻塞主进程
async function getGitInfo(cwd, { forceRefresh = false } = {}) {
  if (!cwd) return null

  const now = Date.now()
  const cached = gitCache.get(cwd)
  if (!forceRefresh && cached && now - cached.timestamp < GIT_CACHE_TTL) {
    return cached
  }

  try {
    const { stdout: workTreeCheck } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
    if (workTreeCheck.trim() !== 'true') return null

    let branch = ''
    try {
      branch = (await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })).stdout.trim()
    } catch (_) {}

    let changes = 0
    try {
      const shortStatus = (await execFileAsync('git', ['status', '--short'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })).stdout.trim()
      if (shortStatus) {
        changes = shortStatus.split('\n').filter(l => l.trim()).length
      }
    } catch (_) {}

    const result = { branch, changes, timestamp: now }
    gitCache.set(cwd, result)
    return result
  } catch (_) {
    return null
  }
}

// ==================== Usage API ====================

let cachedUsageData = null
let usageCacheTime = 0
const USAGE_CACHE_TTL = 180000 // 180 秒
let usageFetchInProgress = false
let usageBlockedUntil = 0

function getUsageToken() {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
    if (fs.existsSync(credPath)) {
      const raw = fs.readFileSync(credPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.claudeAiOauth?.accessToken) {
        return parsed.claudeAiOauth.accessToken
      }
    }
  } catch (_) {}
  return null
}

function fetchUsageApiData() {
  const now = Date.now()

  // 检查内存缓存
  if (cachedUsageData && now - usageCacheTime < USAGE_CACHE_TTL) {
    return cachedUsageData
  }

  // 检查速率限制
  if (now < usageBlockedUntil) {
    return null
  }

  // 防止并发
  if (usageFetchInProgress) {
    return null
  }

  const token = getUsageToken()
  if (!token) return null

  usageFetchInProgress = true

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      timeout: 5000,
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        usageFetchInProgress = false

        if (res.statusCode === 200) {
          try {
            const body = JSON.parse(data)
            const result = {
              sessionUsage: body?.five_hour?.utilization ?? null,
              weeklyUsage: body?.seven_day?.utilization ?? null,
              sessionResetAt: body?.five_hour?.resets_at ?? null,
              weeklyResetAt: body?.seven_day?.resets_at ?? null,
            }
            cachedUsageData = result
            usageCacheTime = Date.now()
            resolve(result)
          } catch (_) {
            resolve(null)
          }
        } else if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'] || '300', 10)
          usageBlockedUntil = Date.now() + (retryAfter || 300) * 1000
          resolve(null)
        } else {
          usageBlockedUntil = Date.now() + 30000
          resolve(null)
        }
      })
    })

    req.on('error', () => {
      usageFetchInProgress = false
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      usageFetchInProgress = false
      resolve(null)
    })
    req.end()
  })
}

// 同步获取缓存数据
function getCachedUsageData() {
  const now = Date.now()
  if (cachedUsageData && now - usageCacheTime < USAGE_CACHE_TTL) {
    return cachedUsageData
  }
  return null
}

// ==================== 主导出接口 ====================

const CLAUDE_MODEL_CONTEXT = [
  ['fable-5', 1000000], ['mythos-5', 1000000], ['mythos-preview', 1000000],
  ['opus-4-8', 1000000], ['opus-4-7', 1000000], ['opus-4-6', 1000000],
  ['opus-4', 200000], ['opus', 200000],
  ['sonnet-4-6', 1000000], ['sonnet-4', 200000], ['sonnet-3-5', 200000], ['sonnet-3', 200000], ['sonnet', 200000],
  ['haiku-4-5', 200000], ['haiku-4', 200000], ['haiku-3', 200000], ['haiku', 200000],
]

function getContextWindowForModel(model) {
  if (!model) return 200000
  const lower = model.toLowerCase()
  for (const [key, size] of CLAUDE_MODEL_CONTEXT) {
    if (lower.includes(key)) return size
  }
  return 200000
}

function estimateCostUsd(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens) {
  const perMillion = { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreation: 3.75 }
  const regularInputTokens = Math.max(0, inputTokens - cacheCreationTokens)
  return (regularInputTokens / 1e6 * perMillion.input) +
    (outputTokens / 1e6 * perMillion.output) +
    (cacheReadTokens / 1e6 * perMillion.cacheRead) +
    (cacheCreationTokens / 1e6 * perMillion.cacheCreation)
}

const sessionPollInfo = new Map() // cliSessionId -> { inputTokens, outputTokens, durationMs, firstSeenAt, lastInputTokens, lastOutputTokens, lastPollAt }

async function pollMetrics(cliSessionId, cwd, model, thinking, options = {}) {
  if (!cliSessionId) return null

  const stop = perfStartIpc('claude-metrics.pollMetrics')
  const tokenMetrics = getTokenMetrics(cliSessionId, options) || {}
  const speedMetrics = getSpeedMetrics(cliSessionId) || {}
  const gitInfo = await getGitInfo(cwd)
  const usageData = getCachedUsageData()
  const now = Date.now()

  // 触发异步的 Usage API 刷新
  fetchUsageApiData()

  // 缓存最新 + 记录首次出现时间用于 fallback 速度计算
  const prev = sessionPollInfo.get(cliSessionId) || {}
  const firstSeenAt = prev.firstSeenAt || (tokenMetrics.inputTokens > 0 ? now : null)
  sessionPollInfo.set(cliSessionId, {
    inputTokens: tokenMetrics.inputTokens || 0,
    outputTokens: tokenMetrics.outputTokens || 0,
    durationMs: tokenMetrics.durationMs || 0,
    firstSeenAt,
    lastInputTokens: prev.inputTokens || 0,
    lastOutputTokens: prev.outputTokens || 0,
    lastPollAt: now,
  })

  // 速度 fallback：getSpeedMetrics 需要 completed request（有 stop_reason），
  // 流式期间可能返回 null/0。此时用累计 token / 墙钟时间估算速度。
  let inputPerSec = speedMetrics.inputTokensPerSec || 0
  let outputPerSec = speedMetrics.outputTokensPerSec || 0
  if (!inputPerSec && !outputPerSec && firstSeenAt) {
    const elapsedSec = Math.max(1, (now - firstSeenAt) / 1000)
    inputPerSec = Math.round((tokenMetrics.inputTokens || 0) / elapsedSec)
    outputPerSec = Math.round((tokenMetrics.outputTokens || 0) / elapsedSec)
  }

  const costUsd = estimateCostUsd(
    tokenMetrics.inputTokens || 0,
    tokenMetrics.outputTokens || 0,
    tokenMetrics.cacheReadTokens || 0,
    tokenMetrics.cacheCreationTokens || 0
  )

  const result = {
    model: model || '',
    costUsd,
    inputTokens: tokenMetrics.inputTokens || 0,
    outputTokens: tokenMetrics.outputTokens || 0,
    cacheReadTokens: tokenMetrics.cacheReadTokens || 0,
    cacheCreationTokens: tokenMetrics.cacheCreationTokens || 0,
    contextUsage: tokenMetrics.contextUsage || 0,
    contextWindow: tokenMetrics.contextWindow || 0,
    contextSource: tokenMetrics.contextSource || '',
    contextSampleAt: tokenMetrics.contextSampleAt || 0,
    compactBoundaryContextUsage: tokenMetrics.compactBoundaryContextUsage || 0,
    compactBoundaryContextWindow: tokenMetrics.compactBoundaryContextWindow || 0,
    compactBoundarySampleAt: tokenMetrics.compactBoundarySampleAt || 0,
    durationMs: tokenMetrics.durationMs || 0,
    speedOutputPerSec: outputPerSec,
    gitBranch: gitInfo?.branch || '',
    gitChanges: gitInfo?.changes || 0,
    usageApiSessionPct: usageData?.sessionUsage,
    usageApiWeeklyPct: usageData?.weeklyUsage,
    usageApiSessionReset: usageData?.sessionResetAt,
    usageApiWeeklyReset: usageData?.weeklyResetAt,
    thinking,
  }
  stop({ hasResult: 1 })
  return result
}

function resetSession(cliSessionId) {
  sessionJsonlCache.delete(cliSessionId)
  sessionPollInfo.delete(cliSessionId)
}

module.exports = {
  resolveJsonlPath,
  getTokenMetrics,
  getSpeedMetrics,
  getCachedClaudeAggregate,
  scheduleBackgroundClaudeAggregate,
  clearClaudeMetricsCaches,
  getLatestSessionCwd,
  getGitInfo,
  fetchUsageApiData,
  getCachedUsageData,
  pollMetrics,
  resetSession,
  getContextWindowForModel,
  parseClaudeTimestampMs,
  normalizeClaudeUsageForUi,
  __test__: {
    getClaudeSystemContextUsageFromData,
    normalizeClaudeUsageForUi,
    collectClaudeTokenMetricsFromLines,
    getClaudeContextEstimateFromNormalizedUsage,
    getLatestSessionCwdFromLines,
    getLatestSessionCwd,
    pickClaudeTurnDurationMs,
    parseClaudeTimestampMs,
    getContextWindowForModel,
  },
}
