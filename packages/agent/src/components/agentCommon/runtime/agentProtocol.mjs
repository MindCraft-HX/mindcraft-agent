/**
 * Agent 领域事件 & Command 协议
 *
 * 定义 MindCraft 运行时的稳定事件 schema 和 command schema。
 * 与 transport 无关（不依赖 Electron IPC / WebSocket 具体实现）。
 * 与 provider 无关（不暴露 Claude SDK / CodeX JSONL 原始字段）。
 *
 * 约束：
 * - 所有事件和 command 必须可 JSON 序列化。
 * - 不得包含 Electron 对象（event.sender、webContents）。
 * - 不得包含 Vue reactive proxy。
 * - 不得以本地绝对路径作为唯一身份。
 */

// ── 常量 ──

export const PROTOCOL_VERSION = 1

/** @enum {string} */
export const AgentDomain = {
  TURN_STARTED: 'agent.turn.started',
  STREAM_ACTIVITY: 'agent.stream.activity',
  TURN_TERMINAL: 'agent.turn.terminal',
  RUN_DONE: 'agent.run.done',
  METRICS_UPDATED: 'agent.metrics.updated',
  BINDING_UPDATED: 'agent.binding.updated',
  ERROR: 'agent.error',
}

/** @enum {string} */
export const TerminalKind = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABORTED: 'aborted',
  INTERRUPTED: 'interrupted',
}

/** @enum {string} */
export const AgentCommand = {
  RUN_START: 'agent.run.start',
  RUN_ABORT: 'agent.run.abort',
  PERMISSION_RESOLVE: 'agent.permission.resolve',
  SESSION_LIST: 'agent.session.list',
  SESSION_RESUME: 'agent.session.resume',
  SESSION_RENAME: 'agent.session.rename',
  SESSION_DELETE: 'agent.session.delete',
  METRICS_QUERY: 'agent.metrics.query',
}

const VALID_DOMAINS = new Set(Object.values(AgentDomain))
const VALID_TERMINAL_KINDS = new Set(Object.values(TerminalKind))
const VALID_COMMANDS = new Set(Object.values(AgentCommand))
const VALID_AGENTS = new Set(['claudeCode', 'codex'])
const VALID_TRANSPORTS = new Set(['ipc', 'websocket'])

// ── ID 生成 ──

let _eventSeq = 0
let _commandSeq = 0

function generateId(prefix) {
  const seq = prefix === 'evt' ? ++_eventSeq : ++_commandSeq
  const rand = Math.random().toString(36).slice(2, 8)
  const ts = Date.now().toString(36)
  return `${prefix}_${ts}_${rand}_${seq}`
}

/** @returns {string} */
export function generateEventId() {
  return generateId('evt')
}

/** @returns {string} */
export function generateCommandId() {
  return generateId('cmd')
}

// ── Event Builder ──

/**
 * @param {object} opts
 * @param {string} opts.agent - registry key，如 'claudeCode' | 'codex'
 * @param {string} opts.domain - AgentDomain 值
 * @param {string} opts.chatKey - MindCraft session chat key
 * @param {string} [opts.runId]
 * @param {string} [opts.cliSessionId]
 * @param {string} [opts.filePath]
 * @param {string} [opts.transport='ipc']
 * @param {string} [opts.eventId] - 外部已有 ID（避免重复生成）
 * @param {string} [opts.timestamp] - ISO 时间戳
 * @param {object} [opts.terminal] - 仅 domain=turn.terminal 时有效
 * @param {object} [opts.turn] - 本轮 token / 耗时
 * @param {object} [opts.metrics] - 累计 token / context / cost
 * @param {object} [opts.error] - 仅 domain=error 时有效
 * @param {object} [opts.binding] - 仅 domain=binding.updated 时有效
 * @returns {object}
 */
export function buildAgentEvent({
  agent,
  domain,
  chatKey,
  runId,
  cliSessionId,
  filePath,
  transport = 'ipc',
  eventId,
  timestamp,
  terminal,
  turn,
  metrics,
  error,
  binding,
} = {}) {
  return removeUndefined({
    version: PROTOCOL_VERSION,
    eventId: eventId || generateEventId(),
    timestamp: timestamp || new Date().toISOString(),
    agent,
    domain,
    chatKey,
    runId,
    cliSessionId,
    filePath,
    transport,
    terminal,
    turn,
    metrics,
    error,
    binding,
  })
}

