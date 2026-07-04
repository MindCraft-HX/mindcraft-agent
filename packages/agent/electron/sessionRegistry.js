const fs = require('fs')
const path = require('path')
const { getMindCraftUserDataDir } = require('./userDataPath')
const { isMeaningfulCodexLocalDraft } = require('../src/components/agentCommon/utils/codexEmptyDraft.cjs')
const { perfStartIpc } = require('./shared/mainPerfProbe')

const REGISTRY_DIR_NAME = 'session-registry'
const SCHEMA_VERSION = 1
const INDEX_SCHEMA_VERSION = 2
const MAX_INSTRUCTION_DESCRIPTION_CHARS = 1000
const MAX_INSTRUCTION_CONTENT_CHARS = 100000
const MAX_INSTRUCTION_ATTACHMENTS = 20
const MAX_INSTRUCTION_ATTACHMENT_CHARS = 4096

// T173: per-chatKey draft 读缓存，写操作时更新/失效。
// cache key = registryRoot + "::" + chatKey，隔离不同 userDataDir。
const _draftCache = new Map()

function _draftCacheKey(chatKey, options = {}) {
  return getSessionRegistryRoot(options) + '::' + normalizeString(chatKey)
}

// T178: per-chatKey instruction 读缓存，写操作时失效。
// 复用 _draftCache 的 key 隔离模式。
const _instructionCache = new Map()

function _instructionCacheKey(chatKey, options = {}) {
  return getSessionRegistryRoot(options) + '::instruction::' + normalizeString(chatKey)
}

function getUserDataDir(options = {}) {
  if (options.userDataDir) return options.userDataDir
  return getMindCraftUserDataDir(options)
}

function getSessionRegistryRoot(options = {}) {
  return path.join(getUserDataDir(options), REGISTRY_DIR_NAME)
}

function getSessionsDir(options = {}) {
  return path.join(getSessionRegistryRoot(options), 'sessions')
}

function getInstructionsDir(options = {}) {
  return path.join(getSessionRegistryRoot(options), 'instructions')
}

function getIndexPath(options = {}) {
  return path.join(getSessionRegistryRoot(options), 'index.json')
}

function encodeRecordName(chatKey) {
  return encodeURIComponent(String(chatKey || '').trim())
}

function getSessionRecordPath(chatKey, options = {}) {
  const safeName = encodeRecordName(chatKey)
  if (!safeName) return ''
  return path.join(getSessionsDir(options), `${safeName}.json`)
}

function getInstructionRecordPath(instructionId, options = {}) {
  const safeName = encodeRecordName(instructionId)
  if (!safeName) return ''
  return path.join(getInstructionsDir(options), `${safeName}.json`)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {
    return fallback
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function copyIfExists(src, dest) {
  if (!src || !fs.existsSync(src)) return false
  ensureDir(path.dirname(dest))
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true })
  } else {
    fs.copyFileSync(src, dest)
  }
  return true
}

function normalizeAgent(agent) {
  const raw = String(agent || '').trim().toLowerCase()
  if (raw === 'claude' || raw === 'claudecode' || raw === 'claude-code') return 'claude'
  if (raw === 'codex' || raw === 'codexcode' || raw === 'code-x') return 'codex'
  return raw || 'unknown'
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeProviderPath(value) {
  return normalizeString(value).replace(/\\/g, '/').toLowerCase()
}

function normalizeTitleSource(value) {
  const raw = normalizeString(value).toLowerCase()
  if (raw === 'user' || raw === 'auto' || raw === 'provider') return raw
  return ''
}

function normalizeRuntimeFields(fields = {}) {
  const normalizedRuntime = {}
  for (const [key, value] of Object.entries(fields)) {
    const normalized = normalizeString(value)
    if (normalized) normalizedRuntime[key] = normalized
  }
  return normalizedRuntime
}

function createRegistryChatKey(agent) {
  const prefix = normalizeAgent(agent) === 'codex' ? 'codex-session' : 'session'
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createUniqueRegistryChatKey(agent, usedKeys = new Set()) {
  let next = createRegistryChatKey(agent)
  while (usedKeys.has(next)) next = createRegistryChatKey(agent)
  usedKeys.add(next)
  return next
}

function inferTitleSource(chat = {}) {
  const explicit = normalizeTitleSource(chat.titleSource)
  if (explicit) return explicit
  if (chat._userRenamed === true) return 'user'
  return normalizeString(chat.name) ? 'provider' : 'auto'
}

function makeProviderKeys(agent, { cliSessionId, filePath } = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const keys = []
  const sid = normalizeString(cliSessionId)
  const normalizedPath = normalizeProviderPath(filePath)
  if (sid) keys.push(`${normalizedAgent}:session:${sid}`)
  if (normalizedPath) keys.push(`${normalizedAgent}:path:${normalizedPath}`)
  return keys
}

function getProviderKeysFromRecord(record = {}) {
  return makeProviderKeys(record.agent, {
    cliSessionId: record.provider?.cliSessionId,
    filePath: record.provider?.filePath,
  })
}

function isPollutedChatKey(record = {}) {
  const chatKey = normalizeString(record.chatKey)
  if (!chatKey) return false
  const provider = record.provider || {}
  if (normalizeString(provider.cliSessionId) && chatKey === normalizeString(provider.cliSessionId)) return true
  const filePath = normalizeString(provider.filePath)
  if (filePath && chatKey === path.basename(filePath, path.extname(filePath))) return true
  return false
}

function chooseTitle(current = {}, incoming = {}) {
  const currentTitle = normalizeString(current.title)
  const incomingTitle = normalizeString(incoming.title)
  const currentSource = normalizeTitleSource(current.titleSource)
  const incomingSource = normalizeTitleSource(incoming.titleSource)
  if (currentTitle && currentSource === 'user' && incomingSource !== 'user') {
    return { title: currentTitle, titleSource: currentSource }
  }
  if (incomingTitle) {
    return { title: incomingTitle, titleSource: incomingSource || 'provider' }
  }
  return {
    title: currentTitle,
    titleSource: currentSource || (currentTitle ? 'provider' : 'auto'),
  }
}

function stableJson(value) {
  if (value === undefined) return 'null'
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => stableJson(item)).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function hasMeaningfulRecordChange(current = {}, next = {}) {
  const fields = ['chatKey', 'agent', 'projectId', 'cwd', 'title', 'titleSource', 'description']
  for (const field of fields) {
    if (normalizeString(current[field]) !== normalizeString(next[field])) return true
  }
  for (const field of ['provider', 'runtime', 'instruction', 'metadata', 'draft']) {
    if (stableJson(current[field] || {}) !== stableJson(next[field] || {})) return true
  }
  return false
}

function normalizeRuntime(agent, chat = {}) {
  if (normalizeAgent(agent) === 'codex') {
    return {
      model: normalizeString(chat.model),
      effort: null,
      reasoningEffort: normalizeString(chat.reasoningEffort),
    }
  }
  return {
    model: normalizeString(chat.model),
    effort: normalizeString(chat.effort),
    modelTier: normalizeString(chat.modelTier),
    reasoningEffort: null,
  }
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const time = new Date(value).getTime()
    if (Number.isFinite(time)) return time
  }
  return 0
}

function buildSessionRecordFromChat(agent, project = {}, chat = {}) {
  const chatKey = normalizeString(chat.sessionId) || normalizeString(chat.id)
  if (!chatKey) return null
  if (normalizeAgent(agent) === 'codex' && !isMeaningfulCodexLocalDraft(chat, chat.messages)) return null
  const createdAt = normalizeTimestamp(chat.createdAt)
  const updatedAt = normalizeTimestamp(chat.updatedAt) || createdAt || Date.now()
  const metadata = chat.metadata && typeof chat.metadata === 'object' ? { ...chat.metadata } : {}
  if (chat._resumeAllowed === false) metadata.resumeAllowed = false
  return {
    schemaVersion: SCHEMA_VERSION,
    chatKey,
    agent: normalizeAgent(agent),
    projectId: normalizeString(project.id),
    cwd: normalizeString(project.cwd),
    title: normalizeString(chat.name),
    titleSource: inferTitleSource(chat),
    description: normalizeString(chat.description),
    metadata,
    provider: {
      cliSessionId: normalizeString(chat.cliSessionId),
      filePath: normalizeString(chat.filePath),
    },
    runtime: normalizeRuntime(agent, chat),
    // Only attach instruction when the upstream chat carries real instruction data.
    // Avoids overwriting an existing enabled instruction with an empty default
    // during syncPanelStateSessions / buildSessionRecordFromChat.
    ...(chat.instruction?.enabled || (chat.instruction?.content && String(chat.instruction.content).trim()) || (Array.isArray(chat.instruction?.attachments) && chat.instruction.attachments.length > 0)
      ? {
          instruction: {
            enabled: Boolean(chat.instruction.enabled),
            instructionId: normalizeString(chat.instruction.instructionId),
            title: normalizeString(chat.instruction.title),
            description: normalizeString(chat.instruction.description),
            content: typeof chat.instruction.content === 'string' ? chat.instruction.content : '',
            attachments: Array.isArray(chat.instruction.attachments) ? chat.instruction.attachments.filter(Boolean) : [],
          },
        }
      : {}),
    createdAt,
    updatedAt,
  }
}

function normalizeInstructionRecord(data = {}) {
  const id = normalizeString(data.id)
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: normalizeString(data.title),
    description: normalizeString(data.description),
    content: typeof data.content === 'string' ? data.content : '',
    attachments: Array.isArray(data.attachments) ? data.attachments.filter(Boolean) : [],
    createdAt: normalizeTimestamp(data.createdAt) || Date.now(),
    updatedAt: normalizeTimestamp(data.updatedAt) || Date.now(),
  }
}

