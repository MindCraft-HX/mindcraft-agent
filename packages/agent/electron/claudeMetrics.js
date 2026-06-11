const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const https = require('https')

// ==================== JSONL 文件定位 ====================

const sessionJsonlCache = new Map() // cliSessionId -> filePath

function resolveJsonlPath(cliSessionId) {
  if (sessionJsonlCache.has(cliSessionId)) {
    const cached = sessionJsonlCache.get(cliSessionId)
    if (cached && fs.existsSync(cached)) return cached
  }

  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeProjectsDir)) {
    return null
  }

  const target = `${cliSessionId}.jsonl`

  // 递归扫描所有子目录
  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
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
    return found
  }

  try {
    const entries = fs.readdirSync(claudeProjectsDir, { withFileTypes: true })
    entries.forEach(e => console.log('  ', e.name, e.isDirectory() ? '[dir]' : '[file]'))
  } catch (_) {}

  return null
}

// ==================== JSONL 指标解析 ====================

const jsonlLineCache = new Map() // cliSessionId -> { lines: [], mtimeMs: 0 }

function readJsonlLines(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const cached = jsonlLineCache.get(filePath)
    // 文件未修改，直接返回缓存
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.lines
    const raw = fs.readFileSync(filePath, 'utf8')
    const lines = raw.split('\n').filter(line => line.trim())
    jsonlLineCache.set(filePath, { lines, mtimeMs: stat.mtimeMs })
    return lines
  } catch (_) {
    return []
  }
}

function getTokenMetrics(cliSessionId) {
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) return null

  const lines = readJsonlLines(filePath)
  if (lines.length === 0) return null

  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0
  let contextUsage = 0
  let contextWindow = 0
  let firstTimestamp = null
  let lastTimestamp = null
  let lastContextUsage = null
  let lastContextWindow = null

  // 扫描所有 assistant 消息提取 usage
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      const ts = parsed.timestamp
      if (typeof ts === 'number') {
        if (firstTimestamp === null) firstTimestamp = ts
        lastTimestamp = ts
      }

      // 提取 token usage
      if (parsed.type === 'assistant' && parsed.message?.usage) {
        const usage = parsed.message.usage
        // 去重：只统计有 stop_reason 的完整请求，或最后一个未完成的
        const stopReason = parsed.message.stop_reason
        if (stopReason) {
          // inputTokens/cacheReadTokens/cacheCreationTokens 每轮 API 调用已包含前文全部上下文，
          // 跨轮累加会导致重复计数（数量级偏高）；output 同样取最后一轮保持一致（对齐 CodeX 做法）
          inputTokens = usage.input_tokens || inputTokens
          outputTokens = usage.output_tokens || outputTokens
          cacheReadTokens = usage.cache_read_input_tokens || cacheReadTokens
          cacheCreationTokens = usage.cache_creation_input_tokens || cacheCreationTokens
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
        }
        if (data.input_tokens) {
          contextUsage = (data.input_tokens || 0) + (data.cache_read_input_tokens || 0) + (data.cache_creation_input_tokens || 0)
          contextWindow = data.context_window_size || 0
          lastContextUsage = contextUsage
          lastContextWindow = contextWindow
        }
      }
    } catch (_) {}
  }

  // 如果没有完整的 stop_reason 过滤，统计所有
  if (inputTokens === 0 && outputTokens === 0) {
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'assistant' && parsed.message?.usage) {
          const usage = parsed.message.usage
          // 同上：input/output/cache 均取最后值避免跨轮不对称
          inputTokens = usage.input_tokens || inputTokens
          outputTokens = usage.output_tokens || outputTokens
          cacheReadTokens = usage.cache_read_input_tokens || cacheReadTokens
          cacheCreationTokens = usage.cache_creation_input_tokens || cacheCreationTokens
        }
      } catch (_) {}
    }
  }

  // 如果仍然没有 context 数据，从最后一个 assistant 消息的 usage 中提取
  if (!contextWindow && !lastContextUsage) {
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i])
        if (parsed.type === 'assistant' && parsed.message?.usage) {
          const u = parsed.message.usage
          contextUsage = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
          contextWindow = getContextWindowForModel(parsed.model_name || parsed.model || parsed.message?.model || '')
          break
        }
      } catch (_) {}
    }
  }

  if (lastContextUsage !== null) {
    contextUsage = lastContextUsage
    contextWindow = lastContextWindow || getContextWindowForModel('')
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
    costUsd,
    durationMs: firstTimestamp && lastTimestamp ? (lastTimestamp - firstTimestamp) : null,
  }
}

function getSpeedMetrics(cliSessionId) {
  const filePath = resolveJsonlPath(cliSessionId)
  if (!filePath) return null

  const lines = readJsonlLines(filePath)
  if (lines.length === 0) return null

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

  if (totalDurationMs <= 0) return null

  const totalDurationSec = totalDurationMs / 1000
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

function getGitInfo(cwd) {
  if (!cwd) return null

  const now = Date.now()
  const cached = gitCache.get(cwd)
  if (cached && now - cached.timestamp < GIT_CACHE_TTL) {
    return cached
  }

  try {
    const workTreeCheck = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
    if (workTreeCheck.toString().trim() !== 'true') return null

    let branch = ''
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch (_) {}

    let changes = 0
    try {
      const shortStatus = execFileSync('git', ['status', '--short'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
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
  ['opus-4-6', 200000], ['opus-4', 200000], ['opus', 200000],
  ['sonnet-4-6', 200000], ['sonnet-4', 200000], ['sonnet-3-5', 200000], ['sonnet-3', 200000], ['sonnet', 200000],
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
  return (inputTokens / 1e6 * perMillion.input) +
    (outputTokens / 1e6 * perMillion.output) +
    (cacheReadTokens / 1e6 * perMillion.cacheRead) +
    (cacheCreationTokens / 1e6 * perMillion.cacheCreation)
}

const sessionPollInfo = new Map() // cliSessionId -> { inputTokens, outputTokens, durationMs, firstSeenAt, lastInputTokens, lastOutputTokens, lastPollAt }

async function pollMetrics(cliSessionId, cwd, model, thinking) {
  if (!cliSessionId) return null

  const tokenMetrics = getTokenMetrics(cliSessionId) || {}
  const speedMetrics = getSpeedMetrics(cliSessionId) || {}
  const gitInfo = getGitInfo(cwd)
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

  return {
    model: model || '',
    costUsd,
    inputTokens: tokenMetrics.inputTokens || 0,
    outputTokens: tokenMetrics.outputTokens || 0,
    cacheReadTokens: tokenMetrics.cacheReadTokens || 0,
    cacheCreationTokens: tokenMetrics.cacheCreationTokens || 0,
    contextUsage: tokenMetrics.contextUsage || 0,
    contextWindow: tokenMetrics.contextWindow || 0,
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
}

function resetSession(cliSessionId) {
  sessionJsonlCache.delete(cliSessionId)
  sessionPollInfo.delete(cliSessionId)
}

module.exports = {
  resolveJsonlPath,
  getTokenMetrics,
  getSpeedMetrics,
  getGitInfo,
  fetchUsageApiData,
  getCachedUsageData,
  pollMetrics,
  resetSession,
  getContextWindowForModel,
}
