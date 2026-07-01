export function shouldAutoShowAgentPicker({
  tabs = [],
  savedTabId = '',
  requestedAgent = '',
  requestedProjectId = '',
  tabOrder = [],
} = {}) {
  if (Array.isArray(tabs) && tabs.length > 0) return false
  if (typeof savedTabId === 'string' && savedTabId) return false
  if (typeof requestedAgent === 'string' && requestedAgent) return false
  if (requestedProjectId != null && String(requestedProjectId)) return false
  if (Array.isArray(tabOrder) && tabOrder.some(id => typeof id === 'string' && id)) return false
  return true
}
