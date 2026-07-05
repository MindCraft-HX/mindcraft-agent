const fs = require('fs')
const path = require('path')
const os = require('os')
const { app } = require('electron')
const { getCodexPanelStateReadCandidates } = require('./codexPanelStatePaths')
const { normalizeClaudeUsageForUi } = require('./claudeMetrics')
const { normalizeCodexUsage } = require('./tokenMetrics/normalizer')
const { createFileDerivedCache } = require('./shared/localDerivedCache')

// ==================== 工具函数 ====================

function formatDateLocal(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayDateStr() {
  return formatDateLocal(Date.now())
}

function startOfLocalDayTs(offsetDays = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - offsetDays)
  return d.getTime()
}

function hasUsageFields(usage) {
  if (!usage || typeof usage !== 'object') return false
  return ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cached_input_tokens', 'cache_creation_input_tokens']
    .some(key => Object.prototype.hasOwnProperty.call(usage, key))
}

function walkDir(dir, maxDepth, cb) {
  if (maxDepth < 0) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      walkDir(full, maxDepth - 1, cb)
    } else if (e.name.endsWith('.jsonl')) {
      cb(full, e)
    }
  }
}

const _lineCache = createFileDerivedCache({
  signature: 'mtimeMs',
  clone: (v) => ({ lines: [...v.lines] }),
})

function readJsonlLinesCached(filePath) {
  const cached = _lineCache.get(filePath)
  if (cached) return cached.lines
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const lines = raw.split('\n').filter(l => l.trim())
    _lineCache.set(filePath, { lines })
    return lines
  } catch (_) {
    return []
  }
}
const _trendCache = new Map()

// ==================== Claude JSONL 解析 ====================

/**
 * 解析 Claude JSONL，按日期聚合 token
 * @returns { input, output, cacheRead, cacheCreation, dateMap }
 *   dateMap: Map<dateStr, {input,output,cacheRead,cacheCreation}>
 */
function parseClaudeLines(lines) {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0
  let hasStop = false
  let hasUsage = false
  const dateMap = new Map()
  // Home is a historical consumption aggregate. Each assistant usage row is a
  // real model request, so cache read must be summed across the transcript.

  function addToDate(ts, inp, out, cr, cc) {
    if (!ts) return
    const d = formatDateLocal(ts)
    const cur = dateMap.get(d) || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
    cur.input += inp
    cur.output += out
    cur.cacheRead += cr
    cur.cacheCreation += cc
    dateMap.set(d, cur)
  }

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      const ts = parsed.timestamp

      if (parsed.type === 'assistant' && parsed.message?.usage) {
        const u = parsed.message.usage
        const model = parsed.model_name || parsed.model || parsed.message?.model || ''
        const normalized = normalizeClaudeUsageForUi(u, model)
        const inp = normalized.inputTokens || 0
        const out = u.output_tokens || 0
        const cr = normalized.cacheReadTokens || 0
        const cc = normalized.cacheCreationTokens || 0
        hasUsage = true
        totalInput += inp
        totalOutput += out
        totalCacheRead += cr
        totalCacheCreation += cc
        addToDate(ts, inp, out, cr, cc)

        if (parsed.message.stop_reason) {
          hasStop = true
        }
      }
    } catch (_) {}
  }

  return { input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheCreation: totalCacheCreation, dateMap, hasStop, hasUsage }
}

// ==================== Codex JSONL 解析 ====================

/**
 * 解析 Codex JSONL，按日期聚合 token
 */