function normalizeInstructionAttachments(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (!item) continue
    if (out.length >= MAX_INSTRUCTION_ATTACHMENTS) {
      const error = new Error('too many attachments')
      error.code = 'attachments_too_many'
      throw error
    }
    const serialized = typeof item === 'string' ? item : JSON.stringify(item)
    if (serialized.length > MAX_INSTRUCTION_ATTACHMENT_CHARS) {
      const error = new Error('attachment too large')
      error.code = 'attachment_too_large'
      throw error
    }
    out.push(item)
  }
  return out
}

function normalizeSessionInstructionInput(data = {}) {
  const description = normalizeString(data.description) || normalizeString(data.summary) || normalizeString(data.title)
  const content = typeof data.content === 'string' ? data.content : ''
  if (description.length > MAX_INSTRUCTION_DESCRIPTION_CHARS) {
    return { ok: false, error: 'description_too_large' }
  }
  if (content.length > MAX_INSTRUCTION_CONTENT_CHARS) {
    return { ok: false, error: 'content_too_large' }
  }
  try {
    return {
      ok: true,
      value: {
        enabled: Boolean(data.enabled),
        description,
        content,
        attachments: normalizeInstructionAttachments(data.attachments),
      },
    }
  } catch (err) {
    return { ok: false, error: err?.code || 'invalid_attachments' }
  }
}

function normalizeSessionTitleContext(data = {}) {
  const runtime = data.runtime && typeof data.runtime === 'object' ? data.runtime : {}
  const normalizedRuntime = normalizeRuntimeFields({
    model: runtime.model || data.model,
    effort: runtime.effort || data.effort,
    modelTier: runtime.modelTier || data.modelTier,
    reasoningEffort: runtime.reasoningEffort || data.reasoningEffort,
  })
  return {
    agent: normalizeAgent(data.agent),
    projectId: normalizeString(data.projectId),
    cwd: normalizeString(data.cwd),
    cliSessionId: normalizeString(data.cliSessionId || data.providerSessionId),
    filePath: normalizeString(data.filePath),
    runtime: normalizedRuntime,
  }
}

function normalizeSessionDraftInput(data = {}) {
  const text = typeof data === 'string'
    ? data
    : (typeof data?.text === 'string' ? data.text : '')
  return {
    text,
    updatedAt: normalizeTimestamp(data?.updatedAt) || Date.now(),
  }
}

function readIndex(options = {}) {
  const index = readJson(getIndexPath(options), { schemaVersion: INDEX_SCHEMA_VERSION, sessions: {}, providers: {} })
  if (!index || typeof index !== 'object') return { schemaVersion: INDEX_SCHEMA_VERSION, sessions: {}, providers: {} }
  if (!index.sessions || typeof index.sessions !== 'object') index.sessions = {}
  if (!index.providers || typeof index.providers !== 'object') index.providers = {}
  index.schemaVersion = Number(index.schemaVersion) || SCHEMA_VERSION
  return index
}

function writeIndex(index, options = {}) {
  writeJsonAtomic(getIndexPath(options), {
    schemaVersion: INDEX_SCHEMA_VERSION,
    sessions: index?.sessions && typeof index.sessions === 'object' ? index.sessions : {},
    providers: index?.providers && typeof index.providers === 'object' ? index.providers : {},
  })
}

function removeIndexReferences(index, chatKey) {
  if (!index || !chatKey) return
  if (index.sessions?.[chatKey]) delete index.sessions[chatKey]
  for (const [providerKey, mappedChatKey] of Object.entries(index.providers || {})) {
    if (mappedChatKey === chatKey) delete index.providers[providerKey]
  }
}

function rebuildIndexFromRecords(records = [], options = {}) {
  const index = { schemaVersion: INDEX_SCHEMA_VERSION, sessions: {}, providers: {} }
  for (const record of records) {
    if (!record?.chatKey) continue
    const filePath = getSessionRecordPath(record.chatKey, options)
    index.sessions[record.chatKey] = {
      agent: record.agent,
      projectId: record.projectId || '',
      cwd: record.cwd || '',
      title: record.title || '',
      titleSource: record.titleSource || '',
      description: record.description || '',
      cliSessionId: record.provider?.cliSessionId || '',
      filePath: record.provider?.filePath || '',
      updatedAt: record.updatedAt || 0,
      path: path.relative(getSessionRegistryRoot(options), filePath).split(path.sep).join('/'),
    }
    for (const key of getProviderKeysFromRecord(record)) {
      if (!index.providers[key]) index.providers[key] = record.chatKey
    }
  }
  writeIndex(index, options)
  return index
}

function findIndexedRecordForProvider(record = {}, index = {}, options = {}) {
  for (const key of getProviderKeysFromRecord(record)) {
    const chatKey = index.providers?.[key]
    if (!chatKey || chatKey === record.chatKey) continue
    const existing = readJson(getSessionRecordPath(chatKey, options), null)
    if (existing?.chatKey) return existing
  }
  return null
}

function findProviderOwnerRecords(record = {}, index = {}, options = {}) {
  const providerKeys = new Set(getProviderKeysFromRecord(record))
  if (!providerKeys.size) return []

  const normalizedAgent = normalizeAgent(record.agent)
  const provider = record.provider || {}
  const byChatKey = new Map()
  const addCandidate = (candidate) => {
    if (!candidate?.chatKey) return
    if (normalizedAgent !== 'unknown' && normalizeAgent(candidate.agent) !== normalizedAgent) return
    byChatKey.set(candidate.chatKey, candidate)
  }

  for (const key of providerKeys) {
    const chatKey = index.providers?.[key]
    if (chatKey) addCandidate(readJson(getSessionRecordPath(chatKey, options), null))
  }

  for (const candidate of listSessionRecords(options)) {
    if (normalizedAgent !== 'unknown' && normalizeAgent(candidate.agent) !== normalizedAgent) continue
    const candidateKeys = new Set(getProviderKeysFromRecord(candidate))
    const sameProvider = Array.from(providerKeys).some(key => candidateKeys.has(key))
    const detachedProvider = isDetachedProviderBinding({
      cliSessionId: provider.cliSessionId,
      filePath: provider.filePath,
    }, candidate.metadata?.detachedProviderBinding)
    if (sameProvider || detachedProvider) addCandidate(candidate)
  }

  return Array.from(byChatKey.values())
}

function chooseProviderOwnerRecord(record = {}, index = {}, options = {}) {
  const candidates = findProviderOwnerRecords(record, index, options)
  if (!candidates.length) return null
  return candidates.slice().sort((a, b) => scoreRepairCandidate(b) - scoreRepairCandidate(a))[0] || null
}

