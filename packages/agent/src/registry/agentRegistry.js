/**
 * Agent 注册表 — 纯数据定义
 *
 * 此文件不包含任何 Vue 导入，可被 router、test、preload 等任意模块安全引用。
 * 组件引用在 agentRegistryComponents.js 中单独管理。
 *
 * 2026-06-24：扩展为 Agent 接入契约，新增 kind / runtime / protocol / capabilities。
 */

import { AgentDomain } from '../components/agentCommon/runtime/agentProtocol.mjs'

export const AGENT_DEFINITIONS = [
  {
    key: 'claudeCode',
    name: 'Claude Code',
    kind: 'coding-agent',
    iconClass: 'mindcraft-flow-win-iconfont icon-mindcraft-claude1',
    iconStyle: { color: '#D97757' },
    description: 'Anthropic 出品的编程智能体，支持代码编写、调试和重构',
    descriptionKey: 'agent.claudeDesc',
    routeAlias: 'claudeCode',

    runtime: {
      location: 'local',
      provider: 'claude',
      defaultTransport: 'ipc',
    },

    capabilities: {
      projectWorkspace: true,
      tools: true,
      fileRead: true,
      fileWrite: true,
      shell: true,
      images: true,
      webSearch: false,
      approvals: false,
      remote: false,
      resumable: true,
      longRunning: false,
    },

    protocol: {
      commandVersion: 1,
      eventVersion: 1,
      domains: [
        AgentDomain.TURN_STARTED,
        AgentDomain.STREAM_ACTIVITY,
        AgentDomain.TURN_TERMINAL,
        AgentDomain.RUN_DONE,
        AgentDomain.METRICS_UPDATED,
        AgentDomain.BINDING_UPDATED,
        AgentDomain.ERROR,
      ],
    },
  },
  {
    key: 'codex',
    name: 'GPT Codex',
    kind: 'coding-agent',
    iconClass: 'icon iconfont icon-ChatGPT',
    iconStyle: { fontSize: '18px', color: '#74AA9C' },
    description: 'OpenAI 编程智能体，支持多种语言代码生成和调试',
    descriptionKey: 'agent.codexDesc',
    routeAlias: 'codex',

    runtime: {
      location: 'local',
      provider: 'codex',
      defaultTransport: 'ipc',
    },

    capabilities: {
      projectWorkspace: true,
      tools: true,
      fileRead: true,
      fileWrite: true,
      shell: true,
      images: true,
      webSearch: true,
      approvals: false,
      remote: false,
      resumable: true,
      longRunning: false,
    },

    protocol: {
      commandVersion: 1,
      eventVersion: 1,
      domains: [
        AgentDomain.TURN_STARTED,
        AgentDomain.STREAM_ACTIVITY,
        AgentDomain.TURN_TERMINAL,
        AgentDomain.RUN_DONE,
        AgentDomain.METRICS_UPDATED,
        AgentDomain.BINDING_UPDATED,
        AgentDomain.ERROR,
      ],
    },
  },
]

/** Map<agentKey, definition> — O(1) 查找 */
export const agentRegistryMap = new Map(
  AGENT_DEFINITIONS.map((a) => [a.key, a])
)

/**
 * 按 key 获取 Agent 定义
 * @param {string} key
 * @returns {object|undefined}
 */
export function getAgent(key) {
  return agentRegistryMap.get(key)
}

/**
 * 获取所有已注册的 Agent key 列表
 * @returns {string[]}
 */
export function getAgentKeys() {
  return AGENT_DEFINITIONS.map((a) => a.key)
}

// ── 契约验证（2026-06-24 新增） ──

const REQUIRED_TOP_FIELDS = ['key', 'name', 'kind', 'runtime', 'capabilities', 'protocol']
const VALID_KINDS = new Set(['coding-agent', 'chat-agent', 'custom-agent'])
const VALID_LOCATIONS = new Set(['local', 'remote'])
const VALID_PROVIDERS = new Set(['claude', 'codex', 'openai', 'anthropic', 'custom'])
const VALID_TRANSPORTS = new Set(['ipc', 'websocket', 'http'])
const REQUIRED_RUNTIME_FIELDS = ['location', 'provider', 'defaultTransport']
const REQUIRED_CAPABILITY_KEYS = [
  'projectWorkspace', 'tools', 'fileRead', 'fileWrite',
  'shell', 'images', 'webSearch', 'approvals',
  'remote', 'resumable', 'longRunning',
]

/**
 * 验证单个 Agent 定义的完整性
 * @param {object} def
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentDefinition(def) {
  const errors = []

  if (!def || typeof def !== 'object') {
    return { valid: false, errors: ['definition must be a non-null object'] }
  }

  for (const field of REQUIRED_TOP_FIELDS) {
    if (!(field in def)) {
      errors.push(`missing required field: ${field}`)
    }
  }

  if (def.key && typeof def.key !== 'string') {
    errors.push('key must be a string')
  }

  if (def.kind && !VALID_KINDS.has(def.kind)) {
    errors.push(`kind must be one of ${[...VALID_KINDS].join(', ')}, got "${def.kind}"`)
  }

  if (def.runtime) {
    for (const field of REQUIRED_RUNTIME_FIELDS) {
      if (!(field in def.runtime)) {
        errors.push(`runtime.${field} is required`)
      }
    }
    if (def.runtime.location && !VALID_LOCATIONS.has(def.runtime.location)) {
      errors.push(`runtime.location must be one of ${[...VALID_LOCATIONS].join(', ')}, got "${def.runtime.location}"`)
    }
    if (def.runtime.provider && !VALID_PROVIDERS.has(def.runtime.provider)) {
      errors.push(`runtime.provider must be one of ${[...VALID_PROVIDERS].join(', ')}, got "${def.runtime.provider}"`)
    }
    if (def.runtime.defaultTransport && !VALID_TRANSPORTS.has(def.runtime.defaultTransport)) {
      errors.push(`runtime.defaultTransport must be one of ${[...VALID_TRANSPORTS].join(', ')}, got "${def.runtime.defaultTransport}"`)
    }
  }

  if (def.capabilities && typeof def.capabilities !== 'object') {
    errors.push('capabilities must be an object')
  } else if (def.capabilities) {
    for (const key of REQUIRED_CAPABILITY_KEYS) {
      if (!(key in def.capabilities)) {
        errors.push(`capabilities.${key} is required`)
      } else if (typeof def.capabilities[key] !== 'boolean') {
        errors.push(`capabilities.${key} must be a boolean`)
      }
    }
  }

  if (def.protocol) {
    if (typeof def.protocol.commandVersion !== 'number') {
      errors.push('protocol.commandVersion must be a number')
    }
    if (typeof def.protocol.eventVersion !== 'number') {
      errors.push('protocol.eventVersion must be a number')
    }
    if (!Array.isArray(def.protocol.domains)) {
      errors.push('protocol.domains must be an array')
    } else {
      const validDomains = new Set(Object.values(AgentDomain))
      for (const d of def.protocol.domains) {
        if (!validDomains.has(d)) {
          errors.push(`protocol.domains contains unknown domain: "${d}"`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 批量验证所有注册的 Agent 定义
 * @returns {{ valid: boolean, errors: {key: string, errors: string[]}[] }}
 */
export function validateAllAgentDefinitions() {
  const results = []
  for (const def of AGENT_DEFINITIONS) {
    const { valid, errors } = validateAgentDefinition(def)
    if (!valid) {
      results.push({ key: def.key || '(unknown)', errors })
    }
  }
  return { valid: results.length === 0, errors: results }
}
