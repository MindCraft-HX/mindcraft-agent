const fs = require('fs')
const path = require('path')
const { getMindCraftUserDataDir } = require('./userDataPath')

const REGISTRY_DIR_NAME = 'session-registry'
const SCHEMA_VERSION = 1
const MAX_INSTRUCTION_DESCRIPTION_CHARS = 1000
const MAX_INSTRUCTION_CONTENT_CHARS = 100000
const MAX_INSTRUCTION_ATTACHMENTS = 20
const MAX_INSTRUCTION_ATTACHMENT_CHARS = 4096

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

function normalizeAgent(agent) {
  const raw = String(agent || '').trim().toLowerCase()
  if (raw === 'claude' || raw === 'claudecode' || raw === 'claude-code') return 'claude'
  if (raw === 'codex' || raw === 'codexcode' || raw === 'code-x') return 'codex'
  return raw || 'unknown'
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
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
  const createdAt = normalizeTimestamp(chat.createdAt)
  const updatedAt = normalizeTimestamp(chat.updatedAt) || createdAt || Date.now()
  return {
    schemaVersion: SCHEMA_VERSION,
    chatKey,
    agent: normalizeAgent(agent),
    projectId: normalizeString(project.id),
    cwd: normalizeString(project.cwd),
    title: normalizeString(chat.name),
    description: normalizeString(chat.description),
    provider: {
      cliSessionId: normalizeString(chat.cliSessionId),
      filePath: normalizeString(chat.filePath),
    },
    runtime: normalizeRuntime(agent, chat),
    instruction: {
      enabled: Boolean(chat.instruction?.enabled),
      instructionId: normalizeString(chat.instruction?.instructionId),
      title: normalizeString(chat.instruction?.title),
      description: normalizeString(chat.instruction?.description),
      content: typeof chat.instruction?.content === 'string' ? chat.instruction.content : '',
      attachments: Array.isArray(chat.instruction?.attachments) ? chat.instruction.attachments.filter(Boolean) : [],
    },
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

function readIndex(options = {}) {
  const index = readJson(getIndexPath(options), { schemaVersion: SCHEMA_VERSION, sessions: {} })
  if (!index || typeof index !== 'object') return { schemaVersion: SCHEMA_VERSION, sessions: {} }
  if (!index.sessions || typeof index.sessions !== 'object') index.sessions = {}
  index.schemaVersion = SCHEMA_VERSION
  return index
}

function writeIndex(index, options = {}) {
  writeJsonAtomic(getIndexPath(options), {
    schemaVersion: SCHEMA_VERSION,
    sessions: index?.sessions && typeof index.sessions === 'object' ? index.sessions : {},
  })
}

function upsertSessionRecord(record, options = {}) {
  if (!record?.chatKey) return false
  const filePath = getSessionRecordPath(record.chatKey, options)
  if (!filePath) return false
  const existing = readJson(filePath, {})
  const next = {
    ...existing,
    ...record,
    provider: {
      ...(existing?.provider || {}),
      ...(record.provider || {}),
    },
    runtime: {
      ...(existing?.runtime || {}),
      ...(record.runtime || {}),
    },
    instruction: {
      ...(existing?.instruction || {}),
      ...(record.instruction || {}),
    },
    schemaVersion: SCHEMA_VERSION,
    updatedAt: record.updatedAt || Date.now(),
  }
  writeJsonAtomic(filePath, next)

  const index = readIndex(options)
  index.sessions[next.chatKey] = {
    agent: next.agent,
    projectId: next.projectId,
    cwd: next.cwd,
    title: next.title,
    description: next.description || '',
    cliSessionId: next.provider?.cliSessionId || '',
    filePath: next.provider?.filePath || '',
    updatedAt: next.updatedAt,
    path: path.relative(getSessionRegistryRoot(options), filePath).split(path.sep).join('/'),
  }
  writeIndex(index, options)
  return true
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

  for (const record of listSessionRecords(options)) {
    if (normalizedAgent !== 'unknown' && record.agent !== normalizedAgent) continue
    const provider = record.provider || {}
    const sameFile = normalizedFilePath && normalizeString(provider.filePath) === normalizedFilePath
    const sameCliSession = normalizedCliSessionId && normalizeString(provider.cliSessionId) === normalizedCliSessionId
    if (sameFile || sameCliSession) return record
  }
  return null
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
  if (index.sessions?.[chatKey]) {
    delete index.sessions[chatKey]
    writeIndex(index, options)
    deleted = true
  }
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
  const recordPath = getSessionRecordPath(chatKey, options)
  const session = readJson(recordPath, null)
  const instructionId = normalizeString(session?.instruction?.instructionId)
  const legacyInstruction = instructionId ? readInstructionRecord(instructionId, options) : null
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
  return {
    enabled: Boolean(sessionInstruction.enabled),
    instructionId,
    description: normalizeString(session?.description) || legacyDescription,
    content: sessionContent || legacyInstruction?.content || '',
    attachments,
  }
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
  return { ok: true, instruction: getSessionInstruction(resolvedChatKey, options) }
}

function syncPanelStateSessions(agent, panelState = {}, options = {}) {
  const projects = Array.isArray(panelState?.projects) ? panelState.projects : []
  let count = 0
  try {
    for (const project of projects) {
      const chats = Array.isArray(project?.chats) ? project.chats : []
      for (const chat of chats) {
        const record = buildSessionRecordFromChat(agent, project, chat)
        if (record && upsertSessionRecord(record, options)) count += 1
      }
    }
  } catch (e) {
    console.warn('[session-registry] sync failed:', e?.message || e)
  }
  return count
}

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

module.exports = {
  buildSessionRecordFromChat,
  deleteSessionRecord,
  deleteSessionRecordsByProvider,
  findSessionRecordByProvider,
  getSessionInstruction,
  getSessionRecordPath,
  getSessionRegistryRoot,
  listSessionRecords,
  setSessionInstruction,
  syncPanelStateSessions,
  normalizeSessionInstructionInput,
  upsertRuntimeByProvider,
  upsertSessionRecord,
}