function mergeProviderBinding(existingProvider = {}, incomingProvider = {}, source = '') {
  const existingCliSessionId = normalizeString(existingProvider.cliSessionId)
  const existingFilePath = normalizeString(existingProvider.filePath)
  const incomingCliSessionId = normalizeString(incomingProvider.cliSessionId)
  const incomingFilePath = normalizeString(incomingProvider.filePath)

  if (source === 'panel') {
    return {
      cliSessionId: existingCliSessionId || incomingCliSessionId,
      filePath: existingFilePath || incomingFilePath,
    }
  }

  return {
    cliSessionId: incomingCliSessionId || existingCliSessionId,
    filePath: incomingFilePath || existingFilePath,
  }
}

/**
 * Merge runtime fields with source-aware strategy.
 *
 * Panel source (syncPanelStateSessions) is untrusted for runtime — it can only
 * fill in fields that don't yet have a value. Non-panel sources (scan,
 * upsertRuntimeByProvider, direct upsert) are authoritative — incoming wins.
 *
 * Uses the same `existing || incoming` pattern as mergeProviderBinding
 * to handle empty strings correctly (normalizeRuntime produces '' for unset).
 */
function mergeRuntime(source, existingRuntime, effectiveRuntime) {
  const e = existingRuntime || {}
  const n = effectiveRuntime || {}

  if (source === 'panel') {
    return {
      model: e.model || n.model || '',
      effort: e.effort || n.effort || null,
      modelTier: e.modelTier || n.modelTier || '',
      reasoningEffort: e.reasoningEffort || n.reasoningEffort || null,
    }
  }

  return {
    model: n.model || e.model || '',
    effort: n.effort || e.effort || null,
    modelTier: n.modelTier || e.modelTier || '',
    reasoningEffort: n.reasoningEffort || e.reasoningEffort || null,
  }
}

function upsertSessionRecord(record, options = {}) {
  if (!record?.chatKey) return false
  const index = readIndex(options)
  const ownerRecords = findProviderOwnerRecords(record, index, options)
  const canonicalRecord = chooseProviderOwnerRecord(record, index, options) || findIndexedRecordForProvider(record, index, options)
  const effectiveRecord = canonicalRecord
    ? {
        ...canonicalRecord,
        ...record,
        chatKey: canonicalRecord.chatKey,
        provider: {
          ...(canonicalRecord.provider || {}),
          ...(record.provider || {}),
        },
        runtime: {
          ...(canonicalRecord.runtime || {}),
          ...(record.runtime || {}),
        },
        metadata: {
          ...(canonicalRecord.metadata || {}),
          ...(record.metadata || {}),
        },
      }
    : record
  const filePath = getSessionRecordPath(effectiveRecord.chatKey, options)
  if (!filePath) return false
  const existing = readJson(filePath, {})
  const incomingProvider = mergeProviderBinding(existing?.provider || {}, effectiveRecord.provider || {}, options.providerBindingSource)
  const titleState = chooseTitle(existing, effectiveRecord)
  const incomingInst = effectiveRecord.instruction || {}
  const hasRealInstruction = incomingInst.enabled || String(incomingInst.content || '').trim()
  const candidate = {
    ...existing,
    ...effectiveRecord,
    title: titleState.title,
    titleSource: titleState.titleSource,
    provider: incomingProvider,
    runtime: mergeRuntime(options.providerBindingSource, existing?.runtime, effectiveRecord.runtime),
    metadata: {
      ...(existing?.metadata || {}),
      ...(effectiveRecord.metadata || {}),
    },
    // Always cascade enabled flag, even when incoming has no content.
    // Without this, toggling instruction OFF with empty content would be
    // silently discarded because hasRealInstruction === false.
    // Only cascade when instruction was explicitly provided (effectiveRecord.instruction
    // exists); otherwise (e.g. syncPanelStateSessions with no instruction data),
    // preserve the existing enabled state.
    instruction: hasRealInstruction
      ? { ...(existing?.instruction || {}), ...incomingInst }
      : {
          ...(existing?.instruction || { enabled: false, instructionId: '', content: '', attachments: [] }),
          ...(effectiveRecord.instruction ? { enabled: incomingInst.enabled } : {}),
        },
    schemaVersion: SCHEMA_VERSION,
  }
  const existingUpdatedAt = normalizeTimestamp(existing?.updatedAt)
  const incomingUpdatedAt = normalizeTimestamp(effectiveRecord.updatedAt)
  const contentChanged = hasMeaningfulRecordChange(existing, candidate)
  const next = {
    ...candidate,
    updatedAt: contentChanged
      ? Math.max(Date.now(), existingUpdatedAt + 1, incomingUpdatedAt)
      : (Math.max(existingUpdatedAt, incomingUpdatedAt) || Date.now()),
  }

  // T179-P1: 提前计算 orphanChatKeys，用于 no-op 判断
  const orphanChatKeys = new Set(ownerRecords
    .map(owner => normalizeString(owner.chatKey))
    .filter(chatKey => chatKey && chatKey !== next.chatKey))
  if (record.chatKey && record.chatKey !== next.chatKey) orphanChatKeys.add(record.chatKey)

  // T179-P1: no-op 快速返回 — 内容无变化且无需处理 orphan 时跳过文件写入。
  // 额外校验 index 摘要一致性，避免 index 损坏或过期时跳过修复。
  if (!contentChanged && orphanChatKeys.size === 0 && index.sessions[next.chatKey]) {
    const idx = index.sessions[next.chatKey]
    const idxConsistent =
      normalizeString(idx.title) === normalizeString(next.title) &&
      normalizeString(idx.filePath) === normalizeString(next.provider?.filePath) &&
      normalizeString(idx.cliSessionId) === normalizeString(next.provider?.cliSessionId) &&
      idx.updatedAt === next.updatedAt &&
      normalizeString(idx.path) === normalizeString(path.relative(getSessionRegistryRoot(options), filePath).split(path.sep).join('/'))
    const providerKeysOk = getProviderKeysFromRecord(next).every(k => index.providers[k] === next.chatKey)
    if (idxConsistent && providerKeysOk) {
      return true
    }
  }

  writeJsonAtomic(filePath, next)

  removeIndexReferences(index, next.chatKey)
  for (const orphanChatKey of orphanChatKeys) {
    removeIndexReferences(index, orphanChatKey)
    // 合并到 canonical 记录后，删除旧的孤立会话文件，
    // 避免 listSessionRecords() 扫描出重复记录。
    try {
      const orphanPath = getSessionRecordPath(orphanChatKey, options)
      if (orphanPath && fs.existsSync(orphanPath)) fs.unlinkSync(orphanPath)
    } catch (_) {}
  }
  index.sessions[next.chatKey] = {
    agent: next.agent,
    projectId: next.projectId,
    cwd: next.cwd,
    title: next.title,
    titleSource: next.titleSource || '',
    description: next.description || '',
    cliSessionId: next.provider?.cliSessionId || '',
    filePath: next.provider?.filePath || '',
    updatedAt: next.updatedAt,
    path: path.relative(getSessionRegistryRoot(options), filePath).split(path.sep).join('/'),
  }
  for (const key of getProviderKeysFromRecord(next)) {
    index.providers[key] = next.chatKey
  }
  writeIndex(index, options)
  // T178: 中心写入口 — 清 instruction cache，避免过期
  _instructionCache.delete(_instructionCacheKey(next.chatKey, options))
  for (const orphanChatKey of orphanChatKeys) {
    _instructionCache.delete(_instructionCacheKey(orphanChatKey, options))
  }
  return true
}

function isDetachedProviderBinding(provider = {}, detached = null) {
  if (!detached || typeof detached !== 'object') return false
  const providerCliId = normalizeString(provider.cliSessionId)
  const providerFilePath = normalizeString(provider.filePath)
  const detachedCliId = normalizeString(detached.cliSessionId)
  const detachedFilePath = normalizeString(detached.filePath)
  return Boolean(
    (providerCliId && detachedCliId && providerCliId === detachedCliId)
    || (providerFilePath && detachedFilePath && providerFilePath === detachedFilePath)
  )
}

function findSessionRecordByDetachedProvider({ agent, filePath, cliSessionId } = {}, options = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const normalizedFilePath = normalizeString(filePath)
  const normalizedCliSessionId = normalizeString(cliSessionId)
  if (!normalizedFilePath && !normalizedCliSessionId) return null

  for (const record of listSessionRecords(options)) {
    if (normalizedAgent !== 'unknown' && record.agent !== normalizedAgent) continue
    if (isDetachedProviderBinding({
      cliSessionId: normalizedCliSessionId,
      filePath: normalizedFilePath,
    }, record.metadata?.detachedProviderBinding)) {
      return record
    }
  }
  return null
}

