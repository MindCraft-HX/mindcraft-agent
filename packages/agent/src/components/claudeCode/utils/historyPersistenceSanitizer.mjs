import {
  getClaudeChatBindingKey,
  getClaudeSessionFilePath,
  usesLegacyCliSessionAsChatKey,
} from './claudeSessionIdentity.mjs'

function toTime(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function scoreBoundChat(chat) {
  let score = 0
  // Older restored chats may have used the CLI UUID as renderer sessionId.
  // Prefer those entries when deduping with placeholder renderer keys.
  if (usesLegacyCliSessionAsChatKey(chat)) score += 1000000000000000
  if (getClaudeSessionFilePath(chat)) score += 1000000000000
  if (chat?.cliSessionId) score += 1000000000
  score += Number(chat?.fileSize || 0)
  score += toTime(chat?.updatedAt || chat?.createdAt)
  return score
}

function dedupeProjectChats(chats = []) {
  const output = []
  const boundIndexByKey = new Map()

  for (const chat of Array.isArray(chats) ? chats : []) {
    const key = getClaudeChatBindingKey(chat)
    if (!key) {
      output.push(chat)
      continue
    }

    const existingIndex = boundIndexByKey.get(key)
    if (existingIndex == null) {
      boundIndexByKey.set(key, output.length)
      output.push(chat)
      continue
    }

    const existing = output[existingIndex]
    if (scoreBoundChat(chat) > scoreBoundChat(existing)) {
      output[existingIndex] = chat
    }
  }

  return output
}

function pickActiveSelection(projects, activeProjectId, activeChatId) {
  const list = Array.isArray(projects) ? projects : []
  if (!list.length) return { activeProjectId: null, activeChatId: null }

  const project = list.find(p => p?.id === activeProjectId)
    || [...list].reverse().find(p => Array.isArray(p?.chats) && p.chats.length)
    || list[list.length - 1]
    || null
  if (!project) return { activeProjectId: null, activeChatId: null }

  const chats = Array.isArray(project.chats) ? project.chats : []
  const chat = chats.find(c => c?.id === activeChatId)
    || [...chats].sort((a, b) => toTime(b?.updatedAt || b?.createdAt) - toTime(a?.updatedAt || a?.createdAt))[0]
    || null

  return {
    activeProjectId: project.id || null,
    activeChatId: chat?.id || null,
  }
}

export function sanitizeClaudeProjectsForPersistence({
  activeProjectId = null,
  activeChatId = null,
  projects = [],
  mapChat = chat => chat,
} = {}) {
  const sanitizedProjects = (Array.isArray(projects) ? projects : []).map(project => ({
    ...project,
    chats: dedupeProjectChats(project?.chats).map(mapChat),
  }))
  const selection = pickActiveSelection(sanitizedProjects, activeProjectId, activeChatId)

  return {
    activeProjectId: selection.activeProjectId,
    activeChatId: selection.activeChatId,
    projects: sanitizedProjects,
  }
}

export function buildClaudePanelStatePayload({
  lastCwd = '',
  activeProjectId = null,
  activeChatId = null,
  projects = [],
  mapChat = chat => chat,
} = {}) {
  const sanitized = sanitizeClaudeProjectsForPersistence({
    activeProjectId,
    activeChatId,
    projects,
    mapChat,
  })

  return {
    lastCwd,
    activeProjectId: sanitized.activeProjectId,
    activeChatId: sanitized.activeChatId,
    projects: sanitized.projects,
  }
}
