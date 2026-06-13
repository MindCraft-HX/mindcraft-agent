/**
 * Agent 注册表 — 纯数据定义
 *
 * 此文件不包含任何 Vue 导入，可被 router、test、preload 等任意模块安全引用。
 * 组件引用在 agentRegistryComponents.js 中单独管理。
 */

export const AGENT_DEFINITIONS = [
  {
    key: 'claudeCode',
    name: 'Claude Code',
    iconClass: 'mindcraft-flow-win-iconfont icon-mindcraft-claude1',
    iconStyle: { color: '#D97757' },
    description: 'Anthropic 出品的编程智能体，支持代码编写、调试和重构',
    descriptionKey: 'agent.claudeDesc',
    routeAlias: 'claudeCode',
    capabilities: { tools: true, images: true, webSearch: false },
  },
  {
    key: 'codex',
    name: 'GPT Codex',
    iconClass: 'icon iconfont icon-ChatGPT',
    iconStyle: { fontSize: '18px', color: '#74AA9C' },
    description: 'OpenAI 编程智能体，支持多种语言代码生成和调试',
    descriptionKey: 'agent.codexDesc',
    routeAlias: 'codex',
    capabilities: { tools: true, images: true, webSearch: true },
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