function listSessionRecords(options = {}) {
  const dir = getSessionsDir(options)
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (_) {
    return []
  }
  const records = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const record = readJson(path.join(dir, entry.name), null)
    if (record?.chatKey) records.push(record)
  }
  return records
}

function findSessionRecordByProvider({ agent, filePath, cliSessionId } = {}, options = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const normalizedFilePath = normalizeString(filePath)
  const normalizedCliSessionId = normalizeString(cliSessionId)
  if (!normalizedFilePath && !normalizedCliSessionId) return null

  const index = readIndex(options)
  for (const key of makeProviderKeys(normalizedAgent, { cliSessionId: normalizedCliSessionId, filePath: normalizedFilePath })) {
    const chatKey = index.providers?.[key]
    if (chatKey) {
      const record = readJson(getSessionRecordPath(chatKey, options), null)
      if (record?.chatKey) return record
    }
  }

  for (const record of listSessionRecords(options)) {
    if (normalizedAgent !== 'unknown' && record.agent !== normalizedAgent) continue
    const provider = record.provider || {}
    const sameFile = normalizedFilePath && normalizeString(provider.filePath) === normalizedFilePath
    const sameCliSession = normalizedCliSessionId && normalizeString(provider.cliSessionId) === normalizedCliSessionId
    if (sameFile || sameCliSession) return record
  }
  return findSessionRecordByDetachedProvider({
    agent: normalizedAgent,
    filePath: normalizedFilePath,
    cliSessionId: normalizedCliSessionId,
  }, options)
}

function resolveSessionByProvider(args = {}, options = {}) {
  return findSessionRecordByProvider(args, options)
}

function upsertRuntimeByProvider({ agent, filePath, cliSessionId, chatKey, cwd, runtime } = {}, options = {}) {
  const existing = findSessionRecordByProvider({ agent, filePath, cliSessionId }, options)
  const resolvedChatKey = existing?.chatKey || normalizeString(chatKey)
  if (!resolvedChatKey) return false
  return upsertSessionRecord({
    ...(existing || {}),
    chatKey: resolvedChatKey,
    agent: normalizeAgent(agent),
    cwd: normalizeString(cwd) || existing?.cwd || '',
    provider: {
      ...(existing?.provider || {}),
      cliSessionId: normalizeString(cliSessionId) || existing?.provider?.cliSessionId || '',
      filePath: normalizeString(filePath) || existing?.provider?.filePath || '',
    },
    runtime: {
      ...(existing?.runtime || {}),
      ...(runtime || {}),
    },
    metadata: existing?.metadata || {},
    updatedAt: Date.now(),
  }, options)
}

function deleteSessionRecord(chatKey, options = {}) {
  const filePath = getSessionRecordPath(chatKey, options)
  if (!filePath) return false
  let deleted = false
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      deleted = true
    }
  } catch (_) {}

  const index = readIndex(options)
  const before = JSON.stringify(index)
  removeIndexReferences(index, chatKey)
  if (JSON.stringify(index) !== before) deleted = true
  if (deleted) writeIndex(index, options)
  _draftCache.delete(_draftCacheKey(chatKey, options))
  _instructionCache.delete(_instructionCacheKey(chatKey, options))
  return deleted
}

function readInstructionRecord(instructionId, options = {}) {
  const filePath = getInstructionRecordPath(instructionId, options)
  if (!filePath) return null
  const record = readJson(filePath, null)
  if (!record?.id) return null
  return normalizeInstructionRecord(record)
}

function getSessionInstruction(chatKey, options = {}) {
  const cacheKey = _instructionCacheKey(chatKey, options)
  const cached = _instructionCache.get(cacheKey)
  if (cached) {
    perfStartIpc('sessionRegistry.getInstruction')({ cacheHit: 1 })
    return { ...cached }
  }
  const stop = perfStartIpc('sessionRegistry.getInstruction')
  const tRecord = Date.now()
  const recordPath = getSessionRecordPath(chatKey, options)
  const session = readJson(recordPath, null)
  const recordReadMs = Date.now() - tRecord
  const instructionId = normalizeString(session?.instruction?.instructionId)
  const tInstr = Date.now()
  const legacyInstruction = instructionId ? readInstructionRecord(instructionId, options) : null
  const instructionReadMs = Date.now() - tInstr
  const sessionInstruction = session?.instruction || {}
  const legacyDescription = normalizeString(sessionInstruction.description)
    || normalizeString(sessionInstruction.title)
    || legacyInstruction?.title
    || legacyInstruction?.description
    || ''
  const sessionContent = typeof sessionInstruction.content === 'string' ? sessionInstruction.content : ''
  const sessionAttachments = Array.isArray(sessionInstruction.attachments)
    ? sessionInstruction.attachments.filter(Boolean)
    : null
  const attachments = sessionAttachments && (sessionAttachments.length || !instructionId)
    ? sessionAttachments
    : (legacyInstruction?.attachments || [])
  const result = {
    enabled: Boolean(sessionInstruction.enabled),
    instructionId,
    description: normalizeString(session?.description) || legacyDescription,
    content: sessionContent || legacyInstruction?.content || '',
    attachments,
  }
  _instructionCache.set(cacheKey, { ...result })
  stop({ hasInstructionId: instructionId ? 1 : 0, recordReadMs, instructionReadMs, cacheHit: 0 })
  return result
}

function getSessionDraft(chatKey, options = {}) {
  const resolvedChatKey = normalizeString(chatKey)
  if (!resolvedChatKey) return { text: '', updatedAt: 0 }
  const cacheKey = _draftCacheKey(chatKey, options)
  const cached = _draftCache.get(cacheKey)
  if (cached) {
    perfStartIpc('sessionRegistry.getDraft')({ cacheHit: 1 })
    return { text: cached.text, updatedAt: cached.updatedAt }
  }
  const stop = perfStartIpc('sessionRegistry.getDraft')
  const session = readJson(getSessionRecordPath(resolvedChatKey, options), null)
  const draft = session?.draft && typeof session.draft === 'object' ? session.draft : {}
  const result = {
    text: typeof draft.text === 'string' ? draft.text : '',
    updatedAt: normalizeTimestamp(draft.updatedAt),
  }
  _draftCache.set(cacheKey, { text: result.text, updatedAt: result.updatedAt })
  stop({ cacheHit: 0 })
  return result
}

function setSessionDraft(chatKey, data = {}, options = {}) {
  const resolvedChatKey = normalizeString(chatKey)
  if (!resolvedChatKey) return { ok: false, error: 'missing chatKey' }
  const draft = normalizeSessionDraftInput(data)
  const now = Date.now()
  const existing = readJson(getSessionRecordPath(resolvedChatKey, options), {})
  const record = {
    ...(existing || {}),
    schemaVersion: SCHEMA_VERSION,
    chatKey: resolvedChatKey,
    agent: normalizeAgent(existing?.agent),
    provider: existing?.provider || {},
    runtime: existing?.runtime || {},
    metadata: existing?.metadata || {},
    draft,
    createdAt: existing?.createdAt || now,
    updatedAt: Math.max(now, normalizeTimestamp(existing?.updatedAt) + 1),
  }
  writeJsonAtomic(getSessionRecordPath(resolvedChatKey, options), record)
  _draftCache.set(_draftCacheKey(chatKey, options), { text: draft.text, updatedAt: draft.updatedAt })
  return { ok: true, draft: getSessionDraft(resolvedChatKey, options) }
}

function clearSessionDraft(chatKey, options = {}) {
  const resolvedChatKey = normalizeString(chatKey)
  if (!resolvedChatKey) return { ok: false, error: 'missing chatKey' }
  const existing = readJson(getSessionRecordPath(resolvedChatKey, options), null)
  if (!existing?.chatKey) {
    _draftCache.set(_draftCacheKey(chatKey, options), { text: '', updatedAt: 0 })
    return { ok: true, draft: { text: '', updatedAt: 0 } }
  }
  const now = Date.now()
  const record = {
    ...existing,
    draft: { text: '', updatedAt: now },
    updatedAt: Math.max(now, normalizeTimestamp(existing.updatedAt) + 1),
  }
  writeJsonAtomic(getSessionRecordPath(resolvedChatKey, options), record)
  _draftCache.set(_draftCacheKey(chatKey, options), { text: '', updatedAt: now })
  return { ok: true, draft: getSessionDraft(resolvedChatKey, options) }
}

