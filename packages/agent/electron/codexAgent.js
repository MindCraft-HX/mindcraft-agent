const { ipcMain, dialog, app } = require('electron')
const { Conf } = require('electron-conf')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execSync, execFileSync, exec, execFile } = require('child_process')
const { shouldStopTurnTimeoutOnEvent } = require('./codexTurnState')
const { extractCodexSessionSummary } = require('./sessionTitleUtils')
const { getGitInfo } = require('./claudeMetrics')
const { getCodexPanelStatePaths, getCodexPanelStateReadCandidates } = require('./codexPanelStatePaths')
const { augmentEnvWithBundledRg } = require('./localSearch')
const { deleteSessionRecordsByProvider, syncPanelStateSessions } = require('./sessionRegistry')
const { findLegacyUserData } = require('./findLegacyUserData')
const { t: lt } = require('./localeHelper')
const { normalizeFileChangeItemPreviews } = require('./codexFileChangePreview')
const { normalizeCodexReasoningEffort } = require('../src/components/codeX/utils/normalizeReasoningEffort.cjs')
const {
  cloneWithFallback: cloneSkillRepoWithFallback,
  copySkillDirAtomic,
  normalizeGithubSkillSource,
  resolveRelativeSourceDir,
  resolveSkillTargetDir,
  safeTempDir,
} = require('./skillsSecurity')
const {
  filterSkillsCatalog,
  readSkillsCatalogCache,
  writeSkillsCatalogCache,
} = require('./skillsCatalogCache')
/** 安全发送 IPC，避免窗口已销毁时抛错 */
function safeSend(sender, channel, ...args) {
  try {
    if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
      sender.send(channel, ...args)
    }
  } catch (_) {}
}

function sendMetrics(sender, payload) {
  safeSend(sender, 'codex-agent-metrics', payload)
}

const CODEX_CONFIG_DIR = path.join(os.homedir(), '.codex')
const CONFIG_TOML_FILE = path.join(CODEX_CONFIG_DIR, 'config.toml')
const SESSIONS_DIR = path.join(CODEX_CONFIG_DIR, 'sessions')

function getMindCraftUserDataDir() {
  try {
    if (app && typeof app.getPath === 'function') return app.getPath('userData')
  } catch (_) {}
  return path.join(os.tmpdir(), 'mindcraft-agent-userData')
}

function getCodexUploadsDir() {
  return path.join(getMindCraftUserDataDir(), 'codex-tmp-uploads')
}

function getSessionLoadLogFile() {
  return path.join(getMindCraftUserDataDir(), 'diagnostics', 'codex-session-load.log')
}

// Codex debug 输出开关（需要查看详细日志时改为 true）
const CODEX_DEBUG = false
// SDK 已知的事件类型（二进制可能输出未知类型，如 context_usage 等）
const KNOWN_EVENT_TYPES = new Set([
  'thread.started', 'turn.started', 'turn.completed', 'turn.failed',
  'task_started', 'task_complete',   // 新版 SDK 事件类型（等同于 turn.started / turn.completed）
  'item.started', 'item.updated', 'item.completed', 'thread.error', 'error',
  // CodeX 二进制 compact 事件（autoCompact 触发时通过 JSONL 输出）
  'compaction', 'compaction_trigger', 'context_compaction', 'contextCompaction',
  // 新版 SDK JSONL 行类型（静默跳过）
  'turn_context', 'session_meta', 'token_count', 'user_message', 'agent_message', 'reasoning',
])

function ensureDirSync(dirPath) {
  if (!dirPath) return
  try {
    fs.mkdirSync(dirPath, { recursive: true })
  } catch (_) {}
}

/** 将 data URL 图片写入 Codex 临时目录，返回文件路径 */
function dataUrlToTempImagePath(img = {}) {
  const dataUrl = typeof img?.dataUrl === 'string' ? img.dataUrl : ''
  if (!dataUrl.startsWith('data:')) return ''
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return ''

  const mediaType = img?.mediaType || match[1] || 'image/png'
  const base64 = match[2]
  const extMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
  }
  const ext = extMap[String(mediaType).toLowerCase()] || '.png'

  try {
    const uploadsDir = getCodexUploadsDir()
    ensureDirSync(uploadsDir)
    const tmpPath = path.join(uploadsDir, `codex-upload-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`)
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'))
    return tmpPath
  } catch (_) {
    return ''
  }
}

/** 解析图片输入：系统路径直传，data URL 写入临时文件 */
function resolveImageInputPath(img = {}) {
  if (img?.path && fs.existsSync(img.path)) return img.path
  return dataUrlToTempImagePath(img)
}

/** 简易 TOML 解析器（仅解析 Codex config.toml 所需的字段） */
function parseTomlStringValue(rawValue) {
  let value = String(rawValue ?? '').trim()
  if (value.startsWith('"')) {
    let out = ''
    let escaped = false
    for (let i = 1; i < value.length; i += 1) {
      const ch = value[i]
      if (escaped) {
        out += ch
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') return out
      out += ch
    }
    return out
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (!isNaN(value) && value !== '') return Number(value)
  return value
}

function stripTomlInlineComment(value) {
  const raw = String(value || '').trim()
  if (raw.startsWith('"')) {
    let escaped = false
    for (let i = 1; i < raw.length; i += 1) {
      const ch = raw[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') return raw.slice(0, i + 1)
    }
    return raw
  }
  const hashIdx = raw.indexOf('#')
  return hashIdx >= 0 ? raw.slice(0, hashIdx).trim() : raw
}

function splitTomlDottedKey(pathText) {
  const parts = []
  let current = ''
  let quoted = false
  let escaped = false
  for (const ch of String(pathText || '').trim()) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (quoted && ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && ch === '.') {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current || pathText) parts.push(current.trim())
  return parts
}

function parseSimpleTomlContent(content) {
  const result = {}
  try {
    let currentSection = result
    for (let rawLine of content.split('\n')) {
      const line = rawLine.replace(/\r$/, '').trim()
      if (!line || line.startsWith('#')) continue
      // 段头 [section] / [section.sub]
      const sectionMatch = line.match(/^\[([^\]]+)\]$/)
      if (sectionMatch) {
        const keys = splitTomlDottedKey(sectionMatch[1])
        currentSection = keys.reduce((obj, k) => { obj[k] = obj[k] || {}; return obj[k] }, result)
        continue
      }
      // key = value
      const kvMatch = line.match(/^([^=]+?)\s*=\s*(.+)$/s)
      if (kvMatch) {
        const key = kvMatch[1].trim()
        currentSection[key] = parseTomlStringValue(stripTomlInlineComment(kvMatch[2]))
      }
    }
  } catch (_) {}
  return result
}

function parseSimpleToml(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    return parseSimpleTomlContent(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {
    return {}
  }
}

function selectCodexTomlProvider(modelProviders, providerId) {
  if (!modelProviders || typeof modelProviders !== 'object') return null
  const id = String(providerId || '').trim()
  if (id && modelProviders[id] && typeof modelProviders[id] === 'object') return modelProviders[id]
  return Object.values(modelProviders).find(v => v && typeof v === 'object' && ('base_url' in v || 'experimental_bearer_token' in v)) || null
}

function buildRuntimeConfigFromToml(toml = {}, userRuntime = {}) {
  // 从 config.toml 提取 CLI 级默认值
  let tomlApiKey = toml.auth_token || toml.experimental_bearer_token || ''
  let tomlBaseURL = toml.base_url || ''
  let tomlModel = toml.model || ''
  let tomlEffort = toml.model_reasoning_effort || toml.reasoning_effort || toml.reason_effort || ''

  // [model_providers.<id>] 段（第三方 provider 格式，参照 cc-switch）
  if (!tomlApiKey || !tomlBaseURL) {
    const provider = selectCodexTomlProvider(toml.model_providers, toml.model_provider)
    if (provider) {
      if (!tomlApiKey) tomlApiKey = provider.experimental_bearer_token || ''
      if (!tomlBaseURL) tomlBaseURL = provider.base_url || ''
    }
  }

  if (!tomlApiKey && toml.auth && toml.auth.token) tomlApiKey = toml.auth.token
  if (!tomlBaseURL && toml.api && toml.api.base_url) tomlBaseURL = toml.api.base_url
  if (!tomlModel && toml.api && toml.api.model) tomlModel = toml.api.model
  if (!tomlEffort && toml.api && (toml.api.model_reasoning_effort || toml.api.reasoning_effort || toml.api.reason_effort)) {
    tomlEffort = toml.api.model_reasoning_effort || toml.api.reasoning_effort || toml.api.reason_effort
  }

  const userApiKey = userRuntime.apiKey || ''
  const userBaseURL = userRuntime.baseURL || ''
  const userModel = userRuntime.model || ''
  const userEffort = userRuntime.reasoningEffort || userRuntime.reasonEffort || ''

  const apiKey = userApiKey || tomlApiKey
  const baseURL = userBaseURL || tomlBaseURL
  const model = userModel || tomlModel
  const reasoningEffort = normalizeCodexReasoningEffort(userEffort || tomlEffort)

  return { apiKey, baseURL, model, reasoningEffort }
}

/** 读取 Codex 运行时配置
 *  优先级：electron-conf（用户偏好） > config.toml（CLI 默认配置）
 *  config.toml 属于 Codex CLI，不可被应用修改；electron-conf 是应用的持久化层
 */
function readRuntimeConfig() {
  const toml = parseSimpleToml(CONFIG_TOML_FILE)

  // electron-conf：用户偏好，优先级高于 config.toml
  let userRuntime = {}
  try {
    const conf = new Conf({ name: 'mindcraft-codex' })
    userRuntime = conf.get('runtime') || {}
  } catch (_) {}

  return buildRuntimeConfigFromToml(toml, userRuntime)
}

/** CodeX SDK 原生 sandboxMode 值 */
const CODEX_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

/** 旧 permissionPolicy 值 → 新 sandboxMode 值迁移映射 */
const CODEX_SANDBOX_MIGRATE = {
  read_only: 'read-only',
  ask: 'workspace-write',
  allow_all: 'danger-full-access',
}

function readSandboxMode() {
  try {
    const conf = new Conf({ name: 'mindcraft-codex' })
    // 先读新 key
    const mode = conf.get('sandboxMode')
    if (mode && CODEX_SANDBOX_MODES.includes(mode)) return mode
    // 尝试旧 key 迁移
    const old = conf.get('permissionPolicy')
    if (old && CODEX_SANDBOX_MIGRATE[old]) {
      conf.set('sandboxMode', CODEX_SANDBOX_MIGRATE[old])
      conf.delete('permissionPolicy')
      return CODEX_SANDBOX_MIGRATE[old]
    }
  } catch (_) {}
  return 'workspace-write'
}

let codexModulePromise = null
let installingCodex = false

/** 缓存已找到的 codex 路径，避免每次调用重复探测 */
let _globalCodexPath = undefined

/** 打包后 SDK 的 createRequire 从 asar 内出发，搜不到全局安装的 codex。
 *  手动查找全局 codex 二进制路径，通过 codexPathOverride 传给 SDK。
 *  开发模式或未找到时返回 null，SDK 走自身 findCodexPath()。 */
function findGlobalCodexPath() {
  if (_globalCodexPath !== undefined) return _globalCodexPath

  try {
    const tripleMap = { win32: 'pc-windows-msvc', darwin: 'apple-darwin', linux: 'unknown-linux-musl' }
    const arch = process.arch === 'x64' ? 'x86_64' : process.arch
    const triple = `${arch}-${tripleMap[process.platform] || 'unknown-linux-musl'}`
    const suffixByTriple = {
      'x86_64-pc-windows-msvc': 'win32-x64', 'aarch64-pc-windows-msvc': 'win32-arm64',
      'x86_64-apple-darwin': 'darwin-x64', 'aarch64-apple-darwin': 'darwin-arm64',
      'x86_64-unknown-linux-musl': 'linux-x64', 'aarch64-unknown-linux-musl': 'linux-arm64',
    }
    const suffix = suffixByTriple[triple]
    if (suffix) {
      const binName = process.platform === 'win32' ? 'codex.exe' : 'codex'
      const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim()
      if (globalRoot) {
        // @openai/codex 是全局包，@openai/codex-{suffix} 是其 optional dep
        const candidates = [
          path.join(globalRoot, '@openai', 'codex', 'node_modules', `@openai/codex-${suffix}`, 'vendor', triple, 'bin', binName),
          path.join(globalRoot, `@openai/codex-${suffix}`, 'vendor', triple, 'bin', binName),
        ]
        for (const p of candidates) {
          if (fs.existsSync(p)) { _globalCodexPath = p; return p }
        }
      }
    }
  } catch (_) { /* npm 不可用，尝试下一级 fallback */ }

  // Fallback: 通过 where/which 在 PATH 中查找 codex（Windows 可能返回 .cmd shim）
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    const result = execSync(`${whichCmd} codex`, { encoding: 'utf8', timeout: 5000 }).trim()
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) { _globalCodexPath = lines[0]; return _globalCodexPath }
  } catch (_) {}

  _globalCodexPath = null
  return null
}

/** 懒加载 @openai/codex-sdk 模块，避免应用启动时阻塞 */
function loadCodexSdk() {
  if (!codexModulePromise) {
    codexModulePromise = import('@openai/codex-sdk')
  }
  return codexModulePromise
}
const codexSlashCommandsCache = new Map() // key -> { ts, commands }

function extractSlashCommandsFromText(text) {
  const map = new Map()
  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^\s*\/([a-zA-Z0-9._-]+)\s+(.+?)\s*$/)
    if (!m) continue
    const name = String(m[1] || '').trim()
    const description = String(m[2] || '').trim()
    if (!name) continue
    if (!map.has(name)) map.set(name, { name, description })
    else if (!map.get(name).description && description) map.set(name, { name, description })
  }
  return Array.from(map.values())
}

/** 路径标准化：统一反斜杠、小写、去尾斜杠，用于跨平台路径匹配 */
function normalizeFsPath(p) {
  return String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/** 递归遍历目录收集所有文件路径 */
function walkFiles(dir, out = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) walkFiles(fullPath, out)
      else if (entry.isFile()) out.push(fullPath)
    }
  } catch (_) {}
  return out
}

function readFirstLine(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const line = String(text || '').split(/\r?\n/).find(l => String(l || '').trim())
    return String(line || '').trim().replace(/^#+\s*/, '')
  } catch (_) { return '' }
}

/** 安全 JSON 解析：失败返回 null，不抛异常 */
function safeJsonParse(line) {
  try { return JSON.parse(line) } catch (_) { return null }
}

const jsonlLineCache = new Map() // filePath -> { lines: [], mtimeMs: 0 }

function readJsonlLines(filePath, maxLines = Infinity) {
  try {
    const stat = fs.statSync(filePath)
    const cached = jsonlLineCache.get(filePath)
    // 文件未修改，直接返回缓存
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return maxLines === Infinity ? cached.lines : cached.lines.slice(0, maxLines)
    }
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/).filter(Boolean)
    jsonlLineCache.set(filePath, { lines, mtimeMs: stat.mtimeMs })
    return maxLines === Infinity ? lines : lines.slice(0, maxLines)
  } catch (_) { return [] }
}

/** 高效读取 JSONL 文件头部行（不加载全文），用于提取 session 元数据 */
function readJsonlHeadLines(filePath, maxLines = 80) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const bufSize = 64 * 1024
    const buffer = Buffer.alloc(bufSize)
    let lineBuffer = ''
    let pos = 0
    let bytesRead = 0
    const lines = []

    while (lines.length < maxLines && (bytesRead = fs.readSync(fd, buffer, 0, bufSize, pos)) > 0) {
      lineBuffer += buffer.subarray(0, bytesRead).toString('utf8')
      pos += bytesRead
      const chunks = lineBuffer.split('\n')
      lineBuffer = chunks.pop() || ''
      for (const line of chunks) {
        if (!line.trim()) continue
        lines.push(line)
        if (lines.length >= maxLines) break
      }
    }

    if (lineBuffer.trim() && lines.length < maxLines) lines.push(lineBuffer)
    fs.closeSync(fd)
    return lines
  } catch (_) { return [] }
}

function resolveCodexDoneReasonFromError(err) {
  const errMsg = err?.message || String(err || '')
  if (err?.name === 'AbortError' || errMsg.includes('AbortError') || errMsg.includes('The operation was aborted')) {
    return 'aborted'
  }
  return 'failed'
}

function buildCodexAgentDonePayload({
  sessionId,
  cliSessionId = '',
  filePath = '',
  reason = 'completed',
} = {}) {
  return {
    sessionId,
    cliSessionId,
    filePath,
    reason,
  }
}

