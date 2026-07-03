const { ipcMain, dialog, app } = require('electron')
const { Conf } = require('electron-conf')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { DEFAULT_MAX_BYTES, appendLogLineWithRotation, getMindCraftSettingsPath, readMindCraftSettings, writeMindCraftSettings } = require('./diagnosticsFileUtils')
const { logMetricSample, logTurnSampleSummary } = require('./tokenMetrics/diagnostics')
const { beginTurn, submitSample, getCurrentSnapshot, clearCurrentTurn, removeStore, clearAllStores } = require('./tokenMetrics/turnStore')
const { readPluginsState } = require('./pluginState')
const claudeMetrics = require('./claudeMetrics')
const claudeMemory = require('./claudeMemory')
const { extractClaudeSessionTitle } = require('./sessionTitleUtils')
const { augmentEnvWithBundledRg } = require('./localSearch')
const {
  deleteSessionRecordsByProvider,
  findSessionRecordByProvider,
  attachRegistrySessionToScanSummary,
  repairSessionRegistry,
  setSessionTitle,
  syncPanelStateSessions,
  upsertRuntimeByProvider,
} = require('./sessionRegistry')
const { buildFullInstructionPrompt } = require('./sessionInstructionAttachments')
const { findLegacyUserData } = require('./findLegacyUserData')
const { t: lt } = require('./localeHelper')
const { getMindCraftUserDataDir } = require('./userDataPath')
const { getDb, persistDb } = require('./db/index')
const { previewLocalCliConfig, annotateConflicts, commitImport } = require('./db/import/index')
const { getProviders, setProviders, projectToLegacy } = require('./db/providerStorage')
const {
  cloneWithFallback: cloneSkillRepoWithFallback,
  copySkillDirAtomic,
  normalizeGithubSkillSource,
  resolveRelativeSourceDir,
  resolveSkillTargetDir,
  safeTempDir,
} = require('./skillsSecurity')

const CLAUDE_FREEZE_DIAG_MAX_BYTES = DEFAULT_MAX_BYTES
const CLAUDE_METRICS_POLL_INTERVAL_MS = 1000
let sessionRegistryOptionsForTest = null
let _claudeProviderStorage = null

const { getAgentProtocol } = require('./agentProtocolBridge')
// Note: getMindCraftSettingsPath / readMindCraftSettings / writeMindCraftSettings
// are imported from diagnosticsFileUtils above (canonical location).

// ---- Claude History Reader (extracted, Batch 2) ----
const {
  buildClaudeHistoryTurnTokensFromEntry,
  annotateClaudeHistoryEntryWithTurnTokens,
  annotateClaudeHistoryMessagesWithTurnTokens,
  readJsonlPageLinesFromTail,
} = require('./claude/historyReader')
const { perfStartIpc, setPerfEnabled } = require('./shared/mainPerfProbe')

// ---- Shared Skills Marketplace (Batch 4) ----
const {
  createSkillsMarketplaceClient,
} = require('./shared/skills/marketplace')
const { scanSkillsDirs } = require('./shared/skills/scanner')
const { createCliExecutor } = require('./shared/cliExecutor')

// ---- ClaudeCode IPC leaf modules (R09 main handler setup split) ----
const { registerClaudeLeafIpcs } = require('./claude/index');

// ---- ClaudeCode Environment (extracted leaf module, Phase 5) ----
const {
  getEnvWithNodePath,
  findSystemClaude,
  loadClaudeAgentSdk,
  resetSystemClaudeCache,
  resetClaudeSdkPromise,
  buildSystemClaudeEnv,
  setClaudeConfRef,
  isInstallingClaudeCode,
  setInstallingClaudeCode,
} = require('./claude/environment')
const { createClaudeBackgroundTaskTracker } = require('./claude/backgroundTaskTracker')

function getClaudeFreezeDiagEnabled() {
  const settings = readMindCraftSettings()
  return Boolean(settings?.diagnostics?.claudeFreeze?.enabled)
}

function setClaudeFreezeDiagEnabled(enabled) {
  const settings = readMindCraftSettings()
  if (!settings.diagnostics || typeof settings.diagnostics !== 'object') settings.diagnostics = {}
  if (!settings.diagnostics.claudeFreeze || typeof settings.diagnostics.claudeFreeze !== 'object') {
    settings.diagnostics.claudeFreeze = {}
  }
  settings.diagnostics.claudeFreeze.enabled = Boolean(enabled)
  const settingsPath = writeMindCraftSettings(settings)
  return { ok: true, enabled: Boolean(enabled), path: settingsPath }
}

function getClaudeFreezeDiagLogPath() {
  return path.join(app.getPath('userData'), 'diagnostics', 'claude-freeze-diag.log')
}

function appendClaudeFreezeDiag(stage, payload = {}) {
  if (!getClaudeFreezeDiagEnabled()) return
  try {
    const logPath = getClaudeFreezeDiagLogPath()
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      stage,
      ...payload,
    }) + '\n'
    appendLogLineWithRotation(logPath, line, { maxBytes: CLAUDE_FREEZE_DIAG_MAX_BYTES })
  } catch (_) {}
}

/** 递归扫描目录，收集所有 .jsonl 文件的 session_id */
function collectJsonlFiles(dirPath, files) {
  try {
    if (!fs.existsSync(dirPath)) return
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        collectJsonlFiles(fullPath, files)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        // 文件名即为 session_id (去掉 .jsonl 后缀)
        const sessionId = path.basename(entry.name, '.jsonl')
        files.push({ sessionId, filePath: fullPath })
      }
    }
  } catch (_) {}
}

/** 扫描当前项目的 CLI 会话 ID */
function scanCliSessionIds(cwd) {
  const result = []
  try {
    const projectPath = getClaudeProjectsRootDir(cwd)

    if (!fs.existsSync(projectPath)) return result

    // 收集该目录下所有 .jsonl 文件
    const jsonlFiles = []
    collectJsonlFiles(projectPath, jsonlFiles)

    // 返回所有 session_id
    for (const file of jsonlFiles) {
      result.push(file.sessionId)
    }
  } catch (_) {}
  return result
}

const claudeProjectJsonlListCache = new Map()
const claudeSessionTitleCache = new Map()

function clearClaudeSessionScanCaches() {
  claudeProjectJsonlListCache.clear()
  claudeSessionTitleCache.clear()
}

function getDirectorySignature(dirPath) {
  try {
    const stats = fs.statSync(dirPath)
    return `${Math.trunc(stats.mtimeMs)}:${stats.size}`
  } catch (_) {
    return ''
  }
}

function listClaudeTopLevelJsonlPaths(projectDir) {
  const signature = getDirectorySignature(projectDir)
  const cached = claudeProjectJsonlListCache.get(projectDir)
  if (cached?.signature === signature) return cached.paths

  const paths = []
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        paths.push(path.join(projectDir, entry.name))
      }
    }
  } catch (_) {}

  claudeProjectJsonlListCache.set(projectDir, { signature, paths })
  return paths
}

function getCachedClaudeSessionTitle(filePath, fileSize, updatedAt) {
  const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0
  const key = `${filePath}:${fileSize || 0}:${Number.isFinite(updatedMs) ? Math.trunc(updatedMs) : 0}`
  const cached = claudeSessionTitleCache.get(filePath)
  if (cached?.key === key) return cached.titleResult

  const titleResult = extractClaudeSessionTitle(filePath)
  claudeSessionTitleCache.set(filePath, { key, titleResult })
  return titleResult
}

/** 安全发送 IPC，避免窗口已销毁时抛错 */
function safeSend(sender, channel, ...args) {
  try {
    if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
      sender.send(channel, ...args)
    }
  } catch (_) {}
}

function toNonNegativeMetricNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function extractClaudeLiveUsageMetricsFromSdkMessage(msg, fallbackModel = '') {
  const usage = msg?.message?.usage
  if (!usage || typeof usage !== 'object') return null
  const normalized = claudeMetrics.normalizeClaudeUsageForUi(usage, msg?.message?.model || msg?.model || fallbackModel || '')
  const contextUsage = (normalized.inputTokens || 0) + (normalized.cacheReadTokens || 0) + (normalized.outputTokens || 0)
  const contextWindow = contextUsage > 0
    ? claudeMetrics.getContextWindowForModel(msg?.message?.model || msg?.model || fallbackModel || '')
    : 0
  return {
    inputTokens: normalized.inputTokens || 0,
    outputTokens: normalized.outputTokens || 0,
    cacheReadTokens: normalized.cacheReadTokens || 0,
    cacheCreationTokens: normalized.cacheCreationTokens || 0,
    contextUsage,
    contextWindow,
  }
}

function hasClaudeUsageTokenFields(usage) {
  if (!usage || typeof usage !== 'object') return false
  return [
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_read_input_tokens,
    usage.cache_creation_input_tokens,
  ].some(value => Number.isFinite(Number(value)))
}

function createClaudeTurnUsageAccumulator() {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }
  return {
    add(sample = {}) {
      totals.inputTokens += toNonNegativeMetricNumber(sample.inputTokens)
      totals.outputTokens += toNonNegativeMetricNumber(sample.outputTokens)
      totals.cacheReadTokens += toNonNegativeMetricNumber(sample.cacheReadTokens)
      totals.cacheCreationTokens += toNonNegativeMetricNumber(sample.cacheCreationTokens)
      return {
        ...sample,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheCreationTokens: totals.cacheCreationTokens,
      }
    },
  }
}

function mergeClaudeLiveMetricSamples(base = {}, next = {}) {
  const prev = base && typeof base === 'object' ? base : {}
  const curr = next && typeof next === 'object' ? next : {}
  return {
    ...prev,
    ...curr,
    inputTokens: Math.max(
      toNonNegativeMetricNumber(prev.inputTokens),
      toNonNegativeMetricNumber(curr.inputTokens),
    ),
    outputTokens: Math.max(
      toNonNegativeMetricNumber(prev.outputTokens),
      toNonNegativeMetricNumber(curr.outputTokens),
    ),
    cacheReadTokens: Math.max(
      toNonNegativeMetricNumber(prev.cacheReadTokens),
      toNonNegativeMetricNumber(curr.cacheReadTokens),
    ),
    cacheCreationTokens: Math.max(
      toNonNegativeMetricNumber(prev.cacheCreationTokens),
      toNonNegativeMetricNumber(curr.cacheCreationTokens),
    ),
    durationMs: Math.max(
      toNonNegativeMetricNumber(prev.durationMs),
      toNonNegativeMetricNumber(curr.durationMs),
    ),
  }
}

/**
 * Phase 3：通过 TurnStore 发射 metrics。
 * 样本先进入 TurnStore，再从 snapshot 构建前端 payload。
 * 确保 StatusBar / footer / history 消费同一套值。
 */
function emitClaudeMetricsViaStore(sender, sample, sessionId, model, extra = {}) {
  const { snapshot } = submitSample({
    provider: 'claude',
    chatKey: sessionId,
    providerSessionId: sample.providerSessionId || '',
    source: sample.source,
    scope: sample.scope,
    allowTurnTokens: sample.allowTurnTokens,
    inputTokens: sample.inputTokens,
    outputTokens: sample.outputTokens,
    cacheReadTokens: sample.cacheReadTokens,
    cacheCreationTokens: sample.cacheCreationTokens,
    contextUsage: sample.contextUsage,
    contextWindow: sample.contextWindow,
    durationMs: sample.durationMs,
    costUsd: sample.costUsd,
  })
  if (!snapshot) return

  logMetricSample({
    provider: 'claude',
    source: sample.source,
    chatKey: sessionId,
    providerSessionId: sample.providerSessionId || '',
    phase: snapshot.phase,
    inputTokens: snapshot.inputTokens,
    outputTokens: snapshot.outputTokens,
    cacheReadTokens: snapshot.cacheReadTokens,
    cacheCreationTokens: snapshot.cacheCreationTokens,
    contextUsage: snapshot.contextUsage,
    durationMs: snapshot.durationMs,
    rawUsage: sample.rawUsage || null,
  })

  safeSend(sender, 'claude-agent-metrics', {
    sessionId,
    model: model || '',
    thinking: snapshot.phase === 'live',
    inputTokens: snapshot.inputTokens,
    outputTokens: snapshot.outputTokens,
    cacheReadTokens: snapshot.cacheReadTokens,
    cacheCreationTokens: snapshot.cacheCreationTokens,
    contextUsage: snapshot.contextUsage,
    contextWindow: snapshot.contextWindow,
    durationMs: snapshot.durationMs,
    costUsd: snapshot.costUsd,
    ...extra,
  })

  return snapshot
}

/** 从用户文案里解析 Windows 绝对路径，用于 additionalDirectories（与 cwd 不同的根目录） */
function additionalDirsFromUserText(resolvedCwd, text) {
  if (typeof text !== 'string' || !text.trim()) return []
  const cwdNorm = path.resolve(resolvedCwd).toLowerCase()
  const isUnderCwd = (abs) => {
    const n = path.resolve(abs).toLowerCase()
    return n === cwdNorm || n.startsWith(cwdNorm + path.sep)
  }
  const out = new Set()
  const re = /([A-Za-z]:)([\\/][^|'<>\n\r]+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] + m[2]
    let abs
    try {
      abs = path.resolve(raw)
    } catch (_) {
      continue
    }
    try {
      if (!fs.existsSync(abs)) continue
      const st = fs.statSync(abs)
      const dir = st.isDirectory() ? abs : path.dirname(abs)
      if (!isUnderCwd(dir)) out.add(dir)
    } catch (_) {}
  }
  return [...out]
}

const { execSync, execFileSync, exec, execFile } = require('child_process')

function resolveClaudeDoneReasonFromError(err) {
  const errMsg = err?.message || String(err || '')
  if (err?.name === 'AbortError' || errMsg.includes('AbortError') || errMsg.includes('The operation was aborted')) {
    return 'aborted'
  }
  return 'failed'
}

function finalizeClaudeDoneReason({
  resultReceived = false,
  exitCode = 0,
  fallbackReason = '',
  sessionFileIntegrity = null,
} = {}) {
  if (fallbackReason === 'aborted') return 'aborted'
  if (fallbackReason === 'failed') return 'failed'
  if (resultReceived) return 'completed'
  if (sessionFileIntegrity?.hasDanglingToolUse) return 'interrupted'
  if (exitCode !== 0) return 'failed'
  return 'interrupted'
}

function analyzeClaudeJsonlFileIntegrity(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const text = fs.readFileSync(filePath, 'utf8')
    const lines = text.split(/\r?\n/).filter(Boolean)
    const openToolUses = new Set()
    let hasResultRow = false
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        const type = entry?.type || entry?._source_type || ''
        if (type === 'result') {
          hasResultRow = true
          openToolUses.clear()
          continue
        }
        const isAssistantEntry = type === 'assistant' || (type === 'message' && entry?.message?.role === 'assistant')
        const isUserEntry = type === 'user' || (type === 'message' && entry?.message?.role === 'user')
        if (isAssistantEntry && Array.isArray(entry?.message?.content)) {
          for (const block of entry.message.content) {
            if (block?.type === 'tool_use') {
              const toolUseId = String(block?.id || '').trim()
              if (toolUseId) openToolUses.add(toolUseId)
            }
            if (block?.type === 'tool_result') {
              const toolUseId = String(block?.tool_use_id || block?.toolUseId || '').trim()
              if (toolUseId) openToolUses.delete(toolUseId)
            }
          }
        }
        if (isUserEntry && Array.isArray(entry?.message?.content)) {
          for (const block of entry.message.content) {
            if (block?.type === 'tool_result') {
              const toolUseId = String(block?.tool_use_id || block?.toolUseId || '').trim()
              if (toolUseId) openToolUses.delete(toolUseId)
            }
          }
        }
      } catch (_) {}
    }
    return {
      hasResult: hasResultRow,
      hasDanglingToolUse: openToolUses.size > 0,
    }
  } catch (_) {
    return null
  }
}

/** 获取项目面板状态路径 - 使用 ~/.claude/projects/<cwd-hash>/panel-state.json */
function getClaudeCodePanelStatePath() {
  // panel state 保存到 Electron userData 目录（属于 mindcraft 应用自身数据）
  const userDataDir = app.getPath('userData')
  return path.join(userDataDir, 'claude-panel-state.json')
}

/** 获取项目会话根目录（仅 hash 目录，不含具体项目名） */
function getClaudeProjectsRootDir(cwd) {
  const resolvedCwd = path.resolve(cwd || process.cwd())
  // Claude CLI 规则：每个非字母数字字符各替换为一个 -
  // D:\示例项目\7c_washing -> D-------7c-washing
  const namePart = resolvedCwd.split('').map(c => /[a-zA-Z0-9]/.test(c) ? c : '-').join('')
  const resultPath = path.join(os.homedir(), '.claude', 'projects', namePart)
  return resultPath
}

function buildClaudeAgentDonePayload({
  sessionId,
  cliSessionId = '',
  filePath = '',
  cwd = '',
  reason = 'completed',
} = {}) {
  const resolvedCliSessionId = String(cliSessionId || '').trim()
  const resolvedFilePath = filePath
    ? String(filePath)
    : (resolvedCliSessionId && cwd
      ? path.join(getClaudeProjectsRootDir(cwd), `${resolvedCliSessionId}.jsonl`)
      : '')

  return {
    sessionId,
    cliSessionId: resolvedCliSessionId,
    filePath: resolvedFilePath,
    reason,
  }
}

/** 扫描项目根目录下所有 .jsonl 会话文件，返回带时间戳和标题的会话列表 */
function scanCliSessionsForProject(cwd) {
  const result = []
  try {
    const projectDir = getClaudeProjectsRootDir(cwd)
    if (!fs.existsSync(projectDir)) return result

    // 只扫描顶层 .jsonl（不递归，避免把 subagents 的 jsonl 当作独立对话）
    const jsonlFiles = []
    for (const fullPath of listClaudeTopLevelJsonlPaths(projectDir)) {
      const cliSessionId = path.basename(fullPath, '.jsonl')
      let createdAt = null
      let updatedAt = null
      let fileSize = null
      try {
        const stats = fs.statSync(fullPath)
        createdAt = stats.birthtime || stats.mtime
        updatedAt = stats.mtime
        fileSize = stats.size
      } catch (_) {}
      jsonlFiles.push({ cliSessionId, filePath: fullPath, createdAt, updatedAt, fileSize })
    }

    // 按最新对话时间倒序排序
    jsonlFiles.sort((a, b) => {
      const rawA = a.updatedAt || a.createdAt
      const rawB = b.updatedAt || b.createdAt
      const timeA = rawA ? new Date(rawA).getTime() : 0
      const timeB = rawB ? new Date(rawB).getTime() : 0
      return timeB - timeA
    })

    for (const file of jsonlFiles) {
      const titleResult = getCachedClaudeSessionTitle(file.filePath, file.fileSize, file.updatedAt)
      const title = titleResult?.title || ''
      const isCustomTitle = titleResult?.isCustomTitle || false
      const meta = readClaudeSessionMetaByFilePath(file.filePath)
      const summary = attachRegistrySessionToScanSummary('claude', {
        // `id` is kept for renderer compatibility; new code should read cliSessionId.
        id: file.cliSessionId,
        cliSessionId: file.cliSessionId,
        providerSessionId: file.cliSessionId,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        filePath: file.filePath,
        fileSize: file.fileSize,
        title,
        providerTitle: title,
        providerTitleSource: isCustomTitle ? 'custom-title' : 'provider',
        isCustomTitle,
        model: meta.model || null,
        effort: meta.effort || null,
        modelTier: meta.modelTier || null,
      }, { cwd })
      if (summary) result.push(summary)
    }
  } catch (_) {}
  return result
}