function setSessionInstruction(chatKey, data = {}, options = {}) {
  const resolvedChatKey = normalizeString(chatKey)
  if (!resolvedChatKey) return { ok: false, error: 'missing chatKey' }
  const normalizedInput = normalizeSessionInstructionInput(data)
  if (!normalizedInput.ok) return normalizedInput
  const instructionInput = normalizedInput.value
  const now = Date.now()
  const existing = readJson(getSessionRecordPath(resolvedChatKey, options), {})
  const sessionRecord = {
    ...(existing || {}),
    schemaVersion: SCHEMA_VERSION,
    chatKey: resolvedChatKey,
    agent: normalizeAgent(existing?.agent),
    description: instructionInput.description,
    provider: existing?.provider || {},
    runtime: existing?.runtime || {},
    metadata: existing?.metadata || {},
    instruction: {
      enabled: instructionInput.enabled,
      instructionId: '',
      content: instructionInput.content,
      attachments: instructionInput.attachments,
      updatedAt: now,
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  upsertSessionRecord(sessionRecord, options)
  _instructionCache.delete(_instructionCacheKey(resolvedChatKey, options))
  return { ok: true, instruction: getSessionInstruction(resolvedChatKey, options) }
}

function setSessionTitle(chatKey, title, options = {}) {
  const resolvedChatKey = normalizeString(chatKey)
  const nextTitle = normalizeString(title)
  if (!resolvedChatKey) return { ok: false, error: 'missing chatKey' }
  if (!nextTitle) return { ok: false, error: 'missing title' }
  const context = normalizeSessionTitleContext(options)
  const existing = readJson(getSessionRecordPath(resolvedChatKey, options), {})
  const now = Date.now()
  const record = {
    ...(existing || {}),
    schemaVersion: SCHEMA_VERSION,
    chatKey: resolvedChatKey,
    agent: context.agent !== 'unknown' ? context.agent : normalizeAgent(existing?.agent),
    projectId: context.projectId || existing?.projectId || '',
    cwd: context.cwd || existing?.cwd || '',
    title: nextTitle,
    titleSource: 'user',
    provider: {
      ...(existing?.provider || {}),
      cliSessionId: context.cliSessionId || existing?.provider?.cliSessionId || '',
      filePath: context.filePath || existing?.provider?.filePath || '',
    },
    runtime: {
      ...(existing?.runtime || {}),
      ...context.runtime,
    },
    metadata: existing?.metadata || {},
    instruction: existing?.instruction || { enabled: false, instructionId: '', content: '', attachments: [] },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  upsertSessionRecord(record, options)
  _instructionCache.delete(_instructionCacheKey(resolvedChatKey, options))
  return { ok: true, record: readJson(getSessionRecordPath(resolvedChatKey, options), null) }
}

function buildProviderScanRecord(agent, scanSummary = {}, project = {}, options = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const providerSessionId = normalizeString(
    scanSummary.providerSessionId
    || scanSummary.cliSessionId
    || scanSummary.id
  )
  const detachedRecord = findSessionRecordByDetachedProvider({
    agent: normalizedAgent,
    cliSessionId: providerSessionId,
    filePath: scanSummary.filePath,
  }, options)
  const providerTitle = normalizeString(scanSummary.providerTitle || scanSummary.title || scanSummary.name)
  const resolved = resolveSessionByProvider({
    agent: normalizedAgent,
    cliSessionId: providerSessionId,
    filePath: scanSummary.filePath,
  }, options)
  const detachedRecordProvider = detachedRecord?.provider || {}
  const detachedRecordHasProvider = Boolean(
    normalizeString(detachedRecordProvider.cliSessionId)
    || normalizeString(detachedRecordProvider.filePath)
  )
  const detachedMatchesCurrentProvider = Boolean(
    detachedRecord
    && (
      !detachedRecordHasProvider
      || isDetachedProviderBinding({
        cliSessionId: detachedRecordProvider.cliSessionId,
        filePath: detachedRecordProvider.filePath,
      }, detachedRecord.metadata?.detachedProviderBinding)
    )
  )
  const existing = resolved || (detachedMatchesCurrentProvider ? detachedRecord : null)
  const chatKey = existing?.chatKey || normalizeString(scanSummary.chatKey) || createRegistryChatKey(normalizedAgent)
  if (!chatKey) return null

  const scanRuntime = scanSummary.runtime && typeof scanSummary.runtime === 'object'
    ? scanSummary.runtime
    : scanSummary
  const runtime = normalizeRuntimeFields({
    model: scanRuntime.model,
    effort: scanRuntime.effort,
    modelTier: scanRuntime.modelTier,
    reasoningEffort: scanRuntime.reasoningEffort,
  })
  const titleState = chooseTitle(existing || {}, {
    title: existing?.title || providerTitle,
    titleSource: existing?.titleSource || (providerTitle ? 'provider' : 'auto'),
  })
  return {
    ...(existing || {}),
    schemaVersion: SCHEMA_VERSION,
    chatKey,
    agent: normalizedAgent,
    projectId: normalizeString(project.id) || existing?.projectId || '',
    cwd: normalizeString(project.cwd) || normalizeString(scanSummary.cwd) || existing?.cwd || '',
    title: titleState.title,
    titleSource: titleState.titleSource,
    description: existing?.description || '',
    provider: {
      ...(existing?.provider || {}),
      cliSessionId: detachedRecord && !detachedMatchesCurrentProvider
        ? normalizeString(existing?.provider?.cliSessionId)
        : (providerSessionId || existing?.provider?.cliSessionId || ''),
      filePath: detachedRecord && !detachedMatchesCurrentProvider
        ? normalizeString(existing?.provider?.filePath)
        : (normalizeString(scanSummary.filePath) || existing?.provider?.filePath || ''),
    },
    runtime: {
      ...(existing?.runtime || {}),
      ...runtime,
    },
    metadata: {
      ...(existing?.metadata || {}),
      ...(detachedRecord ? { resumeAllowed: false } : {}),
    },
    instruction: existing?.instruction || { enabled: false, instructionId: '', content: '', attachments: [] },
    createdAt: normalizeTimestamp(scanSummary.createdAt) || existing?.createdAt || Date.now(),
    updatedAt: normalizeTimestamp(scanSummary.updatedAt) || existing?.updatedAt || Date.now(),
  }
}

function isProviderScanDetached({ agent, cliSessionId, filePath } = {}, options = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const normalizedCliSessionId = normalizeString(cliSessionId)
  const normalizedFilePath = normalizeString(filePath)
  if (!normalizedCliSessionId && !normalizedFilePath) return false
  for (const record of listSessionRecords(options)) {
    if (normalizedAgent !== 'unknown' && record.agent !== normalizedAgent) continue
    if (isDetachedProviderBinding({
      cliSessionId: normalizedCliSessionId,
      filePath: normalizedFilePath,
    }, record.metadata?.detachedProviderBinding)) {
      return true
    }
  }
  return false
}

function upsertSessionFromProviderScan(agent, scanSummary = {}, project = {}, options = {}) {
  const stop = perfStartIpc('registry-scan-upsert')
  const record = buildProviderScanRecord(agent, scanSummary, project, options)
  if (!record) { stop(); return null }
  try {
    if (!upsertSessionRecord(record, options)) { stop(); return null }
    const result = readJson(getSessionRecordPath(record.chatKey, options), null)
    stop()
    return result
  } catch (_) {
    stop()
    return null
  }
}

// T179-P1: 只读 lookup — 从 registry 中查找与 provider scan 匹配的已有 record。
// 复用 buildProviderScanRecord 的解析逻辑，但不构造完整 record，不写文件。
function findRegistryRecordForProviderScan(agent, scanSummary = {}, project = {}, options = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const providerSessionId = normalizeString(
    scanSummary.providerSessionId || scanSummary.cliSessionId || scanSummary.id
  )
  const detachedRecord = findSessionRecordByDetachedProvider({
    agent: normalizedAgent,
    cliSessionId: providerSessionId,
    filePath: scanSummary.filePath,
  }, options)
  const resolved = resolveSessionByProvider({
    agent: normalizedAgent,
    cliSessionId: providerSessionId,
    filePath: scanSummary.filePath,
  }, options)
  const detachedRecordProvider = detachedRecord?.provider || {}
  const detachedRecordHasProvider = Boolean(
    normalizeString(detachedRecordProvider.cliSessionId)
    || normalizeString(detachedRecordProvider.filePath)
  )
  const detachedMatchesCurrentProvider = Boolean(
    detachedRecord
    && (
      !detachedRecordHasProvider
      || isDetachedProviderBinding({
        cliSessionId: detachedRecordProvider.cliSessionId,
        filePath: detachedRecordProvider.filePath,
      }, detachedRecord.metadata?.detachedProviderBinding)
    )
  )
  const existing = resolved || (detachedMatchesCurrentProvider ? detachedRecord : null)
  if (!existing) return null
  const chatKey = existing.chatKey
  if (!chatKey) return null
  // 从文件读回完整 record，确保合并时有最新的 registry 字段
  return readJson(getSessionRecordPath(chatKey, options), null) || existing
}

// T179-P1: 纯合并 — 将 registry record 的字段合并到 scanSummary，不写文件。
// cache hit 热路径专用。record 为 null 时返回 scanSummary 原样。
function mergeRegistryFieldsIntoScanSummary(agent, scanSummary = {}, record = null, options = {}) {
  if (!record) return scanSummary
  const scanFilePath = normalizeString(scanSummary.filePath)
  return {
    ...scanSummary,
    chatKey: record.chatKey,
    registryTitle: record.title || '',
    titleSource: record.titleSource || '',
    title: record.title || scanSummary.title || scanSummary.name || '',
    name: record.title || scanSummary.name || scanSummary.title || '',
    providerSessionId: record.provider?.cliSessionId || scanSummary.providerSessionId || scanSummary.cliSessionId || scanSummary.id || '',
    cliSessionId: record.provider?.cliSessionId || scanSummary.cliSessionId || scanSummary.id || '',
    filePath: scanFilePath || record.provider?.filePath || '',
    model: record.runtime?.model || scanSummary.model || '',
    effort: record.runtime?.effort || scanSummary.effort || '',
    modelTier: record.runtime?.modelTier || scanSummary.modelTier || '',
    reasoningEffort: record.runtime?.reasoningEffort || scanSummary.reasoningEffort || '',
  }
}

// T179-P1: 确保 registry 有对应 record（允许写）。只在 cache miss、新 transcript、repair、record 缺失时调用。
// 等价于原 upsertSessionFromProviderScan，语义更明确。
function ensureRegistryFromProviderScan(agent, scanSummary = {}, project = {}, options = {}) {
  return upsertSessionFromProviderScan(agent, scanSummary, project, options)
}

// T179-P1: 重构 — 委派到 ensureRegistryFromProviderScan + mergeRegistryFieldsIntoScanSummary。
// 保持对外行为不变；cache hit 路径应改用 findRegistryRecordForProviderScan + mergeRegistryFieldsIntoScanSummary。
function attachRegistrySessionToScanSummary(agent, scanSummary = {}, project = {}, options = {}) {
  const record = ensureRegistryFromProviderScan(agent, scanSummary, project, options)
  return mergeRegistryFieldsIntoScanSummary(agent, scanSummary, record, options)
}

function syncPanelStateSessions(agent, panelState = {}, options = {}) {
  const projects = Array.isArray(panelState?.projects) ? panelState.projects : []
  let count = 0
  try {
    for (const project of projects) {
      const chats = Array.isArray(project?.chats) ? project.chats : []
      for (const chat of chats) {
        const record = buildSessionRecordFromChat(agent, project, chat)
        if (record && upsertSessionRecord(record, { ...options, providerBindingSource: 'panel' })) count += 1
      }
    }
  } catch (e) {
    console.warn('[session-registry] sync failed:', e?.message || e)
  }
  return count
}

function buildPanelChatFromRecord(record = {}) {
  if (normalizeAgent(record.agent) === 'codex' && !isMeaningfulCodexLocalDraft({
    name: record.title,
    title: record.title,
    description: record.description,
    cliSessionId: record.provider?.cliSessionId,
    filePath: record.provider?.filePath,
    instruction: record.instruction,
  }, [])) {
    return null
  }
  const provider = record.provider || {}
  const runtime = record.runtime || {}
  const filePath = normalizeString(provider.filePath)
  const fileExists = Boolean(filePath && fs.existsSync(filePath))
  const resumeAllowed = record.metadata?.resumeAllowed === false
    ? false
    : (!filePath || fileExists)
  return {
    id: `chat-${record.chatKey}`,
    name: record.title || 'New Chat',
    sessionId: record.chatKey,
    messages: [],
    metrics: null,
    model: normalizeString(runtime.model) || null,
    reasoningEffort: normalizeString(runtime.reasoningEffort) || null,
    sandboxMode: null,
    networkAccessEnabled: null,
    webSearchMode: null,
    _thinkingStart: null,
    _awaitingDone: false,
    cliSessionId: normalizeString(provider.cliSessionId),
    filePath,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    fileSize: fileExists ? fs.statSync(filePath).size : null,
    titleSource: record.titleSource || '',
    _userRenamed: normalizeTitleSource(record.titleSource) === 'user',
    _resumeAllowed: resumeAllowed,
  }
}

function createPanelProjectFromRecord(record = {}, usedProjectIds = new Set()) {
  const baseId = normalizeString(record.projectId) || `proj-${usedProjectIds.size + 1}`
  let projectId = baseId
  let suffix = 1
  while (usedProjectIds.has(projectId)) {
    suffix += 1
    projectId = `${baseId}-${suffix}`
  }
  usedProjectIds.add(projectId)
  const cwd = normalizeString(record.cwd)
  return {
    id: projectId,
    name: cwd ? path.basename(cwd) || 'New Project' : 'New Project',
    cwd,
    cwdLocked: Boolean(cwd),
    hasDoneNotification: false,
    additionalDirectories: [],
    chats: [],
  }
}

function restorePanelStateFromSessionRegistry(agent, panelState = {}, options = {}) {
  const normalizedAgent = normalizeAgent(agent)
  const projects = Array.isArray(panelState?.projects) ? panelState.projects : []
  let added = 0
  let addedProjects = 0
  const records = listSessionRecords(options)
    .filter(record => record?.chatKey && record.agent === normalizedAgent)
    .sort((a, b) => normalizeTimestamp(a.createdAt) - normalizeTimestamp(b.createdAt))
  if (!records.length) return { changed: false, added: 0, addedProjects: 0, panelState }

  const shouldRebuildProjects = projects.length === 0
  const usedProjectIds = new Set(projects.map(project => normalizeString(project?.id)).filter(Boolean))
  if (shouldRebuildProjects) {
    const seenCwd = new Set()
    for (const record of records) {
      const cwd = normalizeString(record.cwd)
      if (!cwd || seenCwd.has(cwd)) continue
      projects.push(createPanelProjectFromRecord(record, usedProjectIds))
      seenCwd.add(cwd)
      addedProjects += 1
    }
  }

  for (const record of records) {
    const recordProjectId = normalizeString(record.projectId)
    const recordCwd = normalizeString(record.cwd)
    const project = projects.find(candidate => (
      (recordCwd && normalizeString(candidate?.cwd) === recordCwd)
      || (recordProjectId && normalizeString(candidate?.id) === recordProjectId)
    ))
    if (!project) continue

    if (!Array.isArray(project.chats)) project.chats = []
    const exists = project.chats.some(chat => normalizeString(chat?.sessionId) === record.chatKey)
    if (exists) continue
    // 防止 provider 相同的孤立记录被当作新会话加入（例：upsertSessionRecord
    // 合并后遗留的旧 chatKey 文件指向同一 JSONL）
    const providerPath = normalizeProviderPath(record.provider?.filePath)
    const providerCliId = normalizeString(record.provider?.cliSessionId)
    if (providerPath || providerCliId) {
      const sameProvider = project.chats.some(chat =>
        (providerPath && normalizeProviderPath(chat.filePath) === providerPath)
        || (providerCliId && normalizeString(chat.cliSessionId) === providerCliId)
      )
      if (sameProvider) continue
    }

    const panelChat = buildPanelChatFromRecord(record)
    if (!panelChat) continue
    project.chats.push(panelChat)
    added += 1
  }

  return { changed: added > 0 || addedProjects > 0, added, addedProjects, panelState }
}

const restoreMissingPanelStateChats = restorePanelStateFromSessionRegistry

function deleteSessionRecordsByProvider({ agent, filePath, cliSessionId, chatKey } = {}, options = {}) {
  try {
    if (chatKey) return deleteSessionRecord(chatKey, options) ? 1 : 0
    const normalizedAgent = normalizeAgent(agent)
    const normalizedFilePath = normalizeString(filePath)
    const normalizedCliSessionId = normalizeString(cliSessionId)
    if (!normalizedFilePath && !normalizedCliSessionId) return 0

    let count = 0
    for (const record of listSessionRecords(options)) {
      if (normalizedAgent !== 'unknown' && record.agent !== normalizedAgent) continue
      const provider = record.provider || {}
      const sameFile = normalizedFilePath && normalizeString(provider.filePath) === normalizedFilePath
      const sameCliSession = normalizedCliSessionId && normalizeString(provider.cliSessionId) === normalizedCliSessionId
      if (sameFile || sameCliSession) {
        if (deleteSessionRecord(record.chatKey, options)) count += 1
      }
    }
    return count
  } catch (e) {
    console.warn('[session-registry] delete failed:', e?.message || e)
    return 0
  }
}

function detachSessionProviderBinding({ agent, filePath, cliSessionId, chatKey, reason = 'empty_upstream_response' } = {}, options = {}) {
  try {
    const normalizedAgent = normalizeAgent(agent)
    const normalizedChatKey = normalizeString(chatKey)
    const normalizedFilePath = normalizeString(filePath)
    const normalizedCliSessionId = normalizeString(cliSessionId)
    const detachReason = normalizeString(reason) || 'empty_upstream_response'
    if (!normalizedChatKey && !normalizedFilePath && !normalizedCliSessionId) return 0

    let count = 0
    for (const record of listSessionRecords(options)) {
      if (normalizedAgent !== 'unknown' && record.agent !== normalizedAgent) continue
      const provider = record.provider || {}
      const sameChatKey = normalizedChatKey && record.chatKey === normalizedChatKey
      const sameFile = normalizedFilePath && normalizeString(provider.filePath) === normalizedFilePath
      const sameCliSession = normalizedCliSessionId && normalizeString(provider.cliSessionId) === normalizedCliSessionId
      if (!sameChatKey && !sameFile && !sameCliSession) continue

      const next = {
        ...record,
        provider: record.provider || {},
        metadata: {
          ...(record.metadata || {}),
          resumeAllowed: false,
          detachedProviderBinding: {
            cliSessionId: normalizeString(record.provider?.cliSessionId) || normalizedCliSessionId,
            filePath: normalizeString(record.provider?.filePath) || normalizedFilePath,
            reason: detachReason,
            detachedAt: Date.now(),
          },
        },
        updatedAt: Date.now(),
      }
      if (upsertSessionRecord(next, options)) count += 1
    }
    return count
  } catch (e) {
    console.warn('[session-registry] detach provider binding failed:', e?.message || e)
    return 0
  }
}

function hasMeaningfulInstruction(record = {}) {
  const instruction = record.instruction || {}
  return Boolean(
    instruction.enabled
    || normalizeString(instruction.content)
    || (Array.isArray(instruction.attachments) && instruction.attachments.length > 0)
  )
}

function hasRuntime(record = {}) {
  const runtime = record.runtime || {}
  return Boolean(
    normalizeString(runtime.model)
    || normalizeString(runtime.effort)
    || normalizeString(runtime.modelTier)
    || normalizeString(runtime.reasoningEffort)
  )
}

function scoreRepairCandidate(record = {}) {
  let score = 0
  if (!isPollutedChatKey(record)) score += 1000000
  if (normalizeTitleSource(record.titleSource) === 'user') score += 100000
  if (hasMeaningfulInstruction(record)) score += 10000
  if (hasRuntime(record)) score += 1000
  score += Math.min(normalizeTimestamp(record.updatedAt), 9999999999999) / 100000000000
  return score
}

function chooseRepairKeeper(records = [], usedKeys = new Set()) {
  const sorted = records.slice().sort((a, b) => scoreRepairCandidate(b) - scoreRepairCandidate(a))
  const keeper = sorted[0] || records[0]
  if (!keeper) return null
  const polluted = isPollutedChatKey(keeper)
  const nonPolluted = sorted.find(record => !isPollutedChatKey(record))
  const selected = polluted && nonPolluted ? nonPolluted : keeper
  const selectedKey = normalizeString(selected.chatKey)
  return {
    record: selected,
    chatKey: isPollutedChatKey(selected)
      ? createUniqueRegistryChatKey(selected.agent, usedKeys)
      : selectedKey,
  }
}

function mergeRepairRecords(records = [], keepChatKey) {
  const keeper = records.slice().sort((a, b) => scoreRepairCandidate(b) - scoreRepairCandidate(a))[0] || records[0] || {}
  let merged = {
    ...(keeper || {}),
    chatKey: keepChatKey,
    provider: { ...(keeper.provider || {}) },
    runtime: { ...(keeper.runtime || {}) },
    instruction: { ...(keeper.instruction || {}) },
  }
  for (const record of records) {
    if (!record) continue
    const titleState = chooseTitle(merged, record)
    merged = {
      ...merged,
      title: titleState.title,
      titleSource: titleState.titleSource,
      agent: normalizeAgent(merged.agent || record.agent),
      projectId: merged.projectId || record.projectId || '',
      cwd: merged.cwd || record.cwd || '',
      description: merged.description || record.description || '',
      provider: {
        cliSessionId: merged.provider?.cliSessionId || record.provider?.cliSessionId || '',
        filePath: merged.provider?.filePath || record.provider?.filePath || '',
      },
      runtime: {
        model: merged.runtime?.model || record.runtime?.model || '',
        effort: merged.runtime?.effort || record.runtime?.effort || null,
        modelTier: merged.runtime?.modelTier || record.runtime?.modelTier || '',
        reasoningEffort: merged.runtime?.reasoningEffort || record.runtime?.reasoningEffort || null,
      },
      instruction: hasMeaningfulInstruction(merged)
        ? merged.instruction
        : (hasMeaningfulInstruction(record) ? { ...(record.instruction || {}) } : merged.instruction),
      createdAt: merged.createdAt && record.createdAt
        ? Math.min(normalizeTimestamp(merged.createdAt), normalizeTimestamp(record.createdAt)) || merged.createdAt
        : (merged.createdAt || record.createdAt || Date.now()),
      updatedAt: Math.max(normalizeTimestamp(merged.updatedAt), normalizeTimestamp(record.updatedAt), Date.now()),
      schemaVersion: SCHEMA_VERSION,
    }
  }
  if (!merged.instruction || typeof merged.instruction !== 'object') {
    merged.instruction = { enabled: false, instructionId: '', content: '', attachments: [] }
  }
  return merged
}

function getRepairGroups(records = []) {
  const parent = new Map()
  const providerOwner = new Map()
  const keyOf = record => normalizeString(record.chatKey)
  const find = (key) => {
    const current = parent.get(key) || key
    if (current === key) return key
    const root = find(current)
    parent.set(key, root)
    return root
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  for (const record of records) {
    const chatKey = keyOf(record)
    if (!chatKey) continue
    parent.set(chatKey, chatKey)
    for (const providerKey of getProviderKeysFromRecord(record)) {
      const prev = providerOwner.get(providerKey)
      if (prev) union(prev, chatKey)
      else providerOwner.set(providerKey, chatKey)
    }
  }

  const byRoot = new Map()
  for (const record of records) {
    const chatKey = keyOf(record)
    if (!chatKey) continue
    const root = find(chatKey)
    if (!byRoot.has(root)) byRoot.set(root, [])
    byRoot.get(root).push(record)
  }
  return Array.from(byRoot.values()).filter(group => group.length > 1 || isPollutedChatKey(group[0]))
}

function updatePanelStateChatKeys(filePath, keyMap, dryRun = false) {
  if (!filePath || !fs.existsSync(filePath)) return { changed: false, filePath, updates: 0 }
  const data = readJson(filePath, null)
  if (!data || typeof data !== 'object') return { changed: false, filePath, updates: 0 }
  const projects = Array.isArray(data.projects) ? data.projects : (Array.isArray(data.tabs) ? data.tabs : [])
  let updates = 0
  for (const project of projects) {
    const chats = Array.isArray(project?.chats) ? project.chats : []
    for (const chat of chats) {
      const oldKey = normalizeString(chat?.sessionId)
      const newKey = keyMap.get(oldKey)
      if (!newKey || newKey === oldKey) continue
      chat.sessionId = newKey
      updates += 1
    }
  }
  if (updates > 0 && !dryRun) writeJsonAtomic(filePath, data)
  return { changed: updates > 0, filePath, updates }
}

function updatePanelStateProviderKeys(agent, filePath, records = [], dryRun = false) {
  if (!filePath || !fs.existsSync(filePath)) return { changed: false, filePath, updates: 0 }
  const normalizedAgent = normalizeAgent(agent)
  const agentRecords = records.filter(record => normalizeAgent(record?.agent) === normalizedAgent)
  const data = readJson(filePath, null)
  if (!data || typeof data !== 'object') return { changed: false, filePath, updates: 0 }
  const projects = Array.isArray(data.projects) ? data.projects : (Array.isArray(data.tabs) ? data.tabs : [])
  let updates = 0
  for (const project of projects) {
    const chats = Array.isArray(project?.chats) ? project.chats : []
    for (const chat of chats) {
      const chatKey = normalizeString(chat?.sessionId)
      if (!chatKey) continue
      const record = agentRecords.find(candidate => {
        const provider = candidate?.provider || {}
        const sameSession = normalizeString(chat.cliSessionId) && normalizeString(chat.cliSessionId) === normalizeString(provider.cliSessionId)
        const samePath = normalizeProviderPath(chat.filePath) && normalizeProviderPath(chat.filePath) === normalizeProviderPath(provider.filePath)
        return sameSession || samePath
      })
      if (!record?.chatKey || record.chatKey === chatKey) continue
      chat.sessionId = record.chatKey
      updates += 1
    }
  }
  if (updates > 0 && !dryRun) writeJsonAtomic(filePath, data)
  return { changed: updates > 0, filePath, updates }
}

function createRepairBackup(options = {}) {
  const userDataDir = getUserDataDir(options)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = path.join(userDataDir, 'session-registry-backups', stamp)
  ensureDir(backupRoot)
  const copied = []
  if (copyIfExists(getSessionRegistryRoot(options), path.join(backupRoot, 'session-registry'))) copied.push('session-registry')
  if (copyIfExists(path.join(userDataDir, 'claude-panel-state.json'), path.join(backupRoot, 'claude-panel-state.json'))) copied.push('claude-panel-state.json')
  if (copyIfExists(path.join(userDataDir, 'codex-panel-state.json'), path.join(backupRoot, 'codex-panel-state.json'))) copied.push('codex-panel-state.json')
  return { backupRoot, copied }
}

function repairSessionRegistry(options = {}) {
  const dryRun = Boolean(options.dryRun)
  const records = listSessionRecords(options)
  const groups = getRepairGroups(records)
  const keyMap = new Map()
  const usedKeys = new Set(records.map(record => normalizeString(record.chatKey)).filter(Boolean))
  const report = {
    ok: true,
    dryRun,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    backupPath: '',
    scannedRecords: records.length,
    changed: false,
    repairedGroups: [],
    panelStateUpdates: [],
    warnings: [],
  }

  const nextByChatKey = new Map(records.map(record => [record.chatKey, record]))
  for (const group of groups) {
    const keeper = chooseRepairKeeper(group, usedKeys)
    if (!keeper) continue
    const keepChatKey = keeper.chatKey
    const merged = mergeRepairRecords(group, keepChatKey)
    const removedChatKeys = group.map(record => record.chatKey).filter(chatKey => chatKey !== keepChatKey)
    const renamedChatKeys = group
      .map(record => record.chatKey)
      .filter(chatKey => chatKey && chatKey !== keepChatKey && isPollutedChatKey(recordByChatKey(group, chatKey)))
    for (const record of group) {
      if (record.chatKey !== keepChatKey) {
        nextByChatKey.delete(record.chatKey)
        keyMap.set(record.chatKey, keepChatKey)
      }
    }
    if (keeper.record.chatKey !== keepChatKey) {
      nextByChatKey.delete(keeper.record.chatKey)
      keyMap.set(keeper.record.chatKey, keepChatKey)
    }
    nextByChatKey.set(keepChatKey, merged)
    report.repairedGroups.push({
      keptChatKey: keepChatKey,
      originalChatKeys: group.map(record => record.chatKey),
      removedChatKeys,
      renamedChatKeys,
      providerKeys: Array.from(new Set(group.flatMap(record => getProviderKeysFromRecord(record)))),
    })
  }
  const userDataDir = getUserDataDir(options)
  const finalRecords = Array.from(nextByChatKey.values())
  const plannedPanelUpdates = [
    updatePanelStateChatKeys(path.join(userDataDir, 'claude-panel-state.json'), keyMap, true),
    updatePanelStateChatKeys(path.join(userDataDir, 'codex-panel-state.json'), keyMap, true),
    updatePanelStateProviderKeys('claude', path.join(userDataDir, 'claude-panel-state.json'), finalRecords, true),
    updatePanelStateProviderKeys('codex', path.join(userDataDir, 'codex-panel-state.json'), finalRecords, true),
  ]
  report.changed = report.repairedGroups.length > 0 || plannedPanelUpdates.some(item => item.changed)
  report.plannedPanelStateUpdates = plannedPanelUpdates.filter(item => item.changed)
  if (!report.changed || dryRun) {
    report.finishedAt = new Date().toISOString()
    return report
  }

  const backup = createRepairBackup(options)
  report.backupPath = backup.backupRoot
  report.backupCopied = backup.copied

  try {
    for (const record of records) {
      const recordPath = getSessionRecordPath(record.chatKey, options)
      if (fs.existsSync(recordPath) && !nextByChatKey.has(record.chatKey)) fs.unlinkSync(recordPath)
    }
    for (const record of finalRecords) {
      writeJsonAtomic(getSessionRecordPath(record.chatKey, options), record)
    }
    rebuildIndexFromRecords(finalRecords, options)
    report.panelStateUpdates.push(updatePanelStateChatKeys(path.join(userDataDir, 'claude-panel-state.json'), keyMap, dryRun))
    report.panelStateUpdates.push(updatePanelStateChatKeys(path.join(userDataDir, 'codex-panel-state.json'), keyMap, dryRun))
    report.panelStateUpdates.push(updatePanelStateProviderKeys('claude', path.join(userDataDir, 'claude-panel-state.json'), finalRecords, dryRun))
    report.panelStateUpdates.push(updatePanelStateProviderKeys('codex', path.join(userDataDir, 'codex-panel-state.json'), finalRecords, dryRun))
    writeJsonAtomic(path.join(backup.backupRoot, 'repair-report.json'), report)
  } catch (e) {
    report.ok = false
    report.error = e?.message || String(e)
    report.warnings.push('repair failed after backup; restore from backupPath if needed')
  }
  report.finishedAt = new Date().toISOString()
  return report
}

function recordByChatKey(records = [], chatKey) {
  return records.find(record => record.chatKey === chatKey) || null
}

module.exports = {
  buildSessionRecordFromChat,
  deleteSessionRecord,
  deleteSessionRecordsByProvider,
  detachSessionProviderBinding,
  findSessionRecordByProvider,
  getSessionDraft,
  getSessionInstruction,
  getSessionRecordPath,
  getSessionRegistryRoot,
  listSessionRecords,
  makeProviderKeys,
  repairSessionRegistry,
  restorePanelStateFromSessionRegistry,
  restoreMissingPanelStateChats,
  resolveSessionByProvider,
  clearSessionDraft,
  setSessionTitle,
  setSessionDraft,
  setSessionInstruction,
  syncPanelStateSessions,
  normalizeSessionInstructionInput,
  attachRegistrySessionToScanSummary,
  findRegistryRecordForProviderScan,
  mergeRegistryFieldsIntoScanSummary,
  ensureRegistryFromProviderScan,
  upsertRuntimeByProvider,
  upsertSessionFromProviderScan,
  upsertSessionRecord,
}