function parseCodexLines(lines) {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0
  let hasTokens = false
  const dateMap = new Map()
  // 注：首页统一口径：in = 常规输入 + cache_creation = input_tokens - cache_read + cache_creation
  //     cache = cache_read
  //     total_token_usage 是累积值，不应多事件累加——只取末值

  function addToDate(ts, inp, out, cr, cc) {
    if (!ts) return
    const d = formatDateLocal(ts)
    const cur = dateMap.get(d) || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
    cur.input += inp
    cur.output += out
    cur.cacheRead += cr
    cur.cacheCreation += cc
    dateMap.set(d, cur)
  }

  // Full-session totals use the last cumulative total_token_usage, while dateMap
  // uses adjacent deltas so old session history is not counted as today's usage.
  let lastInp = 0, lastOut = 0, lastCr = 0, lastCc = 0, lastTs = null
  let sawTotalUsage = false
  let previousTotalNorm = null
  let fallbackInput = 0, fallbackOutput = 0, fallbackCacheRead = 0, fallbackCacheCreation = 0
  const fallbackDateMap = new Map()

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      const ts = parsed.timestamp ? (typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.parse(parsed.timestamp)) : null

      if (parsed.type === 'event_msg' && parsed.payload?.type === 'token_count') {
        const info = parsed.payload?.info || parsed.info || {}
        const usage = info.total_token_usage || {}
        const lastUsage = info.last_token_usage || {}
        hasTokens = true
        // Phase 1：走统一 normalizer，不再手写 provider 公式
        if (hasUsageFields(usage)) {
          sawTotalUsage = true
          const norm = normalizeCodexUsage(usage)
          const delta = previousTotalNorm
            ? {
                inputTokens: Math.max(0, norm.inputTokens - previousTotalNorm.inputTokens),
                outputTokens: Math.max(0, norm.outputTokens - previousTotalNorm.outputTokens),
                cacheReadTokens: Math.max(0, norm.cacheReadTokens - previousTotalNorm.cacheReadTokens),
                cacheCreationTokens: Math.max(0, norm.cacheCreationTokens - previousTotalNorm.cacheCreationTokens),
              }
            : norm
          lastInp = norm.inputTokens
          lastOut = norm.outputTokens
          lastCr = norm.cacheReadTokens
          lastCc = norm.cacheCreationTokens
          lastTs = ts
          addToDate(ts, delta.inputTokens, delta.outputTokens, delta.cacheReadTokens, delta.cacheCreationTokens)
          previousTotalNorm = norm
        } else if (!sawTotalUsage && hasUsageFields(lastUsage)) {
          const norm = normalizeCodexUsage(lastUsage)
          fallbackInput += norm.inputTokens
          fallbackOutput += norm.outputTokens
          fallbackCacheRead += norm.cacheReadTokens
          fallbackCacheCreation += norm.cacheCreationTokens
          if (ts) {
            const d = formatDateLocal(ts)
            const cur = fallbackDateMap.get(d) || { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
            cur.input += norm.inputTokens
            cur.output += norm.outputTokens
            cur.cacheRead += norm.cacheReadTokens
            cur.cacheCreation += norm.cacheCreationTokens
            fallbackDateMap.set(d, cur)
          }
        }
      }
    } catch (_) {}
  }

  if (sawTotalUsage) {
    // Phase 1：normalizeCodexUsage 已产出统一语义，不再手算
    totalInput = lastInp
    totalOutput = lastOut
    totalCacheRead = lastCr
    totalCacheCreation = lastCc
  } else if (hasTokens) {
    totalInput = fallbackInput
    totalOutput = fallbackOutput
    totalCacheRead = fallbackCacheRead
    totalCacheCreation = fallbackCacheCreation
    for (const [date, vals] of fallbackDateMap) {
      dateMap.set(date, vals)
    }
  }

  return { input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheCreation: totalCacheCreation, dateMap, hasTokens }
}

// ==================== 成本估算 ====================

function estimateClaudeCost(input, output, cacheRead, cacheCreation) {
  const regularInput = Math.max(0, input - cacheCreation)
  return (regularInput / 1e6) * 3.0 + (output / 1e6) * 15.0 + (cacheRead / 1e6) * 0.3 + (cacheCreation / 1e6) * 3.75
}

function estimateCodexCost(input, output, cacheRead) {
  return (input / 1e6) * 1.25 + (output / 1e6) * 10.0 + (cacheRead / 1e6) * 0.125
}

// ==================== 今日用量 ====================

function getTodayStats() {
  const today = todayDateStr()
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions')

  let claude = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 }
  let codex = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 }

  // 扫描 Claude sessions
  if (fs.existsSync(claudeProjectsDir)) {
    walkDir(claudeProjectsDir, 2, (filePath) => {
      try {
        const stat = fs.statSync(filePath)
        // 用 mtime 快速过滤：今天修改过的文件才解析
        if (formatDateLocal(stat.mtimeMs) !== today) return
      } catch (_) { return }

      const lines = readJsonlLinesCached(filePath)
      if (!lines.length) return
      const result = parseClaudeLines(lines)
      const todayStats = result.dateMap.get(today)
      if (todayStats && (todayStats.input > 0 || todayStats.output > 0 || todayStats.cacheRead > 0 || todayStats.cacheCreation > 0)) {
        claude.inputTokens += todayStats.input
        claude.outputTokens += todayStats.output
        claude.cacheReadTokens += todayStats.cacheRead
        claude.cacheCreationTokens += todayStats.cacheCreation
        claude.sessionCount++
      }
    })
  }
  claude.costUsd = estimateClaudeCost(claude.inputTokens, claude.outputTokens, claude.cacheReadTokens, claude.cacheCreationTokens)

  // 扫描 Codex sessions
  if (fs.existsSync(codexSessionsDir)) {
    walkDir(codexSessionsDir, 1, (filePath) => {
      try {
        const stat = fs.statSync(filePath)
        if (formatDateLocal(stat.mtimeMs) !== today) return
      } catch (_) { return }

      const lines = readJsonlLinesCached(filePath)
      if (!lines.length) return
      const result = parseCodexLines(lines)
      const todayStats = result.dateMap.get(today)
      if (todayStats && (todayStats.input > 0 || todayStats.output > 0 || todayStats.cacheRead > 0 || todayStats.cacheCreation > 0)) {
        codex.inputTokens += todayStats.input
        codex.outputTokens += todayStats.output
        codex.cacheReadTokens += todayStats.cacheRead
        codex.cacheCreationTokens += todayStats.cacheCreation
        codex.sessionCount++
      }
    })
  }
  codex.costUsd = estimateCodexCost(codex.inputTokens, codex.outputTokens, codex.cacheReadTokens)

  const combined = {
    inputTokens: claude.inputTokens + codex.inputTokens,
    outputTokens: claude.outputTokens + codex.outputTokens,
    cacheReadTokens: claude.cacheReadTokens + codex.cacheReadTokens,
    cacheCreationTokens: claude.cacheCreationTokens + codex.cacheCreationTokens,
    costUsd: claude.costUsd + codex.costUsd,
  }

  return { claude, codex, combined }
}

