export function findChatBySessionId({ sessionId, projects = [], tabs = [] } = {}) {
  if (!sessionId) return null

  for (const project of Array.isArray(projects) ? projects : []) {
    const chats = Array.isArray(project?.chats) ? project.chats : []
    const tab = chats.find(chat => chat?.sessionId === sessionId)
    if (tab) return { tab, ownerProject: project }
  }

  const fallbackTab = (Array.isArray(tabs) ? tabs : []).find(tab => tab?.sessionId === sessionId)
  if (fallbackTab) return { tab: fallbackTab, ownerProject: null }

  return null
}