function readJsonlTailLines(filePath, maxLines = 80) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.size) return []
    const fd = fs.openSync(filePath, 'r')
    try {
      const chunkSize = Math.min(256 * 1024, stat.size)
      const start = Math.max(0, stat.size - chunkSize)
      const buffer = Buffer.alloc(stat.size - start)
      fs.readSync(fd, buffer, 0, stat.size - start, start)
      const text = buffer.toString('utf8')
      const firstNewline = text.indexOf('\n')
      const safeText = firstNewline >= 0 ? text.slice(firstNewline + 1) : text
      return safeText.split(/\r?\n/).filter(Boolean).slice(-maxLines)
    } finally {
      fs.closeSync(fd)
    }
  } catch (_) { return [] }
}

function collectSessionTailRiskSummary(filePath, maxLines = 80) {
  const lines = readJsonlTailLines(filePath, maxLines)
  let tailLargeOutputCount = 0
  let tailMaxOutputChars = 0

  for (const line of lines) {
    const row = safeJsonParse(line)
    if (!row) continue
    const output = String(
      row?.payload?.output
      || row?.output
      || row?.item?.aggregated_output
      || ''
    )
    if (output.length > 12000) tailLargeOutputCount += 1
    if (output.length > tailMaxOutputChars) tailMaxOutputChars = output.length
  }

  return {
    tailLargeOutputCount,
    tailMaxOutputChars,
  }
}

function appendSessionLoadDiagnostic(entry = {}) {
  try {
    const logFile = getSessionLoadLogFile()
    const logDir = path.dirname(logFile)
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + '\n'
    fs.appendFileSync(logFile, line, 'utf8')
  } catch (_) {}
}

/** 根据模型名返回对应上下文窗口大小（token 数） */
function getCodexContextWindowForModel(model) {
  const lower = String(model || '').toLowerCase()
  if (!lower) return 258400
  // gpt-5 系列 SDK 内部上下文窗口 1M，但 CodeX 二进制限制为 ~258K
  if (lower.includes('gpt-5')) return 258400
  // GPT-4 系列: 128K
  if (lower.includes('gpt-4')) return 128000
  if (lower.includes('gpt-4o')) return 200000
  if (lower.startsWith('o')) return 200000
  if (lower.includes('claude')) return 200000
  return 258400
}

function toPositiveNumber(...values) {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function pickCodexTurnTokenValue(lastValue, deltaValue, fallback = 0) {
  const direct = Number(lastValue)
  if (Number.isFinite(direct) && direct >= 0) return direct
  const delta = Number(deltaValue)
  if (Number.isFinite(delta) && delta >= 0) return delta
  return fallback
}

/** 从 token_count payload 中提取 context usage 值（兼容多种字段名） */
function pickCodexContextUsage(info = {}, payload = {}) {
  // Prefer explicit context usage from Codex events; fallback to token estimate.
  const explicit = toPositiveNumber(
    info.context_usage,
    info.context_token_usage,
    info.context_tokens,
    info.current_context_tokens,
    info.context_used_tokens,
    payload.context_usage,
    payload.context_token_usage,
    payload.context_tokens,
    payload.current_context_tokens
  )
  if (explicit > 0) return explicit

  // Fallback: 使用 last_token_usage.total_tokens（二进制自身对当前上下文大小的测量），
  // 这也是二进制 auto-compact 触发时使用的判断依据。
  // 不能用 total_token_usage.input_tokens —— 那是全量累计值，会无限增长。
  const last = info.last_token_usage || {}
  return toPositiveNumber(last.total_tokens, 0)
}

/** 从 token_count payload 中提取 context window 值（兼容多种字段名） */
function pickCodexContextWindow(info = {}, payload = {}, fallback = 0) {
  return toPositiveNumber(
    info.model_context_window,
    info.context_window,
    info.context_window_size,
    payload.model_context_window,
    payload.context_window,
    payload.context_window_size,
    fallback
  )
}

/** 估算 Codex API 费用（美元），基于 GPT 模型定价 */
function estimateCodexCostUsd(inputTokens, outputTokens, cacheReadTokens) {
  const perMillion = { input: 1.25, output: 10.0, cacheRead: 0.125 }
  return (inputTokens / 1e6 * perMillion.input)
    + (outputTokens / 1e6 * perMillion.output)
    + (cacheReadTokens / 1e6 * perMillion.cacheRead)
}

/** 从 Codex 会话 JSONL 文件解析完整指标：tokens、cost、duration、context */
function getCodexSessionMetricsByFile(filePath, model = '', fallbackCwd = '') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const lines = readJsonlLines(filePath, Infinity)
    if (!lines.length) return null

    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let cacheCreationTokens = 0
    let contextUsage = 0
    let contextWindow = 0
    let cwd = fallbackCwd || ''
    let firstTimestamp = null
    let lastTimestamp = null
    let lastTurnDurationMs = 0
    let cumulativeInputTokens = 0
    let cumulativeOutputTokens = 0
    let cumulativeCacheReadTokens = 0
    let cumulativeCacheCreationTokens = 0
    let turnStartInputTokens = 0
    let turnStartOutputTokens = 0
    let turnStartCacheReadTokens = 0
    let turnStartCacheCreationTokens = 0

    // 速度计算（仿 claudeMetrics.getSpeedMetrics，按 turn 配对 user→token_count）
    let lastUserTs = null
    let prevCumulativeInput = 0
    let prevCumulativeOutput = 0
    let pendingInput = 0
    let pendingOutput = 0
    let pendingTokenTs = null
    let hasPendingTurn = false
    let totalSpeedInputTokens = 0
    let totalSpeedOutputTokens = 0
    let totalSpeedDurationMs = 0

    const settleCodexTurn = () => {
      if (!hasPendingTurn || !lastUserTs || !pendingTokenTs) return
      const interval = pendingTokenTs - lastUserTs
      if (interval > 0) {
        totalSpeedInputTokens += Math.max(0, pendingInput - prevCumulativeInput)
        totalSpeedOutputTokens += Math.max(0, pendingOutput - prevCumulativeOutput)
        totalSpeedDurationMs += interval
      }
      prevCumulativeInput = pendingInput
      prevCumulativeOutput = pendingOutput
      lastUserTs = null
      pendingTokenTs = null
      hasPendingTurn = false
    }

    for (const line of lines) {
      const row = safeJsonParse(line)
      if (!row) continue

      const ts = Date.parse(row.timestamp || '')
      if (!Number.isNaN(ts)) {
        if (firstTimestamp === null) firstTimestamp = ts
        lastTimestamp = ts
      }

      if (row.type === 'event_msg' && row.payload?.type === 'task_started') {
        contextWindow = pickCodexContextWindow({}, row.payload, contextWindow)
      }

      if (row.type === 'turn_context' && row.payload?.model) {
        model = model || row.payload.model
      }

      if (row.type === 'session_meta' && row.payload?.model) {
        model = model || row.payload.model
      }

      if (row.type === 'session_meta' && row.payload?.cwd && !cwd) {
        cwd = row.payload.cwd
      }

      if (row.type === 'turn_context' && row.payload?.cwd && !cwd) {
        cwd = row.payload.cwd
      }

      // 速度：user_message → 结算上一轮，记录新起点
      if (row.type === 'event_msg' && row.payload?.type === 'user_message') {
        settleCodexTurn()
        lastUserTs = ts || null
        turnStartInputTokens = cumulativeInputTokens
        turnStartOutputTokens = cumulativeOutputTokens
        turnStartCacheReadTokens = cumulativeCacheReadTokens
        turnStartCacheCreationTokens = cumulativeCacheCreationTokens
      }

      if (row.type === 'event_msg' && row.payload?.type === 'token_count') {
        const info = row.payload.info || {}
        const total = info.total_token_usage || {}
        const last = info.last_token_usage || {}
        const nextCumulativeInput = toNonNegativeNumber(total.input_tokens, cumulativeInputTokens)
        const nextCumulativeOutput = toNonNegativeNumber(total.output_tokens, cumulativeOutputTokens)
        const nextCumulativeCacheRead = toNonNegativeNumber(total.cached_input_tokens, cumulativeCacheReadTokens)
        const nextCumulativeCacheCreation = toNonNegativeNumber(total.cache_creation_input_tokens, cumulativeCacheCreationTokens)

        inputTokens = pickCodexTurnTokenValue(last.input_tokens, nextCumulativeInput - turnStartInputTokens, inputTokens)
        outputTokens = pickCodexTurnTokenValue(last.output_tokens, nextCumulativeOutput - turnStartOutputTokens, outputTokens)
        cacheReadTokens = pickCodexTurnTokenValue(last.cached_input_tokens, nextCumulativeCacheRead - turnStartCacheReadTokens, cacheReadTokens)
        cacheCreationTokens = pickCodexTurnTokenValue(last.cache_creation_input_tokens, nextCumulativeCacheCreation - turnStartCacheCreationTokens, cacheCreationTokens)
        cumulativeInputTokens = nextCumulativeInput
        cumulativeOutputTokens = nextCumulativeOutput
        cumulativeCacheReadTokens = nextCumulativeCacheRead
        cumulativeCacheCreationTokens = nextCumulativeCacheCreation
        if (lastUserTs && ts) lastTurnDurationMs = Math.max(0, ts - lastUserTs)
        contextUsage = pickCodexContextUsage(info, row.payload) || contextUsage
        contextWindow = pickCodexContextWindow(info, row.payload, contextWindow)

        // 速度：记录最新累计值（结算时用最后一次的差值）
        pendingInput = Number(total.input_tokens) || pendingInput || 0
        pendingOutput = Number(total.output_tokens) || pendingOutput || 0
        pendingTokenTs = ts || pendingTokenTs
        hasPendingTurn = true
      }
    }

    // 结算最后一轮
    settleCodexTurn()

    const speedSec = totalSpeedDurationMs / 1000

    if (!contextWindow) contextWindow = getCodexContextWindowForModel(model)
    const gitInfo = getGitInfo(cwd)

    if (CODEX_DEBUG) console.log('[codex metrics] contextUsage:', contextUsage, 'contextWindow:', contextWindow, 'contextPct:', contextWindow ? Math.round((contextUsage / contextWindow) * 100) : 0, 'model:', model)

    return {
      model: model || '',
      costUsd: estimateCodexCostUsd(inputTokens, outputTokens, cacheReadTokens),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      contextUsage,
      contextWindow,
      durationMs: lastTurnDurationMs,
      speedOutputPerSec: speedSec > 0 ? Math.round(totalSpeedOutputTokens / speedSec) : 0,
      gitBranch: gitInfo?.branch || '',
      gitChanges: gitInfo?.changes || 0,
    }
  } catch (_) {
    return null
  }
}

/** 通过 sessionId 获取指标（会匹配 cliSessionId 找到对应 JSONL 文件） */
function getCodexSessionMetrics(sessionId, model = '', fallbackCwd = '') {
  const cliSessionId = cliSessionIds.get(sessionId) || sessionId
  if (!cliSessionId) return null
  const files = walkFiles(SESSIONS_DIR).filter(file => file.toLowerCase().endsWith('.jsonl'))
  const matched = files.find(file => {
    const base = path.basename(file, '.jsonl')
    return base === cliSessionId || file.includes(cliSessionId)
  })
  if (!matched) return null
  const sessionCwd = codexSessions.get(sessionId)?.cwd || fallbackCwd || ''
  return getCodexSessionMetricsByFile(matched, model, sessionCwd)
}

function extractSessionSummary(filePath) {
  return extractCodexSessionSummary(filePath, collectSessionTailRiskSummary)
}

/** 将 Codex agent item（reasoning/command_execution/file_change 等）转为前端 tool message */
/** 将 Codex stream item 转换为前端 ToolMessageCard 所需的消息对象 */
function buildToolMessageFromItem(item) {
  if (!item || !item.id) return null

  const builders = {
    reasoning: () => ({
      role: 'tool', toolName: 'thinking', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getCodexActivityLabel('thinking'),
      status: 'done', text: item.text || '', expanded: false, newContent: '', diffLines: [],
    }),
    command_execution: () => ({
      role: 'tool', toolName: 'shell', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getCodexActivityLabel('shell'),
      status: item.status === 'failed' ? 'error' : 'done',
      filePath: '', bashCmd: item.command || '', bashCwd: '',
      bashOutput: item.aggregated_output || '', bashExitCode: item.exit_code,
      expanded: true, newContent: item.aggregated_output || '', diffLines: [],
      text: JSON.stringify({ command: item.command || '', status: item.status, exit_code: item.exit_code }, null, 2),
    }),
    file_change: () => {
      const changes = Array.isArray(item.changes) ? item.changes : []
      return {
        role: 'tool', toolName: 'file_change', toolUseId: item.id,
        rawType: item.type,
        activityLabel: getCodexActivityLabel('file_change'),
        status: item.status === 'failed' ? 'error' : 'done',
        filePath: changes.map(c => c.path).filter(Boolean).join('\n'),
        expanded: true, newContent: '', diffLines: [],
        text: JSON.stringify({ changes, status: item.status }, null, 2),
      }
    },
    mcp_tool_call: () => ({
      role: 'tool', toolName: 'mcp_tool', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getCodexActivityLabel('mcp_tool'),
      status: item.status === 'failed' ? 'error' : 'done',
      expanded: true, newContent: '', diffLines: [],
      text: JSON.stringify(item.arguments || {}, null, 2),
      toolResultContent: item.result ? JSON.stringify(item.result, null, 2) : '',
      toolError: item.error?.message || '',
      serverName: item.server || '',
      mcpToolName: item.tool || '',
    }),
    web_search: () => ({
      role: 'tool', toolName: 'web_search', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getCodexActivityLabel('web_search'),
      status: 'done', expanded: false, newContent: '', diffLines: [],
      text: JSON.stringify({ query: item.query }, null, 2),
    }),
    todo_list: () => {
      const todoItems = (Array.isArray(item.items) ? item.items : []).map((t, i) => ({
        id: t?.id || `todo-${i}`, content: t?.content || t?.text || '',
        status: t?.status || (t?.completed ? 'completed' : 'pending'),
      }))
      return {
        role: 'tool', toolName: 'todo_list', toolUseId: item.id,
        rawType: item.type,
        activityLabel: getCodexActivityLabel('todo_list'),
        status: 'done', expanded: false, newContent: '', diffLines: [],
        text: JSON.stringify({ todos: todoItems }, null, 2), todoItems,
      }
    },
    error: () => ({
      role: 'tool', toolName: 'error', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getCodexActivityLabel('error'),
      status: 'error', expanded: true, newContent: '', diffLines: [],
      text: item.message || '',
    }),
  }

  const build = builders[item.type]
  if (build) return build()
  console.warn('[codex] buildToolMessageFromItem: unknown item.type:', item.type, item)
  return null
}

/** 将 Anthropic 风格的 response_item(role=tool) 转为前端 tool message */
/** 将 Codex CLI 响应 payload 转换为前端 ToolMessageCard 所需的消息对象（历史恢复用） */
function buildToolMessageFromResponse(payload) {
  if (!payload) return null
  const content = payload.content
  let toolName = 'tool'
  let toolUseId = ''
  let status = 'done'
  let text = ''

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_result') {
        toolName = block.tool_name || block.name || 'tool'
        toolUseId = block.tool_use_id || block.id || ''
        if (block.is_error) status = 'error'
      }
      if (block.type === 'text') text += block.text || ''
    }
  }

  if (!toolUseId) return null

  return {
    role: 'tool',
    toolName,
    rawType: payload.type || 'tool_result',
    activityLabel: getCodexActivityLabel(toolName),
    toolUseId,
    status,
    text,
    expanded: false,
    newContent: '',
    diffLines: [],
  }
}

function buildMessageTextFromContent(content) {
  if (!Array.isArray(content)) return ''
  const textParts = content
    .filter(item => item?.type === 'input_text' || item?.type === 'output_text' || item?.type === 'text')
    .map(item => String(item.text || '').replace(/<image\s[^>]*>/g, '').replace(/<\/image>/g, ''))
    .join('\n')
    .trim()
  return textParts
}

function hasRenderableMessageContent(content) {
  if (!Array.isArray(content)) return false
  return content.some(item => {
    if (!item || typeof item !== 'object') return false
    if ((item.type === 'input_text' || item.type === 'output_text' || item.type === 'text') && String(item.text || '').trim()) return true
    if (item.type === 'image' && item.source) return true
    if (item.type === 'file' && item.source) return true
    return false
  })
}

/** 工具名 → 前端展示标签的中文映射 */
function getCodexActivityLabel(toolName) {
  const n = String(toolName || '').toLowerCase()
  if (['shell', 'bash', 'execute', 'command_execution'].includes(n)) return 'Ran'
  if (isCodeXFileMutationToolName(n)) return 'Edited'
  if (['web_search'].includes(n)) return 'Searching'
  if (['thinking', 'reasoning'].includes(n)) return 'Thinking'
  if (['todo_list'].includes(n)) return 'Planning'
  if (isCodeXReadToolName(n)) return 'Read'
  if (['mcp_tool'].includes(n)) return '插件'
  if (['error'].includes(n)) return 'Error'
  return 'Tool'
}