// ==================== 趋势数据 ====================

function getTokenTrend(days) {
  const cached = _trendCache.get(days)
  const now = Date.now()
  if (cached && now - cached.time < 30000) {
    return cached.data
  }

  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions')
  const cutoffTs = startOfLocalDayTs(Math.max(days - 1, 0))

  // 聚合 Map: dateStr -> { claudeInput, claudeOutput, claudeCacheRead, codexInput, codexOutput, codexCacheRead, codexCacheCreation }
  const dateAgg = new Map()

  // Claude
  if (fs.existsSync(claudeProjectsDir)) {
    walkDir(claudeProjectsDir, 2, (filePath) => {
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < cutoffTs) return
      } catch (_) { return }
      const lines = readJsonlLinesCached(filePath)
      if (!lines.length) return
      const { dateMap } = parseClaudeLines(lines)
      for (const [date, vals] of dateMap) {
        const cur = dateAgg.get(date) || { claudeInput: 0, claudeOutput: 0, claudeCacheRead: 0, codexInput: 0, codexOutput: 0, codexCacheRead: 0, codexCacheCreation: 0 }
        cur.claudeInput += vals.input
        cur.claudeOutput += vals.output
        cur.claudeCacheRead += (vals.cacheRead || 0)
        dateAgg.set(date, cur)
      }
    })
  }

  // Codex
  if (fs.existsSync(codexSessionsDir)) {
    walkDir(codexSessionsDir, 1, (filePath) => {
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < cutoffTs) return
      } catch (_) { return }
      const lines = readJsonlLinesCached(filePath)
      if (!lines.length) return
      const { dateMap } = parseCodexLines(lines)
      for (const [date, vals] of dateMap) {
        const cur = dateAgg.get(date) || { claudeInput: 0, claudeOutput: 0, claudeCacheRead: 0, codexInput: 0, codexOutput: 0, codexCacheRead: 0, codexCacheCreation: 0 }
        cur.codexInput += vals.input
        cur.codexOutput += vals.output
        cur.codexCacheRead += (vals.cacheRead || 0)
        cur.codexCacheCreation += (vals.cacheCreation || 0)
        dateAgg.set(date, cur)
      }
    })
  }

  // 生成最近 N 天的数组（含零值填充）
  const result = []
  const currentDate = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(currentDate)
    d.setDate(d.getDate() - i)
    const dateStr = formatDateLocal(d.getTime())
    const agg = dateAgg.get(dateStr)
    const displayDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    if (agg) {
      result.push({
        date: displayDate,
        dateFull: dateStr,
        claudeInput: agg.claudeInput,
        claudeOutput: agg.claudeOutput,
        claudeCacheRead: agg.claudeCacheRead,
        codexInput: agg.codexInput,
        codexOutput: agg.codexOutput,
        codexCacheRead: agg.codexCacheRead,
        codexCacheCreation: agg.codexCacheCreation,
        totalInput: agg.claudeInput + agg.codexInput,
        totalOutput: agg.claudeOutput + agg.codexOutput,
        totalCache: agg.claudeCacheRead + agg.codexCacheRead,
      })
    } else {
      result.push({
        date: displayDate,
        dateFull: dateStr,
        claudeInput: 0, claudeOutput: 0, claudeCacheRead: 0,
        codexInput: 0, codexOutput: 0, codexCacheRead: 0, codexCacheCreation: 0,
        totalInput: 0, totalOutput: 0, totalCache: 0,
      })
    }
  }

  _trendCache.set(days, { time: now, data: result })
  return result
}

