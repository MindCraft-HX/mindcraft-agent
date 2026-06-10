function getChatTime(chat) {
  const value = chat?.updatedAt || chat?.createdAt
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortChatsByRecency(chats = []) {
  return [...chats].sort((a, b) => getChatTime(b) - getChatTime(a))
}

export function resolveClaudeHistorySelection(projects, restoredActiveProjectId, restoredActiveChatId) {
  const list = Array.isArray(projects) ? projects : []
  if (!list.length) {
    return {
      activeProjectId: null,
      activeChatId: null,
      activeProject: null,
    }
  }

  const activeProject = list.find(project => project?.id === restoredActiveProjectId) || list[list.length - 1] || null
  const sortedChats = sortChatsByRecency(activeProject?.chats || [])
  const restoredChat = sortedChats.find(chat => chat?.id === restoredActiveChatId) || null
  const activeChat = restoredChat || sortedChats[0] || null

  return {
    activeProjectId: activeProject?.id || null,
    activeChatId: activeChat?.id || null,
    activeProject: activeProject ? { ...activeProject, chats: sortedChats } : null,
  }
}
