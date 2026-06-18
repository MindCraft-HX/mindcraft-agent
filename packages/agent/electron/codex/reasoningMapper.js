/**
 * CodeX Chat Completions 协议转换 — 推理参数映射
 *
 * 从 CC SWITCH codex.rs reasoning 部分移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/codex.rs
 *
 * 每个 provider 使用不同的 reasoning 参数格式：
 * - DeepSeek: thinking:{type} + reasoning_effort
 * - Kimi/GLM: thinking:{type}
 * - Qwen: enable_thinking
 * - MiniMax: reasoning_split
 * - OpenRouter: reasoning:{effort}
 */

/**
 * Provider reasoning 配置表
 */
const REASONING_CONFIGS = {
  deepseek: {
    label: 'DeepSeek',
    supportsThinking: true,
    supportsEffort: true,
    thinkingParam: 'thinking',
    effortParam: 'reasoning_effort',
    effortValueMode: 'deepseek',
    outputFormat: 'reasoning_content',
  },
  kimi: {
    label: 'Kimi/Moonshot',
    supportsThinking: true,
    supportsEffort: false,
    thinkingParam: 'thinking',
    effortParam: null,
    outputFormat: 'reasoning_content',
  },
  moonshot: {
    label: 'Moonshot',
    supportsThinking: true,
    supportsEffort: false,
    thinkingParam: 'thinking',
    effortParam: null,
    outputFormat: 'reasoning_content',
  },
  qwen: {
    label: 'Qwen/通义千问',
    supportsThinking: true,
    supportsEffort: false,
    thinkingParam: 'enable_thinking',
    effortParam: null,
    outputFormat: 'reasoning_content',
  },
  glm: {
    label: 'GLM/智谱',
    supportsThinking: true,
    supportsEffort: false,
    thinkingParam: 'thinking',
    effortParam: null,
    outputFormat: 'reasoning_content',
  },
  minimax: {
    label: 'MiniMax',
    supportsThinking: true,
    supportsEffort: false,
    thinkingParam: 'reasoning_split',
    effortParam: null,
    outputFormat: 'inline_think',
  },
  openrouter: {
    label: 'OpenRouter',
    supportsThinking: false,
    supportsEffort: true,
    thinkingParam: null,
    effortParam: 'reasoning.effort',
    effortValueMode: 'openrouter',
    outputFormat: 'reasoning_field',
  },
  siliconflow: {
    label: 'SiliconFlow',
    supportsThinking: true,
    supportsEffort: false,
    thinkingParam: 'thinking',
    effortParam: null,
    outputFormat: 'reasoning_content',
  },
}

/**
 * 根据 model + baseUrl 推断 provider reasoning 配置
 */
function inferReasoningConfig(model, baseUrl) {
  if (!model && !baseUrl) return null

  const haystack = `${model || ''} ${baseUrl || ''}`.toLowerCase()

  // 顺序匹配 (越具体的 provider 越靠前)
  const ordered = Object.entries(REASONING_CONFIGS)
  for (const [keyword, config] of ordered) {
    if (keyword === 'moonshot') {
      // Kimi 和 Moonshot 共享平台，但 model 名不同
      if (haystack.includes('kimi') || haystack.includes('moonshot')) return config
      continue
    }
    if (haystack.includes(keyword)) return config
  }

  return null
}

/**
 * 映射 reasoning_effort 值到 provider 特定格式
 *
 * DeepSeek 模式: max→max, xhigh/high→high, medium/low→(不设置=关闭)
 * OpenRouter 模式: max→xhigh, xhigh→xhigh, high→high, medium→medium, low→low, minimal→minimal
 * 默认模式: passthrough
 */
function mapReasoningEffort(effort, mode) {
  if (!effort) return null

  const e = String(effort).toLowerCase().trim()

  if (mode === 'deepseek') {
    switch (e) {
      case 'max': return 'max'
      case 'xhigh':
      case 'high': return 'high'
      default: return null
    }
  }

  if (mode === 'openrouter') {
    switch (e) {
      case 'max':
      case 'xhigh': return 'xhigh'
      case 'high': return 'high'
      case 'medium': return 'medium'
      case 'low': return 'low'
      case 'minimal': return 'minimal'
      default: return e
    }
  }

  // 默认: passthrough (minimal/low/medium/high/xhigh/max)
  return e
}

/**
 * 将 reasoning 参数应用到 Chat Completions 请求体
 *
 * @param {object} chatBody - Chat Completions 请求体 (会被修改)
 * @param {string} reasoningEffort - 推理强度 (可选)
 * @param {object} reasoningConfig - 从 inferReasoningConfig 获取的配置
 */
function applyReasoningToChatBody(chatBody, reasoningEffort, reasoningConfig) {
  if (!reasoningConfig) return

  const { supportsThinking, supportsEffort, thinkingParam, effortParam, effortValueMode } = reasoningConfig

  const effort = String(reasoningEffort || '').trim()
  const enabled = !!effort && effort !== 'none'

  // 应用 thinking 开关
  if (supportsThinking && thinkingParam) {
    switch (thinkingParam) {
      case 'thinking':
        chatBody.thinking = { type: enabled ? 'enabled' : 'disabled' }
        break
      case 'enable_thinking':
        chatBody.enable_thinking = enabled
        break
      case 'reasoning_split':
        chatBody.reasoning_split = enabled
        break
    }
  }

  // 应用 effort 值
  if (supportsEffort && effortParam && enabled) {
    const mapped = mapReasoningEffort(effort, effortValueMode)
    if (mapped) {
      if (effortParam.includes('.')) {
        // 嵌套参数如 reasoning.effort
        const parts = effortParam.split('.')
        let target = chatBody
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {}
          target = target[parts[i]]
        }
        target[parts[parts.length - 1]] = mapped
      } else {
        chatBody[effortParam] = mapped
      }
    }
  }
}

module.exports = {
  REASONING_CONFIGS,
  inferReasoningConfig,
  mapReasoningEffort,
  applyReasoningToChatBody,
}