/**
 * 构建 agent.turn.terminal 事件
 */
export function buildAgentTurnTerminalEvent({
  agent,
  chatKey,
  runId,
  cliSessionId,
  filePath,
  transport,
  terminalKind,
  hasAssistantOutput = true,
  turn,
}) {
  return buildAgentEvent({
    agent,
    domain: AgentDomain.TURN_TERMINAL,
    chatKey,
    runId,
    cliSessionId,
    filePath,
    transport,
    terminal: {
      kind: terminalKind,
      hasAssistantOutput,
    },
    turn: turn || undefined,
  })
}

/**
 * 构建 agent.run.done 事件
 */
export function buildAgentRunDoneEvent({
  agent,
  chatKey,
  runId,
  cliSessionId,
  filePath,
  transport,
}) {
  return buildAgentEvent({
    agent,
    domain: AgentDomain.RUN_DONE,
    chatKey,
    runId,
    cliSessionId,
    filePath,
    transport,
  })
}

/**
 * 构建 agent.metrics.updated 事件
 */
export function buildAgentMetricsUpdatedEvent({
  agent,
  chatKey,
  runId,
  cliSessionId,
  filePath,
  transport,
  metrics,
}) {
  return buildAgentEvent({
    agent,
    domain: AgentDomain.METRICS_UPDATED,
    chatKey,
    runId,
    cliSessionId,
    filePath,
    transport,
    metrics,
  })
}

/**
 * 构建 agent.error 事件
 */
export function buildAgentErrorEvent({
  agent,
  chatKey,
  runId,
  cliSessionId,
  transport,
  error,
}) {
  return buildAgentEvent({
    agent,
    domain: AgentDomain.ERROR,
    chatKey,
    runId,
    cliSessionId,
    transport,
    error,
  })
}

// ── Command Builder ──

/**
 * @param {object} opts
 * @param {string} opts.agent
 * @param {string} opts.command - AgentCommand 值
 * @param {string} opts.chatKey
 * @param {string} [opts.runId]
 * @param {object} [opts.payload]
 * @param {string} [opts.commandId]
 * @param {string} [opts.timestamp]
 * @returns {object}
 */
export function buildAgentCommand({
  agent,
  command,
  chatKey,
  runId,
  payload,
  commandId,
  timestamp,
} = {}) {
  return removeUndefined({
    version: PROTOCOL_VERSION,
    commandId: commandId || generateCommandId(),
    timestamp: timestamp || new Date().toISOString(),
    agent,
    command,
    chatKey,
    runId,
    payload,
  })
}

// ── 验证 ──

