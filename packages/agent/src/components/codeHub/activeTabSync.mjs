export function resolveCodeHubSyncedTabId({
  tabs,
  agentType,
  activeProjectId,
  currentActiveTabId,
}) {
  if (!agentType || !activeProjectId) return currentActiveTabId || null

  const targetId = `${agentType}:${activeProjectId}`
  const exists = (Array.isArray(tabs) ? tabs : []).some(tab => tab?.id === targetId)
  return exists ? targetId : (currentActiveTabId || null)
}