// ==================== 最近项目 ====================

let _recentProjectCache = null
let _recentProjectCacheTime = 0
const RECENT_PROJECT_TTL = 30000 // 30s

function getRecentProject() {
  const now = Date.now()
  if (_recentProjectCache && now - _recentProjectCacheTime < RECENT_PROJECT_TTL) {
    return _recentProjectCache
  }

  const candidates = []

  // 读取 Claude panel state
  try {
    const userData = app.getPath('userData')
    const claudeStatePath = path.join(userData, 'claude-panel-state.json')
    if (fs.existsSync(claudeStatePath)) {
      const raw = fs.readFileSync(claudeStatePath, 'utf8')
      const state = JSON.parse(raw)
      const projects = state?.projects || []
      for (const proj of projects) {
        const chats = proj?.chats || []
        const derivedName = proj.cwd ? proj.cwd.split(/[\\/]/).pop() || '' : ''
        for (const chat of chats) {
          const ts = chat.updatedAt || chat.createdAt
          if (ts) {
            candidates.push({
              agentType: 'claudeCode',
              agentName: 'Claude Code',
              agentColor: '#D97757',
              projectName: derivedName || proj.name || '未命名项目',
              chatName: chat.name || '新对话',
              cwd: proj.cwd || '',
              projectId: proj.id,
              chatId: chat.id ?? '',
              sessionId: chat.cliSessionId || chat.sessionId || '',
              updatedAt: ts,
            })
          }
        }
      }
    }
  } catch (_) {}

  // 读取 Codex panel state
  try {
    const codexStatePath = getCodexPanelStateReadCandidates().find(candidate => fs.existsSync(candidate))
    if (codexStatePath) {
      const raw = fs.readFileSync(codexStatePath, 'utf8')
      const state = JSON.parse(raw)
      const projects = state?.projects || []
      for (const proj of projects) {
        const chats = proj?.chats || []
        const derivedName = proj.cwd ? proj.cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '' : ''
        for (const chat of chats) {
          const ts = chat.updatedAt || chat.createdAt
          if (ts) {
            candidates.push({
              agentType: 'codex',
              agentName: 'GPT Codex',
              agentColor: '#74AA9C',
              projectName: derivedName || proj.name || '未命名项目',
              chatName: chat.name || '新对话',
              cwd: proj.cwd || '',
              projectId: proj.id,
              chatId: chat.id ?? '',
              sessionId: chat.cliSessionId || chat.sessionId || '',
              updatedAt: ts,
            })
          }
        }
      }
    }
  } catch (_) {}

  if (candidates.length === 0) {
    const result = { hasRecent: false, projects: [] }
    _recentProjectCache = result
    _recentProjectCacheTime = now
    return result
  }

  // 按 updatedAt 降序，取前 5 条（同一项目+对话去重）
  candidates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  const seen = new Set()
  const top = []
  for (const c of candidates) {
    const key = `${c.agentType}|${c.projectName}|${c.chatName}`
    if (seen.has(key)) continue
    seen.add(key)
    top.push(c)
    if (top.length >= 5) break
  }

  const result = {
    hasRecent: true,
    projects: top,
  }
  _recentProjectCache = result
  _recentProjectCacheTime = now
  return result
}

// ==================== IPC 注册 ====================

function setupHomeMetricsHandlers(ipcMain) {
  ipcMain.handle('home-get-today-stats', async () => {
    try {
      return getTodayStats()
    } catch (e) {
      console.error('[homeMetrics] getTodayStats error:', e.message)
      return {
        claude: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 },
        codex: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, sessionCount: 0 },
        combined: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 },
      }
    }
  })

  ipcMain.handle('home-get-token-trend', async (_, days = 7) => {
    try {
      const d = Math.min(Math.max(parseInt(days) || 7, 1), 90)
      return getTokenTrend(d)
    } catch (e) {
      console.error('[homeMetrics] getTokenTrend error:', e.message)
      return []
    }
  })

  ipcMain.handle('home-get-recent-project', async () => {
    try {
      return getRecentProject()
    } catch (e) {
      console.error('[homeMetrics] getRecentProject error:', e.message)
      return { hasRecent: false }
    }
  })
}

module.exports = {
  setupHomeMetricsHandlers,
  getTodayStats,
  getTokenTrend,
  getRecentProject,
  __test__: {
    parseClaudeLines,
    parseCodexLines,
    estimateClaudeCost,
    estimateCodexCost,
  },
}
