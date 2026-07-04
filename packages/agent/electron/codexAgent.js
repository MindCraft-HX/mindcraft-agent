const { ipcMain, dialog } = require('electron')
const { Conf } = require('electron-conf')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { getMindCraftUserDataDir } = require('./userDataPath')
const { DEFAULT_MAX_BYTES, appendLogLineWithRotation } = require('./diagnosticsFileUtils')
const { logMetricSample, logTurnSampleSummary } = require('./tokenMetrics/diagnostics')
const { beginTurn, submitSample, clearCurrentTurn, getCurrentSnapshot, getFinalSnapshot, removeStore, clearAllStores } = require('./tokenMetrics/turnStore')
const { shouldStopTurnTimeoutOnEvent } = require('./codexTurnState')
const { extractCodexSessionSummary } = require('./sessionTitleUtils')
const { getGitInfo } = require('./claudeMetrics')
const { getCodexPanelStatePaths, getCodexPanelStateReadCandidates } = require('./codexPanelStatePaths')
const { augmentEnvWithBundledRg } = require('./localSearch')
const { attachRegistrySessionToScanSummary, deleteSessionRecordsByProvider, detachSessionProviderBinding, findSessionRecordByProvider, repairSessionRegistry, restorePanelStateFromSessionRegistry, setSessionTitle, syncPanelStateSessions } = require('./sessionRegistry')
const { findLegacyUserData } = require('./findLegacyUserData')
const { t: lt } = require('./localeHelper')
const { ensureProxy, shutdownProxy, isProxyRunning } = require('./codex/chatProxyManager')
const { normalizeFileChangeItemPreviews } = require('./codexFileChangePreview')
const { normalizeCodexReasoningEffort } = require('../src/components/codeX/utils/normalizeReasoningEffort.cjs')
const { getToolActivityLabel, buildHistoryToolMessage } = require('../src/components/codeX/utils/codexUiEventMapper.cjs')
const {
  appendCodexTurnDiagnostic,
  makeCodexTurnDiagnosticId,
  summarizeCodexTerminalEvent,
  summarizeUsage,
  writeCodexTurnDiagnosticArtifact,
} = require('./codex/turnDiagnostics')
const {
  cloneWithFallback: cloneSkillRepoWithFallback,
  copySkillDirAtomic,
  normalizeGithubSkillSource,
  resolveRelativeSourceDir,
  resolveSkillTargetDir,
  safeTempDir,
} = require('./skillsSecurity')
const { perfStartIpc, perfCount } = require('./shared/mainPerfProbe')

const { getAgentProtocol } = require('./agentProtocolBridge')

// ---- CodeX Config (extracted leaf module, Phase 5) ----
// Stateless TOML utils — no deps on module constants, safe to load early.
const {
  parseTomlStringValue,
  stripTomlInlineComment,
  splitTomlDottedKey,
  parseSimpleTomlContent,
  parseSimpleToml,
  selectCodexTomlProvider,
  normalizeCodexApiFormatValue,
  createCodexConfigManager,
} = require('./codex/configManager')

// ---- CodeX Environment (extracted leaf module, Phase 5) ----
const {
  findGlobalCodexPath,
  loadCodexSdk,
  resetCodexSdkPromise,
  isInstallingCodex,
  setInstallingCodex,
} = require('./codex/environment')

// ---- CodeX Done Payload builders (extracted, Batch 2) ----
const {
  resolveCodexDoneReasonFromError,
  buildCodexAgentDonePayload,
} = require('./codex/donePayload')

// ---- CodeX Context Window helpers (extracted, Batch 2) ----
const {
  getCodexContextWindowForModel,
  toPositiveNumber,
  pickCodexContextUsage,
  pickCodexContextWindow,
  estimateCodexCostUsd,
} = require('./codex/contextWindow')

// ---- CodeX Page Reader helpers (extracted, Batch 2) ----
const { readFirstLine, safeJsonParse } = require('./codex/pageReader')

// ---- CodeX Message/Tool helpers (extracted, Batch 2) ----
const {
  pickFirstStringValue,
  buildMessageDedupKey,
  normalizeCodexToolName,
  isCodeXWriteToolName,
  isCodeXEditToolName,
  isCodeXReadToolName,
} = require('./codex/messageTools')

// ---- Shared Skills Marketplace (Batch 4) ----
const {
  createSkillsMarketplaceClient,
} = require('./shared/skills/marketplace')
const { scanSkillsDirs } = require('./shared/skills/scanner')
const { createCliExecutor } = require('./shared/cliExecutor')

// ---- CodeX Config IPC (extracted, R09) ----
const { registerCodexLeafIpcs } = require('./codex/index');

/** 安全发送 IPC，避免窗口已销毁时抛错 */
function safeSend(sender, channel, ...args) {
  try {
    if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
      sender.send(channel, ...args)
    }
  } catch (_) {}
}

function sendMetrics(sender, payload, diag = null) {
  safeSend(sender, 'codex-agent-metrics', payload)
  if (diag) logMetricSample(diag)
}

function mergeCodexTurnSnapshotWithSessionMetrics(turnSnapshot = null, sessionMetrics = null, { sessionId = '', model = '' } = {}) {
  const session = sessionMetrics && typeof sessionMetrics === 'object' ? sessionMetrics : {}
  const turn = turnSnapshot && typeof turnSnapshot === 'object' ? turnSnapshot : null
  return {
    ...session,
    sessionId: sessionId || session.sessionId || '',
    model: model || session.model || turn?.model || '',
    inputTokens: turn?.inputTokens ?? 0,
    outputTokens: turn?.outputTokens ?? 0,
    cacheReadTokens: turn?.cacheReadTokens ?? 0,
    cacheCreationTokens: turn?.cacheCreationTokens ?? 0,
    durationMs: turn?.durationMs ?? 0,
    costUsd: turn?.costUsd ?? 0,
  }
}

function hasMeaningfulTurnTokenSnapshot(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return false
  return (
    toNonNegativeNumber(snapshot.inputTokens) > 0
    || toNonNegativeNumber(snapshot.outputTokens) > 0
    || toNonNegativeNumber(snapshot.cacheReadTokens) > 0
    || toNonNegativeNumber(snapshot.cacheCreationTokens) > 0
  )
}

function extractLatestCodexHistoryTurnSnapshot(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const history = readSessionFileRange(filePath, 0, 60)
  const messages = Array.isArray(history?.messages) ? history.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const turnTokens = messages[i]?._turnTokens
    if (!turnTokens) continue
    return {
      inputTokens: toNonNegativeNumber(turnTokens.inputTokens),
      outputTokens: toNonNegativeNumber(turnTokens.outputTokens),
      cacheReadTokens: toNonNegativeNumber(turnTokens.cacheReadTokens),
      cacheCreationTokens: toNonNegativeNumber(turnTokens.cacheCreationTokens),
      durationMs: toNonNegativeNumber(turnTokens.durationMs),
      costUsd: 0,
    }
  }
  return null
}

function extractLatestCodexFinalTurnSnapshotFromJsonl(filePath, { model = '' } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const lines = readJsonlTailLines(filePath, 200)
  if (!lines.length) return null

  let historyModel = model || ''
  let activeTurnTokens = null
  let latestFinalTurnSnapshot = null

  function ensureActiveTurnTokens(ts = null) {
    if (!activeTurnTokens) {
      activeTurnTokens = {
        startedAt: ts,
        startTotals: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 0,
      }
    } else if (!activeTurnTokens.startedAt && ts) {
      activeTurnTokens.startedAt = ts
    }
    return activeTurnTokens
  }

  function finalizeActiveTurnTokens() {
    if (!activeTurnTokens) return
    latestFinalTurnSnapshot = {
      inputTokens: toNonNegativeNumber(activeTurnTokens.inputTokens),
      outputTokens: toNonNegativeNumber(activeTurnTokens.outputTokens),
      cacheReadTokens: toNonNegativeNumber(activeTurnTokens.cacheReadTokens),
      cacheCreationTokens: toNonNegativeNumber(activeTurnTokens.cacheCreationTokens),
      durationMs: toNonNegativeNumber(activeTurnTokens.durationMs),
      costUsd: 0,
    }
    activeTurnTokens = null
  }

  for (const line of lines) {
    const row = safeJsonParse(line)
    if (!row) continue
    const parsedTs = Date.parse(row.timestamp || '')
    const ts = Number.isFinite(parsedTs) ? parsedTs : null

    if (row.type === 'turn_context' && row.payload?.model) historyModel = historyModel || row.payload.model
    if (row.type === 'session_meta' && row.payload?.model) historyModel = historyModel || row.payload.model

    if (row.type === 'event_msg' && row.payload?.type === 'user_message') {
      finalizeActiveTurnTokens()
      activeTurnTokens = {
        startedAt: ts,
        startTotals: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 0,
      }
      continue
    }

    if (row.type === 'event_msg' && row.payload?.type === 'token_count') {
      const totalUsage = row.payload?.info?.total_token_usage || {}
      const turn = ensureActiveTurnTokens(ts)
      if (!turn.startTotals && hasCodexUsageFields(totalUsage)) {
        turn.startTotals = inferCodexTurnStartTotalsFromTokenCountInfo(row.payload?.info || {})
      }
      const metrics = buildCodexMetricsFromTokenCountPayload(row.payload, {
        model: historyModel,
        durationMs: activeTurnTokens?.startedAt && ts ? Math.max(0, ts - activeTurnTokens.startedAt) : 0,
        turnStartTotals: turn.startTotals,
      })
      if (!metrics) continue
      turn.inputTokens = toNonNegativeNumber(metrics.inputTokens, turn.inputTokens)
      turn.outputTokens = toNonNegativeNumber(metrics.outputTokens, turn.outputTokens)
      turn.cacheReadTokens = toNonNegativeNumber(metrics.cacheReadTokens, turn.cacheReadTokens)
      turn.cacheCreationTokens = toNonNegativeNumber(metrics.cacheCreationTokens, turn.cacheCreationTokens)
      turn.durationMs = toNonNegativeNumber(metrics.durationMs, turn.durationMs)
      continue
    }

    if (row.type === 'event_msg' && row.payload?.type === 'task_complete') {
      const turn = ensureActiveTurnTokens(ts)
      turn.durationMs = toNonNegativeNumber(row.payload?.duration_ms, turn.durationMs)
      if (!turn.durationMs && turn.startedAt && ts) {
        turn.durationMs = Math.max(0, ts - turn.startedAt)
      }
      finalizeActiveTurnTokens()
    }
  }

  return latestFinalTurnSnapshot
}

function isCodexSnapshotFreshForRunningTurn(snapshot = null, thinkingStart = 0) {
  if (!snapshot || typeof snapshot !== 'object') return false
  const startedAt = Number(thinkingStart) || 0
  if (startedAt <= 0) return snapshot.phase === 'live'
  const sampleAt = toNonNegativeNumber(snapshot.finalizedAt, snapshot.updatedAt || 0)
  return sampleAt >= Math.max(0, startedAt - 1000)
}