function buildMessageDedupKey(role, text, content) {
  const safeRole = role || ''
  const safeText = text || ''
  if (Array.isArray(content) && content.length) {
    try {
      return `${safeRole}:${safeText}:${JSON.stringify(content)}`
    } catch (_) {}
  }
  return `${safeRole}:${safeText}`
}

function pickFirstStringValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
  }
  return ''
}

const CODEX_WRITE_TOOL_NAMES = new Set([
  'write',
  'write_file',
  'create_file',
  'writefile',
])

const CODEX_EDIT_TOOL_NAMES = new Set([
  'edit',
  'edit_file',
  'str_replace',
  'str_replace_editor',
  'str_replace_based_edit',
])

const CODEX_READ_TOOL_NAMES = new Set([
  'read',
  'read_file',
])

function normalizeCodexToolName(name) {
  return String(name || '').toLowerCase()
}

function isCodeXWriteToolName(name) {
  return CODEX_WRITE_TOOL_NAMES.has(normalizeCodexToolName(name))
}

function isCodeXEditToolName(name) {
  return CODEX_EDIT_TOOL_NAMES.has(normalizeCodexToolName(name))
}

function isCodeXReadToolName(name) {
  return CODEX_READ_TOOL_NAMES.has(normalizeCodexToolName(name))
}

function isCodeXFileMutationToolName(name) {
  const normalized = normalizeCodexToolName(name)
  return normalized === 'file_change'
    || normalized === 'apply_patch'
    || isCodeXWriteToolName(normalized)
    || isCodeXEditToolName(normalized)
}

function isWriteFunctionTool(name) {
  return isCodeXWriteToolName(name)
}

function isEditFunctionTool(name) {
  return isCodeXEditToolName(name)
}

function isReadFunctionTool(name) {
  return isCodeXReadToolName(name)
}

function buildFunctionCallPreviewState(toolName, args = {}) {
  const isWrite = isWriteFunctionTool(toolName)
  const isEdit = isEditFunctionTool(toolName)
  const isRead = isReadFunctionTool(toolName)

  const filePath = pickFirstStringValue(args.path, args.file_path, args.filename)
  const readContent = isRead ? pickFirstStringValue(args.content, args.file_content, args.output) : ''
  const newContent = isWrite
    ? pickFirstStringValue(args.content, args.new_content, args.file_content, args.new_string, args.new_str)
    : isEdit
      ? pickFirstStringValue(args.new_string, args.new_str, args.new_content, args.content)
      : ''
  const oldStr = isWrite
    ? pickFirstStringValue(args.old_string, args.old_str, args.old_content, args._oldContent)
    : isEdit
      ? pickFirstStringValue(args.old_string, args.old_str, args.old_content)
      : ''

  return {
    filePath,
    readContent,
    newContent,
    diffLines: [],
    _diffInput: (isWrite || isEdit)
      ? {
          oldStr,
          newStr: newContent,
        }
      : null,
  }
}

/** 分页读取 Codex session JSONL 文件，用于历史恢复 */
function readSessionFileRange(filePath, page = 0, pageSize = 60) {
  try {
    if (!fs.existsSync(filePath)) return { messages: [], hasMore: false, totalPages: 0 }

    const safePage = Math.max(0, Number(page) || 0)
    const safePageSize = Math.max(1, Number(pageSize) || 60)
    const fileSize = fs.statSync(filePath).size
    if (safePage === 0) {
      const risk = collectSessionTailRiskSummary(filePath, 80)
      appendSessionLoadDiagnostic({
        type: 'session-read-range',
        filePath,
        fileSize,
        page: safePage,
        pageSize: safePageSize,
        ...risk,
      })
    }

    if (safePage === 0) {
      const fullReadThreshold = 256 * 1024
      const tailSize = Math.min(fileSize, 512 * 1024)

      let rawText = ''
      if (fileSize <= fullReadThreshold) {
        rawText = fs.readFileSync(filePath, 'utf8')
      } else {
        const start = Math.max(0, fileSize - tailSize)
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(fileSize - start)
        fs.readSync(fd, buf, 0, fileSize - start, start)
        fs.closeSync(fd)
        const text = buf.toString('utf8')
        const firstNewline = text.indexOf('\n')
        rawText = firstNewline >= 0 ? text.slice(firstNewline + 1) : text
      }

      const lines = rawText.split(/\r?\n/).filter(line => line.trim())
      const messages = []
      const seenMessages = new Set()
      const seenToolCallIds = new Set() // 已刷入消息的 call_id，防止 JSONL 重复行导致 tool 消息重复
      const pendingCalls = {} // call_id -> { call, output }
      const patchCalls = new Set() // call_ids that are apply_patch (handled by patch_apply_end)

      function collectMessage(line) {
        const row = safeJsonParse(line)
        if (!row) return

        // user/assistant/system 消息只取 response_item（数据最完整，含图片等），
        // event_msg.user_message / agent_message 直接跳过避免重复
        if (row.type === 'response_item' && row.payload?.type === 'message') {
          const role = row.payload.role
          if (role === 'user' || role === 'assistant' || role === 'system') {
            const text = buildMessageTextFromContent(row.payload.content)
            const key = buildMessageDedupKey(role, text, row.payload.content)
            if ((text || hasRenderableMessageContent(row.payload.content)) && !seenMessages.has(key)) {
              seenMessages.add(key)
              messages.push({ role, text, content: row.payload.content })
            }
          }
          return
        }

        // 元数据行（session_meta、turn_context 等），跳过
        if (row.type === 'turn_context' || row.type === 'session_meta') return

        // --- Codex tool calls (response_item level) ---
        const p = row.payload
        if (!p) return

        if (p.type === 'custom_tool_call') {
          pendingCalls[p.call_id] = { call: p }
          if (p.name === 'apply_patch') patchCalls.add(p.call_id)
          return
        }

        if (p.type === 'custom_tool_call_output') {
          const existing = pendingCalls[p.call_id]
          if (existing) {
            existing.output = p.output || ''
            tryFlushCall(p.call_id)
          }
          return
        }

        if (p.type === 'function_call') {
          pendingCalls[p.call_id] = { call: p }
          return
        }

        if (p.type === 'function_call_output') {
          const existing = pendingCalls[p.call_id]
          if (existing) {
            existing.output = p.output || ''
            tryFlushCall(p.call_id)
          }
          return
        }

        if (p.type === 'patch_apply_end') {
          const existing = pendingCalls[p.call_id]
          if (existing) {
            existing.patchEnd = p
            tryFlushCall(p.call_id)
          }
          return
        }

        // --- 新版 SDK 新增的 event_msg 类型 (静默跳过/收集) ---

        // agent_message → 作为 assistant 消息收集（含 final_answer 最终回复）
        if (p.type === 'agent_message' && typeof p.message === 'string' && p.message.trim()) {
          const text = p.message.trim()
          const key = buildMessageDedupKey('assistant', text, [{ type: 'output_text', text }])
          if (!seenMessages.has(key)) {
            seenMessages.add(key)
            messages.push({ role: 'assistant', text, content: [{ type: 'output_text', text }] })
          }
          return
        }

        // 以下类型只是元数据，跳过不警告
        if (p.type === 'task_complete' || p.type === 'task_started' || p.type === 'turn_context' ||
            p.type === 'token_count' || p.type === 'user_message' || p.type === 'reasoning') {
          return
        }

        // 未知 payload 类型兜底日志
        console.warn('[codex] collectMessage: unhandled payload.type:', p.type, row)
      }
      function tryFlushCall(callId) {
        const entry = pendingCalls[callId]
        if (!entry || !entry.call) return
        if (seenToolCallIds.has(callId)) { delete pendingCalls[callId]; return }
        seenToolCallIds.add(callId)

        const call = entry.call
        const output = entry.output || ''
        const patchEnd = entry.patchEnd

        // apply_patch → file_change tool message (use patch_end data)
        if (patchCalls.has(callId) && patchEnd) {
          const changes = []
          const fileChanges = patchEnd.changes || {}
          for (const [filePath, info] of Object.entries(fileChanges)) {
            changes.push({
              path: filePath,
              operation: info.type === 'create' ? 'add' : info.type === 'delete' ? 'delete' : info.move_path ? 'rename' : 'modify',
              unified_diff: info.unified_diff || '',
            })
          }
          const filePaths = changes.map(c => c.path).filter(Boolean).join('\n')
          messages.push({
            role: 'tool',
            toolName: 'file_change',
            rawType: 'file_change',
            activityLabel: getCodexActivityLabel('file_change'),
            toolUseId: callId,
            status: patchEnd.success !== false ? 'done' : 'error',
            filePath: filePaths,
            expanded: true,
            newContent: '',
            diffLines: [],
            text: JSON.stringify({ changes, status: patchEnd.status }, null, 2),
          })
          delete pendingCalls[callId]
          return
        }

        // apply_patch without patch_end yet → skip for now
        if (patchCalls.has(callId) && !patchEnd) return

        // function_call → shell or generic tool
        if (call.type === 'function_call') {
          const name = call.name || ''
          let args = {}
          try { args = JSON.parse(call.arguments || '{}') } catch (_) {}

          if (name === 'shell_command') {
            messages.push({
              role: 'tool',
              toolName: 'shell',
              rawType: 'command_execution',
              activityLabel: getCodexActivityLabel('shell'),
              toolUseId: callId,
              status: output.toLowerCase().includes('error') && output.length < 500 ? 'error' : 'done',
              filePath: '',
              bashCmd: args.command || '',
              bashCwd: args.workdir || '',
              bashOutput: output,
              expanded: true,
              newContent: output,
              diffLines: [],
              text: JSON.stringify({ command: args.command || '', status: 'completed', exit_code: null }, null, 2),
            })
          } else {
            const previewState = buildFunctionCallPreviewState(name, args)
            messages.push({
              role: 'tool',
              toolName: name,
              rawType: name || 'tool',
              activityLabel: getCodexActivityLabel(name || 'tool'),
              toolUseId: callId,
              status: 'done',
              expanded: true,
              ...previewState,
              text: JSON.stringify(args, null, 2),
              toolResultContent: output,
            })
          }
          delete pendingCalls[callId]
          return
        }

        // custom_tool_call (non apply_patch)
        if (call.type === 'custom_tool_call' && !patchCalls.has(callId)) {
          const name = call.name || 'tool'
          const input = call.input || ''
          // apply_patch: 从 input 中提取文件路径
          let filePath = ''
          if (name === 'apply_patch') {
            const match = String(input).match(/\*\*\*\s+Update File:\s*(.+)/)
            if (match) filePath = match[1].trim()
          }
          messages.push({
            role: 'tool',
            toolName: name,
            rawType: name || 'custom_tool_call',
            activityLabel: getCodexActivityLabel(name || 'tool'),
            toolUseId: callId,
            status: call.status === 'failed' ? 'error' : 'done',
            expanded: true,
            newContent: '',
            diffLines: [],
            filePath,
            text: JSON.stringify({ name, input: input.substring(0, 2000) }, null, 2),
            toolResultContent: output,
          })
          delete pendingCalls[callId]
          return
        }
      }

      for (const line of lines) collectMessage(line)

      // Flush remaining calls without output (timeout/cancelled)
      // NOTE: page=0 uses tail-read; tail may start mid-session. Do not synthesize
      // incomplete custom_tool_call/function_call items, otherwise phantom trailing
      // "Edited"/tool messages can appear after history load.
      for (const [callId, entry] of Object.entries(pendingCalls)) {
        if (!entry.call) continue
        const call = entry.call
        if (call.type === 'reasoning') {
          messages.push({
            role: 'tool',
            toolName: 'thinking',
            rawType: 'reasoning',
            activityLabel: getCodexActivityLabel('thinking'),
            toolUseId: callId,
            status: 'done',
            text: '',
            expanded: false,
            newContent: '',
            diffLines: [],
          })
          continue
        }
        if (call.type === 'custom_tool_call' || call.type === 'function_call') {
          continue
        }
        // flush as generic tool
        const name = call.name || call.type || 'tool'
        const input = call.input || call.arguments || ''
        messages.push({
          role: 'tool',
          toolName: name,
          rawType: name || call.type || 'tool',
          activityLabel: getCodexActivityLabel(name || call.type || 'tool'),
          toolUseId: callId,
          status: 'done',
          expanded: true,
          newContent: '',
          diffLines: [],
          text: JSON.stringify({ name, input: String(input).substring(0, 2000) }, null, 2),
        })
      }

      const sliced = messages.slice(-safePageSize)
      return {
        messages: sliced.map((message, index) => ({ id: index + 1, ...message })),
        hasMore: messages.length > sliced.length || fileSize > fullReadThreshold,
        totalPages: Math.max(1, Math.ceil(messages.length / safePageSize)),
      }
    }

    const fd = fs.openSync(filePath, 'r')
    const readBuf = Buffer.alloc(64 * 1024)
    let pos = 0
    let totalLines = 0
    while (pos < fileSize) {
      const toRead = Math.min(readBuf.length, fileSize - pos)
      const bytesRead = fs.readSync(fd, readBuf, 0, toRead, pos)
      if (bytesRead === 0) break
      for (let i = 0; i < bytesRead; i++) {
        if (readBuf[i] === 0x0a) totalLines++
      }
      pos += bytesRead
    }
    if (fileSize > 0) {
      const lastByte = Buffer.alloc(1)
      fs.readSync(fd, lastByte, 0, 1, fileSize - 1)
      if (lastByte[0] !== 0x0a) totalLines++
    }

    const endLine = totalLines - (safePage * safePageSize)
    const startLine = Math.max(0, endLine - safePageSize)

    if (startLine >= totalLines || endLine <= 0) {
      fs.closeSync(fd)
      return { messages: [], hasMore: false, totalPages: Math.ceil(totalLines / safePageSize) }
    }

    const messages = []
    const seenMessages = new Set()
    const pendingCalls = {}
    const patchCalls = new Set()
    let currentLine = 0
    let lineBuffer = ''
    function collectMessage(line) {
      if (!line.trim()) return
      const row = safeJsonParse(line)
      if (!row) return

      if (row.type === 'response_item' && row.payload?.type === 'message') {
        const role = row.payload.role
        if (role === 'user' || role === 'assistant' || role === 'system') {
          const text = buildMessageTextFromContent(row.payload.content)
          const key = buildMessageDedupKey(role, text, row.payload.content)
          if ((text || hasRenderableMessageContent(row.payload.content)) && !seenMessages.has(key)) {
            seenMessages.add(key)
            messages.push({ role, text, content: row.payload.content })
          }
        }
        return
      }

      // turn_context 行只是元数据（cwd、sandbox、model 等），跳过
      if (row.type === 'turn_context' || row.type === 'session_meta') return

      // --- Codex tool calls ---
      const p = row.payload
      if (!p) return

      if (p.type === 'custom_tool_call') {
        pendingCalls[p.call_id] = { call: p }
        if (p.name === 'apply_patch') patchCalls.add(p.call_id)
        return
      }

      if (p.type === 'custom_tool_call_output') {
        const existing = pendingCalls[p.call_id]
        if (existing) {
          existing.output = p.output || ''
          tryFlushCall(p.call_id)
        }
        return
      }

      if (p.type === 'function_call') {
        pendingCalls[p.call_id] = { call: p }
        return
      }

      if (p.type === 'function_call_output') {
        const existing = pendingCalls[p.call_id]
        if (existing) {
          existing.output = p.output || ''
          tryFlushCall(p.call_id)
        }
        return
      }

      if (p.type === 'patch_apply_end') {
        const existing = pendingCalls[p.call_id]
        if (existing) {
          existing.patchEnd = p
          tryFlushCall(p.call_id)
        }
        return
      }

      // --- 新版 SDK 新增的 event_msg 类型 (静默跳过/收集) ---

      // agent_message → 作为 assistant 消息收集（含 final_answer 最终回复）
      if (p.type === 'agent_message' && typeof p.message === 'string' && p.message.trim()) {
        const text = p.message.trim()
        const key = buildMessageDedupKey('assistant', text, [{ type: 'output_text', text }])
        if (!seenMessages.has(key)) {
          seenMessages.add(key)
          messages.push({ role: 'assistant', text, content: [{ type: 'output_text', text }] })
        }
        return
      }

      // 以下类型只是元数据，跳过不警告
      if (p.type === 'task_complete' || p.type === 'task_started' || p.type === 'turn_context' ||
          p.type === 'token_count' || p.type === 'user_message' || p.type === 'reasoning') {
        return
      }

      // 未知 payload 类型兜底日志
      console.warn('[codex] collectMessage: unhandled payload.type:', p.type, row)
    }
    function tryFlushCall(callId) {
      const entry = pendingCalls[callId]
      if (!entry || !entry.call) return

      const call = entry.call
      const output = entry.output || ''
      const patchEnd = entry.patchEnd

      if (patchCalls.has(callId) && patchEnd) {
        const changes = []
        const fileChanges = patchEnd.changes || {}
        for (const [filePath, info] of Object.entries(fileChanges)) {
          changes.push({
            path: filePath,
            operation: info.type === 'create' ? 'add' : info.type === 'delete' ? 'delete' : info.move_path ? 'rename' : 'modify',
            unified_diff: info.unified_diff || '',
          })
        }
        const filePaths = changes.map(c => c.path).filter(Boolean).join('\n')
        messages.push({
          role: 'tool',
          toolName: 'file_change',
          rawType: 'file_change',
          activityLabel: getCodexActivityLabel('file_change'),
          toolUseId: callId,
          status: patchEnd.success !== false ? 'done' : 'error',
          filePath: filePaths,
          expanded: true,
          newContent: '',
          diffLines: [],
          text: JSON.stringify({ changes, status: patchEnd.status }, null, 2),
        })
        delete pendingCalls[callId]
        return
      }

      if (patchCalls.has(callId) && !patchEnd) return

      if (call.type === 'function_call') {
        const name = call.name || ''
        let args = {}
        try { args = JSON.parse(call.arguments || '{}') } catch (_) {}

        if (name === 'shell_command') {
          messages.push({
            role: 'tool',
            toolName: 'shell',
            rawType: 'command_execution',
            activityLabel: getCodexActivityLabel('shell'),
            toolUseId: callId,
            status: output.toLowerCase().includes('error') && output.length < 500 ? 'error' : 'done',
            filePath: '',
            bashCmd: args.command || '',
            bashCwd: args.workdir || '',
            bashOutput: output,
            expanded: true,
            newContent: output,
            diffLines: [],
            text: JSON.stringify({ command: args.command || '', status: 'completed', exit_code: null }, null, 2),
          })
        } else {
          const previewState = buildFunctionCallPreviewState(name, args)
          messages.push({
            role: 'tool',
            toolName: name,
            rawType: name || 'tool',
            activityLabel: getCodexActivityLabel(name || 'tool'),
            toolUseId: callId,
            status: 'done',
            expanded: true,
            ...previewState,
            text: JSON.stringify(args, null, 2),
            toolResultContent: output,
          })
        }
        delete pendingCalls[callId]
        return
      }

      if (call.type === 'custom_tool_call' && !patchCalls.has(callId)) {
        const name = call.name || 'tool'
        const input = call.input || ''
        // apply_patch: 从 input 中提取文件路径
        let filePath = ''
        if (name === 'apply_patch') {
          const match = String(input).match(/\*\*\*\s+Update File:\s*(.+)/)
          if (match) filePath = match[1].trim()
        }
        messages.push({
          role: 'tool',
          toolName: name,
          rawType: name || 'custom_tool_call',
          activityLabel: getCodexActivityLabel(name || 'tool'),
          toolUseId: callId,
          status: call.status === 'failed' ? 'error' : 'done',
          expanded: true,
          newContent: '',
          diffLines: [],
          filePath,
          text: JSON.stringify({ name, input: input.substring(0, 2000) }, null, 2),
          toolResultContent: output,
        })
        delete pendingCalls[callId]
        return
      }
    }

    pos = 0
    while (pos < fileSize) {
      const toRead = Math.min(readBuf.length, fileSize - pos)
      const bytesRead = fs.readSync(fd, readBuf, 0, toRead, pos)
      if (bytesRead === 0) break
      lineBuffer += readBuf.subarray(0, bytesRead).toString('utf8')
      pos += bytesRead
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''
      for (const line of lines) {
        if (currentLine >= startLine && currentLine < endLine) collectMessage(line)
        currentLine++
      }
    }
    if (lineBuffer.trim() && currentLine >= startLine && currentLine < endLine) {
      collectMessage(lineBuffer)
    }

    fs.closeSync(fd)
    const baseId = startLine + 1
    return {
      messages: messages.map((message, index) => ({ id: baseId + index, ...message })),
      hasMore: startLine > 0,
      totalPages: Math.ceil(totalLines / safePageSize),
    }
  } catch (_) {
    return { messages: [], hasMore: false, totalPages: 0 }
  }
}