function normalizeClaudeSessionMeta(data = {}) {
  const validEfforts = new Set(['low', 'medium', 'high', 'xhigh'])
  const validTiers = new Set(['haiku', 'sonnet', 'opus', 'reasoning'])
  const model = typeof data.model === 'string' ? data.model.trim() : ''
  const effortRaw = typeof data.effort === 'string' ? data.effort.trim().toLowerCase() : ''
  const effort = effortRaw === 'max' ? 'xhigh' : effortRaw
  const modelTier = typeof data.modelTier === 'string' ? data.modelTier.trim().toLowerCase() : ''
  return {
    model,
    effort: validEfforts.has(effort) ? effort : '',
    modelTier: validTiers.has(modelTier) ? modelTier : '',
  }
}

function compactClaudeSessionMeta(meta = {}) {
  const normalized = normalizeClaudeSessionMeta(meta)
  const result = {}
  if (normalized.model) result.model = normalized.model
  if (normalized.effort) result.effort = normalized.effort
  if (normalized.modelTier) result.modelTier = normalized.modelTier
  return result
}

function getClaudeSessionMetaPath(cwd, cliSessionId) {
  const sessionId = String(cliSessionId || '').trim()
  if (!cwd || !sessionId) return ''
  return path.join(getClaudeProjectsRootDir(cwd), `${sessionId}.meta.json`)
}

function readClaudeSessionMetaByFilePath(filePath) {
  try {
    const registryRecord = findSessionRecordByProvider({ agent: 'claude', filePath }, sessionRegistryOptionsForTest || {})
    const registryMeta = compactClaudeSessionMeta(registryRecord?.runtime || {})
    if (registryMeta.model || registryMeta.effort || registryMeta.modelTier) return registryMeta

    if (!filePath || !String(filePath).toLowerCase().endsWith('.jsonl')) return {}
    const metaPath = String(filePath).replace(/\.jsonl$/i, '.meta.json')
    if (!fs.existsSync(metaPath)) return {}
    return compactClaudeSessionMeta(JSON.parse(fs.readFileSync(metaPath, 'utf8')))
  } catch (_) {
    return {}
  }
}

function readClaudeSessionMeta(cwd, cliSessionId) {
  const registryRecord = findSessionRecordByProvider({ agent: 'claude', cliSessionId }, sessionRegistryOptionsForTest || {})
  const registryMeta = compactClaudeSessionMeta(registryRecord?.runtime || {})
  if (registryMeta.model || registryMeta.effort || registryMeta.modelTier) return registryMeta

  const metaPath = getClaudeSessionMetaPath(cwd, cliSessionId)
  if (!metaPath) return {}
  return readClaudeSessionMetaByFilePath(metaPath.replace(/\.meta\.json$/i, '.jsonl'))
}

async function buildSessionInstructionPrompt(instruction = {}) {
  return buildFullInstructionPrompt(instruction)
}

function writeClaudeSessionMeta(cwd, cliSessionId, data = {}, { chatKey, filePath } = {}) {
  const meta = normalizeClaudeSessionMeta(data)
  return upsertRuntimeByProvider({
    agent: 'claude',
    chatKey,
    cwd,
    cliSessionId,
    filePath,
    runtime: meta,
  }, sessionRegistryOptionsForTest || {})
}

function deleteClaudeSessionArtifacts(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false
    const record = findSessionRecordByProvider({ agent: 'claude', filePath }, sessionRegistryOptionsForTest || {})
    fs.unlinkSync(filePath)
    deleteSessionRecordsByProvider({ agent: 'claude', filePath }, sessionRegistryOptionsForTest || {})
    if (record?.chatKey) removeStore(record.chatKey)
    const metaPath = String(filePath).replace(/\.jsonl$/i, '.meta.json')
    try {
      if (metaPath !== filePath && fs.existsSync(metaPath)) fs.unlinkSync(metaPath)
    } catch (e) {
      console.warn('[claude-delete-session-file] meta delete failed:', e?.message || e)
    }
    return true
  } catch (e) {
    console.warn('[claude-delete-session-file] failed:', e?.message || e)
    return false
  }
}

function readClaudeCodePanelState() {
  const fp = getClaudeCodePanelStatePath()
  const normalizeState = (j) => {
    if (!j || typeof j !== 'object') return null
    const projects = Array.isArray(j.projects) ? j.projects : null
    const tabs = Array.isArray(j.tabs) ? j.tabs : null
    if (!projects && !tabs) return null
    return {
      lastCwd: typeof j.lastCwd === 'string' ? j.lastCwd : '',
      activeProjectId: typeof j.activeProjectId === 'string' ? j.activeProjectId : null,
      activeChatId: typeof j.activeChatId === 'string' ? j.activeChatId : null,
      projects: projects || null,
      tabs: tabs || null,
    }
  }
  try {
    if (!fs.existsSync(fp)) return null
    const raw = fs.readFileSync(fp, 'utf8')
    const state = normalizeState(JSON.parse(raw))
    if (!state) return null
    syncPanelStateSessions('claude', { projects: state.projects || state.tabs || [] }, sessionRegistryOptionsForTest || {})
    const repair = repairSessionRegistry(sessionRegistryOptionsForTest || {})
    if (repair?.changed && fs.existsSync(fp)) {
      const repaired = normalizeState(JSON.parse(fs.readFileSync(fp, 'utf8')))
      if (repaired) return repaired
    }
    return state
  } catch (e) {
    console.warn('[claude-code-ui] read failed:', e?.message || e)
    return null
  }
}

