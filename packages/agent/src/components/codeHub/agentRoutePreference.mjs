import { agentRegistryMap } from '../../registry/agentRegistry.js'

export function normalizeRequestedAgent(value) {
  const raw = Array.isArray(value) ? value[0] : value
  const agent = String(raw || '')
  return agentRegistryMap.has(agent) ? agent : ''
}

export function pickInitialCodeHubTab({ tabs = [], savedTabId = '', requestedAgent = '' } = {}) {
  const agent = normalizeRequestedAgent(requestedAgent)
  const saved = tabs.find(t => t.id === savedTabId)
  if (saved) return saved
  if (agent) {
    const agentTabs = tabs.filter(t => t.agentType === agent)
    if (agentTabs.length) return agentTabs[agentTabs.length - 1]
  }
  return tabs[tabs.length - 1] || null
}