/** 按工作目录列出所有 Codex 会话历史 */
function listSessionsByCwd(targetCwd) {
  const normalizedTarget = normalizeFsPath(targetCwd)
  const files = walkFiles(SESSIONS_DIR).filter(file => file.toLowerCase().endsWith('.jsonl'))
  const sessions = []

  for (const file of files) {
    const summary = extractSessionSummary(file)
    if (!summary) continue
    if (normalizeFsPath(summary.cwd) === normalizedTarget) sessions.push(summary)
  }

  return sessions.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
}

const codexSessions = new Map()
const cliSessionIds = new Map()
const slowNoticeSent = new Set()
const codexMetricsPollers = new Map() // sessionId -> { interval, startTime }
let codexSessionRunSeq = 0

function nextCodexSessionRunId() {
  codexSessionRunSeq += 1
  return `codex-run-${codexSessionRunSeq}`
}

function isCodexSessionRunTerminal(existing) {
  return Boolean(existing?.doneSent || existing?.resultReceived)
}

function canStartCodexSessionRun(existing) {
  return !existing || existing.streamClosed === true
}

function markCodexSessionDoneSent(session) {
  if (!session) return
  session.doneSent = true
}

function deleteCodexSessionRunIfCurrent(sessions, sessionId, runId) {
  const current = sessions.get(sessionId)
  if (current?.runId !== runId) return false
  sessions.delete(sessionId)
  return true
}

function shouldEmitCodexSessionTerminalSignals(sessions, sessionId, runId) {
  return sessions.get(sessionId)?.runId === runId
}