function writeClaudeCodePanelState(payload) {
  const fp = getClaudeCodePanelStatePath()
  const dir = path.dirname(fp)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${fp}.${process.pid}.tmp`
  // 兼容新旧字段：优先使用 projects（新），回退到 tabs（旧）
  const projects = Array.isArray(payload?.projects) ? payload.projects : null
  const tabs = Array.isArray(payload?.tabs) ? payload.tabs : null
  const body = JSON.stringify({
    lastCwd: payload?.lastCwd != null ? String(payload.lastCwd) : '',
    projects: projects || tabs || [],
  }, null, 2)
  fs.writeFileSync(tmp, body, 'utf8')
  try {
    fs.renameSync(tmp, fp)
  } catch (_) {
    fs.copyFileSync(tmp, fp)
    try { fs.unlinkSync(tmp) } catch (_) {}
  }
  syncPanelStateSessions('claude', {
    projects: projects || tabs || [],
  })
}

const CLAUDE_PLUGINS_DIR = path.join(os.homedir(), '.claude', 'plugins')

// readPluginsState 已提取到 ./pluginState.js，在此仅做适配调用：CLI 偶发超时/失败时兜底，避免已安装插件全部显示为"未安装"
let _installedPluginsCache = null

// ─── Skills 管理 ───────────────────────────────────────────────
const {
  fetchSkillsMarketplace,
  mapMarketplaceSkill,
  resetCache: resetSkillsMarketplaceCache,
} = createSkillsMarketplaceClient('claude')

let _skillsStateCache = null


async function readInstalledPlugins() {
  try {
    const claudePath = await findSystemClaude()
    if (!claudePath) return _installedPluginsCache || []
    const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(claudePath)
    const cmd = isCmdShim ? 'cmd.exe' : claudePath
    const args = isCmdShim
      ? ['/c', claudePath, 'plugin', 'list', '--json']
      : ['plugin', 'list', '--json']
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const j = JSON.parse(out.trim())
    const result = Array.isArray(j) ? j.map(p => ({
      id: p.id || p.plugin || p.name || String(p),
      version: p.version || '',
      enabled: p.enabled !== false,
      scope: p.scope || 'user',
      installPath: p.installPath || '',
    })) : []
    _installedPluginsCache = result  // 成功时更新缓存
    return result
  } catch (_) {
    // CLI 失败时用缓存兜底，避免返回 [] 导致全部显示为"未安装"
    return _installedPluginsCache || []
  }
}

function setupClaudeHandlers() {
  // 应用启动时立即预热 SDK，避免第一次对话时冷启动延迟
  loadClaudeAgentSdk().catch(() => {})

  // 同步 renderer 端 perf flag 到主进程
  ipcMain.handle('agent-set-perf-enabled', (_, v) => { setPerfEnabled(v) })

  // 直接读写 ~/.claude/settings.json，与系统 Claude 配置一致
  const getSettingsPath = () => path.join(os.homedir(), '.claude', 'settings.json')

  /** 读取全局 settings.json（不存在则返回空对象） */
  function readGlobalSettings() {
    try {
      const p = getSettingsPath()
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {}
    return {}
  }
  function sanitizeClaudeSettingsForWrite(settings = {}, { preserveExistingInternal = false } = {}) {
    const next = settings && typeof settings === 'object' && !Array.isArray(settings)
      ? { ...settings }
      : {}
    if (next.permissionPolicy !== undefined) {
      if (!preserveExistingInternal || !internalConf.get('claudePermissionPolicy')) {
        internalConf.set('claudePermissionPolicy', next.permissionPolicy)
      }
      delete next.permissionPolicy
    }
    if (next.language && ['zh-CN', 'en-US'].includes(next.language)) {
      if (!preserveExistingInternal || !internalConf.get('claudeLanguage')) {
        internalConf.set('claudeLanguage', next.language)
      }
      delete next.language
    }
    if (next.pathToClaudeCodeExecutable !== undefined) {
      if (!preserveExistingInternal || !internalConf.get('claudeExecutablePath')) {
        internalConf.set('claudeExecutablePath', next.pathToClaudeCodeExecutable)
      }
      delete next.pathToClaudeCodeExecutable
    }
    if (next.gitMirrorUrl !== undefined) {
      if (!preserveExistingInternal || !internalConf.get('gitMirrorUrl')) {
        internalConf.set('gitMirrorUrl', String(next.gitMirrorUrl || '').trim())
      }
      delete next.gitMirrorUrl
    }
    if (next.memoryInjectMode !== undefined) {
      if (!preserveExistingInternal || !internalConf.get('claudeMemoryInjectMode')) {
        internalConf.set('claudeMemoryInjectMode', next.memoryInjectMode)
      }
      delete next.memoryInjectMode
    }
    if (next.theme !== undefined) {
      delete next.theme
    }
    if (next.effortLevel === 'max') {
      next.effortLevel = 'xhigh'
    }
    return next
  }
  /** 写入全局 settings.json */
  function writeGlobalSettings(obj) {
    const settingsDir = path.join(os.homedir(), '.claude')
    if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true })
    fs.writeFileSync(getSettingsPath(), JSON.stringify(sanitizeClaudeSettingsForWrite(obj, {
      preserveExistingInternal: true,
    }), null, 2), 'utf8')
  }
  setClaudeConfRef({ readGlobalSettings, writeGlobalSettings })

  // 确保 settings.json 中有 skipWebFetchPreflight: true，否则 WebFetch 在国内网络会失败
  // （SDK 的 preflight 验证请求到 claude.ai 被 Cloudflare/GFW 阻断）
  try {
    const s = readGlobalSettings()
    if (s.skipWebFetchPreflight !== false) {
      s.skipWebFetchPreflight = true
      writeGlobalSettings(s)
    }
  } catch (_) {}

  // ─── 一次性迁移：清理 settings.json 中 App 专属字段（T118）────────────────
  // 将 permissionPolicy/language/pathToClaudeCodeExecutable/gitMirrorUrl 从
  // ~/.claude/settings.json 迁移到 claude-internal.json，修正 effortLevel:max→xhigh
  try {
    const s = readGlobalSettings()
    let dirty = false
    // 迁移 permissionPolicy → internalConf
    if (s.permissionPolicy !== undefined) {
      if (!internalConf.get('claudePermissionPolicy')) {
        internalConf.set('claudePermissionPolicy', s.permissionPolicy)
      }
      delete s.permissionPolicy
      dirty = true
    }
    // 迁移 language（仅当值为已知 App UI 语言时；非 App UI 语言的保留为 SDK 设置）
    if (s.language && ['zh-CN', 'en-US'].includes(s.language)) {
      if (!internalConf.get('claudeLanguage')) {
        internalConf.set('claudeLanguage', s.language)
      }
      delete s.language
      dirty = true
    }
    // 迁移 pathToClaudeCodeExecutable → internalConf
    if (s.pathToClaudeCodeExecutable !== undefined) {
      if (!internalConf.get('claudeExecutablePath')) {
        internalConf.set('claudeExecutablePath', s.pathToClaudeCodeExecutable)
      }
      delete s.pathToClaudeCodeExecutable
      dirty = true
    }
    // 修正 effortLevel: max → xhigh（SDK Settings interface 不含 max）
    if (s.effortLevel === 'max') {
      s.effortLevel = 'xhigh'
      dirty = true
    }
    // 迁移 gitMirrorUrl → internalConf
    if (s.gitMirrorUrl !== undefined) {
      if (!internalConf.get('gitMirrorUrl')) {
        internalConf.set('gitMirrorUrl', s.gitMirrorUrl)
      }
      delete s.gitMirrorUrl
      dirty = true
    }
    // 删除旧版遗留 theme（已在 theme.json 正确存储）
    if (s.theme !== undefined) {
      delete s.theme
      dirty = true
    }
    if (dirty) writeGlobalSettings(s)
  } catch (e) {
    console.warn('[claude] settings migration failed (non-fatal):', e?.message || e)
  }

  const pendingPermissionResolvers = new Map() // requestId -> resolver(allowed)

  ipcMain.handle('claude-load-code-panel-state', () => readClaudeCodePanelState())
  ipcMain.handle('claude-scanner-projects-sessions', (_, { cwd }) => scanCliSessionsForProject(cwd))
  ipcMain.handle('claude-read-session-meta', (_, { cwd, cliSessionId, filePath } = {}) => {
    if (filePath) return readClaudeSessionMetaByFilePath(filePath)
    return readClaudeSessionMeta(cwd, cliSessionId)
  })
  ipcMain.handle('claude-write-session-meta', (_, { cwd, cliSessionId, filePath, chatKey, sessionId, data } = {}) => {
    return writeClaudeSessionMeta(cwd, cliSessionId, data, { chatKey: chatKey || sessionId, filePath })
  })
  ipcMain.handle('claude-rename-session', async (_, { sessionId, title, cwd }) => {
    if (!sessionId || !title) return { success: false, error: 'missing sessionId or title' }
    try {
      const record = findSessionRecordByProvider({ agent: 'claude', cliSessionId: sessionId }, sessionRegistryOptionsForTest || {})
      if (!record?.chatKey) return { success: false, error: 'registry session not found' }
      const result = setSessionTitle(record.chatKey, title, {
        ...(sessionRegistryOptionsForTest || {}),
        agent: 'claude',
        cwd: cwd || record.cwd,
        cliSessionId: record.provider?.cliSessionId || sessionId,
        filePath: record.provider?.filePath,
        runtime: record.runtime,
      })
      return { success: Boolean(result?.ok), error: result?.error }
    } catch (e) {
      console.error('[claude-rename-session] error:', e)
      return { success: false, error: e?.message || 'unknown' }
    }
  })
  ipcMain.handle('claude-read-session-file', async (_, { filePath }) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        console.warn('[claude-read-session-file] file not found:', filePath)
        return { error: 'file_not_found' }
      }
      const fileSize = fs.statSync(filePath).size
      const FULL_THRESHOLD = 1024 * 1024 // 1MB 以下全读

      let rawText
      if (fileSize < FULL_THRESHOLD) {
        rawText = fs.readFileSync(filePath, 'utf8')
      } else {
        // 大文件读尾部：读取 2MB 数据，确保有足够的历史消息
        const tailSize = Math.min(fileSize, 2048 * 1024)
        const start = fileSize - tailSize
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(tailSize)
        fs.readSync(fd, buf, 0, tailSize, start)
        fs.closeSync(fd)
        // 跳到第一行完整的位置（可能截断了第一个 JSON 行）
        const text = buf.toString('utf8')
        const firstNewline = text.indexOf('\n')
        rawText = firstNewline >= 0 ? text.slice(firstNewline + 1) : text
      }

      const lines = rawText.split('\n').filter(line => line.trim())
      const messages = []
      const entriesForMessages = []
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)

          if (entry.type === 'queue-operation' && entry.content) {
            messages.push({ type: 'queue-operation', content: entry.content })
            entriesForMessages.push(entry)
            continue
          }

          if (entry.uuid) {
            const msgData = entry.message || entry
            const sourceType = (entry.type === 'message' && entry.message?.role === 'assistant')
              ? 'assistant'
              : entry.type
            msgData._source_type = sourceType

            if (entry.type === 'user' && entry.message) {
              msgData._is_user_wrapper = true
            } else if (sourceType === 'assistant') {
              msgData._is_assistant_wrapper = true
            } else if (entry.type === 'command' || entry.type === 'skill' || entry.type === 'tool_use') {
              msgData._is_tool_message = true
            }

            messages.push(msgData)
            entriesForMessages.push(entry)
          }
        } catch (e) {
          console.warn('[claude-read-session-file] parse error:', e?.message)
        }
      }
      annotateClaudeHistoryMessagesWithTurnTokens(messages, entriesForMessages)
      return messages
    } catch (e) {
      console.warn('[claude-read-session-file] failed:', e?.message || e)
      return []
    }
  })

  // 分页读取：从尾部开始按页读取历史消息
  // 参数：{ filePath, page: 0, pageSize: 50 }
  // page=0 读取最后 pageSize 条，page=1 读取再往前 pageSize 条
  // 返回：{ messages, hasMore: boolean, totalPages: number }
  ipcMain.handle('claude-read-session-file-range', async (_, { filePath, page = 0, pageSize = 50 }) => {
    const stop = perfStartIpc('claude-read-session-file-range', { page, pageSize })
    try {
      const diagStart = Date.now()
      appendClaudeFreezeDiag('session-range.enter', {
        file: filePath ? path.basename(filePath) : null,
        page,
        pageSize,
      })
      if (!filePath || !fs.existsSync(filePath)) {
        appendClaudeFreezeDiag('session-range.file-missing', {
          file: filePath ? path.basename(filePath) : null,
          page,
          pageSize,
        })
        stop()
        return { messages: [], hasMore: false, totalPages: 0, error: 'file_not_found' }
      }
      const pageData = readJsonlPageLinesFromTail(filePath, page, pageSize)
      appendClaudeFreezeDiag('session-range.opened', {
        file: path.basename(filePath),
        fileSize: pageData.fileSize,
        page,
        pageSize,
      })

      const messages = []
      const entriesForMessages = []
      const collectStart = Date.now()
      appendClaudeFreezeDiag('session-range.collect-page.start', {
        file: path.basename(filePath),
        page,
        pageSize,
        bytesScanned: pageData.bytesScanned,
        linesScanned: pageData.linesScanned,
      })
      const collectMessages = (line) => {
        const cleanLine = String(line || '').replace(/^\uFEFF/, '')
        if (!cleanLine.trim()) return
        try {
          const entry = JSON.parse(cleanLine)
          if (entry.type === 'queue-operation' && entry.content) {
            messages.push({ type: 'queue-operation', content: entry.content })
            entriesForMessages.push(entry)
            return
          }
          if (entry.uuid) {
            const msgData = entry.message || entry
            const sourceType = (entry.type === 'message' && entry.message?.role === 'assistant')
              ? 'assistant'
              : entry.type
            msgData._source_type = sourceType
            if (entry.type === 'user' && entry.message) msgData._is_user_wrapper = true
            else if (sourceType === 'assistant') {
              msgData._is_assistant_wrapper = true
            }
            else if (entry.type === 'command' || entry.type === 'skill' || entry.type === 'tool_use') msgData._is_tool_message = true
            messages.push(msgData)
            entriesForMessages.push(entry)
          } else if (entry.type === 'ai-title') {
            // AI 生成的标题，作为特殊消息保留
            messages.push({ type: 'ai-title', aiTitle: entry.aiTitle })
            entriesForMessages.push(entry)
          }
        } catch (_) {}
      }

      for (const line of pageData.lines) collectMessages(line)
      annotateClaudeHistoryMessagesWithTurnTokens(messages, entriesForMessages)

      const hasMore = pageData.hasMore
      const collectMs = Date.now() - collectStart
      const totalMs = Date.now() - diagStart
      appendClaudeFreezeDiag('session-range.collect-page.done', {
        file: path.basename(filePath),
        page,
        pageSize,
        returnedMessages: messages.length,
        collectMs,
      })
      appendClaudeFreezeDiag('session-range.return', {
        file: path.basename(filePath),
        fileSize: pageData.fileSize,
        page,
        pageSize,
        linesScanned: pageData.linesScanned,
        bytesScanned: pageData.bytesScanned,
        returnedMessages: messages.length,
        hasMore,
        collectMs,
        totalMs,
      })
      stop({ fileSize: pageData.fileSize, returned: messages.length, hasMore: hasMore ? 1 : 0, totalPages: pageData.totalPages })
      return { messages, hasMore, totalPages: pageData.totalPages }
    } catch (e) {
      appendClaudeFreezeDiag('session-range.fail', {
        error: e?.message || String(e),
        file: filePath ? path.basename(filePath) : null,
        page,
        pageSize,
      })
      console.warn('[claude-read-session-file-range] failed:', e?.message || e)
      stop()
      return { messages: [], hasMore: false, totalPages: 0 }
    }
  })

  ipcMain.handle('claude-get-file-stat', (_, { filePath }) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null
      const stats = fs.statSync(filePath)
      return { size: stats.size, mtime: stats.mtime }
    } catch (e) {
      console.warn('[claude-get-file-stat] failed:', e?.message || e)
      return null
    }
  })
  ipcMain.handle('claude-delete-session-file', (_, { filePath }) => {
    return deleteClaudeSessionArtifacts(filePath)
  })
  ipcMain.handle('claude-save-code-panel-state', (_, payload) => {
    try {
      writeClaudeCodePanelState(payload)
      return true
    } catch (e) {
      console.warn('[claude-code-ui] write failed:', e?.message || e)
      return false
    }
  })
  ipcMain.on('claude-save-code-panel-state-sync', (event, payload) => {
    try {
      writeClaudeCodePanelState(payload)
      event.returnValue = true
    } catch (e) {
      console.warn('[claude-code-ui] sync write failed:', e?.message || e)
      event.returnValue = false
    }
  })

  ipcMain.handle('plugins-get-state', async () => {
    const state = readPluginsState(CLAUDE_PLUGINS_DIR)
    const installed = await readInstalledPlugins()
    // 双索引匹配：先精确 ID，失败则按插件名 fallback
    // （不同 marketplace 目录名会导致 ID 后缀不同，如 anthropics-claude-plugins-official vs claude-plugins-official）
    const installedById = new Map(installed.map(p => [p.id, p]))
    const installedByName = new Map()
    for (const p of installed) {
      const name = (p.id || '').split('@')[0]
      if (name && !installedByName.has(name)) installedByName.set(name, p)
    }
    for (const p of state.plugins) {
      let match = installedById.get(p.id)
      if (!match) match = installedByName.get((p.id || '').split('@')[0])
      p.installed = !!match
      p.enabled = match ? match.enabled : true
    }
    return state
  })
  // ---- ClaudeCode CLI executor (shared, Batch 5a) ----
  const execClaudeCli = createCliExecutor({ findBinary: findSystemClaude, agentName: "claude" })

  ipcMain.handle('plugins-save-state', () => true)

  ipcMain.handle('plugins-install', async (_, pluginId) => {
    try {
      await execClaudeCli(['plugin', 'install', pluginId])
      _installedPluginsCache = null // 安装后清缓存，下次自动刷新
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[claude] plugin install failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  ipcMain.handle('plugins-uninstall', async (_, pluginId) => {
    try {
      await execClaudeCli(['plugin', 'uninstall', pluginId])
      _installedPluginsCache = null
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[claude] plugin uninstall failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  ipcMain.handle('plugins-enable', async (_, pluginId) => {
    try {
      await execClaudeCli(['plugin', 'enable', pluginId])
      _installedPluginsCache = null // 启用后清缓存
      slashCommandsCache.clear() // 插件启用后刷新 slash command 缓存
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[claude] plugin enable failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  ipcMain.handle('plugins-disable', async (_, pluginId) => {
    try {
      await execClaudeCli(['plugin', 'disable', pluginId])
      _installedPluginsCache = null // 禁用后清缓存
      slashCommandsCache.clear() // 插件禁用后刷新 slash command 缓存
      return { ok: true }
    } catch (e) {
      const errMsg = e?.stderr || e?.message || String(e)
      console.error('[claude] plugin disable failed:', errMsg)
      return { ok: false, error: errMsg }
    }
  })

  const defaultModels = []

  // 内部配置存储（providers/tierModels 等不属于 settings.json 的数据）
  // 打包后 electron-conf 可能因路径/权限问题初始化失败，降级为 JSON 文件存储
  let internalConf
  try {
    internalConf = new Conf({ name: 'claude-internal' })
  } catch (e) {
    console.warn('[claude] electron-conf init failed, using json fallback:', e?.message)
    const fallbackPath = path.join(app.getPath('userData'), 'claude-internal.json')
    const loadFallback = () => {
      try { return JSON.parse(fs.readFileSync(fallbackPath, 'utf8')) } catch { return {} }
    }
    const saveFallback = (data) => {
      try { fs.writeFileSync(fallbackPath, JSON.stringify(data, null, 2), 'utf8') } catch {}
    }
    internalConf = {
      get: (k, def) => { const d = loadFallback(); return k in d ? d[k] : def },
      set: (k, v) => { const d = loadFallback(); d[k] = v; saveFallback(d) },
    }
  }

  /** 从全局 settings.json 读取配置（兼容旧键名） */
  function confGet(key, def) {
    const s = readSystemSettingsJson() || {}
    // 兼容旧键名 -> settings.json 字段映射
    if (key === 'claudeApiKey') return s.env?.ANTHROPIC_AUTH_TOKEN || s.apiKey || def
    if (key === 'claudeBaseURL') return s.env?.ANTHROPIC_BASE_URL || s.apiBaseUrl || def
    if (key === 'claudePermissionPolicy') return internalConf.get('claudePermissionPolicy', s.permissionPolicy || def)
    if (key === 'claudeLanguage') return internalConf.get('claudeLanguage', s.language || def)
    if (key === 'claudeEffortLevel') return s.effortLevel || def
    if (key === 'claudeModel') {
      // 重要：~/.claude/settings.json 的顶层 model 在本项目中表示 tier（sonnet/opus/...），不是“真实模型ID”。
      const stored = internalConf.get('claudeModel', '')
      return (typeof stored === 'string' && stored.trim()) ? stored.trim() : def
    }
    if (key === 'claudeExecutablePath') return internalConf.get('claudeExecutablePath', s.pathToClaudeCodeExecutable || '')
    if (key === 'claudeSelectedTier') {
      const raw = (typeof s.model === 'string' ? s.model : 'sonnet').toLowerCase()
      return ['haiku', 'sonnet', 'opus', 'reasoning'].includes(raw) ? raw : 'sonnet'
    }
    if (key === 'claudeModels') return s.models || []
    if (key === 'claudeProviders') {
      const stored = internalConf.get('claudeProviders', null)
      if (stored) return stored
      // 首次使用：从 settings.json 导入一次
      return s.providers || null
    }
    if (key.startsWith('tierModels.')) {
      const tier = key.split('.')[1]
      const stored = internalConf.get('tierModels', null)
      if (stored) return stored[tier] || ''
      // 首次使用：从 settings.json 导入一次
      const tm = s.tierModels || {}
      return tm[tier] || ''
    }
    if (key === 'tierModels') {
      const stored = internalConf.get('tierModels', null)
      if (stored) return stored
      // 首次使用：从 settings.json 导入一次
      return s.tierModels || { haiku: '', sonnet: '', opus: '', reasoning: '' }
    }
    return def
  }
  /** 写入全局 settings.json */
  function confSet(key, val) {
    const s = readSystemSettingsJson() || {}
    // settings.json 字段映射
    if (key === 'claudeApiKey') {
      s.env = s.env || {}
      s.env.ANTHROPIC_AUTH_TOKEN = val
    } else if (key === 'claudeBaseURL') {
      s.env = s.env || {}
      s.env.ANTHROPIC_BASE_URL = val
    } else if (key === 'claudePermissionPolicy') { internalConf.set('claudePermissionPolicy', val); return }
    else if (key === 'claudeLanguage') { internalConf.set('claudeLanguage', val); return }
    else if (key === 'claudeEffortLevel') s.effortLevel = val
    else if (key === 'claudeModel') {
      // 真实模型 ID 仅写入 app 内部配置，严禁写入 ~/.claude/settings.json 的顶层 model（避免覆盖 sonnet/opus tier）
      internalConf.set('claudeModel', typeof val === 'string' ? val.trim() : '')
      return
    }
    else if (key === 'claudeExecutablePath') { internalConf.set('claudeExecutablePath', val); return }
    else if (key === 'claudeSelectedTier') {
      // tier 写入顶层 model
      s.model = val
    } else if (key === 'claudeModels') { s.models = val }
    else if (key === 'claudeProviders') { internalConf.set('claudeProviders', val); return }
    else if (key.startsWith('tierModels.')) {
      const tm = internalConf.get('tierModels', { haiku: '', sonnet: '', opus: '', reasoning: '' })
      tm[key.split('.')[1]] = val
      internalConf.set('tierModels', tm)
      return
    }
    else if (key === 'tierModels') { internalConf.set('tierModels', val); return }
    else return
    try {
      // 确保 skipWebFetchPreflight 不会被覆盖（WebFetch 在国内网络需要跳过预检）
      if (s.skipWebFetchPreflight !== false) s.skipWebFetchPreflight = true
      const p = path.join(os.homedir(), '.claude')
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
      fs.writeFileSync(path.join(p, 'settings.json'), JSON.stringify(s, null, 2), 'utf8')
    } catch {}
  }

  ipcMain.handle('claude-get-key', () => {
    let key = confGet('claudeApiKey', '')
    if (!key) {
      const sj = readSystemSettingsJson()
      if (sj) {
        key = sj.env?.ANTHROPIC_AUTH_TOKEN || sj.primaryApiKey || sj.apiKey || ''
      }
    }
    return key
  })
  ipcMain.handle('claude-get-base-url', () => {
    let url = confGet('claudeBaseURL', '')
    if (!url) {
      const sj = readSystemSettingsJson()
      if (sj) {
        url = sj.env?.ANTHROPIC_BASE_URL || sj.baseURL || sj.apiBaseUrl || ''
      }
    }
    return url
  })
  function readPermissionPolicy() {
    const policy = confGet('claudePermissionPolicy', 'ask')
    const valid = ['ask', 'allow_all', 'read_only']
    return valid.includes(policy) ? policy : 'ask'
  }
  ipcMain.handle('claude-get-permission-policy', () => readPermissionPolicy())
  ipcMain.handle('claude-set-permission-policy', (_, policy) => {
    const valid = ['ask', 'allow_all', 'read_only']
    if (!valid.includes(policy)) return false
    confSet('claudePermissionPolicy', policy)
    return true
  })

  // WebFetch 预检跳过开关（在国内网络环境下需要跳过指向 claude.ai 的域名安全验证）
  ipcMain.handle('claude-get-skip-webfetch-preflight', () => {
    try {
      const s = readGlobalSettings()
      return s.skipWebFetchPreflight !== false
    } catch (_) { return true }
  })
  ipcMain.handle('claude-set-skip-webfetch-preflight', (_, val) => {
    try {
      const s = readGlobalSettings()
      s.skipWebFetchPreflight = !!val
      writeGlobalSettings(s)
      return true
    } catch (_) { return false }
  })
  ipcMain.handle('claude-get-auto-compact-window', () => {
    try {
      const s = readGlobalSettings()
      return typeof s.autoCompactWindow === 'number' ? s.autoCompactWindow : null
    } catch (_) { return null }
  })
  ipcMain.handle('claude-set-auto-compact-window', (_, val) => {
    try {
      const s = readGlobalSettings()
      if (val === null || val === undefined || val === '') {
        delete s.autoCompactWindow
      } else {
        const num = Number(val)
        if (!Number.isFinite(num) || num < 0) {
          delete s.autoCompactWindow
        } else {
          s.autoCompactWindow = Math.round(num)
        }
      }
      writeGlobalSettings(s)
      return { ok: true, value: s.autoCompactWindow }
    } catch (_) { return { ok: false } }
  })
  function readLanguage() {
    const language = confGet('claudeLanguage', 'zh-CN')
    const valid = ['zh-CN', 'en-US']
    return valid.includes(language) ? language : 'zh-CN'
  }
  ipcMain.handle('claude-get-language', () => readLanguage())
  ipcMain.handle('claude-set-language', (_, language) => {
    const valid = ['zh-CN', 'en-US']
    if (!valid.includes(language)) return false
    confSet('claudeLanguage', language)
    return true
  })
  function readEffortLevel() {
    const effort = confGet('claudeEffortLevel', 'medium')
    // SDK Settings interface 合法值：low/medium/high/xhigh（不含 max）
    // 兼容旧值 'max'：自动升迁为 xhigh
    if (effort === 'max') return 'xhigh'
    const valid = ['low', 'medium', 'high', 'xhigh']
    return valid.includes(effort) ? effort : 'medium'
  }
  ipcMain.handle('claude-get-effort-level', () => readEffortLevel())
  ipcMain.handle('claude-set-effort-level', (_, effort) => {
    // SDK Settings interface 合法值：low/medium/high/xhigh（不含 max）
    const valid = ['low', 'medium', 'high', 'xhigh']
    if (!valid.includes(effort)) return false
    confSet('claudeEffortLevel', effort)
    return true
  })

  ipcMain.handle('claude-get-thinking-enabled', () => {
    return internalConf.get('claudeThinkingEnabled', true)
  })
  ipcMain.handle('claude-set-thinking-enabled', (_, enabled) => {
    internalConf.set('claudeThinkingEnabled', !!enabled)
    return true
  })

  // 自定义 Claude Code 可执行文件路径
  ipcMain.handle('claude-get-executable-path', () => {
    return confGet('claudeExecutablePath', '') || ''
  })
  ipcMain.handle('claude-set-executable-path', (_, p) => {
    const val = String(p || '').trim()
    confSet('claudeExecutablePath', val)
    resetSystemClaudeCache()
    return true
  })
  ipcMain.handle('claude-browse-executable', async () => {
    const result = await dialog.showOpenDialog({
      title: lt('dialog.selectExe'),
      filters: process.platform === 'win32'
        ? [{ name: 'Executable', extensions: ['exe'] }]
        : [{ name: 'All Files', extensions: ['*'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // 检测运行环境：Node、npm、Claude Code
  ipcMain.handle('claude-check-environment', async () => {
    const result = { node: null, npm: null, claude: null }

    // 检测 Node.js
    try {
      const env = getEnvWithNodePath()
      const nodeVer = (await new Promise((resolve, reject) => {
        exec('node --version', { encoding: 'utf8', timeout: 5000, env }, (err, stdout) => {
          if (err) reject(err); else resolve(stdout)
        })
      })).trim()
      const match = nodeVer.match(/^v(\d+)\./)
      const major = match ? parseInt(match[1], 10) : 0
      result.node = { installed: true, version: nodeVer, compatible: major >= 18 }
    } catch (e) {
      console.warn('[claude] node check failed:', e?.message || e)
      result.node = { installed: false, version: null, compatible: false }
    }

    // 检测 npm
    try {
      const env = getEnvWithNodePath()
      const npmVer = (await new Promise((resolve, reject) => {
        exec('npm --version', { encoding: 'utf8', timeout: 5000, env }, (err, stdout) => {
          if (err) reject(err); else resolve(stdout)
        })
      })).trim()
      result.npm = { installed: true, version: npmVer }
    } catch (e) {
      console.warn('[claude] npm check failed:', e?.message || e)
      result.npm = { installed: false, version: null }
    }

    // 检测 Claude Code
    try {
      resetSystemClaudeCache()
      const claudePath = await findSystemClaude()
      const customPath = String(confGet('claudeExecutablePath', '') || '').trim()
      let claudeVersion = null
      if (claudePath) {
        try {
          const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(claudePath)
          const cmd = isCmdShim ? 'cmd.exe' : claudePath
          const args = isCmdShim ? ['/c', claudePath, '--version'] : ['--version']
          claudeVersion = (await new Promise((resolve, reject) => {
            execFile(cmd, args, {
              encoding: 'utf8',
              timeout: 5000,
              windowsHide: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            }, (err, stdout) => {
              if (err) reject(err); else resolve(stdout)
            })
          })).trim()
        } catch (_) {}
      }
      result.claude = { installed: !!claudePath, path: claudePath || null, customPath, version: claudeVersion }
    } catch (e) {
      console.error('[claude] findSystemClaude error:', e?.message || e)
      result.claude = { installed: false, path: null, customPath: '', version: null }
    }

    return result
  })

  // 安装 Claude Code（需要 Node >= 18 且 npm 可用）
  ipcMain.handle('claude-install-claude-code', async () => {
    if (isInstallingClaudeCode()) return { success: false, message: lt('install.inProgress') }
    setInstallingClaudeCode(true)
    try {
      // 先终止可能占用 claude.exe 的进程，避免 EBUSY
      try { execSync('taskkill /IM claude.exe /F', { encoding: 'utf8', timeout: 5000, windowsHide: true }) } catch (_) {}
      // 如果之前有旧版 SDK 捆绑的 claude 在运行，也杀掉
      try { execSync('taskkill /IM claude-agent-sdk-win32-x64.exe /F', { encoding: 'utf8', timeout: 5000, windowsHide: true }) } catch (_) {}

      const env = getEnvWithNodePath()
      await new Promise((resolve, reject) => {
        exec('npm install -g @anthropic-ai/claude-code', {
          encoding: 'utf8',
          timeout: 180000,
          stdio: 'pipe',
          windowsHide: true,
          env,
        }, (err, stdout, stderr) => {
          if (err) reject(Object.assign(err, { stdout, stderr }))
          else resolve(stdout)
        })
      })
      resetSystemClaudeCache()
      const newPath = await findSystemClaude()
      return { success: true, path: newPath || null }
    } catch (e) {
      const msg = (e?.stderr || e?.message || String(e)).toLowerCase()
      let hint = ''
      if (msg.includes('eacces') || msg.includes('eperm') || msg.includes('check permissions')) {
        hint = lt('install.perm')
      } else if (msg.includes('enoent') || msg.includes('not found')) {
        hint = lt('install.noNpm')
      } else if (msg.includes('etimedout') || msg.includes('enotfound') || msg.includes('econnrefused')) {
        hint = lt('install.netErr')
      } else if (msg.includes('enospc')) {
        hint = lt('install.disk')
      } else if (msg.includes('ebusy') || msg.includes('elock')) {
        hint = lt('install.locked')
      } else {
        hint = e?.message || String(e)
      }
      return { success: false, message: hint }
    } finally {
      setInstallingClaudeCode(false)
    }
  })

  // 查询 npm 最新版本（用于版本对比）
  ipcMain.handle('claude-check-latest-version', async () => {
    try {
      const https = require('https')
      return new Promise((resolve) => {
        https.get('https://registry.npmmirror.com/@anthropic-ai/claude-code/latest', (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              resolve({ ok: true, version: json.version || null })
            } catch {
              resolve({ ok: false, error: '解析失败' })
            }
          })
        }).on('error', (e) => {
          // 备用：使用官方 npm registry
          https.get('https://registry.npmjs.org/@anthropic-ai/claude-code/latest', (res2) => {
            let data2 = ''
            res2.on('data', (chunk) => { data2 += chunk })
            res2.on('end', () => {
              try {
                const json = JSON.parse(data2)
                resolve({ ok: true, version: json.version || null })
              } catch {
                resolve({ ok: false, error: '解析失败' })
              }
            })
          }).on('error', (e2) => {
            resolve({ ok: false, error: e2?.message || '网络错误' })
          })
        })
      })
    } catch (e) {
      return { ok: false, error: e?.message || '查询失败' }
    }
  })

  // 读取 ~/.claude/settings.json
  ipcMain.handle('claude-read-settings-json', () => {
    try {
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
      const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {}
      const gitMirrorUrl = internalConf.get('gitMirrorUrl', settings.gitMirrorUrl || '')
      return { ...settings, gitMirrorUrl }
    } catch (_) {
      return null
    }
  })

  // 局部更新 ~/.claude/settings.json（只合并传入的字段，不覆盖其他）
  ipcMain.handle('claude-patch-settings-json', (_, patch) => {
    try {
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'gitMirrorUrl')) {
        internalConf.set('gitMirrorUrl', String(patch.gitMirrorUrl || '').trim())
        const { gitMirrorUrl, ...rest } = patch || {}
        patch = rest
        if (!Object.keys(patch).length) return { ok: true }
      }
      const claudeDir = path.join(os.homedir(), '.claude')
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true })
      const settingsPath = path.join(claudeDir, 'settings.json')
      let existing = {}
      if (fs.existsSync(settingsPath)) {
        try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch (_) {}
      }
      const merged = sanitizeClaudeSettingsForWrite({ ...existing, ...patch }, {
        preserveExistingInternal: true,
      })
      // 原子写入：先写临时文件，再 rename，防止并发写损坏
      const tmp = `${settingsPath}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8')
      try {
        fs.renameSync(tmp, settingsPath)
      } catch (_) {
        fs.copyFileSync(tmp, settingsPath)
        try { fs.unlinkSync(tmp) } catch (_) {}
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e?.message || String(e) }
    }
  })

  ipcMain.handle('claude-repair-settings-json', (_, content) => {
    try {
      const claudeDir = path.join(os.homedir(), '.claude')
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true })
      const settingsPath = path.join(claudeDir, 'settings.json')
      const previous = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : ''
      let next
      if (typeof content === 'string') {
        next = JSON.parse(content)
      } else if (content && typeof content === 'object') {
        next = content
      } else {
        next = {}
      }
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        throw new Error('Invalid settings.json content')
      }
      next = sanitizeClaudeSettingsForWrite(next, {
        preserveExistingInternal: true,
      })
      const finalContent = JSON.stringify(next, null, 2) + '\n'
      if (previous === finalContent) return { ok: true, changed: false, backupPath: '' }
      let backupPath = ''
      if (previous) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
        backupPath = path.join(claudeDir, `settings.json.mindcraft-bak-${stamp}`)
        fs.copyFileSync(settingsPath, backupPath)
      }
      const tmp = `${settingsPath}.${process.pid}.tmp`
      fs.writeFileSync(tmp, finalContent, 'utf8')
      try {
        fs.renameSync(tmp, settingsPath)
      } catch (_) {
        fs.copyFileSync(tmp, settingsPath)
        try { fs.unlinkSync(tmp) } catch (_) {}
      }
      return { ok: true, changed: true, backupPath }
    } catch (e) {
      return { ok: false, message: e?.message || String(e) }
    }
  })

  function buildSystemPrompt(resolvedCwd) {
    const language = readLanguage()
    const effort = readEffortLevel()
    const langLine = language === 'en-US'
      ? 'You are an assistant. Default to English unless the user asks for another language.'
      : '你是一个中文助手。默认使用简体中文回复，除非用户明确要求其他语言。'
    const effortLine = `Reasoning effort level preference: ${effort}.`
    const cwdLine = resolvedCwd
      ? `Current working directory: ${resolvedCwd}. When creating files without an explicit absolute path, place them under this directory. Do not invent paths like /home/user, /tmp, or /root.`
      : ''
    const osLine = `Host platform: ${process.platform} (${os.arch()}).`
    return [langLine, effortLine, cwdLine, osLine].filter(Boolean).join('\n')
  }

  function readMemoryInjectMode() {
    const mode = internalConf.get('claudeMemoryInjectMode', (readSystemSettingsJson() || {}).memoryInjectMode || 'system')
    return ['system', 'user', 'off'].includes(mode) ? mode : 'system'
  }

  function readPrimaryModel() {
    const tier = confGet('claudeSelectedTier', 'sonnet')
    const tierModels = readTierModelsFromConf()
    const tierModel = tierModels[tier]?.trim()
    let model = tierModel || confGet('claudeModel', '')
    if (!model) {
      const sj = readSystemSettingsJson()
      if (sj) {
        const env = sj.env && typeof sj.env === 'object' ? sj.env : {}
        const tierKey = typeof sj.model === 'string' && ['haiku', 'sonnet', 'opus', 'reasoning'].includes(sj.model)
          ? sj.model
          : 'sonnet'
        const envMap = {
          haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
          sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL,
          opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL,
          reasoning: env.ANTHROPIC_REASONING_MODEL,
        }
        model = String(envMap[tierKey] || sj.defaultModel || '').trim()
      }
    }
    return model || null
  }

  /** 从 ~/.claude/settings.json 读取作为兜底（不覆盖，只读取） */
  function readSystemSettingsJson() {
    try {
      const p = path.join(os.homedir(), '.claude', 'settings.json')
      if (!fs.existsSync(p)) return null
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch (_) { return null }
  }

  /**
   * 统一计算"本次请求真实生效"的 provider 配置。
   * 优先取 active provider，避免出现顶部字段与当前激活 provider 不一致。
   */
  function resolveEffectiveRuntimeConfig() {
    const providersState = confGet('claudeProviders', { providers: [], activeIdx: -1 })
    const providers = Array.isArray(providersState?.providers) ? providersState.providers : []
    const activeIdx = Number.isInteger(providersState?.activeIdx) ? providersState.activeIdx : -1
    const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : null
    const selectedTier = confGet('claudeSelectedTier', 'sonnet')

    const fallbackModel = {
      haiku: null,
      sonnet: null,
      opus: null,
      reasoning: null,
    }

    const mergedTierModels = {
      haiku: String(active?.tierModels?.haiku ?? confGet('tierModels.haiku', '')).trim(),
      sonnet: String(active?.tierModels?.sonnet ?? confGet('tierModels.sonnet', '')).trim(),
      opus: String(active?.tierModels?.opus ?? confGet('tierModels.opus', '')).trim(),
      reasoning: String(active?.tierModels?.reasoning ?? confGet('tierModels.reasoning', '')).trim(),
    }

    let nextApiKey = String(active?.key ?? confGet('claudeApiKey', '')).trim()
    let nextBaseURL = String(active?.url ?? confGet('claudeBaseURL', '')).trim()
    let nextModel = (mergedTierModels[selectedTier] || '').trim()
      || String(confGet('claudeModel', '')).trim()
      || fallbackModel[selectedTier]

    // 如果 app 存储中没有 key/URL/model，兜底从 ~/.claude/settings.json 读取
    if (!nextApiKey || !nextBaseURL || !nextModel) {
      const sj = readSystemSettingsJson()
      if (sj) {
        // 从 env 字段读取
        const envKey = sj.env?.ANTHROPIC_AUTH_TOKEN || ''
        const envUrl = sj.env?.ANTHROPIC_BASE_URL || ''
        const env = sj.env && typeof sj.env === 'object' ? sj.env : {}
        const tierKey = typeof sj.model === 'string' && ['haiku', 'sonnet', 'opus', 'reasoning'].includes(sj.model)
          ? sj.model
          : 'sonnet'
        const envModel = String({
          haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
          sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL,
          opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL,
          reasoning: env.ANTHROPIC_REASONING_MODEL,
        }[tierKey] || '').trim()
        // 兜底：从顶级字段读取
        const topKey = sj.primaryApiKey || sj.apiKey || ''
        const topUrl = sj.baseURL || sj.apiBaseUrl || ''
        const topModel = sj.defaultModel || ''
        if (!nextApiKey) nextApiKey = (envKey || topKey).trim()
        if (!nextBaseURL && nextBaseURL === '') nextBaseURL = (envUrl || topUrl).trim()
        if (!nextModel || nextModel === fallbackModel[selectedTier]) {
          const sjModel = (envModel || topModel).trim()
          if (sjModel) nextModel = sjModel
        }
      }
    }

    if (nextBaseURL && !nextBaseURL.endsWith('/')) nextBaseURL += '/'

    // 回写统一后的字段，确保后续所有入口读取到一致值
    confSet('claudeApiKey', nextApiKey)
    confSet('claudeBaseURL', nextBaseURL)
    confSet('claudeModel', nextModel)
    confSet('tierModels', mergedTierModels)

    return {
      apiKey: nextApiKey,
      baseURL: nextBaseURL,
      model: nextModel,
      selectedTier,
      tierModels: mergedTierModels,
      providersState,
      activeProvider: active,
    }
  }

  /**
   * 运行时配置：只读 ~/.claude/settings.json
   * - 运行时绝不读配置列表（internalConf/providers/tierModels）
   * - 运行时绝不写入 ~/.claude/settings.json
   */
  function readRuntimeConfigFromUserSettingsFile() {
    const sj = readSystemSettingsJson() || {}
    const env = sj && typeof sj.env === 'object' && sj.env ? sj.env : {}
    const tier = (typeof sj.model === 'string' ? sj.model.trim().toLowerCase() : '') || 'sonnet'
    const tierKey = ['haiku', 'sonnet', 'opus', 'reasoning'].includes(tier) ? tier : 'sonnet'

    const apiKey = String(
      env.ANTHROPIC_AUTH_TOKEN || sj.primaryApiKey || sj.apiKey || ''
    ).trim()
    let baseURL = String(
      env.ANTHROPIC_BASE_URL || sj.baseURL || sj.apiBaseUrl || ''
    ).trim()
    if (baseURL && !baseURL.endsWith('/')) baseURL += '/'

    // 真实模型 ID：优先按 tier 取对应分级模型，再兜底 ANTHROPIC_MODEL / defaultModel
    const tierMap = {
      haiku: String(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').trim(),
      sonnet: String(env.ANTHROPIC_DEFAULT_SONNET_MODEL || '').trim(),
      opus: String(env.ANTHROPIC_DEFAULT_OPUS_MODEL || '').trim(),
      reasoning: String(env.ANTHROPIC_REASONING_MODEL || '').trim(),
    }
    const model = String(
      tierMap[tierKey] ||
      env.ANTHROPIC_MODEL ||
      sj.defaultModel ||
      ''
    ).trim() || null

    // 供 SDK env 注入的分级模型字段（从 settings.json 来）
    const tierEnv = {}
    if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL) tierEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = env.ANTHROPIC_DEFAULT_HAIKU_MODEL
    if (env.ANTHROPIC_DEFAULT_SONNET_MODEL) tierEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = env.ANTHROPIC_DEFAULT_SONNET_MODEL
    if (env.ANTHROPIC_DEFAULT_OPUS_MODEL) tierEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = env.ANTHROPIC_DEFAULT_OPUS_MODEL
    if (env.ANTHROPIC_REASONING_MODEL) tierEnv.ANTHROPIC_REASONING_MODEL = env.ANTHROPIC_REASONING_MODEL

    return { apiKey, baseURL, model, tierKey, tierEnv }
  }

  // ─── Provider storage (T174: SQLite-authoritative with legacy projection) ──
  async function readClaudeProviders() {
    try {
      const db = await getDb({ userDataDir: getMindCraftUserDataDir() })
      const legacyReader = () => confGet('claudeProviders', null)
      const payload = getProviders(db, 'claude', legacyReader)
      if (payload.providers.length > 0) {
        await persistDb()
      }
      return payload.providers.length > 0 ? payload : null
    } catch (e) {
      console.error('[claude] readProviders error:', e.message)
      // Fallback: read legacy internalConf directly if DB path fails
      return confGet('claudeProviders', null)
    }
  }

  async function writeClaudeProviders(data) {
    try {
      const db = await getDb({ userDataDir: getMindCraftUserDataDir() })
      const result = setProviders(db, 'claude', data || { providers: [], activeIdx: 0 })
      if (result.ok) {
        // Legacy projection to internalConf (claude-internal.json)
        const legacyWriter = (payload) => {
          internalConf.set('claudeProviders', payload)
        }
        projectToLegacy(db, 'claude', legacyWriter)
        await persistDb()
      }
      return true
    } catch (e) {
      console.error('[claude] writeProviders error:', e.message)
      // Fallback: write internalConf directly
      try {
        internalConf.set('claudeProviders', data || { providers: [], activeIdx: -1 })
      } catch (_) {}
      return true
    }
  }

  // Capture provider storage for system-level import IPC (T163).
  _claudeProviderStorage = {
    confGet,
    confSet,
    getMindCraftUserDataDir,
    readRuntimeConfigFromUserSettingsFile,
    readProviders: readClaudeProviders,
    writeProviders: writeClaudeProviders,
  }

  ipcMain.handle('claude-get-model', () => readPrimaryModel())
  ipcMain.handle('claude-set-model', (_, model) => { confSet('claudeModel', model); return true })
  ipcMain.handle('claude-set-key', (_, key) => { confSet('claudeApiKey', key); return true })
  ipcMain.handle('claude-set-base-url', (_, url) => { confSet('claudeBaseURL', url); return true })
  ipcMain.handle('claude-get-models', () => confGet('claudeModels', defaultModels))
  ipcMain.handle('claude-set-models', (_, models) => { confSet('claudeModels', models); return true })
  ipcMain.handle('claude-add-model', (_, model) => {
    if (!model || !model.id) return false
    const list = confGet('claudeModels', [...defaultModels])
    if (list.some(m => m.id === model.id)) return false
    list.push(model)
    confSet('claudeModels', list)
    return true
  })
  ipcMain.handle('claude-remove-model', (_, modelId) => {
    if (!modelId) return false
    const list = confGet('claudeModels', [...defaultModels])
    const idx = list.findIndex(m => m.id === modelId)
    if (idx === -1) return false
    list.splice(idx, 1)
    confSet('claudeModels', list)
    return true
  })
  ipcMain.handle('claude-get-providers', async () => readClaudeProviders())
  ipcMain.handle('claude-set-providers', async (_, data) => {
    await writeClaudeProviders(data)
    // 同步更新 key/url 为当前激活的 provider（写入 ~/.claude/settings.json）
    const active = data.providers?.[data.activeIdx ?? 0]
    if (active) {
      confSet('claudeApiKey', active.key || '')
      confSet('claudeBaseURL', active.url || '')
    }
    return true
  })
  ipcMain.handle('claude-activate-provider', async (_, data) => {
    const providers = Array.isArray(data?.providers) ? data.providers : []
    const activeIdx = Number.isInteger(data?.activeIdx) ? data.activeIdx : -1
    const selectedTier = ['haiku', 'sonnet', 'opus', 'reasoning'].includes(data?.selectedTier)
      ? data.selectedTier
      : 'sonnet'
    const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : null
    const inputTierModels = data?.tierModels && typeof data.tierModels === 'object' ? data.tierModels : null
    const tierModels = {
      haiku: (inputTierModels?.haiku ?? active?.tierModels?.haiku ?? '').toString().trim(),
      sonnet: (inputTierModels?.sonnet ?? active?.tierModels?.sonnet ?? '').toString().trim(),
      opus: (inputTierModels?.opus ?? active?.tierModels?.opus ?? '').toString().trim(),
      reasoning: (inputTierModels?.reasoning ?? active?.tierModels?.reasoning ?? '').toString().trim(),
    }
    const fallbackModel = {
      haiku: null,
      sonnet: null,
      opus: null,
      reasoning: null,
    }
    const requestedModel = typeof data?.model === 'string' ? data.model.trim() : ''
    const model = requestedModel || (tierModels[selectedTier] || '').trim() || fallbackModel[selectedTier]

    // Write providers to SQLite via repository (with legacy projection to internalConf)
    await writeClaudeProviders({ providers, activeIdx })

    // tierModels 仍写入 internalConf（独立的配置，不通过 provider repository）
    internalConf.set('tierModels', tierModels)

    resetAgentRuntime('provider-activated')
    return { ok: true, model }
  })
  ipcMain.handle('claude-get-selected-tier', () => {
    // 从 ~/.claude/settings.json 读取默认 tier（SDK 原生路径）
    const sj = readSystemSettingsJson()
    if (sj && typeof sj.model === 'string' && ['haiku','sonnet','opus','reasoning'].includes(sj.model)) {
      return sj.model
    }
    return 'sonnet'
  })
  ipcMain.handle('claude-set-selected-tier', (_, tier) => {
    const valid = ['haiku', 'sonnet', 'opus', 'reasoning']
    if (!valid.includes(tier)) return false
    confSet('claudeSelectedTier', tier)
    return true
  })

  const TIER_ENV_MAP = {
    haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    reasoning: 'ANTHROPIC_REASONING_MODEL',
  }

  function readTierModelsFromSystemSettings() {
    const sj = readSystemSettingsJson()
    const env = sj && typeof sj.env === 'object' ? sj.env : {}
    return {
      haiku: String(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').trim(),
      sonnet: String(env.ANTHROPIC_DEFAULT_SONNET_MODEL || '').trim(),
      opus: String(env.ANTHROPIC_DEFAULT_OPUS_MODEL || '').trim(),
      reasoning: String(env.ANTHROPIC_REASONING_MODEL || '').trim(),
    }
  }

  function readTierModelsFromConf() {
    const providersState = confGet('claudeProviders', { providers: [], activeIdx: -1 })
    const providers = Array.isArray(providersState?.providers) ? providersState.providers : []
    const activeIdx = Number.isInteger(providersState?.activeIdx) ? providersState.activeIdx : -1
    const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : null
    const activeModels = active?.tierModels && typeof active.tierModels === 'object' ? active.tierModels : {}
    const settingsModels = readTierModelsFromSystemSettings()
    const storedModels = internalConf.get('tierModels', {}) || {}

    const models = {
      haiku: String(activeModels.haiku || settingsModels.haiku || storedModels.haiku || '').trim(),
      sonnet: String(activeModels.sonnet || settingsModels.sonnet || storedModels.sonnet || '').trim(),
      opus: String(activeModels.opus || settingsModels.opus || storedModels.opus || '').trim(),
      reasoning: String(activeModels.reasoning || settingsModels.reasoning || storedModels.reasoning || '').trim(),
    }
    return models
  }
  function writeTierModelsToConf(models) {
    confSet('tierModels', {
      haiku: (models.haiku || '').trim(),
      sonnet: (models.sonnet || '').trim(),
      opus: (models.opus || '').trim(),
      reasoning: (models.reasoning || '').trim(),
    })
    return true
  }

  function buildTierEnv() {
    const tierModels = readTierModelsFromConf()
    const env = {}
    for (const [key, envVar] of Object.entries(TIER_ENV_MAP)) {
      if (tierModels[key]) env[envVar] = tierModels[key]
    }
    return env
  }

  ipcMain.handle('claude-get-tier-models', () => readTierModelsFromConf())
  ipcMain.handle('claude-set-tier-models', (_, data) => {
    if (!data || typeof data !== 'object') return false
    return writeTierModelsToConf(data)
  })

  // 从 mindcraft-electron 导入 Claude 配置（手动触发）
  ipcMain.handle('claude-import-legacy-config', (_, customPath) => {
    const imported = { providers: 0, tierModels: false }
    try {
      const legacyDir = customPath || findLegacyUserData()
      if (!legacyDir) return { notFound: true }

      // ① 优先从 mindcraft-electron 的 claude-internal.json 读取 Provider 列表
      const internalPath = path.join(legacyDir, 'claude-internal.json')
      if (fs.existsSync(internalPath)) {
        let legacy = {}
        try { legacy = JSON.parse(fs.readFileSync(internalPath, 'utf8')) } catch {}

        if (legacy.claudeProviders?.providers?.length) {
          confSet('claudeProviders', legacy.claudeProviders)
          imported.providers = legacy.claudeProviders.providers.length
        }
        if (legacy.tierModels && typeof legacy.tierModels === 'object') {
          confSet('tierModels', legacy.tierModels)
          imported.tierModels = true
        }
        if (typeof legacy.claudeModel === 'string' && legacy.claudeModel.trim()) {
          internalConf.set('claudeModel', legacy.claudeModel.trim())
        }
        if (typeof legacy.claudeThinkingEnabled === 'boolean') {
          internalConf.set('claudeThinkingEnabled', legacy.claudeThinkingEnabled)
        }
      }

      // ② 没有 Provider 时，从共享的 ~/.claude/settings.json 用 Key 创建一个默认 Provider
      //    仅当 mindcraft-agent 自身还没有任何 Provider 时才创建，避免重复导入
      if (!imported.providers) {
        const existing = internalConf.get('claudeProviders', null)
        if (!existing?.providers?.length) {
          const sj = readSystemSettingsJson() || {}
          const key = sj.env?.ANTHROPIC_AUTH_TOKEN || sj.primaryApiKey || sj.apiKey || ''
          if (key) {
            const url = sj.env?.ANTHROPIC_BASE_URL || sj.baseURL || sj.apiBaseUrl || ''
            const defaultProvider = {
              name: '从 MindCraft 导入',
              key,
              url,
              config: sj,
              tierModels: {
                haiku: (sj.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').trim(),
                sonnet: (sj.env?.ANTHROPIC_DEFAULT_SONNET_MODEL || '').trim(),
                opus: (sj.env?.ANTHROPIC_DEFAULT_OPUS_MODEL || '').trim(),
                reasoning: (sj.env?.ANTHROPIC_REASONING_MODEL || '').trim(),
              },
            }
            confSet('claudeProviders', { providers: [defaultProvider], activeIdx: 0 })
            imported.providers = 1
          }
        }
      }

      return { success: true, imported }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  // ---- Import: preview (local-cli only) ----
  ipcMain.handle('claude-config-import-preview', async (_, payload) => {
    const { source } = payload || {};

    if (source === 'cc-switch') {
      return { ok: false, providers: [], warnings: ['CC Switch import has moved to System Settings > Import Config.'] };
    }
    if (source !== 'local-cli') {
      return { ok: false, providers: [], warnings: [`Unsupported source: ${source}`] };
    }

    try {
      const fromFile = readRuntimeConfigFromUserSettingsFile();
      const cliConfig = { ANTHROPIC_AUTH_TOKEN: fromFile.apiKey || '', ANTHROPIC_BASE_URL: fromFile.baseURL || '' };
      const preview = previewLocalCliConfig({ agentType: 'claude', cliConfig });
      if (!preview.ok) return preview;

      const stored = await readClaudeProviders() || { providers: [], activeIdx: -1 };
      preview.providers = annotateConflicts(preview.providers, stored.providers || []);

      return preview;
    } catch (e) {
      return { ok: false, providers: [], warnings: [e.message] };
    }
  });

  // ---- Import: commit (local-cli only) ----
  ipcMain.handle('claude-config-import-commit', async (_, payload) => {
    const { source, providers: decisions } = payload || {};

    if (source === 'cc-switch') {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: ['CC Switch import has moved to System Settings > Import Config.'] };
    }
    if (source !== 'local-cli') {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: [`Unsupported source: ${source}`] };
    }

    try {
      const fromFile = readRuntimeConfigFromUserSettingsFile();
      const cliConfig = { ANTHROPIC_AUTH_TOKEN: fromFile.apiKey || '', ANTHROPIC_BASE_URL: fromFile.baseURL || '' };
      const preview = previewLocalCliConfig({ agentType: 'claude', cliConfig });
      if (!preview.ok) return { ...preview, imported: 0, skipped: 0, backupPath: '' };

      const stored = await readClaudeProviders() || { providers: [], activeIdx: -1 };
      const existing = stored.providers || [];

      const userDataDir = getMindCraftUserDataDir();
      const db = await getDb({ userDataDir });

      const result = commitImport(db, {
        providers: decisions || [],
        previewProviders: preview.providers,
        existingProviders: existing.map((p, i) => ({
          id: p.id,  // real UUID from repository
          name: p.name,
          config: { key: p.key || '', url: p.url || '', model: '', reasoningEffort: '', apiFormat: '' },
          isActive: i === (stored.activeIdx ?? -1),
        })),
        agentType: 'claude',
        source: 'local-cli',
        sourcePath: null,
        userDataDir,
      });

      if (!result.ok) return { ...result, imported: 0, skipped: 0, backupPath: '' };

      // Persist to disk (sql.js is in-memory)
      await persistDb();

      // Project to legacy via repository (handles projection_status)
      const legacyWriter = (payload) => { internalConf.set('claudeProviders', payload) };
      projectToLegacy(db, 'claude', legacyWriter);
      await persistDb();

      // 同步 active key/url 到 settings.json
      const newProviders = result.providers || [];
      const newActiveIdx = Math.max(-1, stored.activeIdx ?? -1);
      const newActive = newActiveIdx >= 0 && newActiveIdx < newProviders.length ? newProviders[newActiveIdx] : null;
      if (newActive) {
        confSet('claudeApiKey', newActive.key || newActive.config?.key || '')
        confSet('claudeBaseURL', newActive.url || newActive.config?.url || '')
      }

      return {
        ok: true,
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        backupPath: result.backupPath || '',
        warnings: result.warnings || [],
      };
    } catch (e) {
      return { ok: false, imported: 0, skipped: 0, backupPath: '', warnings: [e.message] };
    }
  });

  // ── 简易对话：读取运行时配置（合并 UI 配置 + settings.json）──
  function readChatRuntimeConfig() {
    const fromFile = readRuntimeConfigFromUserSettingsFile()

    // 优先读 UI 中激活的 provider（internalConf），再兜底 settings.json
    const providersState = confGet('claudeProviders', { providers: [], activeIdx: -1 })
    const providers = Array.isArray(providersState?.providers) ? providersState.providers : []
    const activeIdx = Number.isInteger(providersState?.activeIdx) ? providersState.activeIdx : -1
    const active = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : null
    const selectedTier = confGet('claudeSelectedTier', 'sonnet')

    const tierModels = {
      haiku: String(active?.tierModels?.haiku ?? confGet('tierModels.haiku', '')).trim(),
      sonnet: String(active?.tierModels?.sonnet ?? confGet('tierModels.sonnet', '')).trim(),
      opus: String(active?.tierModels?.opus ?? confGet('tierModels.opus', '')).trim(),
      reasoning: String(active?.tierModels?.reasoning ?? confGet('tierModels.reasoning', '')).trim(),
    }

    let apiKey = String(active?.key ?? confGet('claudeApiKey', '')).trim()
    let baseURL = String(active?.url ?? confGet('claudeBaseURL', '')).trim()

    // 兜底到 settings.json
    if (!apiKey) apiKey = fromFile.apiKey
    if (!baseURL) baseURL = fromFile.baseURL
    if (baseURL && !baseURL.endsWith('/')) baseURL += '/'

    let defaultModel = tierModels[selectedTier] || fromFile.model || null

    return { apiKey, baseURL, model: defaultModel, tierModels, selectedTier }
  }

  // ── 简易对话：Claude streaming ──
  // chatId -> AbortController（支持渲染进程主动中止主进程流）
  const activeChatAborts = new Map()

  // ── 原生 fetch + SSE 流式（不用 SDK stream，避免内部缓冲 OOM）──
  /** 硬上限：防止第三方模型 thinking 模式输出失控拖垮主进程 */
  const MAX_STREAM_CHUNKS = 5000    // 最多处理 5000 个 SSE 事件
  const MAX_STREAM_CHARS = 100_000  // 累计文本最多 100K 字符
  const MAX_THINKING_CHARS = 50_000 // thinking 内容上限 50K 字符（防止第三方 provider 发送过多 thinking）

  async function runClaudeChatStream(event, { chatId, messages, model, tools, tool_choice, max_tokens, thinking, system }) {
    const rt = readChatRuntimeConfig()
    if (!rt.apiKey) throw new Error(lt('api.noKey', { provider: 'Claude' }))

    const baseURL = (rt.baseURL || 'https://api.anthropic.com').replace(/\/+$/, '')
    const url = baseURL + '/v1/messages'

    const body = {
      model: model || rt.model || 'claude-sonnet-4-20250514',
      max_tokens: max_tokens || 4096,
      messages,
      stream: true,
    }
    if (system) body.system = system
    if (tools && tools.length > 0) body.tools = tools
    if (tool_choice) body.tool_choice = tool_choice
    let thinkingRequested = false
    if (thinking) {
      if (thinking.type === 'disabled') {
        // 显式关闭思考（第三方 provider 可能不理会，已尽力）
        body.thinking = { type: 'disabled' }
      } else {
        const budget = Math.max(512, Math.min(thinking.budget_tokens || 4096, 4096))
        body.thinking = { type: 'enabled', budget_tokens: budget }
        body.max_tokens = Math.max(body.max_tokens, budget + 512)
        body.max_tokens = Math.min(body.max_tokens, 8192)
        thinkingRequested = true
      }
    }
    body.max_tokens = Math.min(body.max_tokens, 8192)

    const controller = new AbortController()
    if (chatId) activeChatAborts.set(chatId, controller)

    let fullText = ''
    let thinkingChars = 0
    const toolUseBlocks = []
    let stopReason = null
    let usage = null
    let chunkCount = 0

    try {
      // 总体请求超时 60 秒（防止第三方 provider 无限挂起）
      const timeoutSignal = AbortSignal.timeout(60_000)
      const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal])

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': rt.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 300)}`)
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
            const raw = trimmed.slice(5).trim()

            let json
            try { json = JSON.parse(raw) } catch (_) { continue }

            chunkCount++
            if (chunkCount > MAX_STREAM_CHUNKS) {
              // 输出失控，截断
              controller.abort()
              stopReason = 'max_chunks_exceeded'
              break
            }

            switch (json.type) {
              case 'content_block_start': {
                if (json.content_block?.type === 'tool_use') {
                  const block = { id: json.content_block.id, name: json.content_block.name, input: '' }
                  toolUseBlocks.push(block)
                  safeSend(event.sender, 'claude-stream-tool-start', { chatId, id: block.id, name: block.name })
                }
                break
              }
              case 'content_block_delta': {
                const delta = json.delta || {}
                if (delta.thinking) {
                  // thinking 内容也需要上限，防止第三方 provider 发送过多 thinking 导致卡死
                  if (thinkingChars < MAX_THINKING_CHARS) {
                    thinkingChars += delta.thinking.length
                    safeSend(event.sender, 'claude-stream-thinking', { chatId, text: delta.thinking })
                  }
                }
                if (delta.text) {
                  if (fullText.length < MAX_STREAM_CHARS) {
                    fullText += delta.text
                    safeSend(event.sender, 'claude-stream-chunk', { chatId, text: delta.text })
                  }
                }
                if (delta.partial_json) {
                  const last = toolUseBlocks[toolUseBlocks.length - 1]
                  if (last) {
                    last.input += delta.partial_json
                    safeSend(event.sender, 'claude-stream-tool-input', { chatId, id: last.id, partial: delta.partial_json })
                  }
                }
                break
              }
              case 'message_delta': {
                stopReason = json.delta?.stop_reason || null
                usage = json.usage || null
                break
              }
              case 'message_stop': {
                // 流正常结束
                break
              }
            }
          }
          // chunkCount 超限 → 退外层循环
          if (chunkCount > MAX_STREAM_CHUNKS) break
        }
      } finally {
        try { reader.releaseLock() } catch (_) {}
      }
    } catch (e) {
      if (controller.signal.aborted) {
        return { fullText, toolUseBlocks: [], stop_reason: 'aborted', usage: null }
      }
      // 处理超时错误（AbortSignal.timeout）
      if (e?.name === 'TimeoutError' || e?.message?.includes('timeout') || e?.message?.includes('The operation was aborted')) {
        return { fullText, toolUseBlocks: [], stop_reason: 'timeout', usage: null }
      }
      throw e
    } finally {
      if (chatId) activeChatAborts.delete(chatId)
    }

    return {
      fullText,
      toolUseBlocks: toolUseBlocks.map(t => ({ id: t.id, name: t.name, input: t.input })),
      stop_reason: stopReason || (toolUseBlocks.length > 0 ? 'tool_use' : 'end_turn'),
      usage,
    }
  }

  ipcMain.handle('claude-chat', async (event, payload) => runClaudeChatStream(event, payload))
  ipcMain.handle('claude-chat-continue', async (event, payload) => runClaudeChatStream(event, payload))
  ipcMain.handle('claude-chat-abort', (_event, { chatId }) => {
    const ab = activeChatAborts.get(chatId)
    if (ab) { ab.abort(); activeChatAborts.delete(chatId); return true }
    return false
  })

  // ── 简易对话：会话持久化（JSON 文件）──
  const CHAT_SESSIONS_DIR = path.join(app.getPath('userData'), 'chat-sessions')
  const CHAT_SESSIONS_INDEX = path.join(CHAT_SESSIONS_DIR, 'index.json')

  function ensureChatSessionsDir() {
    if (!fs.existsSync(CHAT_SESSIONS_DIR)) fs.mkdirSync(CHAT_SESSIONS_DIR, { recursive: true })
  }
  function readChatIndex() {
    ensureChatSessionsDir()
    try {
      if (fs.existsSync(CHAT_SESSIONS_INDEX)) {
        return JSON.parse(fs.readFileSync(CHAT_SESSIONS_INDEX, 'utf8'))
      }
    } catch (_) {}
    return { sessions: [] }
  }
  // P1-1：index 写入串行队列，避免 chat-save-session 高频调用时 read-modify-write 覆盖
  let _indexWriteQueue = Promise.resolve()
  async function writeChatIndexAsync(data) {
    _indexWriteQueue = _indexWriteQueue.then(async () => {
      ensureChatSessionsDir()
      const tmp = CHAT_SESSIONS_INDEX + '.tmp'
      await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf8')
      await fs.promises.rename(tmp, CHAT_SESSIONS_INDEX)
    })
    return _indexWriteQueue
  }

  // ---- Leaf IPC modules (aggregated via claude/index.js, R09 Phase A) ----
  registerClaudeLeafIpcs(ipcMain, {
    lt,
    getClaudeFreezeDiagEnabled,
    getClaudeFreezeDiagLogPath,
    setClaudeFreezeDiagEnabled,
    CHAT_SESSIONS_DIR,
    ensureChatSessionsDir,
    readChatIndex,
    writeChatIndexAsync,
  })

  // Claude Agent SDK 会话管理
  //
  // 这里的 `sessionId` 是 renderer/runtime chat key（T130 中称为 chatKey），
  // 不是 Claude SDK 的 CLI session UUID。真实 CLI UUID 存在 cliSessionIds 中，
  // 并对应磁盘上的 `<cliSessionId>.jsonl`。磁盘 artifact 不应使用 chatKey 定位。
  const agentSessions = new Map()  // chatKey -> { query, event, abortController, model, cwd }
  const cliSessionIds = new Map()  // chatKey -> SDK session_id (for resume)
  const sessionModels = new Map()  // chatKey -> model used by last completed query
  const metricsPollers = new Map() // chatKey -> { interval, startTime, lastCliSessionId }
  const slowNoticeSent = new Set() // chatKey 已提示"响应较慢"
  const slashCommandsCache = new Map() // key -> { ts, commands }
  const compactSummaries = new Map() // chatKey -> { summary, trigger, updatedAt }
  const pendingSessionMetaByChatKey = new Map() // chatKey -> meta waiting for first cliSessionId

  function resetAgentRuntime(_reason) {
    for (const [sid, session] of agentSessions.entries()) {
      try { session.abortController?.abort?.() } catch (_) {}
      try { session.query?.close?.() } catch (_) {}
      agentSessions.delete(sid)
    }
    clearAllStores()
    // 注意：不清理 cliSessionIds。它们是 renderer chatKey -> SDK 会话 UUID 的映射，
    // 仅用于 resume 查询，不依赖当前 SDK 实例。Provider 切换后 renderer 会重新注册所有聊天。
    sessionModels.clear()
    slowNoticeSent.clear()
    slashCommandsCache.clear()
    compactSummaries.clear()
    pendingSessionMetaByChatKey.clear()
    resetClaudeSdkPromise()
    resetSystemClaudeCache()
  }

  ipcMain.handle('claude-agent-query', async (event, { prompt, images, cwd, sessionId, runMode, model: modelOverride, effort: effortOverride, modelTier: modelTierOverride, sessionInstruction }) => {
    const chatKey = sessionId
    const runtime = readRuntimeConfigFromUserSettingsFile()
    const apiKey = runtime.apiKey
    const baseURL = runtime.baseURL
    const cliSessionIdForMeta = cliSessionIds.get(chatKey) || ''
    const sessionMeta = cliSessionIdForMeta ? readClaudeSessionMeta(cwd, cliSessionIdForMeta) : {}
    const requestedMeta = normalizeClaudeSessionMeta({
      model: modelOverride || sessionMeta.model || runtime.model,
      effort: effortOverride || sessionMeta.effort || readEffortLevel(),
      modelTier: modelTierOverride || sessionMeta.modelTier || '',
    })
    const model = requestedMeta.model || runtime.model
    const effort = requestedMeta.effort || readEffortLevel()
    pendingSessionMetaByChatKey.set(chatKey, { model, effort, modelTier: requestedMeta.modelTier })
    const permissionPolicy = readPermissionPolicy()
    const mode = ['ask_before_edits', 'edit_automatically', 'plan_mode'].includes(runMode)
      ? runMode
      : 'edit_automatically'

    function buildContent(text, imgs) {
      const blocks = []
      if (imgs && imgs.length) {
        for (const img of imgs) {
          const base64 = img.dataUrl.replace(/^data:[^;]+;base64,/, '')
          blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/png', data: base64 } })
        }
      }
      if (text) blocks.push({ type: 'text', text })
      return blocks.length === 1 && blocks[0].type === 'text' ? text : blocks
    }

    // 复用仍在运行的 Query（首轮 result 后 SDK 可能仍保持会话，需要 streamInput 续写）
    const existing = agentSessions.get(chatKey)
    if (existing && existing.query) {
      // 当前会话正在运行时若切换了模型，关闭旧会话并按新模型重新创建。
      const runtimeChanged = (
        (existing.model || '') !== (model || '') ||
        (existing.baseURL || '') !== (baseURL || '') ||
        (existing.apiKey || '') !== (apiKey || '')
      )
      if (runtimeChanged) {
        try { existing.abortController?.abort?.() } catch (_) {}
        try { existing.query?.close?.() } catch (_) {}
        // 只清除 SDK Query 对象，保留 cliSessionIds 以便 resume 对话历史。
        agentSessions.delete(chatKey)
        console.log(`[Claude] 检测到运行时配置变更，chatKey=${chatKey.slice(-8)}，已中止旧查询。` +
          `模型: ${existing.model || '(none)'} → ${model || '(none)'}，` +
          `cliSessionId: ${cliSessionIds.get(chatKey) || '(none)'}`)
        // 不 return，继续执行后续逻辑以创建新查询并 resume
      } else {
      existing.event = event
      const userMsg = {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: buildContent(prompt, images),
        },
      }
      ;(async () => {
        try {
          await existing.query.streamInput((async function* () { yield userMsg })())
        } catch (err) {
          const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
          safeSend(sender,'claude-agent-message', {
            sessionId,
            msg: {
              type: 'system',
              message: { content: [{ type: 'text', text: lt('send.failed', { error: err?.message || err }) }] },
            },
          })
        }
      })()
      return
      }
    }

    return new Promise((resolve) => {
      const previousModel = sessionModels.get(chatKey)
      const previousCliSessionId = cliSessionIds.get(chatKey)
      // 允许 resume 的条件：有 cliSessionId 且为有效 UUID 格式（CLI --resume 要求 UUID）
      const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
      const resumedSessionId = (previousCliSessionId && isValidUuid(previousCliSessionId)) ? previousCliSessionId : undefined

      // 记录模型切换和 resume 状态
      if (previousModel && previousModel !== model) {
        console.log(`[Claude] 检测到模型切换 ${previousModel} → ${model}，chatKey=${chatKey.slice(-8)}，` +
          `cliSessionId=${previousCliSessionId || '(none)'}，` +
          `将${resumedSessionId ? 'resume 历史记录' : '创建新会话（无可用的 cliSessionId）'}`)
      } else if (resumedSessionId) {
        console.log(`[Claude] 继续会话，chatKey=${chatKey.slice(-8)}，cliSessionId=${resumedSessionId}，model=${model}`)
      }
      const abortController = new AbortController()
      let gotAnyMessage = false
      let resultReceived = false
      let doneSent = false
      const liveSampleCounts = { sdkLiveCount: 0, jsonlPollCount: 0, tokenCountCount: 0, sdkResultCount: 0, sawLiveTurnTokens: false, sawFinalTurnTokens: false }
      let _agentRunDoneFilePath = '' // PR 2：在 result/fallback 捕获 filePath，finally 使用
      let exitCode = 0
      const resolvedCwd = path.resolve(cwd || process.cwd())
      const extraDirs = additionalDirsFromUserText(resolvedCwd, prompt || '')
      const bootWatch = setTimeout(() => {
        if (!gotAnyMessage) {
          if (slowNoticeSent.has(chatKey)) return
          slowNoticeSent.add(chatKey)
          const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
          safeSend(sender,'claude-agent-message', {
            sessionId,
            msg: {
              type: 'system',
              message: {
                content: [{ type: 'text', text: lt('claude.slow') }],
              },
            },
          })
        }
      }, 30000)
      ;(async () => {
        const runQuery = async (rid) => {
          const { query } = await loadClaudeAgentSdk()
          // Memory user 模式注入：在首条消息前加上 memory 内容
          let effectivePrompt = prompt
          const memInjectMode = readMemoryInjectMode()
          if (memInjectMode === 'user' && !rid) {
            const memBlock = claudeMemory.buildMemoryPrompt(resolvedCwd)
            if (memBlock) effectivePrompt = memBlock + '\n\n' + (prompt || '')
          }
          const userMsg = {
            type: 'user',
            parent_tool_use_id: null,
            message: {
              role: 'user',
              content: buildContent(effectivePrompt, images),
            },
          }
          const systemClaudePath = await findSystemClaude()
          if (!systemClaudePath) {
            return { error: lt('claude.notInstalled'), details: lt('claude.notInstalledHint') }
          }
          // SDK 只从 settings.json 读取 autoCompactWindow（settingSources: ['user']）
          // query() 的 Options 类型不含此字段，显式传参被静默忽略。
          // 若用户未在设置面板配置过，写入默认值（模型上下文窗口）以确保自动压缩生效。
          ;(() => {
            const s = readGlobalSettings()
            if (s.autoCompactWindow === undefined) {
              const ctxWin = claudeMetrics.getContextWindowForModel(model)
              s.autoCompactWindow = ctxWin
              writeGlobalSettings(s)
            }
          })()
          const sessionInstructionPrompt = await buildSessionInstructionPrompt(sessionInstruction)
          const q = query({
            prompt: (async function* () { yield userMsg })(),
            options: {
              cwd: resolvedCwd,
              ...(extraDirs.length ? { additionalDirectories: extraDirs } : {}),
              model,
              maxTurns: 200,
              permissionMode: 'default',
              resume: rid,
              settingSources: ['user'],
              pathToClaudeCodeExecutable: systemClaudePath,
              thinking: internalConf.get('claudeThinkingEnabled', true)
                ? { type: 'adaptive' }
                : { type: 'disabled' },
              effort,
              skipWebFetchPreflight: true,
              systemPrompt: (() => {
                const parts = [
                  buildSystemPrompt(resolvedCwd),
                  sessionInstructionPrompt,
                  mode === 'plan_mode'
                    ? '当前模式为 Plan mode：在执行任何文件写入、修改或命令执行之前，必须先输出一份清晰的实施计划（包含步骤、涉及文件、预期效果）。计划输出后，可以按步骤逐步执行，不要一次性批量修改。'
                    : '',
                ]
                const injectMode = readMemoryInjectMode()
                if (injectMode === 'system') {
                  const memoryBlock = claudeMemory.buildMemoryPrompt(resolvedCwd)
                  if (memoryBlock) parts.push(memoryBlock)
                }
                return parts.filter(Boolean).join('\n')
              })(),
              env: buildSystemClaudeEnv({
                PYTHONUTF8: '1',
                ...(apiKey ? { ANTHROPIC_AUTH_TOKEN: apiKey } : {}),
                ...(baseURL ? { ANTHROPIC_BASE_URL: baseURL } : {}),
                ...runtime.tierEnv,
              }),
              canUseTool: async (toolName, input, meta) => {
                gotAnyMessage = true
                const fp = input && (input.file_path || input.path)
                if (fp && typeof fp === 'string') {
                  try {
                    const abs = path.isAbsolute(fp) ? path.resolve(fp) : path.resolve(resolvedCwd, fp)
                    const cwdL = resolvedCwd.toLowerCase()
                    const absL = abs.toLowerCase()
                    if (absL !== cwdL && !absL.startsWith(cwdL + path.sep)) {
                      console.warn('[Claude] 工具路径不在当前工作目录下，写入可能被 Claude 拒绝。请在工具栏选择包含该文件的项目目录为工作目录。', { abs, cwd: resolvedCwd })
                    }
                  } catch (_) {}
                }

                // 只读/搜索类工具直接允许，不弹确认
                const nameLower = (toolName || '').toLowerCase()
                const safeTools = ['read_file', 'read', 'list_files', 'glob', 'grep', 'search_files',
                  'list_directory', 'get_file_info', 'search', 'find', 'ls',
                  'webfetch', 'web_fetch', 'websearch', 'web_search',
                  'todowrite', 'todo_write',
                  'taskcreate', 'task_create',
                  'taskupdate', 'task_update',
                  'taskdelete', 'task_delete',
                  'tasklist', 'task_list',
                  'enterplanmode', 'enter_plan_mode']
                if (safeTools.includes(nameLower)) {
                  return { behavior: 'allow', updatedInput: input }
                }
                // AskUserQuestion：发给前端让用户选择，等待回答后继续
                if (nameLower === 'askuserquestion' || nameLower === 'ask_user_question') {
                  const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
                  const requestId = `${sessionId}:${meta.toolUseID}:${Date.now()}`
                  const answers = await new Promise((resolve) => {
                    pendingPermissionResolvers.set(requestId, resolve)
                    safeSend(sender, 'claude-agent-ask-question', {
                      sessionId,
                      requestId,
                      questions: input.questions || [],
                    })
                  })
                  return { behavior: 'allow', updatedInput: { ...input, answers } }
                }
                // ExitPlanMode：专用计划审查流程（不论 runMode 是什么，始终让用户审查）
                if (nameLower === 'exitplanmode' || nameLower === 'exit_plan_mode') {
                  const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
                  const requestId = `${sessionId}:${meta.toolUseID}:${Date.now()}`
                  const plan = input.plan || ''
                  const planFilePath = input.planFilePath || ''
                  const action = await new Promise((resolve) => {
                    pendingPermissionResolvers.set(requestId, resolve)
                    safeSend(sender, 'claude-agent-plan-review', {
                      sessionId,
                      requestId,
                      plan,
                      planFilePath,
                      toolName,
                      description: meta.title || meta.description || '',
                      input,
                    })
                  })
                  // action: { type: 'accept' | 'reject' | 'feedback', feedback?: string }
                  if (!action || action.type === 'reject') {
                    return { behavior: 'deny', message: lt('plan.rejected') }
                  }
                  const updatedInput = { ...input, planAction: action.type }
                  if (action.type === 'feedback' && action.feedback) {
                    updatedInput.feedback = action.feedback
                  }
                  return { behavior: 'allow', updatedInput }
                }
                if (agentSessions.get(chatKey)?.runMode === 'edit_automatically') {
                  return { behavior: 'allow', updatedInput: input }
                }
                if (permissionPolicy === 'allow_all') {
                  return { behavior: 'allow', updatedInput: input }
                }
                if (permissionPolicy === 'read_only') {
                  return { behavior: 'deny', message: lt('perm.readonly') }
                }
                const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
                const requestId = `${sessionId}:${meta.toolUseID}:${Date.now()}`
                const msg = {
                  id: requestId,
                  request_id: requestId,
                  tool_name: toolName,
                  tool: toolName,
                  input,
                  description: meta.title || meta.description || `Claude 请求执行 ${toolName}`,
                }
                const allowed = await new Promise((permResolve) => {
                  pendingPermissionResolvers.set(requestId, (allow) => {
                    permResolve(!!allow)
                  })
                  safeSend(sender,'claude-agent-permission', {
                    sessionId,
                    msg: { ...msg, _requestId: requestId },
                  })
                })
                return allowed
                  ? { behavior: 'allow', updatedInput: input }
                  : { behavior: 'deny', message: lt('perm.denied') }
              },
              hooks: {
                PostCompact: [{
                  hooks: [async (hookInput) => {
                    const summary = hookInput?.compact_summary || ''
                    if (summary && typeof summary === 'string') {
                      compactSummaries.set(chatKey, {
                        summary,
                        trigger: hookInput?.trigger || 'manual',
                        updatedAt: Date.now(),
                      })
                      const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
                      safeSend(sender,'claude-agent-message', {
                        sessionId,
                        msg: {
                          type: 'system',
                          subtype: 'compact_summary',
                          message: {
                            content: [{ type: 'text', text: `压缩摘要：\n${summary}` }],
                          },
                        },
                      })
                    }
                    return { continue: true }
                  }],
                }],
              },
              abortController,
            },
          })
          agentSessions.set(chatKey, {
            query: q,
            event,
            abortController,
            model,
            cwd: resolvedCwd,
            baseURL,
            apiKey,
            runMode: mode,
          })
          // Phase 3：TurnStore — 开始新 turn
          beginTurn({ provider: 'claude', chatKey, startedAt: Date.now() })
          const sdkUsageAccumulator = createClaudeTurnUsageAccumulator()
          // 启动 metrics 轮询器。只推送真实 transcript 样本，不伪造中间值；
          // 轮询间隔缩短到 1s，提升状态栏动态感。
          const pollStart = Date.now()
          const pollInterval = setInterval(async () => {
            const s = agentSessions.get(chatKey)
            if (!s) { clearInterval(pollInterval); return }
            const cliId = cliSessionIds.get(chatKey)
            if (!cliId) return
            const metrics = await claudeMetrics.pollMetrics(cliId, s.cwd, s.model, true, {
              tokenSinceMs: pollStart,
            })
            if (metrics) {
              liveSampleCounts.jsonlPollCount += 1
              if ((metrics.inputTokens || 0) > 0 || (metrics.outputTokens || 0) > 0 || (metrics.cacheReadTokens || 0) > 0 || (metrics.cacheCreationTokens || 0) > 0) liveSampleCounts.sawLiveTurnTokens = true
              // Phase 3：TurnStore — jsonl transcript 已经按 tokenSinceMs 隔离到当前 turn。
              // 若 SDK 中途没给 usage，也允许用真实 jsonl 样本驱动当前 turn 的状态栏增长。
              emitClaudeMetricsViaStore(s.event?.sender, {
                source: 'jsonl-poll',
                scope: 'turn-live',
                providerSessionId: cliId,
                inputTokens: metrics.inputTokens,
                outputTokens: metrics.outputTokens,
                cacheReadTokens: metrics.cacheReadTokens,
                cacheCreationTokens: metrics.cacheCreationTokens,
                contextUsage: metrics.contextUsage,
                contextWindow: metrics.contextWindow,
                durationMs: metrics.durationMs,
                costUsd: metrics.costUsd,
                allowTurnTokens: true,
                rawUsage: metrics.rawUsage || null,
              }, sessionId, model || '', {
                speedOutputPerSec: metrics.speedOutputPerSec,
                gitBranch: metrics.gitBranch,
                gitChanges: metrics.gitChanges,
              })
            }
          }, CLAUDE_METRICS_POLL_INTERVAL_MS)
          metricsPollers.set(chatKey, { interval: pollInterval, startTime: pollStart })
          const backgroundTaskTracker = createClaudeBackgroundTaskTracker()

          async function sendCompletedDoneIfReady(sender, donePayload, { force = false } = {}) {
            if (doneSent) return false
            if (!force && backgroundTaskTracker.hasActiveTasks()) {
              backgroundTaskTracker.setPendingDonePayload(donePayload)
              return false
            }
            const finalPayload = donePayload || backgroundTaskTracker.takePendingDonePayload()
            if (!finalPayload) return false
            doneSent = true
            backgroundTaskTracker.clearPendingDonePayload()
            console.log('[Claude] agent-done → filePath:', finalPayload.filePath || '(empty)')
            safeSend(sender, 'claude-agent-done', finalPayload)
            _agentRunDoneFilePath = finalPayload.filePath || ''
            agentSessions.delete(chatKey)
            try {
              const { buildAgentTurnTerminalEvent, TerminalKind } = await getAgentProtocol()
              safeSend(sender, 'agent:event', buildAgentTurnTerminalEvent({
                agent: 'claudeCode',
                chatKey: sessionId,
                cliSessionId: finalPayload.cliSessionId || '',
                filePath: finalPayload.filePath,
                terminalKind: TerminalKind.COMPLETED,
                hasAssistantOutput: true,
              }))
            } catch (_) { /* 新通道发送失败不影响旧通道 */ }
            return true
          }

          for await (const msg of q) {
            if (!agentSessions.has(chatKey)) break
            const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
            gotAnyMessage = true
            backgroundTaskTracker.updateFromSdkMessage(msg)
            // 尽早注册 cliSessionId，并通知渲染进程用于精确匹配 pending chat
            if (msg?.session_id) {
              if (!cliSessionIds.has(chatKey)) {
                cliSessionIds.set(chatKey, msg.session_id)
                const pendingMeta = pendingSessionMetaByChatKey.get(chatKey)
                if (pendingMeta) writeClaudeSessionMeta(resolvedCwd, msg.session_id, pendingMeta, { chatKey })
                safeSend(sender, 'claude-agent-early-cli-session', { sessionId, cliSessionId: msg.session_id })
              }
            } else if (msg?.uuid && !cliSessionIds.has(chatKey)) {
              cliSessionIds.set(chatKey, msg.uuid)
              const pendingMeta = pendingSessionMetaByChatKey.get(chatKey)
              if (pendingMeta) writeClaudeSessionMeta(resolvedCwd, msg.uuid, pendingMeta, { chatKey })
              safeSend(sender, 'claude-agent-early-cli-session', { sessionId, cliSessionId: msg.uuid })
            }
            const liveUsageMetrics = extractClaudeLiveUsageMetricsFromSdkMessage(msg, model || '')
            if (liveUsageMetrics) {
              const liveUsageSnapshot = sdkUsageAccumulator.add(liveUsageMetrics)
              liveSampleCounts.sdkLiveCount += 1
              if ((liveUsageSnapshot.inputTokens || 0) > 0 || (liveUsageSnapshot.outputTokens || 0) > 0 || (liveUsageSnapshot.cacheReadTokens || 0) > 0 || (liveUsageSnapshot.cacheCreationTokens || 0) > 0) liveSampleCounts.sawLiveTurnTokens = true
              // Phase 3：TurnStore — sdk-live 更新 live snapshot
              emitClaudeMetricsViaStore(sender, {
                source: 'sdk-live',
                scope: 'turn-live',
                providerSessionId: cliSessionIds.get(chatKey) || '',
                ...liveUsageSnapshot,
                durationMs: Math.max(0, Date.now() - pollStart),
                rawUsage: msg?.message?.usage || null,
              }, sessionId, model || '')
            }
            if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
              for (const block of msg.message.content) {
                if (block.type === 'tool_use') {
                  const n = (block.name || '').toLowerCase()
                  const isWrite = n === 'write_file' || n === 'create_file' || n === 'write'
                  const isEdit = n === 'str_replace_based_edit' || n === 'edit_file' || n === 'edit' || n === 'str_replace'
                  if (isWrite || isEdit) {
                    const fp = block.input?.file_path || block.input?.path || ''
                    if (fp) {
                      try {
                        const absFp = path.isAbsolute(fp) ? fp : path.resolve(resolvedCwd, fp)
                        block.input._oldContent = fs.readFileSync(absFp, 'utf8')
                      }
                      catch (_) { block.input._oldContent = '' }
                    }
                  }
                }
              }
            }
            // Phase 4：对 result 消息，先 finalize TurnStore 再发送，确保前端收到 TurnStore snapshot
            if (msg.type === 'result') {
              liveSampleCounts.sdkResultCount += 1
              const usage = msg.usage || {}
              const normalizedUsage = claudeMetrics.normalizeClaudeUsageForUi(usage, model || '')
              const hasResultUsage = hasClaudeUsageTokenFields(usage)
              const snapshot = emitClaudeMetricsViaStore(sender, {
                source: 'sdk-result',
                scope: 'turn-final',
                providerSessionId: msg.session_id || '',
                inputTokens: hasResultUsage ? (normalizedUsage.inputTokens || 0) : undefined,
                outputTokens: hasResultUsage ? (normalizedUsage.outputTokens || 0) : undefined,
                cacheReadTokens: hasResultUsage ? (normalizedUsage.cacheReadTokens || 0) : undefined,
                cacheCreationTokens: hasResultUsage ? (normalizedUsage.cacheCreationTokens || 0) : undefined,
                durationMs: Number.isFinite(Number(msg.duration_ms)) && Number(msg.duration_ms) > 0 ? Number(msg.duration_ms) : undefined,
                costUsd: msg.total_cost_usd || 0,
                rawUsage: usage || null,
              }, sessionId, model || '', {
                numTurns: msg.num_turns || 0,
              })
              if (snapshot) {
                if ((snapshot.inputTokens || 0) > 0 || (snapshot.outputTokens || 0) > 0 || (snapshot.cacheReadTokens || 0) > 0 || (snapshot.cacheCreationTokens || 0) > 0) liveSampleCounts.sawFinalTurnTokens = true
                msg._turnTokens = {
                  inputTokens: snapshot.inputTokens,
                  outputTokens: snapshot.outputTokens,
                  cacheReadTokens: snapshot.cacheReadTokens,
                  cacheCreationTokens: snapshot.cacheCreationTokens,
                  durationMs: snapshot.durationMs,
                }
              }
            }
            safeSend(sender,'claude-agent-message', { sessionId, msg })
            if (resultReceived && !doneSent && !backgroundTaskTracker.hasActiveTasks() && backgroundTaskTracker.hasPendingDonePayload()) {
              await sendCompletedDoneIfReady(sender, null, { force: true })
            }
            if (msg.type === 'result') {
              if (msg.session_id) {
                cliSessionIds.set(chatKey, msg.session_id)
                sessionModels.set(chatKey, model)
                const pendingMeta = pendingSessionMetaByChatKey.get(chatKey)
                if (pendingMeta) writeClaudeSessionMeta(resolvedCwd, msg.session_id, pendingMeta, { chatKey })
              }
              // Phase 4：emitClaudeMetricsViaStore 已在 safeSend 前调用（TurnStore 已 finalize）
              resultReceived = true
              const sessionCwd = agentSessions.get(chatKey)?.cwd || resolvedCwd
              const donePayload = buildClaudeAgentDonePayload({
                sessionId,
                cliSessionId: msg.session_id,
                cwd: sessionCwd,
                reason: 'completed',
              })
              // SDK 的后台 Agent 会在主 turn result 之后继续发 task_notification。
              // 还有后台 task 时不能立刻 done，否则 renderer 会解锁输入且后续通知无人消费。
              await sendCompletedDoneIfReady(sender, donePayload)
            }
          }
          if (resultReceived && !doneSent && backgroundTaskTracker.hasPendingDonePayload()) {
            const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
            await sendCompletedDoneIfReady(sender, null, { force: true })
          }
        } // end runQuery

        try {
          await runQuery(resumedSessionId)
        } catch (err) {
          exitCode = -1
          const sender = agentSessions.get(chatKey)?.event?.sender || event.sender
          const errMsg = err?.message || String(err)
          if (err?.message?.includes('No conversation found') && resumedSessionId) {
            // session 失效，自动重试（不带 resume）
            console.log(`[Claude] resume 失败 (No conversation found)，chatKey=${chatKey.slice(-8)}，cliSessionId=${resumedSessionId}，将创建新会话`)
            cliSessionIds.delete(chatKey)
            sessionModels.delete(chatKey)
            try {
              await runQuery(undefined)
              exitCode = 0
            } catch (err2) {
              safeSend(sender,'claude-agent-message', {
                sessionId,
                msg: {
                  type: 'system',
                  subtype: 'error',
                  message: { content: [{ type: 'text', text: `Claude SDK 异常：${err2?.message || err2}` }] },
                },
              })
            }
          } else if (errMsg.includes('maximum number of turns') || errMsg.includes('maxTurns')) {
            // maxTurns 耗尽：清除旧 session 避免后续 resume 死循环
            cliSessionIds.delete(chatKey)
            sessionModels.delete(chatKey)
            safeSend(sender,'claude-agent-message', {
              sessionId,
              msg: {
                type: 'system',
                subtype: 'error',
                message: { content: [{ type: 'text', text: lt('maxSteps') }] },
              },
            })
          } else {
            safeSend(sender,'claude-agent-message', {
              sessionId,
              msg: {
                type: 'system',
                subtype: 'error',
                message: { content: [{ type: 'text', text: `Claude SDK 异常：${errMsg}` }] },
              },
            })
          }
        } finally {
          clearTimeout(bootWatch)
          // 停止 metrics 轮询器
          const poller = metricsPollers.get(chatKey)
          if (poller) {
            clearInterval(poller.interval)
            metricsPollers.delete(chatKey)
          }
          logTurnSampleSummary({
            provider: 'claude',
            chatKey,
            providerSessionId: cliSessionIds.get(chatKey) || '',
            turnId: chatKey,
            ...liveSampleCounts,
          })
          // Phase 3：清理 TurnStore current turn
          clearCurrentTurn(chatKey)
          const s = agentSessions.get(chatKey)
          if (!resultReceived && s) {
            const fallbackCliSessionId = cliSessionIds.get(chatKey) || ''
            // 如果错误发生在流式首条消息之前，cliSessionId 未注册。
            // 兜底扫描项目目录，按修改时间找本次查询创建的 .jsonl（误差窗口 60s）。
            let finalCliSessionId = fallbackCliSessionId
            let sessionFileIntegrity = null
            if (!finalCliSessionId && (s.cwd || resolvedCwd)) {
              try {
                const projectDir = getClaudeProjectsRootDir(s.cwd || resolvedCwd)
                if (fs.existsSync(projectDir)) {
                  const now = Date.now()
                  const candidate = fs.readdirSync(projectDir)
                    .filter(f => f.endsWith('.jsonl'))
                    .map(f => {
                      const fp = path.join(projectDir, f)
                      try { return { id: f.replace(/\.jsonl$/, ''), mtime: fs.statSync(fp).mtimeMs, fp } }
                      catch (_) { return null }
                    })
                    .filter(Boolean)
                    .filter(c => now - c.mtime < 60000)
                    .sort((a, b) => b.mtime - a.mtime)[0]
                  if (candidate) {
                    finalCliSessionId = candidate.id
                    cliSessionIds.set(chatKey, finalCliSessionId)
                    const pendingMeta = pendingSessionMetaByChatKey.get(chatKey)
                    if (pendingMeta) writeClaudeSessionMeta(s.cwd || resolvedCwd, finalCliSessionId, pendingMeta, { chatKey })
                    console.log(`[Claude] fallback scan found cliSessionId: ${finalCliSessionId.slice(0,8)}...`)
                  }
                }
              } catch (_) {}
            }
            if (finalCliSessionId && (s.cwd || resolvedCwd)) {
              const jsonlPath = path.join(getClaudeProjectsRootDir(s.cwd || resolvedCwd), `${finalCliSessionId}.jsonl`)
              sessionFileIntegrity = analyzeClaudeJsonlFileIntegrity(jsonlPath)
            }
            const doneReason = finalizeClaudeDoneReason({
              resultReceived,
              exitCode,
              fallbackReason: exitCode === 0 ? 'interrupted' : 'failed',
              sessionFileIntegrity,
            })
            const donePayload = buildClaudeAgentDonePayload({
              sessionId,
              cliSessionId: finalCliSessionId,
              cwd: s.cwd || resolvedCwd,
              reason: doneReason,
            })
            safeSend((s.event?.sender || event.sender), 'claude-agent-done', donePayload)
            _agentRunDoneFilePath = donePayload.filePath || ''  // PR 2：fallback 路径也捕获 filePath
          }
          // PR 2：双发 agent.run.done（finally 统一发送，abort/success/failure 全部覆盖）
          // agent.turn.terminal 在 result 到达时已发，此处是 run 收尾事件。
          // filePath 从 result/fallback 的 donePayload 捕获，abort 交给 finally 统一发。
          try {
            const { buildAgentRunDoneEvent } = await getAgentProtocol()
            safeSend(event.sender, 'agent:event', buildAgentRunDoneEvent({
              agent: 'claudeCode',
              chatKey: sessionId,
              cliSessionId: cliSessionIds.get(chatKey) || '',
              filePath: _agentRunDoneFilePath,
            }))
          } catch (_) { /* 新通道发送失败不影响旧通道 */ }
          agentSessions.delete(chatKey)
          pendingSessionMetaByChatKey.delete(chatKey)
          resolve(exitCode)
        }
      })()
    })
  })

  ipcMain.handle('claude-agent-abort', (_, sessionId) => {
    const chatKey = sessionId
    const s = agentSessions.get(chatKey)
    if (s) {
      try { s.abortController?.abort?.() } catch (_) {}
      try { s.query?.close?.() } catch (_) {}
      agentSessions.delete(chatKey)
      pendingSessionMetaByChatKey.delete(chatKey)
      safeSend(s.event?.sender, 'claude-agent-done', buildClaudeAgentDonePayload({
        sessionId,
        cliSessionId: cliSessionIds.get(chatKey) || '',
        cwd: s.cwd || '',
        reason: 'aborted',
      }))
      // PR 2：agent.run.done 由 query handler 的 finally 统一发送，此处不重复
    }
  })

  // 运行时更新 runMode（用户在运行中途切换模式时生效）
  ipcMain.handle('claude-agent-update-runmode', (_, { sessionId, runMode }) => {
    const chatKey = sessionId
    const s = agentSessions.get(chatKey)
    if (!s) return
    if (['ask_before_edits', 'edit_automatically', 'plan_mode'].includes(runMode)) {
      s.runMode = runMode
    }
  })

  // 主动查询会话 metrics（用于切换 tab 时恢复历史数据）
  ipcMain.handle('claude-agent-query-metrics', async (_, { cliSessionId, model }) => {
    const stop = perfStartIpc('claude-agent-query-metrics')
    if (!cliSessionId) { stop(); return null }
    const diagStart = Date.now()
    const resolveStart = Date.now()
    appendClaudeFreezeDiag('metrics.enter', {
      cliSessionId: String(cliSessionId).slice(-12),
      model: model || '',
    })
    const jsonlPath = claudeMetrics.resolveJsonlPath(cliSessionId)
    const metricsCwd = claudeMetrics.getLatestSessionCwd?.(cliSessionId) || ''
    const resolveMs = Date.now() - resolveStart
    appendClaudeFreezeDiag('metrics.resolve.done', {
      cliSessionId: String(cliSessionId).slice(-12),
      file: jsonlPath ? path.basename(jsonlPath) : null,
      resolveMs,
    })
    const tokenStart = Date.now()
    const jsonlMetrics = claudeMetrics.getTokenMetrics(cliSessionId)
    const tokenMs = Date.now() - tokenStart
    appendClaudeFreezeDiag('metrics.tokens.done', {
      cliSessionId: String(cliSessionId).slice(-12),
      tokenMs,
      hasMetrics: Boolean(jsonlMetrics),
    })
    const speedStart = Date.now()
    const speedMetrics = claudeMetrics.getSpeedMetrics(cliSessionId)
    const speedMs = Date.now() - speedStart
    const gitInfo = metricsCwd ? await claudeMetrics.getGitInfo(metricsCwd) : null
    const totalMs = Date.now() - diagStart
    appendClaudeFreezeDiag('metrics.speed.done', {
      cliSessionId: String(cliSessionId).slice(-12),
      speedMs,
    })
    appendClaudeFreezeDiag('metrics.return', {
      cliSessionId: String(cliSessionId).slice(-12),
      file: jsonlPath ? path.basename(jsonlPath) : null,
      resolveMs,
      tokenMs,
      speedMs,
      totalMs,
      hasMetrics: Boolean(jsonlMetrics),
    })
    if (!jsonlMetrics) { stop(); return null }
    // 速度 fallback：getSpeedMetrics 需要 completed request（stop_reason），
    // 旧 session / 流式中可能返回 null，此时用总量 ÷ 墙钟时间估算。
    let inputPerSec = speedMetrics?.inputTokensPerSec || 0
    let outputPerSec = speedMetrics?.outputTokensPerSec || 0
    if (!inputPerSec && !outputPerSec && jsonlMetrics.durationMs > 0) {
      const elapsedSec = Math.max(1, jsonlMetrics.durationMs / 1000)
      inputPerSec = Math.round((jsonlMetrics.inputTokens || 0) / elapsedSec)
      outputPerSec = Math.round((jsonlMetrics.outputTokens || 0) / elapsedSec)
    }
    const result = {
      model: model || '',
      costUsd: jsonlMetrics.costUsd || 0,
      inputTokens: jsonlMetrics.inputTokens || 0,
      outputTokens: jsonlMetrics.outputTokens || 0,
      cacheReadTokens: jsonlMetrics.cacheReadTokens || 0,
      cacheCreationTokens: jsonlMetrics.cacheCreationTokens || 0,
      contextUsage: jsonlMetrics.contextUsage || 0,
      contextWindow: jsonlMetrics.contextWindow || 0,
      durationMs: jsonlMetrics.durationMs || 0,
      speedOutputPerSec: outputPerSec,
      gitBranch: gitInfo?.branch || '',
      gitChanges: gitInfo?.changes || 0,
    }
    stop({ resolveMs, tokenMs, speedMs, hasMetrics: 1 })
    return result
  })

  ipcMain.handle('claude-permission-response', (_, { sessionId, requestId, allowed }) => {
    const chatKey = sessionId
    const s = agentSessions.get(chatKey)
    if (!s) return
    if (!requestId) return
    const clearPending = pendingPermissionResolvers.get(requestId)
    if (clearPending) {
      clearPending(allowed)
      pendingPermissionResolvers.delete(requestId)
    }
  })

  ipcMain.handle('claude-ask-question-response', (_, { requestId, answers }) => {
    if (!requestId) return
    const resolve = pendingPermissionResolvers.get(requestId)
    if (resolve) {
      resolve(answers)
      pendingPermissionResolvers.delete(requestId)
    }
  })

  ipcMain.handle('claude-plan-review-response', (_, { requestId, action }) => {
    if (!requestId) return
    const resolve = pendingPermissionResolvers.get(requestId)
    if (resolve) {
      resolve(action)
      pendingPermissionResolvers.delete(requestId)
    }
  })

  ipcMain.handle('claude-register-cli-sessions', (_, map) => {
    for (const [sid, cliId] of Object.entries(map || {})) {
      if (cliId) cliSessionIds.set(sid, cliId)
    }
  })

  // 扫描并注册当前项目下的所有 CLI 会话 ID
  ipcMain.handle('claude-scan-cli-sessions', async (_, { cwd }) => {
    const sessionIds = scanCliSessionIds(cwd)
    return sessionIds
  })

  ipcMain.handle('claude-get-last-compact-summary', (_, sessionId) => {
    if (!sessionId) return null
    return compactSummaries.get(sessionId) || null
  })

  /** 仅 claude-list-slash-commands：与官方 CLI 一致只读 ~/.claude/settings.json，不读 provider、不回写 conf。 */
  function readSlashCommandsEnvFromUserSettingsFile() {
    const sj = readSystemSettingsJson()
    const env = sj && typeof sj.env === 'object' && sj.env ? sj.env : {}
    const fallbackModel = {
      haiku: null,
      sonnet: null,
      opus: null,
      reasoning: null,
    }
    const tierFromEnv = {
      haiku: String(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '').trim(),
      sonnet: String(env.ANTHROPIC_DEFAULT_SONNET_MODEL || '').trim(),
      opus: String(env.ANTHROPIC_DEFAULT_OPUS_MODEL || '').trim(),
      reasoning: String(env.ANTHROPIC_REASONING_MODEL || '').trim(),
    }
    const apiKey = String(env.ANTHROPIC_AUTH_TOKEN || sj?.primaryApiKey || sj?.apiKey || '').trim()
    let baseURL = String(env.ANTHROPIC_BASE_URL || sj?.baseURL || sj?.apiBaseUrl || '').trim()
    // settings.json 顶层 model 在本项目约定为 tier（sonnet/opus/...），因此此处不读取 env.ANTHROPIC_MODEL。
    let model = ''
    const tierKey = sj?.model && ['haiku', 'sonnet', 'opus', 'reasoning'].includes(sj.model) ? sj.model : 'sonnet'
    model = (tierFromEnv[tierKey] || '').trim()
    if (!model) model = String(sj?.defaultModel || '').trim()
    if (!model) model = (tierFromEnv.sonnet || fallbackModel.sonnet || '').trim()
    if (baseURL && !baseURL.endsWith('/')) baseURL += '/'
    const tierEnv = {}
    for (const k of ['ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_REASONING_MODEL']) {
      if (env[k]) tierEnv[k] = env[k]
    }
    return { apiKey, baseURL, model, tierEnv }
  }

  ipcMain.handle('claude-list-slash-commands', async (_, { cwd, sessionId }) => {
    const chatKey = sessionId
    const { apiKey, baseURL, model, tierEnv } = readSlashCommandsEnvFromUserSettingsFile()
    const resolvedCwd = path.resolve(cwd || process.cwd())
    const cacheKey = `${resolvedCwd}::${model}`
    const now = Date.now()
    const cached = slashCommandsCache.get(cacheKey)
    if (cached && (now - cached.ts) < 10 * 60 * 1000 && Array.isArray(cached.commands) && cached.commands.length) {
      return cached.commands
    }
    try {
      const active = sessionId ? agentSessions.get(chatKey) : null
      if (active && active.query && active.model === model && active.cwd === resolvedCwd) {
        const activeCommands = await active.query.supportedCommands()
        const normalizedActive = (activeCommands || []).map(c => ({
          name: c?.name || '',
          description: typeof c?.description === 'string' ? c.description : '',
        })).filter(c => c.name)
        if (normalizedActive.length) slashCommandsCache.set(cacheKey, { ts: now, commands: normalizedActive })
        return normalizedActive
      }
      const { query } = await loadClaudeAgentSdk()
      const systemClaudePath = await findSystemClaude()
      if (!systemClaudePath) return []
      const q = query({
        prompt: 'hi',
        options: {
          cwd: resolvedCwd,
          model,
          maxTurns: 1,
          permissionMode: 'default',
          settingSources: ['user'],
          skipWebFetchPreflight: true,
          systemPrompt: buildSystemPrompt(resolvedCwd),
          pathToClaudeCodeExecutable: systemClaudePath,
          persistSession: false,
          env: buildSystemClaudeEnv({
            PYTHONUTF8: '1',
            ...(apiKey ? { ANTHROPIC_AUTH_TOKEN: apiKey } : {}),
            ...(baseURL ? { ANTHROPIC_BASE_URL: baseURL } : {}),
            ...tierEnv,
          }),
        },
      })
      let commands = []
      try {
        commands = await q.supportedCommands()
      } finally {
        try { q.close?.() } catch (_) {}
      }
      const normalized = (commands || []).map(c => ({
        name: c?.name || '',
        description: typeof c?.description === 'string' ? c.description : '',
      })).filter(c => c.name)

      // 额外扫描项目级 .claude/commands/ 目录（SDK settingSources:['user'] 不会自动读取项目级）
      const projectCommandsDir = path.join(resolvedCwd, '.claude', 'commands')
      const userCommandsDir = path.join(os.homedir(), '.claude', 'commands')
      const readCommandsFromDir = (baseDir, scope) => {
        try {
          if (!fs.existsSync(baseDir)) return []
          const entries = fs.readdirSync(baseDir, { withFileTypes: true })
          const rows = []
          const readFirstLine = (filePath) => {
            try {
              const content = fs.readFileSync(filePath, 'utf8')
              const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
              if (fm) {
                for (const line of fm[1].split(/\r?\n/)) {
                  const idx = line.indexOf(':')
                  if (idx > 0 && line.slice(0, idx).trim().toLowerCase() === 'description') {
                    const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
                    if (v) return v.slice(0, 100)
                  }
                }
                for (const ln of fm[2].split(/\r?\n/)) {
                  const t = ln.trim()
                  if (!t || t.startsWith('#')) continue
                  return t.slice(0, 100)
                }
                return ''
              }
              for (const ln of content.split(/\r?\n/)) {
                const t = ln.trim()
                if (!t || t.startsWith('#')) continue
                return t.slice(0, 100)
              }
            } catch (_) {}
            return ''
          }
          for (const e of entries) {
            const full = path.join(baseDir, e.name)
            if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
              const cmdName = path.basename(e.name, path.extname(e.name))
              rows.push({
                name: cmdName,
                description: readFirstLine(full) || `自定义命令（${scope}）`,
              })
            } else if (e.isDirectory()) {
              // 支持子目录命令（如 foo/bar.md -> /foo:bar）
              try {
                const subEntries = fs.readdirSync(full, { withFileTypes: true })
                for (const se of subEntries) {
                  if (se.isFile() && se.name.toLowerCase().endsWith('.md')) {
                    const subName = path.basename(se.name, path.extname(se.name))
                    rows.push({
                      name: `${e.name}:${subName}`,
                      description: readFirstLine(path.join(full, se.name)) || `自定义命令（${scope}）`,
                    })
                  }
                }
              } catch (_) {}
            }
          }
          return rows
        } catch (_) {
          return []
        }
      }

      // 合并本地 commands（用户级 + 项目级），已存在的不覆盖（SDK 优先）
      const localCommands = [
        ...readCommandsFromDir(userCommandsDir, '用户级'),
        ...readCommandsFromDir(projectCommandsDir, '项目级'),
      ]
      for (const lc of localCommands) {
        const cmdName = (lc.name || '').trim()
        if (!cmdName) continue
        if (!normalized.some(c => c.name === cmdName)) {
          normalized.push({ name: cmdName, description: lc.description || '本地命令' })
        }
      }

      if (normalized.length) slashCommandsCache.set(cacheKey, { ts: now, commands: normalized })
      return normalized
    } catch (e) {
      console.error('[claude-list-slash-commands]', e?.message || e)
      return []
    }
  })

  ipcMain.handle('claude-list-local-skills', async (_, { cwd }) => {
    const hasProjectCwd = !!String(cwd || '').trim()
    const result = {
      system: [],
      project: [],
      paths: {
        system: path.join(os.homedir(), '.claude', 'skills'),
        project: hasProjectCwd ? path.join(path.resolve(cwd), '.claude', 'skills') : '',
      },
    }

    function readSkillsFromDir(baseDir) {
      try {
        if (!fs.existsSync(baseDir)) return []
        const entries = fs.readdirSync(baseDir, { withFileTypes: true })
        const rows = []
        const pickSkillMarkdown = (dirPath) => {
          try {
            const files = fs.readdirSync(dirPath)
            const md = files.find(n => n.toLowerCase() === 'skill.md')
              || files.find(n => n.toLowerCase() === 'readme.md')
              || files.find(n => n.toLowerCase().endsWith('.md'))
            return md ? path.join(dirPath, md) : null
          } catch (_) {
            return null
          }
        }
        const readDesc = (filePath) => {
          let desc = ''
          try {
            const content = fs.readFileSync(filePath, 'utf8')
            const lines = content.split(/\r?\n/)
            for (const ln of lines) {
              const t = ln.trim()
              if (!t || t.startsWith('#')) continue
              desc = t.slice(0, 80)
              break
            }
          } catch (_) {}
          return desc
        }
        for (const e of entries) {
          const full = path.join(baseDir, e.name)
          if (e.isDirectory()) {
            const filePath = pickSkillMarkdown(full)
            if (!filePath) continue
            rows.push({
              name: e.name,
              path: full,
              description: readDesc(filePath),
            })
            continue
          }
          if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
            const skillName = path.basename(e.name, path.extname(e.name))
            rows.push({
              name: skillName,
              path: full,
              description: readDesc(full),
            })
          }
        }
        rows.sort((a, b) => a.name.localeCompare(b.name))
        return rows
      } catch (_) {
        return []
      }
    }

    result.system = readSkillsFromDir(result.paths.system)
    result.project = readSkillsFromDir(result.paths.project)
    return result
  })

  // ─── Skills 市场与管理 ──────────────────────────────────────────
  ipcMain.handle('skills-get-catalog', async () => {
    const catalog = await fetchSkillsMarketplace()
    return { skills: catalog.skills || [], version: catalog.version }
  })

  ipcMain.handle('skills-get-state', async (_, { cwd }) => {
    try {
      const catalog = await fetchSkillsMarketplace()

      const systemDir = path.join(os.homedir(), '.claude', 'skills')
      const projectDir = String(cwd || '').trim() ? path.join(path.resolve(cwd), '.claude', 'skills') : ''
      const installed = scanSkillsDirs(systemDir, projectDir)

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

      // 本地手动安装但不在地项目录中的 skill
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

      _skillsStateCache = { skills, version: catalog.version }
      return _skillsStateCache
    } catch (e) {
      console.error('[skills-get-state]', e?.message)
      return _skillsStateCache || { skills: [], version: '0' }
    }
  })

  // ─── Git 镜像 + 异步 clone（Skill 安装用）────────────────
  function getGitMirrorUrl() {
    try {
      const internal = internalConf.get('gitMirrorUrl', '')
      if (internal) return internal
      const s = readGlobalSettings()
      return s.gitMirrorUrl || ''
    } catch (_) { return '' }
  }

  async function resolveCatalogSkillSource(skillName) {
    const catalog = await fetchSkillsMarketplace()
    let item = (catalog.skills || []).find(s => s.name === skillName)
    if (!item) {
      const searchCatalog = await fetchSkillsMarketplace({ search: skillName, limit: 30 })
      item = (searchCatalog.skills || []).find(s => s.name === skillName)
    }
    if (!item?.gitUrl) throw new Error('该 skill 无可信安装源（GitHub URL）')
    return normalizeGithubSkillSource(item.gitUrl, item.subPath || '')
  }

  ipcMain.handle('skills-install', async (event, { skillName, scope, cwd, gitUrl, subPath }) => {
    try {
      const target = resolveSkillTargetDir({ agentName: 'claude', scope, cwd, skillName })
      const source = await resolveCatalogSkillSource(target.skillName)

      const sender = event.sender
      const tmpDir = safeTempDir('skill', target.skillName)
      try {
        await cloneSkillRepoWithFallback({ originalUrl: source.gitUrl, targetDir: tmpDir, sender, mirrorUrl: getGitMirrorUrl() })
        const sourceDir = resolveRelativeSourceDir(tmpDir, source.subPath)
        if (!fs.existsSync(sourceDir)) {
          return { ok: false, error: `源目录不存在: ${source.subPath || '/'}` }
        }
        copySkillDirAtomic(sourceDir, target.targetDir, target.skillName)
        fs.rmSync(tmpDir, { recursive: true, force: true })

        _skillsStateCache = null
        resetSkillsMarketplaceCache()
        return { ok: true, path: target.targetDir, scope: target.scope }
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        const msg = e?.stderr ? String(e.stderr).slice(0, 300) : (e?.message || String(e))
        if (msg.includes('command not found') || msg.includes('not recognized') || msg.includes('ENOENT')) {
          return { ok: false, error: '未检测到 git，请先安装 git 后再安装 Skill' }
        }
        return { ok: false, error: msg }
      }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('skills-uninstall', async (_, { skillName, scope, cwd }) => {
    try {
      const target = resolveSkillTargetDir({ agentName: 'claude', scope, cwd, skillName })

      if (fs.existsSync(target.targetDir)) {
        fs.rmSync(target.targetDir, { recursive: true, force: true })
      }
      _skillsStateCache = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  // ─── Skills 社区市场 ────────────────────────────────────────
  // 社区市场搜索已改为 renderer 直连 API，不再需要 IPC handler

  ipcMain.handle('skills-market-install', async (event, { skillName, scope, cwd, gitUrl }) => {
    try {
      const target = resolveSkillTargetDir({ agentName: 'claude', scope, cwd, skillName })
      const source = await resolveCatalogSkillSource(target.skillName)

      // 克隆到临时目录，再复制到 skills 目录（支持镜像 + 进度 + 自动回退）
      const tmpDir = safeTempDir('skill-mkt', target.skillName)
      const sender = event.sender
      try {
        await cloneSkillRepoWithFallback({ originalUrl: source.gitUrl, targetDir: tmpDir, sender, mirrorUrl: getGitMirrorUrl() })

        // 查找 SKILL.md 所在的子目录路径（agent-skills-cli 的行为）
        const { findSkillMdSubPath } = await import('agent-skills-cli').catch(() => ({}))
        let sourceDir = tmpDir
        if (findSkillMdSubPath) {
          try {
            const subPath = findSkillMdSubPath(tmpDir)
            if (subPath) sourceDir = path.join(tmpDir, subPath)
          } catch (_) {}
        }
        // fallback：查找 SKILL.md
        if (sourceDir === tmpDir) {
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
          const found = walk(tmpDir, 0)
          if (found) sourceDir = found
        }

        copySkillDirAtomic(sourceDir, target.targetDir, target.skillName)
        fs.rmSync(tmpDir, { recursive: true, force: true })

        _skillsStateCache = null
        return { ok: true, path: target.targetDir, scope: target.scope }
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
        throw e
      }
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg.includes('command not found') || msg.includes('not recognized') || msg.includes('ENOENT') || msg.includes('git')) {
        return { ok: false, error: '未检测到 git，请先安装 git 后再安装 Skill' }
      }
      return { ok: false, error: msg }
    }
  })

  // ─── Memory 管理 ───────────────────────────────────────────────
  ipcMain.handle('claude-memory-list', (_, { cwd, scope }) => {
    try {
      if (scope === 'system') return claudeMemory.readSystemMemories()
      return claudeMemory.readAllMemories(cwd)
    } catch (e) {
      console.warn('[claude-memory-list]', e?.message)
      return []
    }
  })

  ipcMain.handle('claude-memory-read', (_, { cwd, filename, scope }) => {
    try {
      if (scope === 'system') {
        const dir = claudeMemory.getSystemMemoryDir()
        const filePath = require('path').join(dir, filename.endsWith('.md') ? filename : `${filename}.md`)
        if (!fs.existsSync(filePath)) return null
        const content = fs.readFileSync(filePath, 'utf8')
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
        if (!match) return { filename, name: filename, description: '', type: 'user', body: content.trim() }
        const meta = {}
        for (const line of match[1].split(/\r?\n/)) {
          const idx = line.indexOf(':')
          if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        }
        return { filename, name: meta.name || filename, description: meta.description || '', type: meta.type || 'user', body: match[2].trim() }
      }
      return claudeMemory.readMemoryFile(cwd, filename)
    } catch (e) {
      console.warn('[claude-memory-read]', e?.message)
      return null
    }
  })

  ipcMain.handle('claude-memory-write', (_, { cwd, filename, name, description, type, body, scope }) => {
    try {
      if (scope === 'system') {
        const saved = claudeMemory.writeSystemMemoryFile(filename, { name, description, type, body })
        return { ok: true, filename: saved }
      }
      const saved = claudeMemory.writeMemoryFile(cwd, filename, { name, description, type, body })
      return { ok: true, filename: saved }
    } catch (e) {
      return { ok: false, message: e?.message || String(e) }
    }
  })

  ipcMain.handle('claude-memory-delete', (_, { cwd, filename, scope }) => {
    try {
      if (scope === 'system') {
        const deleted = claudeMemory.deleteSystemMemoryFile(filename)
        return { ok: deleted }
      }
      const deleted = claudeMemory.deleteMemoryFile(cwd, filename)
      return { ok: deleted }
    } catch (e) {
      return { ok: false, message: e?.message || String(e) }
    }
  })

  ipcMain.handle('claude-memory-get-inject-mode', () => {
    return readMemoryInjectMode()
  })

  ipcMain.handle('claude-memory-set-inject-mode', (_, mode) => {
    const valid = ['system', 'user', 'off']
    if (!valid.includes(mode)) return false
    try {
      internalConf.set('claudeMemoryInjectMode', mode)
      const sj = readSystemSettingsJson() || {}
      if (sj.memoryInjectMode !== undefined) {
        writeGlobalSettings(sj)
      }
      return true
    } catch (_) { return false }
  })
}

module.exports = {
  setupClaudeHandlers,
  getClaudeProviderStorage: () => _claudeProviderStorage,
  __test__: {
    analyzeClaudeJsonlFileIntegrity,
    buildClaudeAgentDonePayload,
    deleteClaudeSessionArtifacts,
    finalizeClaudeDoneReason,
    extractClaudeLiveUsageMetricsFromSdkMessage,
    getClaudeProjectsRootDir,
    readClaudeSessionMeta,
    readClaudeSessionMetaByFilePath,
    resolveClaudeDoneReasonFromError,
    scanCliSessionsForProject,
    buildClaudeHistoryTurnTokensFromEntry,
    setSessionRegistryOptionsForTest: (options) => {
      sessionRegistryOptionsForTest = options || null
      clearClaudeSessionScanCaches()
    },
    clearClaudeSessionScanCaches,
    writeClaudeSessionMeta,
  },
}
