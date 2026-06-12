const fs = require('fs')
const path = require('path')
const os = require('os')
const { app } = require('electron')

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

function readJsonlLinesCached(filePath) {
  const now = Date.now()
  const cached = _lineCache.get(filePath)
  try {
    const stat = fs.statSync(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.lines
    const raw = fs.readFileSync(filePath, 'utf8')
    const lines = raw.split('\n').filter(l => l.trim())
    _lineCache.set(filePath, { lines, mtimeMs: stat.mtimeMs })
    return lines
  } catch (_) {
    return cached ? cached.lines : []
  }
}
const _lineCache = new Map()

// ==================== Claude JSONL 解析 ====================

/**
 * 解析 Claude JSONL，按日期聚合 token
 * @returns { input, output, cacheRead, cacheCreation, dateMap }
 *   dateMap: Map<dateStr, {input,output,cacheRead,cacheCreation}>
 */
function parseClaudeLines(lines) {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0
  let lastStopInput = 0, lastStopOutput = 0, lastStopCacheRead = 0, lastStopCacheCreation = 0
  let hasStop = false
  const dateMap = new Map()

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
        const inp = u.input_tokens || 0
        const out = u.output_tokens || 0
        const cr = u.cache_read_input_tokens || 0
        const cc = u.cache_creation_input_tokens || 0

        if (parsed.message.stop_reason) {
          hasStop = true
          // claudeMetrics.js 的做法：input/cache 取最后一轮，output 累加
          const deltaOut = out - lastStopOutput
          lastStopInput = inp
          lastStopOutput = out
          lastStopCacheRead = cr
          lastStopCacheCreation = cc
          if (deltaOut > 0) {
            totalOutput += deltaOut
          }
          // 日期映射始终用累加（用于趋势图每天独立统计）
          addToDate(ts, inp, out, cr, cc)
        }
      }
    } catch (_) {}
  }

  if (hasStop) {
    totalInput = lastStopInput
    totalCacheRead = lastStopCacheRead
    totalCacheCreation = lastStopCacheCreation
  } else {
    // Fallback：没有 stop_reason，统计所有
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === 'assistant' && parsed.message?.usage) {
          const u = parsed.message.usage
          totalInput = u.input_tokens || totalInput
          totalOutput += u.output_tokens || 0
          totalCacheRead = u.cache_read_input_tokens || totalCacheRead
          totalCacheCreation = u.cache_creation_input_tokens || totalCacheCreation
          addToDate(parsed.timestamp, u.input_tokens || 0, u.output_tokens || 0,
            u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0)
        }
      } catch (_) {}
    }
  }

  return { input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheCreation: totalCacheCreation, dateMap, hasStop }
}

// ==================== Codex JSONL 解析 ====================

/**
 * 解析 Codex JSONL，按日期聚合 token
 */
function parseCodexLines(lines) {
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0
  let hasTokens = false
  const dateMap = new Map()

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
      const ts = parsed.timestamp ? (typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.parse(parsed.timestamp)) : null

      // token_count 事件
      if (parsed.type === 'event_msg' && parsed.payload?.type === 'token_count') {
        const info = parsed.payload?.info || parsed.info || {}
        const usage = info.total_token_usage || {}
        const inp = usage.input_tokens || 0
        const out = usage.output_tokens || 0
        const cr = usage.cached_input_tokens || 0
        const cc = 0 // Codex 不单独报告 cache creation

        hasTokens = true
        totalInput += inp
        totalOutput += out
        totalCacheRead += cr
        totalCacheCreation += cc
        addToDate(ts, inp, out, cr, cc)
      }
    } catch (_) {}
  }

  return { input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheCreation: totalCacheCreation, dateMap, hasTokens }
}

// ==================== 成本估算 ====================

function estimateClaudeCost(input, output, cacheRead, cacheCreation) {
  return (input / 1e6) * 3.0 + (output / 1e6) * 15.0 + (cacheRead / 1e6) * 0.3 + (cacheCreation / 1e6) * 3.75
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
      if (result.input > 0 || result.output > 0) {
        claude.inputTokens += result.input
        claude.outputTokens += result.output
        claude.cacheReadTokens += result.cacheRead
        claude.cacheCreationTokens += result.cacheCreation
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
      if (result.input > 0 || result.output > 0) {
        codex.inputTokens += result.input
        codex.outputTokens += result.output
        codex.cacheReadTokens += result.cacheRead
        codex.cacheCreationTokens += result.cacheCreation
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
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions')

  // 聚合 Map: dateStr -> { claudeInput, claudeOutput, claudeCacheRead, codexInput, codexOutput, codexCacheRead }
  const dateAgg = new Map()

  // Claude
  if (fs.existsSync(claudeProjectsDir)) {
    walkDir(claudeProjectsDir, 2, (filePath) => {
      const lines = readJsonlLinesCached(filePath)
      if (!lines.length) return
      const { dateMap } = parseClaudeLines(lines)
      for (const [date, vals] of dateMap) {
        const cur = dateAgg.get(date) || { claudeInput: 0, claudeOutput: 0, claudeCacheRead: 0, codexInput: 0, codexOutput: 0, codexCacheRead: 0 }
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
      const lines = readJsonlLinesCached(filePath)
      if (!lines.length) return
      const { dateMap } = parseCodexLines(lines)
      for (const [date, vals] of dateMap) {
        const cur = dateAgg.get(date) || { claudeInput: 0, claudeOutput: 0, claudeCacheRead: 0, codexInput: 0, codexOutput: 0, codexCacheRead: 0 }
        cur.codexInput += vals.input
        cur.codexOutput += vals.output
        cur.codexCacheRead += (vals.cacheRead || 0)
        dateAgg.set(date, cur)
      }
    })
  }

  // 生成最近 N 天的数组（含零值填充）
  const result = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
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
        totalInput: Math.max(0, agg.claudeInput - agg.claudeCacheRead) + Math.max(0, agg.codexInput - agg.codexCacheRead),
        totalOutput: agg.claudeOutput + agg.codexOutput,
        totalCache: agg.claudeCacheRead + agg.codexCacheRead,
      })
    } else {
      result.push({
        date: displayDate,
        dateFull: dateStr,
        claudeInput: 0, claudeOutput: 0, claudeCacheRead: 0,
        codexInput: 0, codexOutput: 0, codexCacheRead: 0,
        totalInput: 0, totalOutput: 0, totalCache: 0,
      })
    }
  }

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
        for (const chat of chats) {
          const ts = chat.updatedAt || chat.createdAt
          if (ts) {
            candidates.push({
              agentType: 'claudeCode',
              agentName: 'Claude Code',
              agentColor: '#D97757',
              projectName: proj.name || '未命名项目',
              chatName: chat.name || '新对话',
              cwd: proj.cwd || '',
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
    const codexStatePath = path.join(os.homedir(), '.codex', 'codex-panel-state.json')
    if (fs.existsSync(codexStatePath)) {
      const raw = fs.readFileSync(codexStatePath, 'utf8')
      const state = JSON.parse(raw)
      const projects = state?.projects || []
      for (const proj of projects) {
        const chats = proj?.chats || []
        for (const chat of chats) {
          const ts = chat.updatedAt || chat.createdAt
          if (ts) {
            candidates.push({
              agentType: 'codex',
              agentName: 'GPT Codex',
              agentColor: '#74AA9C',
              projectName: proj.name || '未命名项目',
              chatName: chat.name || '新对话',
              cwd: proj.cwd || '',
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

module.exports = { setupHomeMetricsHandlers, getTodayStats, getTokenTrend, getRecentProject }