/**
 * @param {object} envelope
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentEventEnvelope(envelope) {
  const errors = []

  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['envelope must be a non-null object'] }
  }

  if (envelope.version !== PROTOCOL_VERSION) {
    errors.push(`version must be ${PROTOCOL_VERSION}, got ${envelope.version}`)
  }
  if (typeof envelope.eventId !== 'string' || !envelope.eventId) {
    errors.push('eventId must be a non-empty string')
  }
  if (typeof envelope.timestamp !== 'string' || !envelope.timestamp) {
    errors.push('timestamp must be a non-empty string')
  }
  if (!VALID_AGENTS.has(envelope.agent)) {
    errors.push(`agent must be one of ${[...VALID_AGENTS].join(', ')}, got "${envelope.agent}"`)
  }
  if (!VALID_DOMAINS.has(envelope.domain)) {
    errors.push(`domain must be a valid AgentDomain, got "${envelope.domain}"`)
  }
  if (typeof envelope.chatKey !== 'string' || !envelope.chatKey) {
    errors.push('chatKey must be a non-empty string')
  }
  if (envelope.transport && !VALID_TRANSPORTS.has(envelope.transport)) {
    errors.push(`transport must be one of ${[...VALID_TRANSPORTS].join(', ')}, got "${envelope.transport}"`)
  }

  // 领域特定验证
  if (envelope.domain === AgentDomain.TURN_TERMINAL) {
    if (!envelope.terminal || typeof envelope.terminal !== 'object') {
      errors.push('domain=turn.terminal requires terminal object')
    } else if (!VALID_TERMINAL_KINDS.has(envelope.terminal.kind)) {
      errors.push(`terminal.kind must be one of ${[...VALID_TERMINAL_KINDS].join(', ')}, got "${envelope.terminal.kind}"`)
    }
  }

  if (envelope.domain === AgentDomain.ERROR) {
    if (!envelope.error || typeof envelope.error !== 'object') {
      errors.push('domain=error requires error object')
    }
  }

  if (envelope.domain === AgentDomain.METRICS_UPDATED) {
    if (!envelope.metrics || typeof envelope.metrics !== 'object') {
      errors.push('domain=metrics.updated requires metrics object')
    }
  }

  // 结构安全验证
  validateNoUnsafeValues(envelope, '', errors)

  return { valid: errors.length === 0, errors }
}

/**
 * @param {object} envelope
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentCommandEnvelope(envelope) {
  const errors = []

  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['envelope must be a non-null object'] }
  }

  if (envelope.version !== PROTOCOL_VERSION) {
    errors.push(`version must be ${PROTOCOL_VERSION}, got ${envelope.version}`)
  }
  if (typeof envelope.commandId !== 'string' || !envelope.commandId) {
    errors.push('commandId must be a non-empty string')
  }
  if (typeof envelope.timestamp !== 'string' || !envelope.timestamp) {
    errors.push('timestamp must be a non-empty string')
  }
  if (!VALID_AGENTS.has(envelope.agent)) {
    errors.push(`agent must be one of ${[...VALID_AGENTS].join(', ')}, got "${envelope.agent}"`)
  }
  if (!VALID_COMMANDS.has(envelope.command)) {
    errors.push(`command must be a valid AgentCommand, got "${envelope.command}"`)
  }
  if (typeof envelope.chatKey !== 'string' || !envelope.chatKey) {
    errors.push('chatKey must be a non-empty string')
  }

  validateNoUnsafeValues(envelope, '', errors)

  return { valid: errors.length === 0, errors }
}

// ── 工具函数 ──

/**
 * 移除值为 undefined 的字段（保持 JSON 干净）
 */
function removeUndefined(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

/**
 * 递归检查对象中是否包含不可序列化的值
 */
function validateNoUnsafeValues(obj, path, errors) {
  if (obj === null || obj === undefined) return
  if (typeof obj === 'function') {
    errors.push(`${path || 'root'}: functions are not allowed in protocol objects`)
    return
  }
  if (typeof obj !== 'object') return

  // 检测 Electron / Vue 对象
  const ctorName = obj.constructor?.name || ''
  if (ctorName === 'WebContents' || ctorName === 'BrowserWindow' || ctorName.startsWith('Vue')) {
    errors.push(`${path || 'root'}: ${ctorName} objects are not allowed in protocol objects`)
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => validateNoUnsafeValues(item, `${path}[${i}]`, errors))
  } else {
    for (const [k, v] of Object.entries(obj)) {
      validateNoUnsafeValues(v, path ? `${path}.${k}` : k, errors)
    }
  }
}

/**
 * 构造通知去重 key
 * 用于防止同一 run 的 terminal/done 重复触发通知
 *
 * @param {object} event - agent:event envelope
 * @returns {string}
 */
export function notificationDedupeKey(event) {
  const parts = [event.agent, event.chatKey]
  if (event.cliSessionId) parts.push(event.cliSessionId)
  if (event.runId) {
    parts.push(event.runId)
    // 有 runId 时精确去重（CodeX 场景）
  }
  // 无 runId 时不追加 eventId（eventId 每次唯一，无法去重）。
  // 此时依赖 agent + chatKey + cliSessionId + terminal.kind 去重，
  // 可拦截 Claude 同 session 内 double-done（PR 2 将补齐 runId）。
  if (event.domain === AgentDomain.TURN_TERMINAL && event.terminal?.kind) {
    parts.push(event.terminal.kind)
  }
  return parts.join('::')
}

/**
 * 判断事件是否具备通知音播放资格（notification eligibility）
 *
 * 保守策略：
 * - turn.terminal + completed + hasAssistantOutput → eligible
 * - 其他情况 → not eligible（避免 failed/aborted 误播）
 *
 * @param {object} event - agent:event envelope
 * @returns {boolean}
 */
export function isSoundEligible(event) {
  if (event.domain !== AgentDomain.TURN_TERMINAL) return false
  if (event.terminal?.kind !== TerminalKind.COMPLETED) return false
  return event.terminal?.hasAssistantOutput !== false
}