async function queryCodexStatusBarMetrics({ sessionId = '', cliSessionId = '', filePath = '', model = '', cwd = '', thinking = false, thinkingStart = 0 } = {}) {
  const subResolve = perfStartIpc('codex-metrics.resolve')
  const resolvedFilePath = resolveCodexSessionFilePath({
    sessionId,
    cliSessionId,
    fallbackFilePath: filePath,
  })
  const running = Boolean(thinking)
  const currentTurnSnapshot = getCurrentSnapshot(sessionId) || null
  const finalTurnSnapshot = getFinalSnapshot(sessionId) || null
  const currentTurnTokenSnapshot = hasMeaningfulTurnTokenSnapshot(currentTurnSnapshot)
    ? currentTurnSnapshot
    : null
  const finalTurnTokenSnapshot = hasMeaningfulTurnTokenSnapshot(finalTurnSnapshot)
    ? finalTurnSnapshot
    : null
  const turnSnapshot = running
    ? (isCodexSnapshotFreshForRunningTurn(currentTurnTokenSnapshot, thinkingStart) ? currentTurnTokenSnapshot : null)
    : (currentTurnTokenSnapshot || finalTurnTokenSnapshot)
  const historyTurnSnapshot = running
    ? turnSnapshot
    : (turnSnapshot
      || extractLatestCodexFinalTurnSnapshotFromJsonl(resolvedFilePath, { model })
      || extractLatestCodexHistoryTurnSnapshot(resolvedFilePath))
  subResolve({ hasTurnSnapshot: turnSnapshot ? 1 : 0, hasHistorySnapshot: historyTurnSnapshot ? 1 : 0 })
  let sessionMetrics = null
  const subSession = perfStartIpc('codex-metrics.session-read')
  if (resolvedFilePath && String(resolvedFilePath).toLowerCase().endsWith('.jsonl')) {
    sessionMetrics = await getCodexSessionMetricsByFile(resolvedFilePath, model || '', cwd || '')
  } else if (sessionId || cliSessionId) {
    sessionMetrics = await getCodexSessionMetrics(sessionId || cliSessionId, model || '', cwd || '')
  }
  subSession({ hasSessionMetrics: sessionMetrics ? 1 : 0 })
  logMetricSample({
    provider: 'codex',
    source: 'statusbar-query',
    chatKey: sessionId,
    providerSessionId: cliSessionId || '',
    phase: turnSnapshot ? 'live-or-final' : (historyTurnSnapshot ? 'history-final' : (running ? 'running-session' : 'session')),
    inputTokens: historyTurnSnapshot?.inputTokens,
    outputTokens: historyTurnSnapshot?.outputTokens,
    cacheReadTokens: historyTurnSnapshot?.cacheReadTokens,
    cacheCreationTokens: historyTurnSnapshot?.cacheCreationTokens,
    contextUsage: sessionMetrics?.contextUsage,
    durationMs: historyTurnSnapshot?.durationMs,
    rawUsage: {
      resolvedFilePath,
      hasCurrentTurnSnapshot: Boolean(currentTurnSnapshot),
      hasFinalTurnSnapshot: Boolean(finalTurnSnapshot),
      usingTurnSnapshot: Boolean(turnSnapshot),
      hasHistoryTurnSnapshot: Boolean(historyTurnSnapshot),
      running,
      thinkingStart: Number(thinkingStart) || 0,
      hasSessionMetrics: Boolean(sessionMetrics),
      sessionMetricsInputTokens: sessionMetrics?.inputTokens,
      sessionMetricsOutputTokens: sessionMetrics?.outputTokens,
      sessionMetricsCacheReadTokens: sessionMetrics?.cacheReadTokens,
      sessionMetricsDurationMs: sessionMetrics?.durationMs,
    },
  })
  if (!historyTurnSnapshot && !sessionMetrics) return null
  return mergeCodexTurnSnapshotWithSessionMetrics(historyTurnSnapshot, sessionMetrics, {
    sessionId,
    model: model || '',
  })
}

/**
 * Phase 3：通过 TurnStore 发射 CodeX metrics。
 */