async function waitForCodexSessionRunToClose(existing, timeoutMs = 0) {
  if (!existing) return true
  if (existing.streamClosed) return true
  if (!existing.completionPromise || timeoutMs <= 0) return existing.streamClosed === true

  let timeoutId = null
  try {
    await Promise.race([
      existing.completionPromise.catch(() => {}),
      new Promise((resolve) => {
        timeoutId = setTimeout(resolve, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
  return existing.streamClosed === true
}

function findCodexSessionForSlashCommands(sessions, cliSessionMap, sessionId) {
  if (!sessionId) return null
  const direct = sessions.get(sessionId)
  if (direct) return direct
  for (const [sid, session] of sessions.entries()) {
    if (!session) continue
    if (session?.thread?.id === sessionId) return session
    if (cliSessionMap.get(sid) === sessionId) return session
  }
  return null
}

function finalizeCodexSessionDoneState({ resultReceived, doneReason }) {
  if (!resultReceived && doneReason === 'completed') {
    return { doneReason: 'failed', shouldSendSilentFailureMessage: true }
  }
  return { doneReason, shouldSendSilentFailureMessage: false }
}

function closeCodexSessionRun(session, {
  resultReceived = session?.resultReceived,
  doneSent = session?.doneSent,
} = {}) {
  if (!session) return
  if (session.__turnTimeout) {
    clearTimeout(session.__turnTimeout)
    session.__turnTimeout = null
  }
  if (session.__bootWatch) {
    clearTimeout(session.__bootWatch)
    session.__bootWatch = null
  }
  session.resultReceived = Boolean(resultReceived)
  session.doneSent = Boolean(doneSent)
  session.streamClosed = true
  try { session.resolveCompletion?.() } catch (_) {}
}

function resetCodexSdkRuntime() {
  for (const [, poller] of codexMetricsPollers.entries()) {
    clearInterval(poller.interval)
  }
  codexMetricsPollers.clear()
  for (const [, s] of codexSessions.entries()) {
    try { s.abortController?.abort?.() } catch (_) {}
    codexSessions.delete(s.sessionId)
  }
  cliSessionIds.clear()
  slowNoticeSent.clear()
  codexModulePromise = null
}

/** 注册所有 Codex SDK 相关的 IPC 处理器（query/abort/history/settings） */
function setupCodexSdkHandlers() {
  loadCodexSdk().catch(() => {})

  ipcMain.handle('codex-agent-query', async (event, { prompt, images, cwd, sessionId, networkAccessEnabled, webSearchMode, additionalDirectories, sandboxMode: frontendSandbox, model: modelOverride, reasoningEffort: reasoningEffortOverride }) => {
    const runtime = readRuntimeConfig()
    console.log('[codex-diag] readRuntimeConfig:', {
      hasApiKey: !!runtime.apiKey,
      baseURL: runtime.baseURL,
      model: runtime.model,
      reasoningEffort: runtime.reasoningEffort,
      cwd: path.resolve(cwd || process.cwd()),
    })
    const apiKey = runtime.apiKey || ''
    const baseURL = runtime.baseURL || ''
    const model = modelOverride?.trim() || runtime.model || ''
    const reasoningEffort = String(reasoningEffortOverride?.trim() || runtime.reasoningEffort || '').trim()
    const sandboxMode = frontendSandbox || readSandboxMode()
    const resolvedCwd = path.resolve(cwd || process.cwd())

    console.log('[codex] session launch:', {
      sessionId,
      cwd: resolvedCwd,
      sandboxMode,
    })

    // 前端已通过排队机制（_queuedInput）阻止运行中发送，正常情况下不应命中此分支。
    // 若因时序竞态命中，统一 abort 旧 session 后走新建路径，避免 fire-and-forget IIFE
    // 导致的"双 finally / 事件丢失 / 无 done 通知"问题（B027）。
    const existing = codexSessions.get(sessionId)
    if (existing && !canStartCodexSessionRun(existing)) {
      if (!isCodexSessionRunTerminal(existing)) {
        console.warn('[codex] duplicate query ignored: session already running. sessionId=', sessionId, 'runId=', existing?.runId || '')
        return { accepted: false, reason: 'session_already_running' }
      }
      console.warn('[codex] waiting for previous terminal session to close before starting next run. sessionId=', sessionId, 'runId=', existing?.runId || '')
      let closed = await waitForCodexSessionRunToClose(existing, 2500)
      if (!closed) {
        console.warn('[codex] terminal session did not close in time, aborting before restart. sessionId=', sessionId, 'runId=', existing?.runId || '')
        try { existing.abortController?.abort?.() } catch (_) {}
        closed = await waitForCodexSessionRunToClose(existing, 750)
      }
    }
    const settledExisting = codexSessions.get(sessionId)
    if (settledExisting && !canStartCodexSessionRun(settledExisting)) {
      console.warn('[codex] duplicate query ignored after close wait: session still running. sessionId=', sessionId, 'runId=', settledExisting?.runId || '')
      return { accepted: false, reason: 'session_close_timeout' }
    }
    const runId = nextCodexSessionRunId()
    if (settledExisting && settledExisting.thread) {
      console.warn('[codex] query collision: session already running, aborting old and starting new. sessionId=', sessionId)
      try { settledExisting.abortController?.abort?.() } catch (_) {}
      // 清除旧 poller
      const oldPoller = codexMetricsPollers.get(sessionId)
      if (oldPoller) { clearInterval(oldPoller.interval); codexMetricsPollers.delete(sessionId) }
      // 立即清除旧 turnTimeout，防止旧 IIFE 的 finally 延迟清除导致二次超时消息
      if (settledExisting.__turnTimeout) { clearTimeout(settledExisting.__turnTimeout); settledExisting.__turnTimeout = null }
      if (settledExisting.__bootWatch) { clearTimeout(settledExisting.__bootWatch); settledExisting.__bootWatch = null }
      codexSessions.delete(sessionId)
    }

    return new Promise((resolve) => {
      const prevCliId = cliSessionIds.get(sessionId)
      const abortController = new AbortController()
      let resolveCompletion = () => {}
      const completionPromise = new Promise((completionResolve) => {
        resolveCompletion = completionResolve
      })
      let gotAnyMessage = false
      let resultReceived = false
      let exitCode = 0
      let doneReason = 'completed'

      const sessionState = {
        runId, thread: null, abortController, event, model, baseURL, apiKey,
        sessionId, startTime: Date.now(), cwd: resolvedCwd,
        resultReceived: false, doneSent: false, streamClosed: false,
        completionPromise, resolveCompletion,
      }
      codexSessions.set(sessionId, sessionState)

      const bootWatch = setTimeout(() => {
        if (!gotAnyMessage && !slowNoticeSent.has(sessionId)) {
          slowNoticeSent.add(sessionId)
          const sender = codexSessions.get(sessionId)?.event?.sender || event.sender
          safeSend(sender, 'codex-agent-message', {
            sessionId,
            msg: { type: 'system', subtype: 'slow_notice', message: { content: [{ type: 'text', text: lt('codex.slow') }] } },
          })
        }
      }, 30000)
      // 存到 session（延迟设置，要等 codexSessions.set 之后才能赋值）
      // 通过小延迟确保 session 已创建
      setImmediate(() => {
        const s = codexSessions.get(sessionId)
        if (s) s.__bootWatch = bootWatch
      })

      // 轮次空闲超时保护（10 分钟无事件视为挂死），每次收到事件时重置计时器
      const TURN_TIMEOUT_MS = 10 * 60 * 1000
      let turnTimedOut = false
      let turnTimeout = null
      function resetTurnTimeout() {
        if (turnTimeout) clearTimeout(turnTimeout)
        turnTimeout = setTimeout(() => {
          turnTimedOut = true
          console.warn('[codex] turn idle timeout after', TURN_TIMEOUT_MS / 60000, 'min, aborting session', sessionId)
          try { abortController.abort() } catch (_) {}
          const sender = codexSessions.get(sessionId)?.event?.sender || event.sender
          safeSend(sender, 'codex-agent-message', {
            sessionId,
            msg: { type: 'system', subtype: 'error', message: { content: [{ type: 'text', text: lt('codex.timeout') }] } },
          })
        }, TURN_TIMEOUT_MS)
        // 存到 session 对象上，方便碰撞/abort 时从外部清除
        const s = codexSessions.get(sessionId)
        if (s) s.__turnTimeout = turnTimeout
      }
      resetTurnTimeout()

      let drainTimer = null
      // 以下变量在 try / finally 之间共享（let 在 try 块内声明则 finally 无法访问）
      let doneSent = false
      let pendingItemIds = new Set()
      let thread = null
      ;(async () => {
        try {
          const { Codex } = await loadCodexSdk()

          const codex = new Codex({
            codexPathOverride: findGlobalCodexPath(),
            apiKey,
            ...(baseURL ? { baseUrl: baseURL } : {}),
            env: augmentEnvWithBundledRg({
              ...process.env,
              OPENAI_API_KEY: apiKey,
              ...(baseURL ? { OPENAI_BASE_URL: baseURL } : {}),
            }),
          })

          const threadOptions = {
            workingDirectory: resolvedCwd,
            skipGitRepoCheck: true,
            // approvalPolicy: SDK 使用单向 exec --experimental-json 模式，stdin 在输入后即关闭，
            // 无法回复 CLI 发出的 ExecApprovalRequest 事件（需要双向 app-server 协议）。
            // 权限由 sandboxMode OS 级强制执行，approvalPolicy 固定 'never'。
            approvalPolicy: 'never',
            ...(sandboxMode ? { sandboxMode } : {}),
            ...(model ? { model } : {}),
            ...(reasoningEffort ? { modelReasoningEffort: reasoningEffort } : {}),
            ...(networkAccessEnabled !== undefined ? { networkAccessEnabled } : {}),
            ...(webSearchMode ? { webSearchMode } : {}),
            ...(additionalDirectories?.length ? { additionalDirectories } : {}),
          }

          // 恢复已有线程；若线程已失效则降级为新建
          thread = null
          if (prevCliId) {
            try {
              thread = codex.resumeThread(prevCliId, threadOptions)
            } catch (e) {
              console.warn('[codex] resumeThread failed, starting new thread:', e?.message, 'sessionId=', sessionId, 'prevCliId=', prevCliId)
              cliSessionIds.delete(sessionId)
              thread = codex.startThread(threadOptions)
            }
          } else {
            // B023 guard：记录每次 startThread 调用，便于排查空会话（仅含'/'）来源
            console.log('[codex] startThread: sessionId=', sessionId, 'cwd=', resolvedCwd, 'sandboxMode=', sandboxMode, 'hasPrompt=', !!prompt)
            thread = codex.startThread(threadOptions)
          }

          const inputParts = []
          if (prompt) inputParts.push({ type: 'text', text: prompt })
          if (images?.length) {
            for (const img of images) {
              const imagePath = resolveImageInputPath(img)
              if (imagePath) inputParts.push({ type: 'local_image', path: imagePath })
            }
          }
          const input = inputParts.length === 1 && inputParts[0].type === 'text'
            ? inputParts[0].text
            : (inputParts.length ? inputParts : (prompt || ''))

          const currentSessionState = codexSessions.get(sessionId)
          if (!currentSessionState || currentSessionState.runId !== runId) return
          Object.assign(currentSessionState, { thread })

          sendMetrics(event.sender, {
            sessionId,
            model: model || '',
            thinking: true,
          })

          // 启动 metrics 轮询器（3s 间隔，与 ClaudeCode 一致）
          const pollStart = Date.now()
          const pollInterval = setInterval(async () => {
            const s = codexSessions.get(sessionId)
            if (!s) { clearInterval(pollInterval); return }
            if (s.runId !== runId) { clearInterval(pollInterval); return }
            const cliId = cliSessionIds.get(sessionId)
            if (!cliId) return
            const filePath = path.join(SESSIONS_DIR, cliId + '.jsonl')
            if (!fs.existsSync(filePath)) return
            const metrics = getCodexSessionMetricsByFile(filePath, model || '', s.cwd || '')
            if (metrics) {
              metrics.sessionId = sessionId
              metrics.thinking = true
              sendMetrics(s.event?.sender, metrics)
            }
          }, 3000)
          codexMetricsPollers.set(sessionId, { interval: pollInterval, startTime: pollStart, runId })

          const { events } = await thread.runStreamed(input, { signal: abortController.signal })

          const applyPatchByCallId = new Map()
          const applyPatchCallIdByItemId = new Map()
          const patchApplyEndByCallId = new Map()
          pendingItemIds = new Set()
          let turnCompletedSeen = false
          doneSent = false
          let turnCompletedAt = 0
          let lastItemProgressAt = 0
          const DRAIN_EMPTY_MS = 200
          const DRAIN_PENDING_IDLE_MS = 250
          const DRAIN_MAX_MS = 1000

          function scheduleDone(delayMs) {
            if (doneSent) return
            if (drainTimer) clearTimeout(drainTimer)
            drainTimer = setTimeout(flushDone, Math.max(0, delayMs))
          }

          function maybeSendDone() {
            if (doneSent) return
            if (!turnCompletedSeen) return
            console.log(`[codex] maybeSendDone: pendingItems=${pendingItemIds.size} sessionId=${sessionId}`)
            if (pendingItemIds.size === 0) {
              scheduleDone(DRAIN_EMPTY_MS)
              return
            }
            scheduleDone(Math.min(DRAIN_PENDING_IDLE_MS, DRAIN_MAX_MS))

            // 启动 drain window 等待尾部事件
          }

          function flushDone() {
            if (doneSent) return
            drainTimer = null
            if (!turnCompletedSeen) return
            const now = Date.now()
            const totalWait = turnCompletedAt > 0 ? now - turnCompletedAt : 0
            const idleWait = lastItemProgressAt > 0 ? now - lastItemProgressAt : 0
            console.log(`[codex] flushDone: totalWait=${totalWait}ms idleWait=${idleWait}ms pendingItems=${pendingItemIds.size} sessionId=${sessionId}`)

            // pending 重新出现（有新 item started），续期
            if (totalWait >= DRAIN_MAX_MS) {
              triggerDone()
              return
            }

            if (pendingItemIds.size === 0) {
              triggerDone()
              return
            }

            // 总上限到达，强制结束
            if (idleWait >= DRAIN_PENDING_IDLE_MS) {
              triggerDone()
              return
            }

            // 等待更多事件：取 idle 剩余和总上限剩余的较小值
            const maxRemaining = DRAIN_MAX_MS - totalWait
            const idleRemaining = DRAIN_PENDING_IDLE_MS - idleWait
            const remaining = Math.min(idleRemaining, maxRemaining)
            if (remaining > 0) {
              drainTimer = setTimeout(flushDone, remaining)
            } else {
              triggerDone()
            }
          }

          function triggerDone() {
            if (doneSent) { console.log(`[codex] triggerDone: already doneSent, skipping. sessionId=${sessionId}`); return }
            const currentSession = codexSessions.get(sessionId)
            if (currentSession?.runId !== runId) { console.warn(`[codex] triggerDone: session gone or runId mismatch. currentRunId=${currentSession?.runId} expected=${runId} sessionId=${sessionId}`); return }
            doneSent = true
            drainTimer = null
            currentSession.doneSent = true
            // B029: 标记 stream 已关闭，让 canStartCodexSessionRun 和 waitForCodexSessionRunToClose
            // 立即通过，消除 triggerDone → codex-agent-done → 前端 flush _queuedInput →
            // codexAgentQuery 竞态（B029：done 发送时 finally 尚未运行，streamClosed=false
            // 导致 2.5s 超时等待 → "CodeX 正在处理上一轮请求" toast）
            currentSession.streamClosed = true
            try { currentSession.resolveCompletion?.() } catch (_) {}
            const sender = codexSessions.get(sessionId)?.event?.sender || event.sender
            const sfilePath = thread.id ? path.join(SESSIONS_DIR, thread.id + '.jsonl') : ''
            console.log(`[codex] triggerDone: sessionId=${sessionId} cliId=${thread?.id} filePath=${!!sfilePath}`)
            safeSend(sender, 'codex-agent-done', buildCodexAgentDonePayload({
              sessionId,
              cliSessionId: thread.id,
              filePath: sfilePath,
              reason: doneReason,
            }))
          }

          function toFileChangeChangesFromPatchEnd(patchEnd) {
            const fileChanges = patchEnd?.changes || {}
            const changes = []
            for (const [filePath, info] of Object.entries(fileChanges)) {
              changes.push({
                path: filePath,
                kind: info?.type || 'update',
                operation: info?.type === 'create'
                  ? 'add'
                  : info?.type === 'delete'
                    ? 'delete'
                    : info?.move_path
                      ? 'rename'
                      : 'modify',
                unified_diff: info?.unified_diff || '',
              })
            }
            return changes
          }

          for await (const ev of events) {
            if (codexSessions.get(sessionId)?.runId !== runId) break
            gotAnyMessage = true
            resetTurnTimeout()
            try {
              const t = String(ev?.type || '')
              const isKnown = KNOWN_EVENT_TYPES.has(t)
              // 未知事件类型始终记录（主进程控制台），便于排查卡住原因
              if (!isKnown) {
                const subtype = ev?.subtype || ''
                console.warn(`[codex] unknown event: type=${t}${subtype ? ' subtype=' + subtype : ''} keys=${Object.keys(ev).join(',')}`)
              }
              // 全量日志仅在 debug 模式开启
              if (CODEX_DEBUG) {
                const subtype = ev?.subtype || ''
                const label = isKnown ? t : `[UNKNOWN] ${t}`
                console.log(`[codex-main] event: ${label}${subtype ? ' subtype=' + subtype : ''}`, !isKnown ? JSON.stringify(ev).slice(0, 500) : '')
              }
            } catch (_) {}
  
            if (shouldStopTurnTimeoutOnEvent(ev.type)) {
              if (turnTimeout) {
                clearTimeout(turnTimeout)
                turnTimeout = null
              }
              const activeSession = codexSessions.get(sessionId)
              if (activeSession) activeSession.__turnTimeout = null
            }

            if (ev.type === 'thread.started' && ev.thread_id) {
              if (!cliSessionIds.has(sessionId)) cliSessionIds.set(sessionId, ev.thread_id)
            }

            if (ev.type === 'turn.completed' || ev.type === 'turn.failed' || ev.type === 'task_complete') {
              console.log(`[codex] turn terminal: type=${ev.type} sessionId=${sessionId} pendingItems=${pendingItemIds.size}`)
              resultReceived = true
              const session = codexSessions.get(sessionId)
              if (session?.runId === runId) session.resultReceived = true
              const sender = session?.event?.sender || event.sender
              const parsedMetrics = getCodexSessionMetrics(sessionId, model || '', session?.cwd || '')
              const durationMs = Math.max(0, Date.now() - (session?.startTime || Date.now()))
              sendMetrics(sender, {
                sessionId,
                model: parsedMetrics?.model || model || '',
                inputTokens: parsedMetrics?.inputTokens ?? ev.usage?.input_tokens ?? 0,
                outputTokens: parsedMetrics?.outputTokens ?? ev.usage?.output_tokens ?? 0,
                cacheReadTokens: parsedMetrics?.cacheReadTokens ?? ev.usage?.cached_input_tokens ?? 0,
                cacheCreationTokens: parsedMetrics?.cacheCreationTokens ?? 0,
                contextUsage: parsedMetrics?.contextUsage ?? 0,
                contextWindow: parsedMetrics?.contextWindow ?? 0,
                durationMs: parsedMetrics?.durationMs || durationMs,
                speedOutputPerSec: parsedMetrics?.speedOutputPerSec ?? 0,
                thinking: false,
                gitBranch: parsedMetrics?.gitBranch || '',
                gitChanges: parsedMetrics?.gitChanges || 0,
                usageApiSessionPct: null,
                costUsd: parsedMetrics?.costUsd ?? 0,
              })
            }

            // 转发 item 事件到前端
            if (ev.type === 'item.started' || ev.type === 'item.updated' || ev.type === 'item.completed') {
              lastItemProgressAt = Date.now()
              const item = ev.item

              if (item?.id) {
                if (ev.type === 'item.started' || ev.type === 'item.updated') pendingItemIds.add(item.id)
                if (ev.type === 'item.completed') pendingItemIds.delete(item.id)
              }
              if (item?.type === 'custom_tool_call' && item?.name === 'apply_patch' && item?.call_id) {
                applyPatchByCallId.set(item.call_id, item.id)
                if (item?.id) applyPatchCallIdByItemId.set(item.id, item.call_id)
              }
              if (item?.type === 'patch_apply_end' && item?.call_id) {
                patchApplyEndByCallId.set(item.call_id, item)
              }
              let forwardItem = ev.item
              if (forwardItem?.type === 'file_change' && ev.type === 'item.completed') {
                const callId = forwardItem?.call_id
                  || (forwardItem?.id ? applyPatchCallIdByItemId.get(forwardItem.id) : null)
                  || [...applyPatchByCallId.entries()].find(([, itemId]) => itemId === forwardItem.id)?.[0]
                const patchEnd = callId ? patchApplyEndByCallId.get(callId) : null
                if (patchEnd) {
                  const enrichedChanges = toFileChangeChangesFromPatchEnd(patchEnd)
                  if (enrichedChanges.length) forwardItem = { ...forwardItem, changes: enrichedChanges }
                }
              }
              if (forwardItem?.type === 'file_change') {
                forwardItem = normalizeFileChangeItemPreviews(forwardItem, resolvedCwd)
              }
              if (item?.type === 'patch_apply_end' || forwardItem?.type === 'file_change') {
                if (CODEX_DEBUG) {
                  const debugChanges = Array.isArray(forwardItem?.changes) ? forwardItem.changes : []
                  const debugPaths = debugChanges.map(c => c?.path).filter(Boolean)
                  const debugDiffPreview = debugChanges
                    .map(c => String(c?.unified_diff || '').slice(0, 300))
                    .filter(Boolean)
                  const debugText = String(forwardItem?.text || item?.text || '')
                  console.log('[codex-main] stream tool item:', {
                    eventType: ev.type,
                    itemType: item?.type,
                    forwardType: forwardItem?.type,
                    itemId: item?.id,
                    callId: item?.call_id || forwardItem?.call_id,
                    status: item?.status || forwardItem?.status,
                    changesCount: Array.isArray(item?.changes)
                      ? item.changes.length
                      : (Array.isArray(forwardItem?.changes) ? forwardItem.changes.length : 0),
                    paths: debugPaths,
                    diffPreview: debugDiffPreview,
                    textPreview: debugText.slice(0, 300),
                  })
                  try {
                    safeSend(codexSessions.get(sessionId)?.event?.sender || event.sender, 'codex-agent-message', {
                      sessionId,
                      msg: {
                        type: 'system',
                        subtype: 'debug',
                        message: {
                          content: [{
                            type: 'text',
                            text: `[debug] file_change ev=${ev.type} itemId=${item?.id || ''} status=${item?.status || forwardItem?.status || ''} paths=${debugPaths.join(', ') || '(none)'} diff=${debugDiffPreview[0] ? debugDiffPreview[0].replace(/\n/g, '\\n') : '(none)'} text=${debugText ? debugText.slice(0, 160).replace(/\n/g, '\\n') : '(none)'}`,
                          }],
                        },
                      },
                    })
                  } catch (_) {}
                }
              }
              const sender = codexSessions.get(sessionId)?.event?.sender || event.sender
              safeSend(sender, 'codex-agent-message', { sessionId, msg: { type: ev.type, item: forwardItem } })
            }

            if (ev.type === 'turn.completed' || ev.type === 'task_complete') {
              turnCompletedSeen = true
              turnCompletedAt = Date.now()
              maybeSendDone()
            }

            if (ev.type === 'thread.error' || ev.type === 'turn.failed') {
              resultReceived = true
              const session = codexSessions.get(sessionId)
              if (session?.runId === runId) session.resultReceived = true
              const sender = session?.event?.sender || event.sender
              safeSend(sender, 'codex-agent-message', {
                sessionId,
                msg: { type: 'system', subtype: 'error', message: { content: [{ type: 'text', text: lt('codex.error', { error: ev.message || ev.error?.message || '' }) }] } },
              })
            }

            // ---- CodeX 二进制 compact（压缩）事件处理 ----
            // 当 model_auto_compact_token_limit 触发时，binary 会通过 JSONL 输出这些事件
            // compaction_trigger: 压缩即将开始
            if (ev.type === 'compaction_trigger') {
              if (CODEX_DEBUG) console.log('[codex-main] compaction_trigger:', JSON.stringify(ev).slice(0, 500))
              safeSend(codexSessions.get(sessionId)?.event?.sender || event.sender, 'codex-agent-message', {
                sessionId,
                msg: {
                  type: 'system',
                  subtype: 'compact_started',
                  message: { content: [{ type: 'text', text: lt('compacting') }] },
                },
              })
            }

            // compaction / context_compaction: 压缩完成
            if (ev.type === 'compaction' || ev.type === 'context_compaction' || ev.type === 'contextCompaction') {
              if (CODEX_DEBUG) console.log('[codex-main] compaction result:', JSON.stringify(ev).slice(0, 800))
              const preTokens = toPositiveNumber(
                ev.pre_compact_tokens, ev.preCompactTokens,
                ev.pre_compaction_tokens, ev.pre_compaction_input_tokens
              )
              const postTokens = toPositiveNumber(
                ev.post_compact_tokens, ev.postCompactTokens,
                ev.post_compaction_tokens, ev.compacted_tokens
              )
              const summary = ev.summary || ev.compact_summary || ev.compaction_summary || ''

              // 更新会话 compact 指标（后续 getCodexSessionMetrics 会用到）
              const csession = codexSessions.get(sessionId)
              if (csession) {
                csession._compactedAfter = postTokens
                csession._compactedBefore = preTokens
              }

              safeSend(codexSessions.get(sessionId)?.event?.sender || event.sender, 'codex-agent-message', {
                sessionId,
                msg: {
                  type: 'system',
                  subtype: 'compact_boundary',
                  compact_metadata: {
                    pre_compact_tokens: preTokens,
                    post_compact_tokens: postTokens,
                    compact_summary: summary,
                  },
                },
              })

              // 如果有摘要文本，也发送 compact_summary 消息
              if (summary) {
                safeSend(codexSessions.get(sessionId)?.event?.sender || event.sender, 'codex-agent-message', {
                  sessionId,
                  msg: {
                    type: 'system',
                    subtype: 'compact_summary',
                    message: { content: [{ type: 'text', text: String(summary) }] },
                  },
                })
              }
            }
          }

        } catch (err) {
          exitCode = -1
          const errMsg = err?.message || String(err)
          const canEmitTerminalSignals = shouldEmitCodexSessionTerminalSignals(codexSessions, sessionId, runId)

          // 用户主动中断不算错误
          if (err?.name === 'AbortError' || errMsg.includes('AbortError') || errMsg.includes('The operation was aborted')) {
            doneReason = resolveCodexDoneReasonFromError(err)
            resultReceived = true // 阻止发送错误消息
            if (canEmitTerminalSignals) {
              safeSend(event.sender, 'codex-agent-message', {
                sessionId,
                msg: { type: 'system', subtype: 'abort', message: { content: [{ type: 'text', text: lt('aborted') }] } },
              })
              const session = codexSessions.get(sessionId)
              sendMetrics(event.sender, {
                sessionId,
                model: model || '',
                durationMs: Math.max(0, Date.now() - (session?.startTime || Date.now())),
                thinking: false,
              })
            }
          }
          // SDK 找不到二进制时的错误，替换为更友好的提示
          else if (/Unable to locate Codex CLI/i.test(errMsg) || /Missing optional dependency/i.test(errMsg)) {
            doneReason = resolveCodexDoneReasonFromError(err)
            if (!resultReceived && canEmitTerminalSignals) {
              safeSend(event.sender, 'codex-agent-message', {
                sessionId,
                msg: { type: 'system', subtype: 'error', message: { content: [{ type: 'text', text: lt('noCodex') }] } },
              })
            }
          }
          else if (!resultReceived && canEmitTerminalSignals) {
            doneReason = resolveCodexDoneReasonFromError(err)
            safeSend(event.sender, 'codex-agent-message', {
              sessionId,
              msg: { type: 'system', subtype: 'error', message: { content: [{ type: 'text', text: lt('codex.error', { error: errMsg }) }] } },
            })
          }
        } finally {
          clearTimeout(bootWatch)
          clearTimeout(turnTimeout)
          if (drainTimer) { clearTimeout(drainTimer); drainTimer = null }
          // 停止 metrics 轮询器
          const poller = codexMetricsPollers.get(sessionId)
          if (poller?.runId === runId || (poller && !poller.runId)) {
            clearInterval(poller.interval)
            codexMetricsPollers.delete(sessionId)
          }
          // 同步清除 session 上存储的 timeout 引用（防御性清理）
          const finalized = finalizeCodexSessionDoneState({ resultReceived, doneReason })
          doneReason = finalized.doneReason
          closeCodexSessionRun(sessionState, { resultReceived, doneSent })

          const s = codexSessions.get(sessionId)
          if (s?.runId === runId) {
            closeCodexSessionRun(s, { resultReceived, doneSent })
          }
          slowNoticeSent.delete(sessionId)

          // 清理日志：记录退出时的状态，方便排查卡住原因
          if (finalized.shouldSendSilentFailureMessage) {
            console.error(`[codex] stream ended without turn.completed: sessionId=${sessionId} runId=${runId} cliId=${thread?.id || ''} pendingItems=${pendingItemIds.size}`)
          }
          console.log(`[codex] cleanup: sessionId=${sessionId} runId=${runId} resultReceived=${resultReceived} doneSent=${doneSent} turnTimedOut=${turnTimedOut} pendingItems=${pendingItemIds.size}`)

          // 确保 codex-agent-done 始终发送（drain timer 可能在 for 循环结束后
          // 被 finally 取消，且 resultReceived=true 时也不会走 if 分支）。
          // 前台 onAgentDone 负责记录 cliSessionId、注册 session 映射等关键收尾。
          const needDone = !doneSent
          const isCurrentRunAtCleanup = codexSessions.get(sessionId)?.runId === runId

          deleteCodexSessionRunIfCurrent(codexSessions, sessionId, runId)

          if (isCurrentRunAtCleanup && !resultReceived) {
            if (finalized.shouldSendSilentFailureMessage) {
              safeSend(event.sender, 'codex-agent-message', {
                sessionId,
                msg: { type: 'system', subtype: 'error', message: { content: [{ type: 'text', text: lt('codex.ended') }] } },
              })
            }
            const session = codexSessions.get(sessionId)
            sendMetrics(event.sender, {
              sessionId,
              model: model || '',
              durationMs: Math.max(0, Date.now() - (session?.startTime || Date.now())),
              thinking: false,
            })
          }

          // 统一发送 done（避免 drain timer 被清除后丢失）
          if (isCurrentRunAtCleanup && needDone) {
            const sfilePath = thread?.id ? path.join(SESSIONS_DIR, thread.id + '.jsonl') : ''
            if (CODEX_DEBUG) console.log('[Codex] agent-done (finally) → filePath:', sfilePath || '(empty)')
            safeSend(event.sender, 'codex-agent-done', buildCodexAgentDonePayload({
              sessionId,
              cliSessionId: thread?.id,
              filePath: sfilePath,
              reason: doneReason,
            }))
          }

          resolve({ accepted: true, exitCode })
        }
      })()
    })
  })

  ipcMain.handle('codex-agent-abort', async (_, sessionId) => {
    const s = codexSessions.get(sessionId)
    if (s) {
      try { s.abortController?.abort?.() } catch (_) {}
      if (s.__turnTimeout) { clearTimeout(s.__turnTimeout); s.__turnTimeout = null }
      if (s.__bootWatch) { clearTimeout(s.__bootWatch); s.__bootWatch = null }
      // 停止 metrics 轮询器
      const poller = codexMetricsPollers.get(sessionId)
      if (poller) {
        clearInterval(poller.interval)
        codexMetricsPollers.delete(sessionId)
      }
      // 额外尝试终止 thread（如果 SDK 暴露了 stop/cancel 方法）
      try {
        if (s.thread && typeof s.thread.cancel === 'function') await s.thread.cancel()
        else if (s.thread && typeof s.thread.stop === 'function') await s.thread.stop()
      } catch (_) {}
      codexSessions.delete(sessionId)
      // 发送 abort 系统消息，让前端显示"已中断"并立即停止 thinking 状态
      safeSend(s.event?.sender, 'codex-agent-message', {
        sessionId,
        msg: { type: 'system', subtype: 'abort', message: { content: [{ type: 'text', text: lt('aborted') }] } },
      })
      safeSend(s.event?.sender, 'codex-agent-done', buildCodexAgentDonePayload({
        sessionId,
        reason: 'aborted',
      }))
      // 发送 thinking=false 确保前端状态正确
      sendMetrics(s.event?.sender, {
        sessionId,
        model: s.model || '',
        durationMs: Math.max(0, Date.now() - (s.startTime || Date.now())),
        thinking: false,
      })
    }
  })

  ipcMain.handle('codex-register-cli-sessions', (_, map) => {
    for (const [sid, cliId] of Object.entries(map || {})) {
      if (cliId) cliSessionIds.set(sid, cliId)
    }
  })

  ipcMain.handle('codex-unregister-cli-session', (_, sessionId) => {
    if (sessionId) cliSessionIds.delete(sessionId)
  })

  ipcMain.handle('codex-list-sessions-by-cwd', (_, cwd) => {
    if (!cwd) return []
    return listSessionsByCwd(cwd)
  })

  ipcMain.handle('codex-delete-session-file', (_, { filePath }) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return false
      fs.unlinkSync(filePath)
      deleteSessionRecordsByProvider({ agent: 'codex', filePath })
      return true
    } catch (e) {
      console.warn('[codex-delete-session-file] failed:', e?.message || e)
      return false
    }
  })

  ipcMain.handle('codex-rename-session', async (_, { sessionId, title }) => {
    if (!sessionId || !title) return { success: false, error: 'missing sessionId or title' }
    try {
      // 在 SESSIONS_DIR 中找到对应 JSONL 文件
      const files = walkFiles(SESSIONS_DIR).filter(file => file.toLowerCase().endsWith('.jsonl'))
      let targetFile = null
      for (const file of files) {
        const summary = extractSessionSummary(file)
        if (summary && (summary.id === sessionId || summary.sessionId === sessionId)) {
          targetFile = file
          break
        }
      }
      if (!targetFile) return { success: false, error: 'session file not found' }
      // 追加 custom-title 行（与 Claude Code SDK 格式一致）
      const entry = JSON.stringify({
        type: 'custom-title',
        customTitle: String(title).trim(),
        sessionId,
        uuid: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
      }) + '\n'
      fs.appendFileSync(targetFile, entry, 'utf8')
      return { success: true }
    } catch (e) {
      console.error('[codex-rename-session] error:', e)
      return { success: false, error: e?.message || 'unknown' }
    }
  })

  ipcMain.handle('codex-read-session-file-range', (_, { filePath, page = 0, pageSize = 60 } = {}) => {
    if (!filePath || !String(filePath).toLowerCase().endsWith('.jsonl')) {
      return { messages: [], hasMore: false }
    }
    return readSessionFileRange(filePath, page, pageSize)
  })

  ipcMain.handle('codex-agent-query-metrics', (_, { sessionId, cliSessionId, filePath, model, cwd } = {}) => {
    if (filePath && String(filePath).toLowerCase().endsWith('.jsonl')) {
      return getCodexSessionMetricsByFile(filePath, model || '', cwd || '') || null
    }
    if (sessionId || cliSessionId) {
      return getCodexSessionMetrics(sessionId || cliSessionId, model || '', cwd || '') || null
    }
    return null
  })

  ipcMain.handle('codex-list-slash-commands', async (_, { cwd, sessionId } = {}) => {
    const resolvedCwd = path.resolve(cwd || process.cwd())
    const cacheKey = `${resolvedCwd}::${sessionId || ''}`
    const now = Date.now()
    const cached = codexSlashCommandsCache.get(cacheKey)
    // 默认命令：前端 /clear /new /model 均为应用本地命令，不通过 IPC 返回
    // IPC 只返回 SDK 级别的命令（如 /compact /init 等），由前端合并到本地命令后
    if (cached && (now - cached.ts) < 10 * 60 * 1000 && Array.isArray(cached.commands) && cached.commands.length) {
      return cached.commands
    }
    if (!sessionId) {
      return [] // 无会话时无 SDK 命令，前端使用本地命令
    }
    const runningSession = findCodexSessionForSlashCommands(codexSessions, cliSessionIds, sessionId)
    if (runningSession && !runningSession.streamClosed) {
      return (cached && Array.isArray(cached.commands)) ? cached.commands : []
    }

    try {
      const { Codex } = await loadCodexSdk()
      const rt = readRuntimeConfig()
      const codex = new Codex({
        codexPathOverride: findGlobalCodexPath(),
        ...(rt.apiKey ? { apiKey: rt.apiKey } : {}),
        ...(rt.baseURL ? { baseUrl: rt.baseURL } : {}),
        env: augmentEnvWithBundledRg({
          ...process.env,
          ...(rt.apiKey ? { OPENAI_API_KEY: rt.apiKey } : {}),
          ...(rt.baseURL ? { OPENAI_BASE_URL: rt.baseURL } : {}),
        }),
      })
      let thread = null
      if (sessionId) {
        try {
          thread = codex.resumeThread(sessionId, { workingDirectory: resolvedCwd, skipGitRepoCheck: true })
        } catch (_) {
          thread = null
        }
      }
      if (!thread) return [] // 无法恢复会话，无 SDK 命令

      // Prefer structured command listing; it's stable even when finalResponse is empty.
      let structured = []
      try {
        structured = await thread.query.supportedCommands()
      } catch (_) {}
      const normalized = (structured || []).map(c => ({
        name: c?.name || '',
        description: c?.description || '',
      })).filter(c => c.name)
      if (normalized.length) {
        codexSlashCommandsCache.set(cacheKey, { ts: now, commands: normalized })
        return normalized
      }

      return [] // 未获取到 SDK 命令
    } catch (e) {
      console.error('[codex-list-slash-commands]', e?.message || e)
      return [] // 出错时前端用本地命令
    }
  })

  ipcMain.handle('codex-list-local-skills', async (_, { cwd } = {}) => {
    try {
      const hasProjectCwd = !!String(cwd || '').trim()
      const dirs = {
        system: path.join(os.homedir(), '.codex', 'skills'),
        project: hasProjectCwd ? path.join(path.resolve(cwd), '.codex', 'skills') : '',
      }
      const collect = (baseDir, scope) => {
        const out = []
        if (!fs.existsSync(baseDir)) return out
        const entries = fs.readdirSync(baseDir, { withFileTypes: true })
        for (const e of entries) {
          if (!e.isDirectory()) continue
          const skillDir = path.join(baseDir, e.name)
          const md = path.join(skillDir, 'SKILL.md')
          if (!fs.existsSync(md)) continue
          out.push({
            name: e.name,
            description: readFirstLine(md) || `本地 Skill（${scope}）`,
            scope,
            path: skillDir,
          })
        }
        return out
      }
      return {
        system: collect(dirs.system, '系统级'),
        project: collect(dirs.project, '项目级'),
      }
    } catch (_) {
      return { system: [], project: [] }
    }
  })

  // ─── Skills 市场与管理 ──────────────────────────────────────────
  ipcMain.handle('codex-skills-get-catalog', async () => {
    const catalog = await codexFetchSkillsFromAPI()
    return { skills: catalog.skills || [], version: catalog.version }
  })

  ipcMain.handle('codex-skills-get-state', async (_, { cwd }) => {
    try {
      const catalog = await codexFetchSkillsFromAPI()

      const systemDir = path.join(os.homedir(), '.codex', 'skills')
      const projectDir = String(cwd || '').trim() ? path.join(path.resolve(cwd), '.codex', 'skills') : ''
      const installed = codexScanSkillsDirs(systemDir, projectDir)

      const skills = (catalog.skills || []).map(s => {
        const inst = installed.get(s.name)
        return {
          ...s,
          installed: !!inst,
          scope: inst ? inst.scope : null,
          installPath: inst ? inst.path : null,
          _busy: false,
        }
      })

      for (const [name, info] of installed) {
        if (!skills.find(s => s.name === name)) {
          skills.push({
            name,
            displayName: name,
            description: info.description || '本地安装的 Skill',
            author: 'local',
            category: 'unknown',
            tags: [],
            sourceUrl: '',
            gitUrl: '',
            subPath: '',
            installed: true,
            scope: info.scope,
            installPath: info.path,
            _busy: false,
          })
        }
      }

      _codexSkillsStateCache = { skills, version: catalog.version }
      return _codexSkillsStateCache
    } catch (e) {
      console.error('[codex-skills-get-state]', e?.message)
      return _codexSkillsStateCache || { skills: [], version: '0' }
    }
  })

  // ─── Git 镜像 + 异步 clone（Skill 安装用）────────────────
  function getGitMirrorUrl() {
    try {
      // 优先从 claude-internal.json 读取（T118 迁移后）
      try {
        const conf = new Conf({ name: 'claude-internal' })
        const val = conf.get('gitMirrorUrl', '')
        if (val) return val
      } catch (_) {}
      // 兜底：从 ~/.claude/settings.json 读取（迁移前或迁移失败）
      const settingsPath = require('path').join(require('os').homedir(), '.claude', 'settings.json')
      if (require('fs').existsSync(settingsPath)) {
        const s = JSON.parse(require('fs').readFileSync(settingsPath, 'utf8'))
        return s.gitMirrorUrl || ''
      }
    } catch (_) {}
    return ''
  }

  async function resolveCodexCatalogSkillSource(skillName) {
    const catalog = await codexFetchSkillsFromAPI()
    let item = (catalog.skills || []).find(s => s.name === skillName)
    if (!item) {
      const searchCatalog = await codexFetchSkillsFromAPI({ search: skillName, limit: 30 })
      item = (searchCatalog.skills || []).find(s => s.name === skillName)
    }
    if (!item?.gitUrl) throw new Error(lt('skill.noSource'))
    return normalizeGithubSkillSource(item.gitUrl, item.subPath || '')
  }

  ipcMain.handle('codex-skills-install', async (event, { skillName, scope, cwd, gitUrl, subPath }) => {
    try {
      const target = resolveSkillTargetDir({ agentName: 'codex', scope, cwd, skillName })
      const source = await resolveCodexCatalogSkillSource(target.skillName)

      const sender = event.sender
      const tmpDir = safeTempDir('codex-skill', target.skillName)
      try {
        await cloneSkillRepoWithFallback({ originalUrl: source.gitUrl, targetDir: tmpDir, sender, mirrorUrl: getGitMirrorUrl() })
        const sourceDir = resolveRelativeSourceDir(tmpDir, source.subPath)
        if (!fs.existsSync(sourceDir)) {
          return { ok: false, error: lt('skill.noSourceDir', { path: source.subPath || '/' }) }
        }
        copySkillDirAtomic(sourceDir, target.targetDir, target.skillName)
        fs.rmSync(tmpDir, { recursive: true, force: true })

        _codexSkillsStateCache = null
        _codexSkillsFetchCache = null
        return { ok: true, path: target.targetDir, scope: target.scope }
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        const msg = e?.stderr ? String(e.stderr).slice(0, 300) : (e?.message || String(e))
        if (msg.includes('command not found') || msg.includes('not recognized') || msg.includes('ENOENT')) {
          return { ok: false, error: lt('skill.noGit') }
        }
        return { ok: false, error: msg }
      }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('codex-skills-uninstall', async (_, { skillName, scope, cwd }) => {
    try {
      const target = resolveSkillTargetDir({ agentName: 'codex', scope, cwd, skillName })

      if (fs.existsSync(target.targetDir)) {
        fs.rmSync(target.targetDir, { recursive: true, force: true })
      }
      _codexSkillsStateCache = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // 社区市场搜索已改为 renderer 直连 API，不再需要 IPC handler

  ipcMain.handle('codex-skills-market-install', async (event, { skillName, scope, cwd, gitUrl }) => {
    try {
      const target = resolveSkillTargetDir({ agentName: 'codex', scope, cwd, skillName })
      const source = await resolveCodexCatalogSkillSource(target.skillName)

      const tmpDir = safeTempDir('codex-skill-mkt', target.skillName)
      const sender = event.sender
      try {
        await cloneSkillRepoWithFallback({ originalUrl: source.gitUrl, targetDir: tmpDir, sender, mirrorUrl: getGitMirrorUrl() })

        // 查找 SKILL.md 子目录
        const walk = (dir, depth = 0) => {
          if (depth > 3) return null
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const e of entries) {
              if (e.name === 'SKILL.md' && depth > 0) return dir
              if (e.isDirectory() && !e.name.startsWith('.')) {
                const found = walk(path.join(dir, e.name), depth + 1)
                if (found) return found
              }
            }
          } catch (_) {}
          return null
        }
        let sourceDir = walk(tmpDir, 0) || tmpDir

        copySkillDirAtomic(sourceDir, target.targetDir, target.skillName)
        fs.rmSync(tmpDir, { recursive: true, force: true })

        _codexSkillsStateCache = null
        return { ok: true, path: target.targetDir, scope: target.scope }
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        throw e
      }
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg.includes('command not found') || msg.includes('not recognized') || msg.includes('ENOENT') || msg.includes('git')) {
        return { ok: false, error: lt('skill.noGit') }
      }
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('codex-get-key', () => {
    const rt = readRuntimeConfig()
    return rt.apiKey || ''
  })
  ipcMain.handle('codex-set-key', (_, key) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.apiKey = key; c.set('runtime', r) } catch (_) {}
    return true
  })
  ipcMain.handle('codex-get-base-url', () => {
    const rt = readRuntimeConfig()
    return rt.baseURL || ''
  })
  ipcMain.handle('codex-set-base-url', (_, url) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.baseURL = url; c.set('runtime', r) } catch (_) {}
    return true
  })
  ipcMain.handle('codex-get-model', () => {
    const rt = readRuntimeConfig()
    return rt.model || ''
  })
  ipcMain.handle('codex-set-model', (_, model) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); const r = c.get('runtime') || {}; r.model = model; c.set('runtime', r) } catch (_) {}
    return true
  })
  ipcMain.handle('codex-get-reasoning-effort', () => {
    const rt = readRuntimeConfig()
    return rt.reasoningEffort || ''
  })
  ipcMain.handle('codex-set-reasoning-effort', (_, effort) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' })
      const r = c.get('runtime') || {}
      r.reasoningEffort = normalizeCodexReasoningEffort(effort)
      c.set('runtime', r)
    } catch (_) {}
    return true
  })

  // 从 mindcraft-electron 导入 Codex 配置（手动触发）
  // 注意：~/.codex/config.toml 是共享文件，两个 App 天然互通；仅 electron-conf 覆盖需要导入
  ipcMain.handle('codex-import-legacy-config', (_, customPath) => {
    const imported = { key: false, url: false, model: false, reasoningEffort: false }
    try {
      const legacyDir = customPath || findLegacyUserData()
      if (!legacyDir) return { notFound: true }

      const codexPath = path.join(legacyDir, 'mindcraft-codex.json')
      if (!fs.existsSync(codexPath)) {
        return { success: true, imported }
      }

      let legacy = {}
      try { legacy = JSON.parse(fs.readFileSync(codexPath, 'utf8')) } catch {
        return { success: true, imported }
      }

      const rt = legacy.runtime || {}
      const mergeRuntime = (key, val, flag) => {
        if (!val) return
        try {
          const c = new Conf({ name: 'mindcraft-codex' })
          const r = c.get('runtime') || {}
          r[key] = val
          c.set('runtime', r)
          imported[flag] = true
        } catch (_) {}
      }
      mergeRuntime('apiKey', rt.apiKey, 'key')
      mergeRuntime('baseURL', rt.baseURL, 'url')
      mergeRuntime('model', rt.model, 'model')
      mergeRuntime('reasoningEffort', rt.reasoningEffort, 'reasoningEffort')

      return { success: true, imported }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('codex-get-sandbox-mode', () => readSandboxMode())
  ipcMain.handle('codex-set-sandbox-mode', (_, mode) => {
    try {
      const c = new Conf({ name: 'mindcraft-codex' })
      if (mode && CODEX_SANDBOX_MODES.includes(mode)) {
        c.set('sandboxMode', mode)
      }
    } catch (_) {}
    return true
  })

  /** 读取 per-cwd 项目设置 */
  ipcMain.handle('codex-get-project-settings', (_, { cwd }) => {
    try {
      const conf = new Conf({ name: 'mindcraft-codex' })
      const all = conf.get('projectSettings') || {}
      return all[cwd] || null
    } catch (_) { return null }
  })
  /** 写入 per-cwd 项目设置 */
  ipcMain.handle('codex-set-project-settings', (_, { cwd, settings }) => {
    try {
      const conf = new Conf({ name: 'mindcraft-codex' })
      const all = conf.get('projectSettings') || {}
      if (settings) {
        all[cwd] = { ...(all[cwd] || {}), ...settings }
      } else {
        delete all[cwd]
      }
      conf.set('projectSettings', all)
      return true
    } catch (_) { return false }
  })

  /** 读写全局默认值：networkAccess / webSearch */
  ipcMain.handle('codex-get-default-network-access', () => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); return c.get('defaultNetworkAccess', true) } catch (_) { return true }
  })
  ipcMain.handle('codex-set-default-network-access', (_, val) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); c.set('defaultNetworkAccess', !!val) } catch (_) {}
    return true
  })
  ipcMain.handle('codex-get-default-web-search', () => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); return c.get('defaultWebSearch', 'cached') } catch (_) { return 'cached' }
  })
  ipcMain.handle('codex-set-default-web-search', (_, val) => {
    try { const c = new Conf({ name: 'mindcraft-codex' }); c.set('defaultWebSearch', val || 'cached') } catch (_) {}
    return true
  })

  ipcMain.handle('codex-check-environment', async () => {
    const result = { node: null, npm: null, codex: null }
    try {
      const ver = (await new Promise((resolve, reject) => {
        exec('node --version', { encoding: 'utf8', timeout: 5000, windowsHide: true }, (err, stdout) => {
          if (err) reject(err); else resolve(stdout)
        })
      })).trim()
      result.node = { installed: true, version: ver }
    } catch (_) { result.node = { installed: false, version: null } }
    try {
      const ver = (await new Promise((resolve, reject) => {
        exec('npm --version', { encoding: 'utf8', timeout: 5000, windowsHide: true }, (err, stdout) => {
          if (err) reject(err); else resolve(stdout)
        })
      })).trim()
      result.npm = { installed: true, version: ver }
    } catch (_) { result.npm = { installed: false, version: null } }
    try {
      const { Codex } = await loadCodexSdk()
      // 尝试创建一个不传路径的 Codex 实例来检测 SDK 能否找到二进制
      const c = new Codex({ codexPathOverride: findGlobalCodexPath() })
      const codexPath = c.exec?.executablePath || null
      // 获取已安装版本号：优先 npm list，失败再试 --version
      let codexVersion = null
      try {
        const output = await new Promise((resolve, reject) => {
          exec('npm list -g @openai/codex --depth=0', { encoding: 'utf8', timeout: 10000, windowsHide: true }, (err, stdout) => {
            if (err) reject(err)
            else resolve(stdout)
          })
        })
        const match = output.match(/@openai\/codex@(\S+)/)
        if (match) codexVersion = match[1]
      } catch (_) {}
      if (!codexVersion && codexPath) {
        try {
          const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)
          const cmd = isCmdShim ? 'cmd.exe' : codexPath
          const args = isCmdShim ? ['/c', codexPath, '--version'] : ['--version']
          codexVersion = (await new Promise((resolve, reject) => {
            execFile(cmd, args, {
              encoding: 'utf8', timeout: 5000, windowsHide: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            }, (err, stdout) => {
              if (err) reject(err); else resolve(stdout)
            })
          })).trim()
        } catch (_) {}
      }
      result.codex = { installed: !!codexPath, path: codexPath, version: codexVersion }
    } catch (_) { result.codex = { installed: false, path: null, version: null } }
    return result
  })

  ipcMain.handle('codex-check-latest-version', async () => {
    try {
      const https = require('https')
      return new Promise((resolve) => {
        https.get('https://registry.npmmirror.com/@openai/codex/latest', (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              resolve({ ok: true, version: json.version || null })
            } catch {
              resolve({ ok: false, error: lt('claude.parseFailed') })
            }
          })
        }).on('error', (e) => {
          resolve({ ok: false, error: e?.message || String(e) })
        })
      })
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('codex-install-codex', async () => {
    if (installingCodex) return { success: false, message: lt('install.inProgress') }
    installingCodex = true
    try {
      try { execSync('taskkill /IM codex.exe /F', { encoding: 'utf8', timeout: 5000, windowsHide: true }) } catch (_) {}
      await new Promise((resolve, reject) => {
        exec('npm install -g @openai/codex', { encoding: 'utf8', timeout: 180000, stdio: 'pipe', windowsHide: true }, (err, stdout, stderr) => {
          if (err) reject(Object.assign(err, { stdout, stderr }))
          else resolve(stdout)
        })
      })
      // 清除 SDK 的 require 缓存，让下次检测重新解析
      Object.keys(require.cache).forEach((k) => {
        if (k.includes('codex-sdk')) delete require.cache[k]
      })
      codexModulePromise = null
      return { success: true }
    } catch (e) {
      return { success: false, message: e?.stderr || e?.message || String(e) }
    } finally {
      installingCodex = false
    }
  })

  ipcMain.handle('codex-select-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // 面板状态持久化：MindCraft 自有 UI 状态写入 userData；旧 ~/.codex 文件只作为迁移 fallback。
  const { primary: PANEL_STATE_FILE, legacy: LEGACY_PANEL_STATE_FILE } = getCodexPanelStatePaths()
  const AUTH_JSON_FILE = path.join(CODEX_CONFIG_DIR, 'auth.json')
  const DEFAULT_PANEL_STATE = { lastCwd: '', projects: [] }

  function normalizePanelState(parsed) {
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PANEL_STATE }
    const projects = Array.isArray(parsed.projects) ? parsed.projects.map(project => ({
      ...project,
      chats: Array.isArray(project?.chats) ? project.chats.map(chat => ({
        ...chat,
        messages: chat?.filePath ? [] : (Array.isArray(chat?.messages) ? chat.messages : []),
      })) : [],
    })) : []
    return {
      lastCwd: typeof parsed.lastCwd === 'string' ? parsed.lastCwd : '',
      projects,
    }
  }

  function readPanelState() {
    for (const candidate of getCodexPanelStateReadCandidates()) {
      try {
        if (!fs.existsSync(candidate)) continue
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        if (!parsed || typeof parsed !== 'object') continue
        const normalized = normalizePanelState(parsed)
        if (candidate === LEGACY_PANEL_STATE_FILE && !fs.existsSync(PANEL_STATE_FILE)) {
          writePanelState(normalized)
        }
        return normalized
      } catch (e) {
        console.warn('[codex] readPanelState failed:', e?.message || e, 'file=', candidate)
      }
    }
    return { ...DEFAULT_PANEL_STATE }
  }
  function writePanelState(payload) {
    try {
      const dir = path.dirname(PANEL_STATE_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmp = `${PANEL_STATE_FILE}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
      fs.renameSync(tmp, PANEL_STATE_FILE)
      syncPanelStateSessions('codex', payload)
    } catch (e) {
      console.warn('[codex] writePanelState failed:', e?.message || e, 'file=', PANEL_STATE_FILE)
    }
  }
  ipcMain.handle('codex-load-code-panel-state', () => readPanelState())
  ipcMain.handle('codex-save-code-panel-state', (_, payload) => { writePanelState(payload); return true })
  ipcMain.on('codex-save-code-panel-state-sync', (event, payload) => {
    writePanelState(payload)
    event.returnValue = true
  })

  // Codex 配置管理
  const PROVIDERS_FILE = path.join(CODEX_CONFIG_DIR, 'providers.json')
  function readProviders() {
    try {
      if (!fs.existsSync(PROVIDERS_FILE)) return null
      return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'))
    } catch (_) { return null }
  }
  function writeProviders(data) {
    try {
      if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
      const tmp = `${PROVIDERS_FILE}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
      fs.renameSync(tmp, PROVIDERS_FILE)
    } catch (_) {}
  }

  ipcMain.handle('codex-get-providers', () => readProviders())
  ipcMain.handle('codex-set-providers', (_, data) => { writeProviders(data); return true })

  ipcMain.handle('codex-write-auth-json', (_, obj) => {
    try {
      if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
      fs.writeFileSync(AUTH_JSON_FILE, JSON.stringify(obj, null, 2), 'utf8')
      return { ok: true }
    } catch (e) { return { ok: false, message: e.message } }
  })

  ipcMain.handle('codex-read-config-toml', () => {
    try {
      if (fs.existsSync(CONFIG_TOML_FILE)) return fs.readFileSync(CONFIG_TOML_FILE, 'utf8')
      return ''
    } catch (_) { return '' }
  })

  function appendPreservedCodexConfigSections(content, existing) {
    let finalContent = content || ''
    const preserved = []
    let inPreserve = false
    for (const line of String(existing || '').split('\n')) {
      const trimmed = line.trim()
      if (/^\[plugins\./.test(trimmed) || /^\[marketplaces\./.test(trimmed)) {
        inPreserve = true
      } else if (inPreserve && /^\[/.test(trimmed) && !/^\[plugins\./.test(trimmed) && !/^\[marketplaces\./.test(trimmed)) {
        inPreserve = false
      }
      if (inPreserve) preserved.push(line)
    }
    const preserveBlock = preserved.join('\n').trim()
    if (!preserveBlock) return finalContent

    const normalizeNewlines = (value) => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (!normalizeNewlines(finalContent).includes(normalizeNewlines(preserveBlock))) {
      finalContent = finalContent.trimEnd() + '\n\n' + preserveBlock + '\n'
    }
    return finalContent
  }

  ipcMain.handle('codex-write-config-toml', (_, content) => {
    try {
      if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
      // 保留现有文件中的 plugin/marketplace 段，防止模型配置保存时覆盖插件信息
      let finalContent = content || ''
      if (fs.existsSync(CONFIG_TOML_FILE)) {
        const existing = fs.readFileSync(CONFIG_TOML_FILE, 'utf8')
        finalContent = appendPreservedCodexConfigSections(finalContent, existing)
      }
      fs.writeFileSync(CONFIG_TOML_FILE, finalContent, 'utf8')
      return { ok: true }
    } catch (e) { return { ok: false, message: e.message } }
  })

  ipcMain.handle('codex-repair-config-toml', (_, content) => {
    try {
      if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
      const previous = fs.existsSync(CONFIG_TOML_FILE) ? fs.readFileSync(CONFIG_TOML_FILE, 'utf8') : ''
      let finalContent = content || ''
      if (fs.existsSync(CONFIG_TOML_FILE)) {
        const existing = fs.readFileSync(CONFIG_TOML_FILE, 'utf8')
        finalContent = appendPreservedCodexConfigSections(finalContent, existing)
      }
      if (previous === finalContent) return { ok: true, changed: false, backupPath: '' }
      let backupPath = ''
      if (previous) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
        backupPath = path.join(CODEX_CONFIG_DIR, `config.toml.mindcraft-bak-${stamp}`)
        fs.copyFileSync(CONFIG_TOML_FILE, backupPath)
      }
      fs.writeFileSync(CONFIG_TOML_FILE, finalContent, 'utf8')
      return { ok: true, changed: true, backupPath }
    } catch (e) { return { ok: false, message: e.message } }
  })

  ipcMain.handle('codex-get-last-cwd', () => readPanelState()?.lastCwd || '')

  // 验证 API Key
  ipcMain.handle('codex-validate-key', async (_, { key, baseURL, model: _model }) => {
    const start = Date.now()
    try {
      const fetchUrl = `${baseURL.replace(/\/$/, '')}/models`
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })
      const elapsed = Date.now() - start
      if (res.ok) {
        return { valid: true, elapsed }
      }
      const body = await res.text().catch(() => '')
      return { valid: false, elapsed, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    } catch (e) {
      return { valid: false, elapsed: Date.now() - start, error: e.message }
    }
  })

  // 获取 API 端点支持的模型列表
  ipcMain.handle('codex-list-available-models', async () => {
    try {
      const rt = readRuntimeConfig()
      if (!rt.apiKey || !rt.baseURL) return { models: [], error: lt('noApiKey') }
      const fetchUrl = `${rt.baseURL.replace(/\/$/, '')}/models`
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${rt.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return { models: [], error: `HTTP ${res.status}` }
      const body = await res.json()
      const models = (body.data || []).map(m => ({ id: m.id, owned_by: m.owned_by || '' }))
      return { models, error: null }
    } catch (e) {
      return { models: [], error: e.message }
    }
  })

  // ── git diff 命令（供前端 /diff 和 /review 使用）──
  ipcMain.handle('codex-run-git-diff', async (_, { cwd } = {}) => {
    const resolvedCwd = path.resolve(cwd || process.cwd())
    try {
      const { execSync } = require('child_process')
      // 检查是否在 git 仓库内
      try {
        execSync('git rev-parse --is-inside-work-tree', { cwd: resolvedCwd, timeout: 5000, stdio: 'pipe' })
      } catch (_) {
        return { isGitRepo: false, diff: '' }
      }
      // 已跟踪文件的 diff（无颜色，HTML 无法渲染 ANSI escape codes）
      let tracked = ''
      try {
        tracked = execSync('git diff', { cwd: resolvedCwd, timeout: 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (e) {
        // git diff 返回 1 表示有差异（正常情况）
        if (e.stdout) tracked = typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8')
      }
      // 未跟踪文件列表
      let untrackedFiles = ''
      try {
        untrackedFiles = execSync('git ls-files --others --exclude-standard', { cwd: resolvedCwd, timeout: 5000, encoding: 'utf8', stdio: 'pipe' })
      } catch (_) {}
      let untrackedDiff = ''
      if (untrackedFiles.trim()) {
        const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
        for (const file of untrackedFiles.split('\n').map(s => s.trim()).filter(Boolean)) {
          try {
            const d = execSync(`git diff --no-index -- ${nullDevice} "${file}"`, { cwd: resolvedCwd, timeout: 10000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
            untrackedDiff += d
          } catch (e) {
            if (e.stdout) untrackedDiff += typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8')
          }
        }
      }
      return { isGitRepo: true, diff: (tracked + untrackedDiff).trim() }
    } catch (e) {
      return { isGitRepo: false, diff: '', error: e.message }
    }
  })

  // ─── CodeX 插件管理 ──────────────────────────────────────────
  const CODEX_PLUGINS_MARKET_DIR = path.join(CODEX_CONFIG_DIR, '.tmp', 'plugins')
  const CODEX_PLUGIN_CACHE_DIR = path.join(CODEX_CONFIG_DIR, 'plugins', 'cache')
  const CODEX_CONFIG_TOML = path.join(CODEX_CONFIG_DIR, 'config.toml')

  function codexReadMarketplacePlugins() {
    const marketplacePath = path.join(CODEX_PLUGINS_MARKET_DIR, '.agents', 'plugins', 'marketplace.json')
    const plugins = []
    try {
      if (!fs.existsSync(marketplacePath)) return []
      const j = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'))
      for (const entry of (j.plugins || [])) {
        const pluginDir = path.join(CODEX_PLUGINS_MARKET_DIR, 'plugins', entry.name)
        const metaPath = path.join(pluginDir, '.codex-plugin', 'plugin.json')
        let meta = {}
        try {
          if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        } catch (_) {}
        plugins.push({
          id: `${entry.name}@${j.name}`,
          name: meta.name || entry.name,
          description: meta.description || '',
          author: (meta.author?.name || meta.author) || (meta.interface?.developerName) || j.name,
          market: j.name,
          category: entry.category || '',
          installed: false,
          enabled: false,
          displayName: meta.interface?.displayName || meta.name || '',
          brandColor: meta.interface?.brandColor || '',
        })
      }
    } catch (_) {}
    return plugins
  }

  /** 执行 codex CLI 命令，自动处理 Windows .cmd/.bat shim */
  function execCodexCli(args, opts = {}) {
    const codexPath = findGlobalCodexPath()
    if (!codexPath) throw new Error('codex not found')
    const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath)
    const cmd = isCmdShim ? 'cmd.exe' : codexPath
    const cmdArgs = isCmdShim ? ['/c', codexPath, ...args] : args
    const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    console.log('[codex] CLI:', args.join(' '), '→', (out || '').trim().slice(0, 200) || '(empty)')
    return out
  }

  // 模块级缓存：CLI 偶发超时/失败时兜底，避免已安装插件全部显示为"未安装"
  let _codexInstalledPluginsCache = null

  // ─── Skills 管理 ───────────────────────────────────────────────
  let _codexSkillsStateCache = null
  let _codexSkillsFetchCache = null

  const CODX_SKILLS_API = 'https://www.agentskills.in/api/skills'

  function codexMapAPISkill(s) {
    return {
      name: s.name, displayName: s.name, description: s.description || '',
      author: s.author || '', category: '', tags: [],
      sourceUrl: `https://skills.sh?q=${encodeURIComponent(s.name)}`,
      gitUrl: s.githubUrl || '',
      subPath: s.path ? s.path.replace(/\/SKILL\.md$/i, '') : '',
      installs: s.stars || 0,
    }
  }

  async function codexFetchSkillsFromAPI(opts = {}) {
    const isDefaultCatalog = !opts.page && !opts.search
    if (isDefaultCatalog && _codexSkillsFetchCache) return _codexSkillsFetchCache
    try {
      const params = new URLSearchParams({ limit: String(opts.limit || 100), sortBy: 'stars' })
      if (opts.page) params.set('page', String(opts.page))
      if (opts.search) params.set('search', String(opts.search))
      const resp = await fetch(`${CODX_SKILLS_API}?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const catalog = { version: '1', skills: (data.skills || []).map(codexMapAPISkill) }
      if (isDefaultCatalog) {
        _codexSkillsFetchCache = catalog
        writeSkillsCatalogCache('codex', catalog)
      }
      return catalog
    } catch (_) {
      const cachedCatalog = readSkillsCatalogCache('codex')
      const fallback = filterSkillsCatalog(cachedCatalog, opts)
      if (fallback.skills.length) {
        return fallback
      }
      return { version: '0', skills: [] }
    }
  }

  function codexScanSkillsDirs(systemDir, projectDir) {
    const installed = new Map()
    const readFirstMdLine = (dirPath) => {
      try {
        const files = fs.readdirSync(dirPath)
        const md = files.find(n => n.toLowerCase() === 'skill.md')
        if (!md) return ''
        const content = fs.readFileSync(path.join(dirPath, md), 'utf8')
        const lines = content.split(/\r?\n/)
        for (const ln of lines) {
          const t = ln.trim()
          if (!t || t.startsWith('#')) continue
          return t.slice(0, 80)
        }
      } catch (_) {}
      return ''
    }
    const scan = (baseDir, scope) => {
      try {
        if (!fs.existsSync(baseDir)) return
        const entries = fs.readdirSync(baseDir, { withFileTypes: true })
        for (const e of entries) {
          if (e.isDirectory()) {
            installed.set(e.name, {
              scope,
              path: path.join(baseDir, e.name),
              description: readFirstMdLine(path.join(baseDir, e.name)),
            })
          }
        }
      } catch (_) {}
    }
    scan(systemDir, 'system')
    scan(projectDir, 'project')
    return installed
  }

  function codexReadInstalledPlugins() {
    const installed = []
    try {
      const out = execCodexCli(['plugin', 'list'], { timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })
      // 解析表格输出，格式：PLUGIN_ID    STATUS    ...
      // STATUS 列可能包含 "not installed"、"installed"、"enabled" 等词
      for (const line of out.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('PLUGIN') || trimmed.startsWith('Marketplace')) continue
        const parts = trimmed.split(/\s{2,}/)
        const id = parts[0] || ''
        if (!id || !id.includes('@')) continue
        // 合并所有状态列，用词边界匹配避免 "not installed" 被误判
        const allStatus = parts.slice(1).join(' ')
        installed.push({
          id,
          installed: /\binstalled\b/.test(allStatus) && !/\bnot\s+installed\b/i.test(allStatus),
          enabled: /\benabled\b/.test(allStatus),
        })
      }
      _codexInstalledPluginsCache = installed  // 成功时更新缓存
      return installed
    } catch (_) {
      // CLI 失败时用缓存兜底，避免返回 [] 导致全部显示为"未安装"
      return _codexInstalledPluginsCache || []
    }
  }

  ipcMain.handle('codex-plugins-get-state', async () => {
    const plugins = codexReadMarketplacePlugins()
    const installed = codexReadInstalledPlugins()
    const installedMap = new Map(installed.map(p => [p.id, p]))
    for (const p of plugins) {
      const match = installedMap.get(p.id)
      p.installed = match ? match.installed : false
      p.enabled = match ? match.enabled : false
    }
    return { plugins, marketplaces: [{ id: 'openai-curated', url: 'https://github.com/openai/plugins' }] }
  })

  ipcMain.handle('codex-plugins-install', async (_, pluginId) => {
    try {
      execCodexCli(['plugin', 'add', pluginId])
      _codexInstalledPluginsCache = null // 安装后清缓存
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[codex] plugin install failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  ipcMain.handle('codex-plugins-uninstall', async (_, pluginId) => {
    try {
      execCodexCli(['plugin', 'remove', pluginId])
      _codexInstalledPluginsCache = null
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[codex] plugin uninstall failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  // CodeX 没有独立的 enable/disable 命令，用 add/remove 代替
  ipcMain.handle('codex-plugins-enable', async (_, pluginId) => {
    try {
      execCodexCli(['plugin', 'add', pluginId])
      _codexInstalledPluginsCache = null
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[codex] plugin enable failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  ipcMain.handle('codex-plugins-disable', async (_, pluginId) => {
    try {
      execCodexCli(['plugin', 'remove', pluginId])
      _codexInstalledPluginsCache = null
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[codex] plugin disable failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  // ── 简易对话：CodeX (OpenAI Responses API) streaming ──
  // chatId -> AbortController（支持渲染进程主动中止）
  const activeChatAborts = new Map()

  /** 硬上限：防止第三方模型输出失控拖垮主进程 */
  const MAX_STREAM_CHUNKS = 5000
  const MAX_STREAM_CHARS = 100_000
  const MAX_THINKING_CHARS = 50_000 // thinking 内容上限 50K 字符（防止第三方 provider 发送过多 thinking）

  /** 将会话消息转成 Responses API input 格式 */
  function messagesToResponsesInput(messages) {
    if (!Array.isArray(messages)) return []
    const input = []
    for (const m of messages) {
      if (m.role === 'user') {
        // 多模态：Responses API content 块格式与 Chat Completions 略有不同
        if (Array.isArray(m.content)) {
          const blocks = m.content.map(b => {
            if (b.type === 'image_url' && b.image_url?.url) {
              return { type: 'input_image', image_url: b.image_url.url }
            }
            if (b.type === 'text') {
              return { type: 'input_text', text: b.text || '' }
            }
            return b
          })
          input.push({ role: 'user', content: blocks })
        } else {
          input.push({ role: 'user', content: m.content || '' })
        }
      } else if (m.role === 'system') {
        input.push({ role: 'system', content: m.content || '' })
      } else if (m.role === 'assistant') {
        // assistant content 可能是纯文本或数组
        let text = ''
        if (typeof m.content === 'string') {
          text = m.content
        } else if (Array.isArray(m.content)) {
          text = m.content.filter(c => c.type === 'text').map(c => c.text || '').join('')
        }
        input.push({ role: 'assistant', content: text })
        // assistant.tool_calls → Responses API 的 function_call items
        if (Array.isArray(m.tool_calls)) {
          for (const tc of m.tool_calls) {
            if (!tc.id) continue
            input.push({
              type: 'function_call',
              id: tc.id,
              call_id: tc.id,
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            })
          }
        }
      } else if (m.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: m.tool_call_id || '',
          output: m.content || '',
        })
      }
    }
    return input
  }

  async function runCodexChatStream(event, { chatId, messages, model, tools, max_tokens, reasoning }) {
    const rt = readRuntimeConfig()
    if (!rt.apiKey) throw new Error(lt('noApiKey'))

    const baseURL = rt.baseURL || 'https://api.openai.com/v1'
    const url = baseURL.replace(/\/+$/, '') + '/responses'

    const input = messagesToResponsesInput(messages)

    const body = {
      model: model || rt.model || 'gpt-4o',
      stream: true,
      input,
    }

    if (max_tokens) body.max_output_tokens = Math.min(max_tokens, 8192)
    if (reasoning) body.reasoning = reasoning
    if (tools && tools.length > 0) {
      // Chat Completions 工具定义（嵌套 function）→ Responses API 格式（扁平）
      body.tools = tools.map(t => {
        if (t.function) {
          return {
            type: t.type || 'function',
            name: t.function.name || '',
            description: t.function.description || '',
            parameters: t.function.parameters || {},
          }
        }
        return t
      })
    }

    const controller = new AbortController()
    if (chatId) activeChatAborts.set(chatId, controller)

    // 60s 整体超时（防止第三方 provider 挂起不返回）
    const timeoutSignal = AbortSignal.timeout(60_000)
    const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal])

    let fullText = ''
    let thinkingChars = 0
    const toolCalls = []
    let finishReason = null
    let chunkCount = 0

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${rt.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`OpenAI Responses API ${resp.status}: ${errText.slice(0, 300)}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          lineBuffer += decoder.decode(value, { stream: true })

          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue

            let json
            try { json = JSON.parse(data) } catch (_) { continue }

            chunkCount++
            if (chunkCount > MAX_STREAM_CHUNKS) {
              controller.abort()
              finishReason = 'max_chunks_exceeded'
              break
            }

            // Responses API 格式
            switch (json.type) {
              case 'response.output_text.delta':
                if (fullText.length < MAX_STREAM_CHARS) {
                  fullText += json.delta || ''
                  safeSend(event.sender, 'codex-stream-chunk', { chatId, text: json.delta || '' })
                }
                break

              case 'response.reasoning_text.delta':
                if (thinkingChars < MAX_THINKING_CHARS) {
                  thinkingChars += (json.delta || '').length
                  safeSend(event.sender, 'codex-stream-thinking', { chatId, text: json.delta || '' })
                }
                break

              case 'response.reasoning_summary_text.delta':
                if (thinkingChars < MAX_THINKING_CHARS) {
                  thinkingChars += (json.delta || '').length
                  safeSend(event.sender, 'codex-stream-thinking', { chatId, text: json.delta || '' })
                }
                break

              case 'response.output_item.added':
                if (json.item?.type === 'function_call') {
                  const item = json.item
                  const idx = toolCalls.length
                  toolCalls.push({
                    id: item.id || '',
                    type: 'function',
                    function: { name: item.name || '', arguments: '' },
                  })
                  safeSend(event.sender, 'codex-stream-tool-delta', {
                    chatId, index: idx, id: item.id || '', name: item.name || '', arguments: '',
                  })
                }
                break

              case 'response.output_item.done':
                if (json.item?.type === 'function_call') {
                  const item = json.item
                  const matchId = item.id || item.call_id || ''
                  const idx = toolCalls.findIndex(tc => tc.id === matchId)
                  if (idx >= 0) {
                    toolCalls[idx].function.arguments = item.arguments || ''
                  }
                }
                break

              case 'response.completed':
                finishReason = json.response?.status || 'completed'
                break
            }
          }
          if (chunkCount > MAX_STREAM_CHUNKS) break
        }
      } finally {
        reader.releaseLock()
      }
    } catch (e) {
      if (controller.signal.aborted) {
        return { fullText, finish_reason: 'aborted', stop_reason: 'aborted', toolCalls: [] }
      }
      // 超时 → 返回已收到的部分内容
      if (e?.name === 'TimeoutError' || e?.message?.includes('timeout') || e?.message?.includes('The operation was aborted')) {
        return { fullText, finish_reason: 'timeout', stop_reason: 'timeout', toolCalls: [] }
      }
      throw e
    } finally {
      if (chatId) activeChatAborts.delete(chatId)
    }

    if (!finishReason) finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop'
    return { fullText, finish_reason: finishReason, toolCalls }
  }

  ipcMain.handle('codex-chat', async (event, payload) => runCodexChatStream(event, payload))
  ipcMain.handle('codex-chat-continue', async (event, payload) => runCodexChatStream(event, payload))
  ipcMain.handle('codex-chat-abort', (_event, { chatId }) => {
    const ab = activeChatAborts.get(chatId)
    if (ab) { ab.abort(); activeChatAborts.delete(chatId); return true }
    return false
  })
}

module.exports = {
  setupCodexSdkHandlers,
  resetCodexSdkRuntime,
  __test__: {
    buildCodexAgentDonePayload,
    getCodexSessionMetricsByFile,
    getCodexSessionMetrics,
    readSessionFileRange,
    resolveCodexDoneReasonFromError,
    isCodexSessionRunTerminal,
    canStartCodexSessionRun,
    deleteCodexSessionRunIfCurrent,
    shouldEmitCodexSessionTerminalSignals,
    waitForCodexSessionRunToClose,
    findCodexSessionForSlashCommands,
    finalizeCodexSessionDoneState,
    closeCodexSessionRun,
    markCodexSessionDoneSent,
    parseSimpleTomlContent,
    buildRuntimeConfigFromToml,
    selectCodexTomlProvider,
  },
}
