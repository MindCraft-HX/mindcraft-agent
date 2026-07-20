import { findChatBySessionId } from './sessionRouting.mjs'

export function resolveQueuedInputFlushTarget({
  payload = {},
  projects = [],
  activeProject = null,
} = {}) {
  const sid = payload?.sessionId
  if (!sid) return null

  const match = findChatBySessionId({
    sessionId: sid,
    projects,
    tabs: activeProject?.chats || [],
  })
  const tab = match?.tab
  if (!tab?._queuedInput) return null

  const ownerProject = match?.ownerProject
    || projects.find((project) => (project?.chats || []).some((chat) => chat.sessionId === sid))
    || null

  return {
    sessionId: sid,
    text: tab._queuedInput,
    tab,
    ownerProject,
  }
}

export function canFlushQueuedInputTarget(target = {}) {
  return Boolean(target?.tab && typeof target?.text === 'string' && target.text.trim())
}

export function shouldQueueRejectedCodexInput(result = {}) {
  const reason = String(result?.reason || '')
  return reason === 'session_already_running' || reason === 'session_close_timeout'
}