function emitCodexMetricsViaStore(sender, sample, sessionId, model, extra = {}) {
  const { snapshot } = submitSample({
    provider: 'codex',
    chatKey: sessionId,
    providerSessionId: sample.providerSessionId || '',
    source: sample.source,
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
    provider: 'codex',
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

  safeSend(sender, 'codex-agent-metrics', {
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

const CODEX_CONFIG_DIR = path.join(os.homedir(), '.codex')
const CONFIG_TOML_FILE = path.join(CODEX_CONFIG_DIR, 'config.toml')
let SESSIONS_DIR = path.join(CODEX_CONFIG_DIR, 'sessions')
const CODEX_METRICS_POLL_INTERVAL_MS = 1000
const CODEX_SESSION_LOAD_LOG_MAX_BYTES = DEFAULT_MAX_BYTES

// ---- CodeX Config Manager (factory — needs constants above) ----
const _codexCfg = createCodexConfigManager({
  codexConfigDir: CODEX_CONFIG_DIR,
  configTomlFile: CONFIG_TOML_FILE,
  Conf,
  normalizeReasoningEffort: normalizeCodexReasoningEffort,
})

const {
  readCodexProvidersConfig,
  buildRuntimeConfigFromProvider,
  getActiveCodexProviderRuntime,
  buildRuntimeConfigFromToml,
  readRuntimeConfig,
  readSandboxMode,
  CODEX_SANDBOX_MODES,
  CODEX_SANDBOX_MIGRATE,
} = _codexCfg

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

function extractCodexAgentMessageText(raw = {}) {
  const directText = typeof raw?.text === 'string' ? raw.text.trim() : ''
  if (directText) return directText

  const directMessage = typeof raw?.message === 'string' ? raw.message.trim() : ''
  if (directMessage) return directMessage

  const content = raw?.message?.content || raw?.content || raw?.payload?.content
  if (Array.isArray(content)) {
    const text = content
      .filter(block => block && typeof block.text === 'string' && ['text', 'input_text', 'output_text'].includes(block.type))
      .map(block => block.text)
      .join('\n')
      .trim()
    if (text) return text
  }

  return ''
}

function buildCodexAssistantHistoryMessage(text = '') {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return null
  return {
    role: 'assistant',
    text: normalizedText,
    content: [{ type: 'output_text', text: normalizedText }],
  }
}

function extractCodexAssistantHistoryMessageFromJsonlRow(row = {}) {
  if (!row || typeof row !== 'object') return null
  if (row.type === 'agent_message') {
    return buildCodexAssistantHistoryMessage(extractCodexAgentMessageText(row))
  }
  if (row.payload?.type === 'agent_message') {
    return buildCodexAssistantHistoryMessage(extractCodexAgentMessageText(row.payload))
  }
  return null
}

function normalizeTopLevelCodexStreamEvent(ev = {}) {
  if (ev?.type !== 'agent_message') return null
  const text = extractCodexAgentMessageText(ev)
  if (!text) return null
  return {
    type: 'item.completed',
    item: {
      id: ev.id || `agent_message_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: 'agent_message',
      text,
    },
  }
}

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

const codexJsonlScanCache = {
  root: '',
  signature: '',
  files: [],
}
const codexSessionSummaryCache = new Map()

function getCodexSessionsTreeSignature(dir) {
  try {
    const parts = []
    function visit(current) {
      const stat = fs.statSync(current)
      parts.push(`${current}:${Math.trunc(stat.mtimeMs)}:${stat.size}`)
      const entries = fs.readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        visit(path.join(current, entry.name))
      }
    }
    visit(dir)
    return parts.join('|')
  } catch (_) {
    return ''
  }
}

function listCodexJsonlFilesCached() {
  const root = SESSIONS_DIR
  const signature = getCodexSessionsTreeSignature(root)
  if (
    codexJsonlScanCache.root === root
    && codexJsonlScanCache.signature === signature
    && Array.isArray(codexJsonlScanCache.files)
  ) {
    return codexJsonlScanCache.files
  }

  const files = walkFiles(root).filter(file => file.toLowerCase().endsWith('.jsonl'))
  codexJsonlScanCache.root = root
  codexJsonlScanCache.signature = signature
  codexJsonlScanCache.files = files
  return files
}

function clearCodexJsonlCaches() {
  jsonlLineCache.clear()
  codexSessionSummaryCache.clear()
  codexJsonlScanCache.root = ''
  codexJsonlScanCache.signature = ''
  codexJsonlScanCache.files = []
}

function findCodexSessionFileByThreadId(threadId) {
  const id = String(threadId || '').trim()
  if (!id) return ''
  const files = listCodexJsonlFilesCached()
    .filter(file => path.basename(file).includes(id))
    .filter(file => {
      try { return fs.statSync(file).isFile() } catch (_) { return false }
    })
    .sort((a, b) => {
      try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs } catch (_) { return 0 }
    })
  return files[0] || ''
}

function resolveCodexSessionFilePath({ sessionId, cliSessionId, fallbackFilePath } = {}) {
  const fallback = String(fallbackFilePath || '').trim()
  if (fallback && fs.existsSync(fallback)) return fallback

  const threadId = String(cliSessionId || '').trim()
  if (threadId) {
    const registryRecord = findSessionRecordByProvider({ agent: 'codex', cliSessionId: threadId })
    const registryPath = registryRecord?.provider?.filePath || ''
    if (registryPath && fs.existsSync(registryPath)) return registryPath
  }

  if (sessionId) {
    const mappedCliId = cliSessionIds.get(sessionId)
    if (mappedCliId && mappedCliId !== threadId) {
      const registryRecord = findSessionRecordByProvider({ agent: 'codex', cliSessionId: mappedCliId })
      const registryPath = registryRecord?.provider?.filePath || ''
      if (registryPath && fs.existsSync(registryPath)) return registryPath
    }
  }

  return findCodexSessionFileByThreadId(threadId || cliSessionIds.get(sessionId) || sessionId)
}

const jsonlLineCache = new Map() // filePath -> { lines: [], mtimeMs: 0 }

// T177: metrics aggregate 结果缓存，避免每次 query 都全量 JSON.parse 聚合
// key: filePath, value: { mtimeMs, size, result }
const _metricsAggregateCache = new Map()

function getCachedMetricsAggregate(filePath) {
  const cached = _metricsAggregateCache.get(filePath)
  if (!cached) return null
  try {
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
      return { result: cached.result, cwd: cached.cwd || '' }
    }
  } catch (_) { /* file deleted */ }
  _metricsAggregateCache.delete(filePath)
  return null
}

function readJsonlLines(filePath, maxLines = Infinity) {
  try {
    const stat = fs.statSync(filePath)
    const cached = jsonlLineCache.get(filePath)
    // 文件未修改，直接返回缓存
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return maxLines === Infinity ? cached.lines : cached.lines.slice(0, maxLines)
    }
    // ⚠️ 此函数仅被 async 调用方使用；调用方已改为流式异步读取
    // 保留此同步路径用于向后兼容，但新代码应使用 readJsonlLinesAsync
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/).filter(Boolean)
    jsonlLineCache.set(filePath, { lines, mtimeMs: stat.mtimeMs })
    return maxLines === Infinity ? lines : lines.slice(0, maxLines)
  } catch (_) { return [] }
}

/** T177: 流式读取 JSONL 行，避免 fs.readFileSync 阻塞主进程 event loop */
async function readJsonlLinesAsync(filePath, maxLines = Infinity) {
  try {
    const stat = fs.statSync(filePath)
    const cached = jsonlLineCache.get(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return maxLines === Infinity ? cached.lines : cached.lines.slice(0, maxLines)
    }
    const lines = []
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 })
    let remainder = ''
    for await (const chunk of stream) {
      remainder += chunk
      const parts = remainder.split('\n')
      remainder = parts.pop() || ''
      for (const part of parts) {
        if (part.trim()) lines.push(part)
      }
    }
    if (remainder.trim()) lines.push(remainder)
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

function readJsonlPageLinesFromTail(filePath, page = 0, pageSize = 60) {
  const safePage = Math.max(0, Number(page) || 0)
  const safePageSize = Math.max(1, Math.min(1000, Number(pageSize) || 60))
  const newestToSkip = safePage * safePageSize
  const wanted = safePageSize + 1
  const maxLinesToRead = newestToSkip + wanted
  const chunkSize = 64 * 1024
  const linesNewestFirst = []
  let fd = null
  let fileSize = 0

  try {
    fd = fs.openSync(filePath, 'r')
    fileSize = fs.fstatSync(fd).size
    let pos = fileSize
    let carry = Buffer.alloc(0)

    while (pos > 0 && linesNewestFirst.length < maxLinesToRead) {
      const toRead = Math.min(chunkSize, pos)
      pos -= toRead
      const buf = Buffer.allocUnsafe(toRead)
      const bytesRead = fs.readSync(fd, buf, 0, toRead, pos)
      if (bytesRead <= 0) break

      let end = bytesRead
      for (let i = bytesRead - 1; i >= 0; i--) {
        if (buf[i] !== 0x0a) continue
        const part = buf.subarray(i + 1, end)
        const lineBuf = carry.length ? Buffer.concat([part, carry]) : part
        if (lineBuf.length > 0 && lineBuf.toString('utf8').trim()) {
          linesNewestFirst.push(lineBuf)
          if (linesNewestFirst.length >= maxLinesToRead) break
        }
        carry = Buffer.alloc(0)
        end = i
      }
      if (end > 0 && linesNewestFirst.length < maxLinesToRead) {
        const prefix = buf.subarray(0, end)
        carry = carry.length ? Buffer.concat([prefix, carry]) : Buffer.from(prefix)
      }
    }

    if (carry.length > 0 && linesNewestFirst.length < maxLinesToRead && carry.toString('utf8').trim()) {
      linesNewestFirst.push(carry)
    }

    const pageLinesNewestFirst = linesNewestFirst.slice(newestToSkip, newestToSkip + safePageSize)
    const hasMore = linesNewestFirst.length > newestToSkip + safePageSize
    return {
      lines: pageLinesNewestFirst.reverse().map(line => line.toString('utf8').replace(/^\uFEFF/, '')),
      hasMore,
      totalPages: hasMore ? safePage + 2 : safePage + 1,
      fileSize,
    }
  } finally {
    if (fd != null) {
      try { fs.closeSync(fd) } catch (_) {}
    }
  }
}

function extractLatestCodexLiveTurnMetricsFromJsonl(filePath, {
  model = '',
  turnStartedAt = 0,
  now = Date.now(),
} = {}) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const startedAt = Number(turnStartedAt) || 0
  if (startedAt <= 0) return null
  const minTs = startedAt - 2000
  const lines = readJsonlTailLines(filePath, 120)
  let latest = null
  let startTotals = null
  for (const line of lines) {
    const row = safeJsonParse(line)
    if (!row || row.type !== 'event_msg' || row.payload?.type !== 'token_count') continue
    const ts = Date.parse(row.timestamp || '')
    if (!Number.isFinite(ts) || ts < minTs) continue
    const info = row.payload?.info || {}
    if (!startTotals) startTotals = inferCodexTurnStartTotalsFromTokenCountInfo(info)
    latest = { row, ts }
  }
  if (!latest) return null
  const metrics = buildCodexMetricsFromTokenCountPayload(latest.row.payload, {
    model,
    durationMs: Math.max(0, latest.ts - startedAt || now - startedAt),
    turnStartTotals: startTotals,
  })
  if (!metrics || !hasMeaningfulCodexTurnMetrics(metrics)) return null
  return metrics
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
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + '\n'
    appendLogLineWithRotation(logFile, line, { maxBytes: CODEX_SESSION_LOAD_LOG_MAX_BYTES })
  } catch (_) {}
}

function summarizeCodexPromptInput(prompt = '', images = []) {
  return {
    promptChars: String(prompt || '').length,
    imageCount: Array.isArray(images) ? images.length : 0,
  }
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

function normalizeCodexUsage(usage = {}) {
  if (!usage || typeof usage !== 'object') return null
  // Phase 1：委托给统一 normalizer
  const { normalizeCodexUsage: _norm } = require('./tokenMetrics/normalizer')
  const base = _norm(usage)
  const rawInputTokens = toNonNegativeNumber(usage.input_tokens)
  return {
    input_tokens: base.inputTokens,
    output_tokens: base.outputTokens,
    total_tokens: toNonNegativeNumber(usage.total_tokens),
    cache_read_input_tokens: base.cacheReadTokens,
    cache_creation_input_tokens: base.cacheCreationTokens,
    raw_input_tokens: rawInputTokens,
  }
}

function buildCodexPerTurnTokens(parsedMetrics, usage = null) {
  const normalizedUsage = normalizeCodexUsage(usage)
  const inputTokens = toNonNegativeNumber(
    parsedMetrics?.inputTokens,
    normalizedUsage?.input_tokens
  )
  const outputTokens = toNonNegativeNumber(
    parsedMetrics?.outputTokens,
    normalizedUsage?.output_tokens
  )
  const cacheReadTokens = toNonNegativeNumber(
    parsedMetrics?.cacheReadTokens,
    normalizedUsage?.cache_read_input_tokens
  )
  const cacheCreationTokens = toNonNegativeNumber(
    parsedMetrics?.cacheCreationTokens,
    normalizedUsage?.cache_creation_input_tokens
  )
  const durationMs = toNonNegativeNumber(parsedMetrics?.durationMs)
  if (inputTokens <= 0 && outputTokens <= 0 && cacheReadTokens <= 0 && cacheCreationTokens <= 0 && durationMs <= 0) {
    return null
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    durationMs,
  }
}

function hasCodexUsageFields(usage = {}) {
  if (!usage || typeof usage !== 'object') return false
  return ['input_tokens', 'output_tokens', 'cached_input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'total_tokens']
    .some(key => Object.prototype.hasOwnProperty.call(usage, key))
}

function hasMeaningfulCodexTurnMetrics(metrics = null) {
  if (!metrics || typeof metrics !== 'object') return false
  return (
    toNonNegativeNumber(metrics.inputTokens) > 0 ||
    toNonNegativeNumber(metrics.outputTokens) > 0 ||
    toNonNegativeNumber(metrics.cacheReadTokens) > 0 ||
    toNonNegativeNumber(metrics.cacheCreationTokens) > 0
  )
}

function isCodexTerminalUsageCompatibleWithSessionTotals(usage = {}, turnStartTotals = {}) {
  if (!hasCodexUsageFields(usage) || !hasCodexUsageFields(turnStartTotals)) return false

  return (
    toNonNegativeNumber(usage.input_tokens) >= toNonNegativeNumber(turnStartTotals.input_tokens) &&
    toNonNegativeNumber(usage.output_tokens) >= toNonNegativeNumber(turnStartTotals.output_tokens) &&
    toNonNegativeNumber(usage.cache_read_input_tokens, usage.cached_input_tokens) >= toNonNegativeNumber(turnStartTotals.cache_read_input_tokens, turnStartTotals.cached_input_tokens) &&
    toNonNegativeNumber(usage.cache_creation_input_tokens) >= toNonNegativeNumber(turnStartTotals.cache_creation_input_tokens)
  )
}

function buildCodexFinalTurnMetricsFromTerminalUsage(terminalUsage = {}, {
  turnStartTotals = null,
  liveSnapshot = null,
  tokenCountSeen = false,
} = {}) {
  if (hasMeaningfulCodexTurnMetrics(liveSnapshot)) {
    return {
      authority: 'live-snapshot',
      inputTokens: undefined,
      outputTokens: undefined,
      cacheReadTokens: undefined,
      cacheCreationTokens: undefined,
    }
  }

  if (!hasCodexUsageFields(terminalUsage)) {
    return {
      authority: 'no-terminal-usage',
      inputTokens: undefined,
      outputTokens: undefined,
      cacheReadTokens: undefined,
      cacheCreationTokens: undefined,
    }
  }

  const hasTurnStartTotals = hasCodexUsageFields(turnStartTotals) && (
    toNonNegativeNumber(turnStartTotals.input_tokens) > 0 ||
    toNonNegativeNumber(turnStartTotals.output_tokens) > 0 ||
    toNonNegativeNumber(turnStartTotals.cached_input_tokens, turnStartTotals.cache_read_input_tokens) > 0 ||
    toNonNegativeNumber(turnStartTotals.cache_creation_input_tokens) > 0
  )

  if (tokenCountSeen && hasTurnStartTotals && isCodexTerminalUsageCompatibleWithSessionTotals(terminalUsage, turnStartTotals || {})) {
    return {
      authority: 'token-count-total-delta',
      ...buildCodexLiveTurnMetricsFromTotals(terminalUsage, turnStartTotals || {}, null),
    }
  }

  // Codex turn.completed.usage has been observed as session/context cumulative
  // data. Without a live snapshot or a reliable start total, keep it diagnostic
  // only; do not fabricate current-turn precision for StatusBar/footer.
  return {
    authority: hasTurnStartTotals ? 'ambiguous-session-total' : 'untrusted-terminal-usage',
    inputTokens: undefined,
    outputTokens: undefined,
    cacheReadTokens: undefined,
    cacheCreationTokens: undefined,
  }
}

function buildCodexLiveTurnMetricsFromTotals(totalUsage = {}, turnStartTotals = {}, fallbackLastUsage = null) {
  const normalizedTotal = normalizeCodexUsage(totalUsage) || {}
  const normalizedStart = normalizeCodexUsage(turnStartTotals) || {}
  const hasTotal = hasCodexUsageFields(totalUsage)
  const hasStart = hasCodexUsageFields(turnStartTotals)

  if (hasTotal && hasStart) {
    const rawTotalInput = toNonNegativeNumber(normalizedTotal.raw_input_tokens, normalizedTotal.input_tokens)
    const rawStartInput = toNonNegativeNumber(normalizedStart.raw_input_tokens, normalizedStart.input_tokens)
    const totalOutput = toNonNegativeNumber(normalizedTotal.output_tokens)
    const startOutput = toNonNegativeNumber(normalizedStart.output_tokens)
    const totalCacheRead = toNonNegativeNumber(normalizedTotal.cache_read_input_tokens)
    const startCacheRead = toNonNegativeNumber(normalizedStart.cache_read_input_tokens)
    const totalCacheCreation = toNonNegativeNumber(normalizedTotal.cache_creation_input_tokens)
    const startCacheCreation = toNonNegativeNumber(normalizedStart.cache_creation_input_tokens)

    const cacheReadTokens = Math.max(0, totalCacheRead - startCacheRead)
    const cacheCreationTokens = Math.max(0, totalCacheCreation - startCacheCreation)
    const rawInputTokens = Math.max(0, rawTotalInput - rawStartInput)
    const inputTokens = Math.max(0, rawInputTokens - cacheReadTokens) + cacheCreationTokens
    const outputTokens = Math.max(0, totalOutput - startOutput)

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    }
  }

  // Codex token_count carries both session cumulative totals and last request usage.
  // Without a reliable turn-start total, last_token_usage is only a degraded
  // latest-request fallback, not a full-turn aggregate.
  if (hasCodexUsageFields(fallbackLastUsage)) {
    const last = normalizeCodexUsage(fallbackLastUsage) || {}
    return {
      inputTokens: toNonNegativeNumber(last.input_tokens),
      outputTokens: toNonNegativeNumber(last.output_tokens),
      cacheReadTokens: toNonNegativeNumber(last.cache_read_input_tokens),
      cacheCreationTokens: toNonNegativeNumber(last.cache_creation_input_tokens),
    }
  }

  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
}

function inferCodexTurnStartTotalsFromTokenCountInfo(info = {}) {
  const totalUsage = info?.total_token_usage || {}
  const lastUsage = info?.last_token_usage || {}
  if (!hasCodexUsageFields(totalUsage)) return null
  return {
    input_tokens: Math.max(0, toNonNegativeNumber(totalUsage.input_tokens) - toNonNegativeNumber(lastUsage.input_tokens)),
    output_tokens: Math.max(0, toNonNegativeNumber(totalUsage.output_tokens) - toNonNegativeNumber(lastUsage.output_tokens)),
    cached_input_tokens: Math.max(0, toNonNegativeNumber(totalUsage.cached_input_tokens) - toNonNegativeNumber(lastUsage.cached_input_tokens)),
    cache_creation_input_tokens: Math.max(0, toNonNegativeNumber(totalUsage.cache_creation_input_tokens) - toNonNegativeNumber(lastUsage.cache_creation_input_tokens)),
  }
}

function buildCodexMetricsFromTokenCountPayload(payload = {}, {
  model = '',
  durationMs = 0,
  gitBranch = '',
  gitChanges = 0,
  turnStartTotals = null,
} = {}) {
  const info = payload?.info || payload || {}
  const total = info.total_token_usage || {}
  const last = info.last_token_usage || {}
  const liveTurnMetrics = buildCodexLiveTurnMetricsFromTotals(total, turnStartTotals || {}, last)
  const inputTokens = toNonNegativeNumber(liveTurnMetrics.inputTokens)
  const outputTokens = toNonNegativeNumber(liveTurnMetrics.outputTokens)
  const cacheReadTokens = toNonNegativeNumber(liveTurnMetrics.cacheReadTokens)
  const cacheCreationTokens = toNonNegativeNumber(liveTurnMetrics.cacheCreationTokens)
  const contextUsage = pickCodexContextUsage(info, payload)
  const contextWindow = pickCodexContextWindow(info, payload, getCodexContextWindowForModel(model))
  if (inputTokens <= 0 && outputTokens <= 0 && cacheReadTokens <= 0 && cacheCreationTokens <= 0 && contextUsage <= 0) {
    return null
  }

  return {
    model: model || '',
    costUsd: estimateCodexCostUsd(inputTokens, outputTokens, cacheReadTokens),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    contextUsage,
    contextWindow,
    durationMs,
    speedOutputPerSec: 0,
    gitBranch,
    gitChanges,
  }
}

/** 从 Codex 会话 JSONL 文件解析完整指标：tokens、cost、duration、context */
// P1-4：级联 async — getGitInfo 已异步化
// NOTE: Transcript/session aggregate helper only. Valid for history restore, diagnostics,
// and session context refresh. Its aggregate token totals must never be used as StatusBar
// current-turn `in/out/cache`; StatusBar must read TurnStore live/final snapshots.
async function getCodexSessionMetricsByFile(filePath, model = '', fallbackCwd = '') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    // T177: 优先走 aggregate 缓存 — 文件未变时直接返回已聚合结果
    const cachedAggregate = getCachedMetricsAggregate(filePath)
    if (cachedAggregate !== null) {
      perfCount('codex-metrics.aggregate-cache-hit')
      const gitInfo = await getGitInfo(cachedAggregate.cwd || fallbackCwd || '')
      return {
        ...cachedAggregate.result,
        gitBranch: gitInfo?.branch || '',
        gitChanges: gitInfo?.changes || 0,
      }
    }
    perfCount('codex-metrics.aggregate-cache-miss')
    const lines = await readJsonlLinesAsync(filePath, Infinity)
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

        const hasTotal = hasCodexUsageFields(total)
        const rawTurnInput = hasTotal
          ? Math.max(0, nextCumulativeInput - turnStartInputTokens)
          : pickCodexTurnTokenValue(last.input_tokens, null, inputTokens)
        outputTokens = hasTotal
          ? Math.max(0, nextCumulativeOutput - turnStartOutputTokens)
          : pickCodexTurnTokenValue(last.output_tokens, null, outputTokens)
        cacheReadTokens = hasTotal
          ? Math.max(0, nextCumulativeCacheRead - turnStartCacheReadTokens)
          : pickCodexTurnTokenValue(last.cached_input_tokens, null, cacheReadTokens)
        cacheCreationTokens = hasTotal
          ? Math.max(0, nextCumulativeCacheCreation - turnStartCacheCreationTokens)
          : pickCodexTurnTokenValue(last.cache_creation_input_tokens, null, cacheCreationTokens)
        inputTokens = Math.max(0, rawTurnInput - cacheReadTokens) + cacheCreationTokens
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

    const result = {
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
    }

    // T177: 缓存聚合结果（不含 git，存拷贝防止外部 mutate 污染缓存）
    try {
      const resultStat = fs.statSync(filePath)
      _metricsAggregateCache.set(filePath, {
        mtimeMs: resultStat.mtimeMs,
        size: resultStat.size,
        cwd,
        result: { ...result },
      })
    } catch (_) { /* stat 失败不阻塞返回 */ }

    // git 状态独立获取（getGitInfo 自带 30s TTL cache，不与 JSONL aggregate 混用）
    const gitInfo = await getGitInfo(cwd)

    return {
      ...result,
      gitBranch: gitInfo?.branch || '',
      gitChanges: gitInfo?.changes || 0,
    }
  } catch (_) {
    return null
  }
}

/** 通过 sessionId 获取指标（会匹配 cliSessionId 找到对应 JSONL 文件） */
// P1-4：级联 async — getCodexSessionMetricsByFile 已异步化
async function getCodexSessionMetrics(sessionId, model = '', fallbackCwd = '') {
  const cliSessionId = cliSessionIds.get(sessionId) || sessionId
  if (!cliSessionId) return null
  const files = listCodexJsonlFilesCached()
  const matched = files.find(file => {
    const base = path.basename(file, '.jsonl')
    return base === cliSessionId || file.includes(cliSessionId)
  })
  if (!matched) return null
  const sessionCwd = codexSessions.get(sessionId)?.cwd || fallbackCwd || ''
  return await getCodexSessionMetricsByFile(matched, model, sessionCwd)
}

function extractSessionSummary(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const key = `${filePath}:${stat.size}:${Math.trunc(stat.mtimeMs)}`
    const cached = codexSessionSummaryCache.get(filePath)
    if (cached?.key === key) {
      return cached.summary ? { ...cached.summary, historyLoadGuard: { ...(cached.summary.historyLoadGuard || {}) } } : null
    }
    const summary = extractCodexSessionSummary(filePath, collectSessionTailRiskSummary)
    codexSessionSummaryCache.set(filePath, { key, summary })
    return summary ? { ...summary, historyLoadGuard: { ...(summary.historyLoadGuard || {}) } } : null
  } catch (_) {
    return null
  }
}

/** 将 Codex agent item（reasoning/command_execution/file_change 等）转为前端 tool message */
/** 将 Codex stream item 转换为前端 ToolMessageCard 所需的消息对象 */
function buildToolMessageFromItem(item) {
  if (!item || !item.id) return null

  const builders = {
    reasoning: () => ({
      role: 'tool', toolName: 'thinking', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getToolActivityLabel('thinking'),
      status: 'done', text: item.text || '', expanded: false, newContent: '', diffLines: [],
    }),
    command_execution: () => ({
      role: 'tool', toolName: 'shell', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getToolActivityLabel('shell'),
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
        activityLabel: getToolActivityLabel('file_change'),
        status: item.status === 'failed' ? 'error' : 'done',
        filePath: changes.map(c => c.path).filter(Boolean).join('\n'),
        expanded: true, newContent: '', diffLines: [],
        text: JSON.stringify({ changes, status: item.status }, null, 2),
      }
    },
    mcp_tool_call: () => ({
      role: 'tool', toolName: 'mcp_tool', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getToolActivityLabel('mcp_tool'),
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
      activityLabel: getToolActivityLabel('web_search'),
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
        activityLabel: getToolActivityLabel('todo_list'),
        status: 'done', expanded: false, newContent: '', diffLines: [],
        text: JSON.stringify({ todos: todoItems }, null, 2), todoItems,
      }
    },
    error: () => ({
      role: 'tool', toolName: 'error', toolUseId: item.id,
      rawType: item.type,
      activityLabel: getToolActivityLabel('error'),
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
    activityLabel: getToolActivityLabel(toolName),
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

function pushHistoryMessage(messages, seenMessages, message) {
  if (!message) return false
  const key = buildMessageDedupKey(message.role, message.text, message.content)
  const previous = messages[messages.length - 1]
  const previousKey = previous ? buildMessageDedupKey(previous.role, previous.text, previous.content) : ''
  if (previousKey === key || seenMessages.has(`${messages.length}:${key}`)) return false
  seenMessages.add(`${messages.length}:${key}`)
  messages.push(message)
  return true
}

function attachTurnTokensToLastAssistantMessage(messages, turnTokens) {
  if (!turnTokens || !Array.isArray(messages)) return
  const hasTokens = toNonNegativeNumber(turnTokens.inputTokens) > 0
    || toNonNegativeNumber(turnTokens.outputTokens) > 0
    || toNonNegativeNumber(turnTokens.cacheReadTokens) > 0
    || toNonNegativeNumber(turnTokens.cacheCreationTokens) > 0
    || toNonNegativeNumber(turnTokens.durationMs) > 0
  if (!hasTokens) return
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role !== 'assistant') continue
    message._turnTokens = {
      inputTokens: toNonNegativeNumber(turnTokens.inputTokens),
      outputTokens: toNonNegativeNumber(turnTokens.outputTokens),
      cacheReadTokens: toNonNegativeNumber(turnTokens.cacheReadTokens),
      cacheCreationTokens: toNonNegativeNumber(turnTokens.cacheCreationTokens),
      durationMs: toNonNegativeNumber(turnTokens.durationMs),
    }
    return
  }
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
    const stopStat = perfStartIpc('codex.readRange.stat')
    if (!fs.existsSync(filePath)) {
      stopStat({ found: 0 })
      return { messages: [], hasMore: false, totalPages: 0 }
    }

    const safePage = Math.max(0, Number(page) || 0)
    const safePageSize = Math.max(1, Number(pageSize) || 60)
    const fileSize = fs.statSync(filePath).size
    stopStat({ found: 1, fileSizeKB: Math.round(fileSize / 1024) })
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
      const firstPageLineBudget = Math.max(1000, safePageSize)
      const maxFirstPageScans = 5
      const lines = []
      let pageData = { lines: [], hasMore: false, totalPages: 1 }
      const messages = []
      const seenMessages = new Set()
      const seenToolCallIds = new Set() // 已刷入消息的 call_id，防止 JSONL 重复行导致 tool 消息重复
      const pendingCalls = {} // call_id -> { call, output }
      const patchCalls = new Set() // call_ids that are apply_patch (handled by patch_apply_end)
      let historyModel = ''
      let activeTurnTokens = null

      function ensureActiveTurnTokens(ts = null) {
        if (!activeTurnTokens) {
          activeTurnTokens = {
            startedAt: ts,
            startTotals: null,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            durationMs: 0,
          }
        } else if (!activeTurnTokens.startedAt && ts) {
          activeTurnTokens.startedAt = ts
        }
        return activeTurnTokens
      }

      function flushActiveTurnTokens() {
        if (!activeTurnTokens) return
        // Phase 4：activeTurnTokens 值已由 buildCodexLiveTurnMetricsFromTotals
        // 通过 normalizeCodexUsage 规范化，与 TurnStore 口径一致。
        attachTurnTokensToLastAssistantMessage(messages, activeTurnTokens)
        activeTurnTokens = null
      }

      function collectMessage(line) {
        const row = safeJsonParse(line)
        if (!row) return
        const parsedTs = Date.parse(row.timestamp || '')
        const ts = Number.isFinite(parsedTs) ? parsedTs : null
        if (row.type === 'turn_context' && row.payload?.model) historyModel = historyModel || row.payload.model
        if (row.type === 'session_meta' && row.payload?.model) historyModel = historyModel || row.payload.model

        if (row.type === 'event_msg' && row.payload?.type === 'user_message') {
          flushActiveTurnTokens()
          activeTurnTokens = {
            startedAt: ts,
            startTotals: null,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            durationMs: 0,
          }
          return
        }

        if (row.type === 'event_msg' && row.payload?.type === 'token_count') {
          const totalUsage = row.payload?.info?.total_token_usage || {}
          const turn = ensureActiveTurnTokens(ts)
          if (!turn.startTotals && hasCodexUsageFields(totalUsage)) {
            turn.startTotals = inferCodexTurnStartTotalsFromTokenCountInfo(row.payload?.info || {})
          }
          const metrics = buildCodexMetricsFromTokenCountPayload(row.payload, {
            model: historyModel,
            durationMs: activeTurnTokens?.startedAt && ts ? Math.max(0, ts - activeTurnTokens.startedAt) : 0,
            turnStartTotals: turn.startTotals,
          })
          if (metrics) {
            turn.inputTokens = toNonNegativeNumber(metrics.inputTokens, turn.inputTokens)
            turn.outputTokens = toNonNegativeNumber(metrics.outputTokens, turn.outputTokens)
            turn.cacheReadTokens = toNonNegativeNumber(metrics.cacheReadTokens, turn.cacheReadTokens)
            turn.cacheCreationTokens = toNonNegativeNumber(metrics.cacheCreationTokens, turn.cacheCreationTokens)
            turn.durationMs = toNonNegativeNumber(metrics.durationMs, turn.durationMs)
          }
          return
        }

        if (row.type === 'event_msg' && row.payload?.type === 'task_complete') {
          const turn = ensureActiveTurnTokens(ts)
          turn.durationMs = toNonNegativeNumber(row.payload?.duration_ms, turn.durationMs)
          if (!turn.durationMs && turn.startedAt && ts) {
            turn.durationMs = Math.max(0, ts - turn.startedAt)
          }
        }

        // user/assistant/system 消息只取 response_item（数据最完整，含图片等），
        // event_msg.user_message / agent_message 直接跳过避免重复
        if (row.type === 'response_item' && row.payload?.type === 'message') {
          const role = row.payload.role
          if (role === 'user' || role === 'assistant' || role === 'system') {
            const text = buildMessageTextFromContent(row.payload.content)
            if (text || hasRenderableMessageContent(row.payload.content)) {
              pushHistoryMessage(messages, seenMessages, { role, text, content: row.payload.content })
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
        const agentMessage = extractCodexAssistantHistoryMessageFromJsonlRow(row)
        if (agentMessage) {
          pushHistoryMessage(messages, seenMessages, agentMessage)
          return
        }

        // 以下类型只是元数据，跳过不警告
        if (p.type === 'task_complete' || p.type === 'task_started' || p.type === 'turn_context' ||
            p.type === 'token_count' || p.type === 'user_message' || p.type === 'reasoning' || p.type === 'agent_reasoning') {
          return
        }

        // 未知 payload 类型兜底日志
        if (CODEX_DEBUG) console.warn('[codex] collectMessage: unhandled payload.type:', p.type)
      }
      function tryFlushCall(callId) {
        const entry = pendingCalls[callId]
        if (!entry || !entry.call) return
        if (seenToolCallIds.has(callId)) { delete pendingCalls[callId]; return }
        seenToolCallIds.add(callId)

        const call = entry.call
        const output = entry.output || ''
        const patchEnd = entry.patchEnd

        // apply_patch without patch_end yet → skip for now (defer fusion)
        if (patchCalls.has(callId) && !patchEnd) return

        // Use shared mapper for tool message construction (live/history parity)
        const msg = buildHistoryToolMessage(call, output, patchEnd, { historyRestore: true })
        if (!msg) return

        // Enrich function_call (non-shell) with file preview state
        if (call.type === 'function_call' && call.name !== 'shell_command') {
          let args = {}
          try { args = JSON.parse(call.arguments || '{}') } catch (_) {}
          Object.assign(msg, buildFunctionCallPreviewState(call.name, args))
        }

        messages.push(msg)
        delete pendingCalls[callId]
      }

      const stopTail = perfStartIpc('codex.readRange.tailRead')
      let actualScans = 0
      for (let scanPage = 0; scanPage < maxFirstPageScans; scanPage += 1) {
        actualScans = scanPage + 1
        pageData = readJsonlPageLinesFromTail(filePath, scanPage, firstPageLineBudget)
        if (pageData.lines.length) lines.unshift(...pageData.lines)
        messages.length = 0
        seenMessages.clear()
        seenToolCallIds.clear()
        for (const key of Object.keys(pendingCalls)) delete pendingCalls[key]
        patchCalls.clear()
        historyModel = ''
        activeTurnTokens = null
        for (const line of lines) collectMessage(line)
        if (messages.length >= safePageSize || !pageData.hasMore) break
      }
      // tailRead 含 I/O + collectMessage（循环内交替），仅记录扫描次数和行数
      stopTail({ scanPages: actualScans, linesRead: lines.length })
      // collect：循环后的消息收尾（flush + pending flush）
      const stopCollect = perfStartIpc('codex.readRange.collect')
      flushActiveTurnTokens()

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
            activityLabel: getToolActivityLabel('thinking'),
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
          activityLabel: getToolActivityLabel(name || call.type || 'tool'),
          toolUseId: callId,
          status: 'done',
          expanded: true,
          newContent: '',
          diffLines: [],
          text: JSON.stringify({ name, input: String(input).substring(0, 2000) }, null, 2),
        })
      }
      stopCollect({ pendingFlushed: Object.keys(pendingCalls).length })

      const stopProcess = perfStartIpc('codex.readRange.process')
      const sliced = messages.slice(-safePageSize)
      const result = {
        messages: sliced.map((message, index) => ({ id: index + 1, ...message })),
        hasMore: pageData.hasMore || messages.length > sliced.length,
        totalPages: Math.max(1, pageData.totalPages || Math.ceil(messages.length / safePageSize)),
      }
      stopProcess({ resultMessages: result.messages.length, resultHasMore: result.hasMore ? 1 : 0 })
      return result
    }

    const pageData = readJsonlPageLinesFromTail(filePath, safePage, safePageSize)
    if (!pageData.lines.length) return { messages: [], hasMore: false, totalPages: pageData.totalPages }

    const messages = []
    const seenMessages = new Set()
    const pendingCalls = {}
    const patchCalls = new Set()
    let historyModel = ''
    let activeTurnTokens = null

    function ensureActiveTurnTokens(ts = null) {
      if (!activeTurnTokens) {
        activeTurnTokens = {
          startedAt: ts,
          startTotals: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: 0,
        }
      } else if (!activeTurnTokens.startedAt && ts) {
        activeTurnTokens.startedAt = ts
      }
      return activeTurnTokens
    }

    function flushActiveTurnTokens() {
      if (!activeTurnTokens) return
      attachTurnTokensToLastAssistantMessage(messages, activeTurnTokens)
      activeTurnTokens = null
    }
    function collectMessage(line) {
      if (!line.trim()) return
      const row = safeJsonParse(line)
      if (!row) return
      const parsedTs = Date.parse(row.timestamp || '')
      const ts = Number.isFinite(parsedTs) ? parsedTs : null
      if (row.type === 'turn_context' && row.payload?.model) historyModel = historyModel || row.payload.model
      if (row.type === 'session_meta' && row.payload?.model) historyModel = historyModel || row.payload.model

      if (row.type === 'event_msg' && row.payload?.type === 'user_message') {
        flushActiveTurnTokens()
        activeTurnTokens = {
          startedAt: ts,
          startTotals: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: 0,
        }
        return
      }

      if (row.type === 'event_msg' && row.payload?.type === 'token_count') {
        const totalUsage = row.payload?.info?.total_token_usage || {}
        const turn = ensureActiveTurnTokens(ts)
        if (!turn.startTotals && hasCodexUsageFields(totalUsage)) {
          turn.startTotals = inferCodexTurnStartTotalsFromTokenCountInfo(row.payload?.info || {})
        }
        const metrics = buildCodexMetricsFromTokenCountPayload(row.payload, {
          model: historyModel,
          durationMs: activeTurnTokens?.startedAt && ts ? Math.max(0, ts - activeTurnTokens.startedAt) : 0,
          turnStartTotals: turn.startTotals,
        })
        if (metrics) {
          turn.inputTokens = toNonNegativeNumber(metrics.inputTokens, turn.inputTokens)
          turn.outputTokens = toNonNegativeNumber(metrics.outputTokens, turn.outputTokens)
          turn.cacheReadTokens = toNonNegativeNumber(metrics.cacheReadTokens, turn.cacheReadTokens)
          turn.cacheCreationTokens = toNonNegativeNumber(metrics.cacheCreationTokens, turn.cacheCreationTokens)
          turn.durationMs = toNonNegativeNumber(metrics.durationMs, turn.durationMs)
        }
        return
      }

      if (row.type === 'event_msg' && row.payload?.type === 'task_complete') {
        const turn = ensureActiveTurnTokens(ts)
        turn.durationMs = toNonNegativeNumber(row.payload?.duration_ms, turn.durationMs)
        if (!turn.durationMs && turn.startedAt && ts) {
          turn.durationMs = Math.max(0, ts - turn.startedAt)
        }
      }

      if (row.type === 'response_item' && row.payload?.type === 'message') {
        const role = row.payload.role
        if (role === 'user' || role === 'assistant' || role === 'system') {
          const text = buildMessageTextFromContent(row.payload.content)
          if (text || hasRenderableMessageContent(row.payload.content)) {
            pushHistoryMessage(messages, seenMessages, { role, text, content: row.payload.content })
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
      const agentMessage = extractCodexAssistantHistoryMessageFromJsonlRow(row)
      if (agentMessage) {
        pushHistoryMessage(messages, seenMessages, agentMessage)
        return
      }

      // 以下类型只是元数据，跳过不警告
      if (p.type === 'task_complete' || p.type === 'task_started' || p.type === 'turn_context' ||
          p.type === 'token_count' || p.type === 'user_message' || p.type === 'reasoning' || p.type === 'agent_reasoning') {
        return
      }

      // 未知 payload 类型兜底日志
      if (CODEX_DEBUG) console.warn('[codex] collectMessage: unhandled payload.type:', p.type)
    }
    function tryFlushCall(callId) {
      const entry = pendingCalls[callId]
      if (!entry || !entry.call) return

      const call = entry.call
      const output = entry.output || ''
      const patchEnd = entry.patchEnd

      // apply_patch without patch_end yet → skip (defer fusion)
      if (patchCalls.has(callId) && !patchEnd) return

      // Use shared mapper (live/history parity)
      const msg = buildHistoryToolMessage(call, output, patchEnd, { historyRestore: true })
      if (!msg) return

      // Enrich function_call (non-shell) with file preview state
      if (call.type === 'function_call' && call.name !== 'shell_command') {
        let args = {}
        try { args = JSON.parse(call.arguments || '{}') } catch (_) {}
        Object.assign(msg, buildFunctionCallPreviewState(call.name, args))
      }

      messages.push(msg)
      delete pendingCalls[callId]
    }

    for (const line of pageData.lines) collectMessage(line)
    flushActiveTurnTokens()

    const baseId = -((safePage + 1) * 100000)
    return {
      messages: messages.map((message, index) => ({ id: baseId + index, ...message })),
      hasMore: pageData.hasMore,
      totalPages: pageData.totalPages,
    }
  } catch (_) {
    return { messages: [], hasMore: false, totalPages: 0 }
  }
}

/** 按工作目录列出所有 Codex 会话历史 */
function listSessionsByCwd(targetCwd) {
  const normalizedTarget = normalizeFsPath(targetCwd)
  const files = listCodexJsonlFilesCached()
  const sessions = []

  for (const file of files) {
    const summary = extractSessionSummary(file)
    if (!summary) continue
    if (normalizeFsPath(summary.cwd) === normalizedTarget) {
      const attached = attachRegistrySessionToScanSummary('codex', summary, { cwd: targetCwd })
      if (attached) sessions.push(attached)
    }
  }

  return sessions.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
}

const codexSessions = new Map()
const cliSessionIds = new Map()
const sessionFingerprints = new Map()
const slowNoticeSent = new Set()
const codexMetricsPollers = new Map() // sessionId -> { interval, startTime }

function stopCodexMetricsPoller(sessionId, runId = null) {
  const poller = codexMetricsPollers.get(sessionId)
  if (!poller) return false
  if (runId && poller.runId && poller.runId !== runId) return false
  clearInterval(poller.interval)
  codexMetricsPollers.delete(sessionId)
  return true
}

function startCodexMetricsPoller(sessionId, poller) {
  stopCodexMetricsPoller(sessionId)
  codexMetricsPollers.set(sessionId, poller)
}
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

function codexEventHasErrorType(value, targetType) {
  const expected = String(targetType || '').trim()
  if (!expected) return false
  const seen = new Set()
  function visit(node) {
    if (!node || typeof node !== 'object') return false
    if (seen.has(node)) return false
    seen.add(node)
    if (String(node.type || '') === expected) return true
    if (String(node.code || '') === expected) return true
    if (String(node.error?.type || '') === expected) return true
    if (String(node.error?.code || '') === expected) return true
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object' && visit(child)) return true
    }
    return false
  }
  return visit(value)
}

function isEmptyUpstreamCodexFailure(ev) {
  return codexEventHasErrorType(ev, 'empty_upstream_response')
}

function detachCodexResumeMapping({ sessionId, cliSessionId, filePath } = {}) {
  const sid = String(sessionId || '').trim()
  const cliId = String(cliSessionId || '').trim()
  if (sid) cliSessionIds.delete(sid)
  try {
    detachSessionProviderBinding({
      agent: 'codex',
      chatKey: sid || undefined,
      cliSessionId: cliId || undefined,
      filePath: filePath || undefined,
    })
  } catch (e) {
    console.warn('[codex] failed to detach resume mapping:', e?.message || e)
  }
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
  sessionFingerprints.clear()
  slowNoticeSent.clear()
  clearAllStores()
  resetCodexSdkPromise()
}

/** 注册所有 Codex SDK 相关的 IPC 处理器（query/abort/history/settings） */
function buildCodexSessionFingerprint({ model, baseURL, apiFormat, reasoningEffort } = {}) {
  return JSON.stringify({
    model: String(model || '').trim(),
    baseURL: String(baseURL || '').trim(),
    apiFormat: String(apiFormat || '').trim() || 'responses',
    reasoningEffort: normalizeCodexReasoningEffort(reasoningEffort),
  })
}

function shouldResumeCodexSession({ previousCliId } = {}) {
  // P0: 只要存在旧 threadId 就尝试 resume，不再因 fingerprint 变化阻断
  // SDK 的 resumeThread(id, options) 原生支持传入新的 model / reasoningEffort
  return Boolean(String(previousCliId || '').trim())
}

function setupCodexSdkHandlers() {
  loadCodexSdk().catch(() => {})

  ipcMain.handle('codex-agent-query', async (event, { prompt, images, cwd, sessionId, networkAccessEnabled, webSearchMode, additionalDirectories, sandboxMode: frontendSandbox, model: modelOverride, reasoningEffort: reasoningEffortOverride }) => {
    const runtime = readRuntimeConfig()
    console.log('[codex-diag] readRuntimeConfig:', {
      hasApiKey: !!runtime.apiKey,
      baseURL: runtime.baseURL,
      model: runtime.model,
      reasoningEffort: runtime.reasoningEffort,
      apiFormat: runtime.apiFormat,
      cwd: path.resolve(cwd || process.cwd()),
    })
    const apiKey = runtime.apiKey || ''
    const baseURL = runtime.baseURL || ''
    const model = modelOverride?.trim() || runtime.model || ''
    const reasoningEffort = String(reasoningEffortOverride?.trim() || runtime.reasoningEffort || '').trim()
    const apiFormat = String(runtime.apiFormat || '').trim() || 'responses'
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
      stopCodexMetricsPoller(sessionId)
      // 立即清除旧 turnTimeout，防止旧 IIFE 的 finally 延迟清除导致二次超时消息
      if (settledExisting.__turnTimeout) { clearTimeout(settledExisting.__turnTimeout); settledExisting.__turnTimeout = null }
      if (settledExisting.__bootWatch) { clearTimeout(settledExisting.__bootWatch); settledExisting.__bootWatch = null }
      codexSessions.delete(sessionId)
    }

    return new Promise((resolve) => {
      const nextFingerprint = buildCodexSessionFingerprint({
        model,
        baseURL,
        apiFormat,
        reasoningEffort,
      })
      const previousCliId = cliSessionIds.get(sessionId)
      // P0: 不再因 fingerprint 变化阻断 resume，始终尝试恢复旧 thread
      const prevCliId = previousCliId || ''
      const abortController = new AbortController()
      let resolveCompletion = () => {}
      const completionPromise = new Promise((completionResolve) => {
        resolveCompletion = completionResolve
      })
      const diagnosticId = makeCodexTurnDiagnosticId('codex-turn')
      let gotAnyMessage = false
      let resultReceived = false
      const liveSampleCounts = { sdkLiveCount: 0, jsonlPollCount: 0, tokenCountCount: 0, sdkResultCount: 0, sawLiveTurnTokens: false, sawFinalTurnTokens: false }
      let exitCode = 0
      let doneReason = 'completed'
      let detachResumeOnDone = false

      const sessionState = {
        runId, thread: null, abortController, event, model, baseURL, apiKey,
        sessionId, startTime: Date.now(), cwd: resolvedCwd,
        resultReceived: false, doneSent: false, streamClosed: false,
        completionPromise, resolveCompletion, diagnosticId,
      }
      codexSessions.set(sessionId, sessionState)
      // Phase 3: begin turn for TurnStore
      beginTurn({ provider: 'codex', chatKey: sessionId, providerSessionId: prevCliId || '', startedAt: Date.now() })

      appendCodexTurnDiagnostic({
        kind: 'turn.start',
        diagnosticId,
        sessionId,
        runId,
        cliSessionId: prevCliId || '',
        provider: 'codex',
        model: model || '',
        baseURL: baseURL || '',
        apiFormat: apiFormat || '',
        reasoningEffort: reasoningEffort || '',
        // P0: canResumePreviousThread 已移除，始终尝试 resume
        previousFingerprint: sessionFingerprints.get(sessionId) || '',
        nextFingerprint,
        additionalDirectoriesCount: Array.isArray(additionalDirectories) ? additionalDirectories.length : 0,
        networkAccessEnabled: networkAccessEnabled === undefined ? null : Boolean(networkAccessEnabled),
        webSearchMode: webSearchMode || '',
        promptInput: summarizeCodexPromptInput(prompt, images),
      })

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

          // 协议转换代理：跟随 apiFormat 自动管理，通过本次 Codex 子进程 config 指向本地 proxy
          let effectiveBaseUrl = baseURL || ''
          let proxyCodexConfig = null
          if (apiFormat === 'chat' && baseURL) {
            try {
              const { baseUrl: proxyBaseUrl, codexConfig } = await ensureProxy({
                upstreamUrl: baseURL,
                apiKey,
                model: model || '',
                reasoningEffort,
                diagnosticId,
              })
              effectiveBaseUrl = proxyBaseUrl
              proxyCodexConfig = codexConfig
            } catch (proxyErr) {
              console.error('[codex] proxy start failed:', {
                upstream: baseURL,
                model: model || '',
                message: proxyErr?.message || String(proxyErr),
              })
              throw new Error(`Codex Chat proxy failed to start for ${model || 'current model'}: ${proxyErr?.message || proxyErr}`)
            }
          } else {
            // apiFormat 不是 chat → 确保代理关闭（含 toml 恢复）
            try { await shutdownProxy() } catch (_) {}
          }

          const codex = new Codex({
            codexPathOverride: findGlobalCodexPath(),
            apiKey,
            ...(effectiveBaseUrl ? { baseUrl: effectiveBaseUrl } : {}),
            ...(proxyCodexConfig ? { config: proxyCodexConfig } : {}),
            env: augmentEnvWithBundledRg({
              ...process.env,
              OPENAI_API_KEY: apiKey,
              ...(effectiveBaseUrl ? { OPENAI_BASE_URL: effectiveBaseUrl } : {}),
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
              appendCodexTurnDiagnostic({
                kind: 'turn.resume-attempt',
                diagnosticId,
                sessionId,
                runId,
                previousCliSessionId: prevCliId,
                resumed: true,
              })
            } catch (e) {
              console.warn('[codex] resumeThread failed, starting new thread:', e?.message, 'sessionId=', sessionId, 'prevCliId=', prevCliId)
              cliSessionIds.delete(sessionId)
              appendCodexTurnDiagnostic({
                kind: 'turn.resume-attempt',
                diagnosticId,
                sessionId,
                runId,
                previousCliSessionId: prevCliId,
                resumed: false,
                error: String(e?.message || e || ''),
              })
              thread = codex.startThread(threadOptions)
            }
          } else {
            // B023 guard：记录每次 startThread 调用，便于排查空会话（仅含'/'）来源
            console.log('[codex] startThread: sessionId=', sessionId, 'cwd=', resolvedCwd, 'sandboxMode=', sandboxMode, 'hasPrompt=', !!prompt)
            thread = codex.startThread(threadOptions)
          }

          appendCodexTurnDiagnostic({
            kind: 'turn.thread-bound',
            diagnosticId,
            sessionId,
            runId,
            cliSessionId: thread?.id || '',
            cwd: resolvedCwd,
            sandboxMode: sandboxMode || '',
            hasPrompt: Boolean(prompt),
            imageCount: Array.isArray(images) ? images.length : 0,
          })

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

          // 启动 metrics 轮询器。只推送真实 JSONL 样本，不伪造中间值；
          // 轮询间隔缩短到 1s，提升状态栏动态感。
          const pollStart = Date.now()
          const pollInterval = setInterval(async () => {
            const stopLocalPoller = () => {
              clearInterval(pollInterval)
              stopCodexMetricsPoller(sessionId, runId)
            }
            const s = codexSessions.get(sessionId)
            if (!s) {
              stopLocalPoller()
              return
            }
            if (s.runId !== runId) {
              stopLocalPoller()
              return
            }
            if (s.streamClosed || s.doneSent || s.resultReceived) {
              stopLocalPoller()
              return
            }
            const cliId = cliSessionIds.get(sessionId)
            if (!cliId) return
            const filePath = resolveCodexSessionFilePath({ sessionId, cliSessionId: cliId })
            if (!fs.existsSync(filePath)) return
            const liveMetrics = extractLatestCodexLiveTurnMetricsFromJsonl(filePath, {
              model: model || '',
              turnStartedAt: s.startTime || pollStart,
            })
            let sawJsonlPollSample = false
            if (liveMetrics) {
              sawJsonlPollSample = true
              liveSampleCounts.sawLiveTurnTokens = true
              emitCodexMetricsViaStore(s.event?.sender, {
                source: 'jsonl-poll',
                scope: 'turn-live',
                inputTokens: liveMetrics.inputTokens,
                outputTokens: liveMetrics.outputTokens,
                cacheReadTokens: liveMetrics.cacheReadTokens,
                cacheCreationTokens: liveMetrics.cacheCreationTokens,
                contextUsage: liveMetrics.contextUsage,
                contextWindow: liveMetrics.contextWindow,
                durationMs: liveMetrics.durationMs,
                costUsd: liveMetrics.costUsd,
                rawUsage: liveMetrics.rawUsage || null,
              }, sessionId, model || '')
            }
            const metrics = await getCodexSessionMetricsByFile(filePath, model || '', s.cwd || '')
            if (metrics) {
              sawJsonlPollSample = true
              metrics.sessionId = sessionId
              metrics.thinking = true
              emitCodexMetricsViaStore(s.event?.sender, {
                source: 'jsonl-poll',
                scope: 'session-context',
                contextUsage: metrics.contextUsage,
                contextWindow: metrics.contextWindow,
                durationMs: metrics.durationMs,
                costUsd: metrics.costUsd,
                rawUsage: metrics.rawUsage || null,
              }, sessionId, model || '')
            }
            if (sawJsonlPollSample) liveSampleCounts.jsonlPollCount += 1
          }, CODEX_METRICS_POLL_INTERVAL_MS)
          startCodexMetricsPoller(sessionId, { interval: pollInterval, startTime: pollStart, runId })

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
            const sfilePath = resolveCodexSessionFilePath({ sessionId, cliSessionId: thread.id })
            console.log(`[codex] triggerDone: sessionId=${sessionId} cliId=${thread?.id} filePath=${!!sfilePath}`)
            safeSend(sender, 'codex-agent-done', buildCodexAgentDonePayload({
              sessionId,
              cliSessionId: thread.id,
              filePath: sfilePath,
              reason: doneReason,
              detachResume: detachResumeOnDone,
            }))
            // PR 2：双发 agent.run.done（triggerDone 是同步函数，用 .then）
            getAgentProtocol().then(({ buildAgentRunDoneEvent }) => {
              safeSend(sender, 'agent:event', buildAgentRunDoneEvent({
                agent: 'codex',
                chatKey: sessionId,
                runId,
                cliSessionId: thread.id || '',
                filePath: sfilePath,
              }))
            }).catch(() => {})
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

            if (ev.type === 'turn.completed') {
              sessionFingerprints.set(sessionId, nextFingerprint)
            }

            if (ev.type === 'user_message' || ev.payload?.type === 'user_message') {
              const session = codexSessions.get(sessionId)
              if (session) {
                session._liveTurnStartTotals = session._liveLastTotals
                  ? { ...session._liveLastTotals }
                  : null
              }
            }

            if (ev.type === 'token_count' || ev.payload?.type === 'token_count') {
              liveSampleCounts.tokenCountCount += 1
              const session = codexSessions.get(sessionId)
              const sender = session?.event?.sender || event.sender
              const tokenPayload = ev.payload?.type === 'token_count' ? ev.payload : ev
              const tokenInfo = tokenPayload?.info || tokenPayload || {}
              const totalUsage = tokenInfo.total_token_usage || {}
              if (session && !session._liveTurnStartTotals) {
                session._liveTurnStartTotals = inferCodexTurnStartTotalsFromTokenCountInfo(tokenInfo)
              }
              if (session && hasCodexUsageFields(totalUsage)) {
                session._liveLastTotals = {
                  input_tokens: toNonNegativeNumber(totalUsage.input_tokens),
                  output_tokens: toNonNegativeNumber(totalUsage.output_tokens),
                  cached_input_tokens: toNonNegativeNumber(totalUsage.cached_input_tokens),
                  cache_creation_input_tokens: toNonNegativeNumber(totalUsage.cache_creation_input_tokens),
                }
              }
              const elapsedMs = Math.max(0, Date.now() - pollStart)
              const liveMetrics = buildCodexMetricsFromTokenCountPayload(tokenPayload, {
                model: model || '',
                durationMs: elapsedMs,
                gitBranch: '',
                gitChanges: 0,
                turnStartTotals: session?._liveTurnStartTotals || null,
              })
              if (liveMetrics) {
                if ((liveMetrics.inputTokens || 0) > 0 || (liveMetrics.outputTokens || 0) > 0 || (liveMetrics.cacheReadTokens || 0) > 0 || (liveMetrics.cacheCreationTokens || 0) > 0) liveSampleCounts.sawLiveTurnTokens = true
                emitCodexMetricsViaStore(sender, {
                  source: 'token-count',
                  scope: 'turn-live',
                  inputTokens: liveMetrics.inputTokens,
                  outputTokens: liveMetrics.outputTokens,
                  cacheReadTokens: liveMetrics.cacheReadTokens,
                  cacheCreationTokens: liveMetrics.cacheCreationTokens,
                  contextUsage: liveMetrics.contextUsage,
                  contextWindow: liveMetrics.contextWindow,
                  durationMs: liveMetrics.durationMs,
                  costUsd: liveMetrics.costUsd,
                  rawUsage: totalUsage || null,
                }, sessionId, model || '')
              }
            }

            if (ev.type === 'turn.completed' || ev.type === 'turn.failed' || ev.type === 'task_complete') {
              liveSampleCounts.sdkResultCount += 1
              console.log(`[codex] turn terminal: type=${ev.type} sessionId=${sessionId} pendingItems=${pendingItemIds.size}`)
              resultReceived = true
              const session = codexSessions.get(sessionId)
              if (session?.runId === runId) session.resultReceived = true
              const sender = session?.event?.sender || event.sender
              const durationMs = Math.max(0, Date.now() - (session?.startTime || Date.now()))
              const liveSnapshot = getCurrentSnapshot(sessionId) || null
              const finalTurnMetrics = buildCodexFinalTurnMetricsFromTerminalUsage(ev.usage || {}, {
                turnStartTotals: session?._liveTurnStartTotals || null,
                liveSnapshot,
                tokenCountSeen: liveSampleCounts.tokenCountCount > 0,
              })
              // Phase 4：先 finalize TurnStore，再从 snapshot 构建 _perTurnTokens
              const snapshot = emitCodexMetricsViaStore(sender, {
                source: 'sdk-result',
                scope: 'turn-final',
                // normalizeCodexUsage 返回 snake_case 字段（phase 1 wrapper），需用正确 key
                inputTokens: finalTurnMetrics.inputTokens,
                outputTokens: finalTurnMetrics.outputTokens,
                cacheReadTokens: finalTurnMetrics.cacheReadTokens,
                cacheCreationTokens: finalTurnMetrics.cacheCreationTokens,
                contextUsage: 0,
                contextWindow: 0,
                durationMs,
                costUsd: 0,
                rawUsage: {
                  authority: finalTurnMetrics.authority,
                  usage: ev.usage || null,
                },
              }, sessionId, model || '', {
                speedOutputPerSec: 0,
                gitBranch: '',
                gitChanges: 0,
                usageApiSessionPct: null,
              })
              // 从 TurnStore snapshot 构建 perTurnTokens（与 StatusBar 同源）
              if (snapshot && ((snapshot.inputTokens || 0) > 0 || (snapshot.outputTokens || 0) > 0 || (snapshot.cacheReadTokens || 0) > 0 || (snapshot.cacheCreationTokens || 0) > 0)) liveSampleCounts.sawFinalTurnTokens = true
              const perTurnTokens = snapshot ? {
                inputTokens: snapshot.inputTokens,
                outputTokens: snapshot.outputTokens,
                cacheReadTokens: snapshot.cacheReadTokens,
                cacheCreationTokens: snapshot.cacheCreationTokens,
                durationMs: snapshot.durationMs,
              } : null
              safeSend(sender, 'codex-agent-message', {
                sessionId,
                msg: { type: ev.type, payload: ev.payload || ev, _perTurnTokens: perTurnTokens },
              })
              if (session?.runId === runId) {
                const currentSession = codexSessions.get(sessionId)
                if (currentSession) {
                  currentSession._liveTurnStartTotals = null
                  currentSession._liveLastTotals = null
                }
              }
              appendCodexTurnDiagnostic({
                kind: 'turn.terminal-event',
                diagnosticId,
                sessionId,
                runId,
                cliSessionId: thread?.id || '',
                pendingItems: pendingItemIds.size,
                tokenMetricAuthority: finalTurnMetrics.authority,
                terminal: summarizeCodexTerminalEvent(ev),
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
              // 防重：turn.completed 和 task_complete 可能同时出现，只发一次 terminal 事件
              const wasAlreadyTerminal = turnCompletedSeen
              turnCompletedSeen = true
              turnCompletedAt = Date.now()
              // 旧 done 优先（不阻塞），新 event fire-and-forget
              maybeSendDone()
              if (!wasAlreadyTerminal) {
                const sender = codexSessions.get(sessionId)?.event?.sender || event.sender
                getAgentProtocol().then(({ buildAgentTurnTerminalEvent, TerminalKind }) => {
                  safeSend(sender, 'agent:event', buildAgentTurnTerminalEvent({
                    agent: 'codex',
                    chatKey: sessionId,
                    runId,
                    cliSessionId: thread?.id || '',
                    terminalKind: TerminalKind.COMPLETED,
                    hasAssistantOutput: true,
                  }))
                }).catch(() => {})
              }
            }

            const topLevelAgentMessage = normalizeTopLevelCodexStreamEvent(ev)
            if (topLevelAgentMessage) {
              const sender = codexSessions.get(sessionId)?.event?.sender || event.sender
              safeSend(sender, 'codex-agent-message', { sessionId, msg: topLevelAgentMessage })
              continue
            }

            if (ev.type === 'thread.error' || ev.type === 'turn.failed') {
              resultReceived = true
              const session = codexSessions.get(sessionId)
              if (session?.runId === runId) session.resultReceived = true
              if (ev.type === 'turn.failed' && isEmptyUpstreamCodexFailure(ev)) {
                const cliId = thread?.id || cliSessionIds.get(sessionId) || ''
                const filePath = resolveCodexSessionFilePath({ sessionId, cliSessionId: cliId })
                console.warn('[codex] empty upstream response; detaching bad resume mapping:', {
                  sessionId,
                  cliSessionId: cliId,
                  filePath: !!filePath,
                })
                detachResumeOnDone = true
                detachCodexResumeMapping({ sessionId, cliSessionId: cliId, filePath })
              }
              const sender = session?.event?.sender || event.sender
              const errorText = ev.message || ev.error?.message || ev.payload?.error?.message || ev.error?.type || ev.payload?.error?.type || ''
              appendCodexTurnDiagnostic({
                kind: 'turn.error-event',
                diagnosticId,
                sessionId,
                runId,
                cliSessionId: thread?.id || '',
                pendingItems: pendingItemIds.size,
                detachResumeOnDone: Boolean(detachResumeOnDone),
                terminal: summarizeCodexTerminalEvent(ev),
              })
              safeSend(sender, 'codex-agent-message', {
                sessionId,
                msg: { type: 'system', subtype: 'error', message: { content: [{ type: 'text', text: lt('codex.error', { error: errorText }) }] } },
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
          appendCodexTurnDiagnostic({
            kind: 'turn.catch',
            diagnosticId,
            sessionId,
            runId,
            cliSessionId: thread?.id || '',
            errorName: String(err?.name || ''),
            errorMessage: errMsg,
            canEmitTerminalSignals,
            resultReceived,
          })

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
          logTurnSampleSummary({
            provider: 'codex',
            chatKey: sessionId,
            providerSessionId: thread?.id || cliSessionIds.get(sessionId) || '',
            turnId: runId,
            ...liveSampleCounts,
          })
          // Phase 3: clear current turn for TurnStore
          clearCurrentTurn(sessionId)
          // 停止 metrics 轮询器
          stopCodexMetricsPoller(sessionId, runId)
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
          appendCodexTurnDiagnostic({
            kind: 'turn.cleanup',
            diagnosticId,
            sessionId,
            runId,
            cliSessionId: thread?.id || '',
            resultReceived,
            doneSent,
            doneReason,
            turnTimedOut,
            pendingItems: pendingItemIds.size,
            detachResumeOnDone: Boolean(detachResumeOnDone),
            finalState: finalized,
          })
          writeCodexTurnDiagnosticArtifact(diagnosticId, 'main-cleanup-summary', {
            diagnosticId,
            sessionId,
            runId,
            cliSessionId: thread?.id || '',
            model: model || '',
            baseURL: baseURL || '',
            apiFormat: apiFormat || '',
            reasoningEffort: reasoningEffort || '',
            resultReceived,
            doneSent,
            doneReason,
            turnTimedOut,
            pendingItems: pendingItemIds.size,
            detachResumeOnDone: Boolean(detachResumeOnDone),
            usage: summarizeUsage(sessionState?._liveLastTotals),
            finalState: finalized,
          }, { kind: 'json' })

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
            const sfilePath = resolveCodexSessionFilePath({ sessionId, cliSessionId: thread?.id })
            if (CODEX_DEBUG) console.log('[Codex] agent-done (finally) → filePath:', sfilePath || '(empty)')
            safeSend(event.sender, 'codex-agent-done', buildCodexAgentDonePayload({
              sessionId,
              cliSessionId: thread?.id,
              filePath: sfilePath,
              reason: doneReason,
              detachResume: detachResumeOnDone,
            }))
            // PR 2：双发 agent.run.done
            try {
              const { buildAgentRunDoneEvent } = await getAgentProtocol()
              safeSend(event.sender, 'agent:event', buildAgentRunDoneEvent({
                agent: 'codex',
                chatKey: sessionId,
                runId,
                cliSessionId: thread?.id || '',
                filePath: sfilePath,
              }))
            } catch (_) { /* 新通道发送失败不影响旧通道 */ }
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
      stopCodexMetricsPoller(sessionId)
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
      // PR 2：双发 agent.run.done（abort 路径）
      try {
        const { buildAgentRunDoneEvent } = await getAgentProtocol()
        safeSend(s.event?.sender, 'agent:event', buildAgentRunDoneEvent({
          agent: 'codex',
          chatKey: sessionId,
        }))
      } catch (_) { /* 新通道发送失败不影响旧通道 */ }
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
      if (!cliId) continue
      const record = findSessionRecordByProvider({ agent: 'codex', cliSessionId: cliId })
      if (record?.chatKey === sid && record?.metadata?.resumeAllowed === false) {
        cliSessionIds.delete(sid)
        continue
      }
      cliSessionIds.set(sid, cliId)
    }
  })

  ipcMain.handle('codex-unregister-cli-session', (_, sessionId) => {
    if (sessionId) {
      cliSessionIds.delete(sessionId)
      sessionFingerprints.delete(sessionId)
    }
  })

  ipcMain.handle('codex-list-sessions-by-cwd', (_, cwd) => {
    if (!cwd) return []
    return listSessionsByCwd(cwd)
  })

  ipcMain.handle('codex-delete-session-file', (_, { filePath }) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return false
      const record = findSessionRecordByProvider({ agent: 'codex', filePath })
      fs.unlinkSync(filePath)
      deleteSessionRecordsByProvider({ agent: 'codex', filePath })
      if (record?.chatKey) removeStore(record.chatKey)
      return true
    } catch (e) {
      console.warn('[codex-delete-session-file] failed:', e?.message || e)
      return false
    }
  })

  ipcMain.handle('codex-delete-session', (_, payload = {}) => {
    try {
      const filePath = typeof payload?.filePath === 'string' ? payload.filePath : ''
      const cliSessionId = typeof payload?.cliSessionId === 'string' ? payload.cliSessionId : ''
      const chatKey = typeof payload?.chatKey === 'string' ? payload.chatKey : ''
      let deletedTranscript = false

      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        deletedTranscript = true
      }

      const deletedRecords = deleteSessionRecordsByProvider({
        agent: 'codex',
        filePath,
        cliSessionId,
        chatKey,
      })
      if (chatKey) removeStore(chatKey)

      return {
        ok: deletedTranscript || deletedRecords > 0,
        deletedTranscript,
        deletedRecords,
      }
    } catch (e) {
      console.warn('[codex-delete-session] failed:', e?.message || e)
      return { ok: false, error: e?.message || String(e), deletedTranscript: false, deletedRecords: 0 }
    }
  })

  ipcMain.handle('codex-rename-session', async (_, { sessionId, title }) => {
    if (!sessionId || !title) return { success: false, error: 'missing sessionId or title' }
    try {
      const record = findSessionRecordByProvider({ agent: 'codex', cliSessionId: sessionId })
      if (!record?.chatKey) return { success: false, error: 'registry session not found' }
      const result = setSessionTitle(record.chatKey, title, {
        agent: 'codex',
        cwd: record.cwd,
        cliSessionId: record.provider?.cliSessionId || sessionId,
        filePath: record.provider?.filePath,
        runtime: record.runtime,
      })
      return { success: Boolean(result?.ok), error: result?.error }
    } catch (e) {
      console.error('[codex-rename-session] error:', e)
      return { success: false, error: e?.message || 'unknown' }
    }
  })

  ipcMain.handle('codex-read-session-file-range', (_, { filePath, page = 0, pageSize = 60 } = {}) => {
    const stop = perfStartIpc('codex-read-session-file-range', { page, pageSize })
    if (!filePath || !String(filePath).toLowerCase().endsWith('.jsonl')) {
      stop()
      return { messages: [], hasMore: false }
    }
    const result = readSessionFileRange(filePath, page, pageSize)
    stop({ returned: result?.messages?.length || 0, hasMore: result?.hasMore ? 1 : 0 })
    return result
  })

  // NOTE: Easy-to-misuse bridge. StatusBar current-turn token fields must come from
  // TurnStore snapshots. Session/file aggregate metrics may only supplement session-level
  // fields such as context usage, git info, and speed.
  ipcMain.handle('codex-agent-query-metrics', async (_, { sessionId, cliSessionId, filePath, model, cwd, thinking, thinkingStart } = {}) => {
    const stop = perfStartIpc('codex-agent-query-metrics')
    const result = await queryCodexStatusBarMetrics({ sessionId, cliSessionId, filePath, model, cwd, thinking, thinkingStart })
    stop({ hasMetrics: result ? 1 : 0 })
    return result
  })

  ipcMain.handle('codex-list-slash-commands', async (_, { cwd, sessionId } = {}) => {
    const resolvedCwd = path.resolve(cwd || process.cwd())
    const cacheKey = `${resolvedCwd}::${sessionId || ''}`
    const now = Date.now()
    const cached = codexSlashCommandsCache.get(cacheKey)
    // 默认命令：/new /model 等由前端作为应用本地命令处理，不通过 IPC 返回。
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
      const cliSessionId = sessionId ? (cliSessionIds.get(sessionId) || sessionId) : ''
      if (cliSessionId) {
        try {
          thread = codex.resumeThread(cliSessionId, { workingDirectory: resolvedCwd, skipGitRepoCheck: true })
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
    const catalog = await fetchSkillsMarketplace()
    return { skills: catalog.skills || [], version: catalog.version }
  })

  ipcMain.handle('codex-skills-get-state', async (_, { cwd }) => {
    try {
      const catalog = await fetchSkillsMarketplace()

      const systemDir = path.join(os.homedir(), '.codex', 'skills')
      const projectDir = String(cwd || '').trim() ? path.join(path.resolve(cwd), '.codex', 'skills') : ''
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
    const catalog = await fetchSkillsMarketplace()
    let item = (catalog.skills || []).find(s => s.name === skillName)
    if (!item) {
      const searchCatalog = await fetchSkillsMarketplace({ search: skillName, limit: 30 })
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
        resetCodexSkillsMarketplaceCache()
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

  // ---- Leaf IPC modules (aggregated via codex/index.js, R09 Phase A) ----
  registerCodexLeafIpcs(ipcMain, {
    readRuntimeConfig,
    readSandboxMode,
    CODEX_SANDBOX_MODES,
    findLegacyUserData,
    normalizeCodexReasoningEffort,
    codexConfigDir: CODEX_CONFIG_DIR,
    configTomlFile: CONFIG_TOML_FILE,
    loadCodexSdk,
    findGlobalCodexPath,
    isInstallingCodex,
    setInstallingCodex,
    resetCodexSdkPromise,
    readPanelState,
    lt,
    userDataDir: getMindCraftUserDataDir(),
    readProviders,
    writeProviders,
    readCodexConfigTomlRaw: () => fs.existsSync(CONFIG_TOML_FILE) ? fs.readFileSync(CONFIG_TOML_FILE, 'utf8') : '',
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
        syncPanelStateSessions('codex', normalized)
        const backfill = restorePanelStateFromSessionRegistry('codex', normalized)
        if (backfill?.changed) writePanelState(normalized)
        const repair = repairSessionRegistry()
        if (repair?.changed) {
          const repairedPath = fs.existsSync(PANEL_STATE_FILE) ? PANEL_STATE_FILE : candidate
          return normalizePanelState(JSON.parse(fs.readFileSync(repairedPath, 'utf8')))
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

  // ─── Provider storage (T174: SQLite-authoritative with legacy projection) ──
  const PROVIDERS_FILE = path.join(CODEX_CONFIG_DIR, 'providers.json')
  const { getDb, persistDb } = require('./db')
  const { getProviders, setProviders, migrateFromLegacy, projectToLegacy } = require('./db/providerStorage')

  async function readProviders() {
    try {
      const db = await getDb({ userDataDir: getMindCraftUserDataDir() })
      const legacyReader = () => {
        try {
          if (!fs.existsSync(PROVIDERS_FILE)) return null
          return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'))
        } catch (_) { return null }
      }
      const payload = getProviders(db, 'codex', legacyReader)
      if (payload.providers.length > 0) {
        await persistDb()
      }
      return payload.providers.length > 0 ? payload : null
    } catch (e) {
      console.error('[codex] readProviders error:', e.message)
      // Fallback: read legacy file directly if DB path fails
      try {
        if (!fs.existsSync(PROVIDERS_FILE)) return null
        return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'))
      } catch (_) { return null }
    }
  }

  async function writeProviders(data) {
    try {
      const db = await getDb({ userDataDir: getMindCraftUserDataDir() })
      const result = setProviders(db, 'codex', data || { providers: [], activeIdx: 0 })

      if (result.ok) {
        // Project to legacy providers.json for rollback compatibility
        const legacyWriter = (payload) => {
          if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
          const tmp = `${PROVIDERS_FILE}.${process.pid}.tmp`
          fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
          fs.renameSync(tmp, PROVIDERS_FILE)
        }
        projectToLegacy(db, 'codex', legacyWriter)
        await persistDb()
      }
      return true
    } catch (e) {
      console.error('[codex] writeProviders error:', e.message)
      // Emergency backup to a separate path — do NOT silently overwrite the
      // legacy authority file.  If SQLite is the authority and it failed,
      // returning true would make the UI believe the save succeeded when it
      // didn't, creating a silent fork between DB and legacy.
      try {
        const emergencyPath = path.join(getMindCraftUserDataDir(), 'codex-providers.emergency.json')
        fs.writeFileSync(emergencyPath, JSON.stringify(data, null, 2), 'utf8')
        console.error('[codex] wrote emergency backup to:', emergencyPath)
      } catch (_) { /* best-effort */ }
      return false
    }
  }

  ipcMain.handle('codex-get-providers', async () => readProviders())
  ipcMain.handle('codex-set-providers', async (_, data) => {
    const ok = await writeProviders(data)
    return { ok, error: ok ? null : 'DB write failed' }
  })

  ipcMain.handle('codex-write-auth-json', (_, obj) => {
    try {
      if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
      fs.writeFileSync(AUTH_JSON_FILE, JSON.stringify(obj, null, 2), 'utf8')
      return { ok: true }
    } catch (e) { return { ok: false, message: e.message } }
  })

  // TOML file operations moved to codex/configIpc.js (Batch 5c)
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

  // ---- CodeX CLI executor (shared, Batch 5a) ----
  const execCodexCli = createCliExecutor({ findBinary: findGlobalCodexPath, agentName: "codex" })

  // 模块级缓存：CLI 偶发超时/失败时兜底，避免已安装插件全部显示为"未安装"
  let _codexInstalledPluginsCache = null

  // ─── Skills 管理 (marketplace — shared via Batch 4) ────────────
  let _codexSkillsStateCache = null

  const {
    fetchSkillsMarketplace,
    mapMarketplaceSkill,
    resetCache: resetCodexSkillsMarketplaceCache,
  } = createSkillsMarketplaceClient('codex')


  async function codexReadInstalledPlugins() {
    const installed = []
    try {
      const out = await execCodexCli(['plugin', 'list'], { timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })
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
    const installed = await codexReadInstalledPlugins()
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
      await execCodexCli(['plugin', 'add', pluginId])
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
      await execCodexCli(['plugin', 'remove', pluginId])
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
      await execCodexCli(['plugin', 'add', pluginId])
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
      await execCodexCli(['plugin', 'remove', pluginId])
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
    let usage = null
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
                usage = normalizeCodexUsage(json.response?.usage)
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
        return { fullText, finish_reason: 'aborted', stop_reason: 'aborted', toolCalls: [], usage: null }
      }
      // 超时 → 返回已收到的部分内容
      if (e?.name === 'TimeoutError' || e?.message?.includes('timeout') || e?.message?.includes('The operation was aborted')) {
        return { fullText, finish_reason: 'timeout', stop_reason: 'timeout', toolCalls: [], usage: null }
      }
      throw e
    } finally {
      if (chatId) activeChatAborts.delete(chatId)
    }

    if (!finishReason) finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop'
    return { fullText, finish_reason: finishReason, toolCalls, usage }
  }

  ipcMain.handle('codex-chat', async (event, payload) => runCodexChatStream(event, payload))
  ipcMain.handle('codex-chat-continue', async (event, payload) => runCodexChatStream(event, payload))
  ipcMain.handle('codex-chat-abort', (_event, { chatId }) => {
    const ab = activeChatAborts.get(chatId)
    if (ab) { ab.abort(); activeChatAborts.delete(chatId); return true }
    return false
  })

  // Capture provider storage for system-level import IPC (T163/T174).
  // Legacy sync wrapper: the async readProviders/writeProviders are the authority,
  // but system import/export IPC expects sync deps.  Step 6 will switch those
  // callers to use the repository directly.
  _codexProviderStorage = {
    readProviders: () => {
      // Sync fallback: read legacy file directly; import IPC will be updated in Step 6
      try {
        if (!fs.existsSync(PROVIDERS_FILE)) return null
        return JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'))
      } catch (_) { return null }
    },
    writeProviders: (data) => {
      try {
        if (!fs.existsSync(CODEX_CONFIG_DIR)) fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true })
        const tmp = `${PROVIDERS_FILE}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
        fs.renameSync(tmp, PROVIDERS_FILE)
      } catch (_) {}
    },
    readCodexConfigTomlRaw: () => fs.existsSync(CONFIG_TOML_FILE) ? fs.readFileSync(CONFIG_TOML_FILE, 'utf8') : '',
    userDataDir: getMindCraftUserDataDir(),
  };
}

// Module-level storage accessor for system-level import IPC (T163)
let _codexProviderStorage = null;
function getCodexProviderStorage() { return _codexProviderStorage; }

module.exports = {
  setupCodexSdkHandlers,
  getCodexProviderStorage,
  resetCodexSdkRuntime,
  __test__: {
    buildCodexAgentDonePayload,
    buildCodexMetricsFromTokenCountPayload,
    buildCodexPerTurnTokens,
    buildCodexFinalTurnMetricsFromTerminalUsage,
    extractLatestCodexLiveTurnMetricsFromJsonl,
    codexEventHasErrorType,
    getCodexSessionMetricsByFile,
    getCodexSessionMetrics,
    isEmptyUpstreamCodexFailure,
    normalizeCodexUsage,
    buildCodexSessionFingerprint,
    shouldResumeCodexSession,
    readSessionFileRange,
    listSessionsByCwd,
    resolveCodexSessionFilePath,
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
    extractCodexAgentMessageText,
    extractCodexAssistantHistoryMessageFromJsonlRow,
    normalizeTopLevelCodexStreamEvent,
    mergeCodexTurnSnapshotWithSessionMetrics,
    queryCodexStatusBarMetrics,
    selectCodexTomlProvider,
    setSessionsDirForTest: (dir) => {
      SESSIONS_DIR = dir
      clearCodexJsonlCaches()
    },
    clearCodexJsonlCaches,
  },
}
