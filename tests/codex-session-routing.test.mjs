import assert from 'node:assert/strict'
import { findChatBySessionId } from '../packages/agent/src/components/codeX/utils/sessionRouting.mjs'

const projectAChat = { id: 'chat-a', sessionId: 'sid-a', messages: [] }
const projectBChat = { id: 'chat-b', sessionId: 'sid-b', messages: [] }

const projects = [
  { id: 'proj-a', chats: [projectAChat] },
  { id: 'proj-b', chats: [projectBChat] },
]

const activeTabs = [projectBChat]

const crossProjectMatch = findChatBySessionId({
  sessionId: 'sid-a',
  projects,
  tabs: activeTabs,
})

assert.equal(crossProjectMatch?.tab, projectAChat)
assert.equal(crossProjectMatch?.ownerProject, projects[0])

const activeProjectMatch = findChatBySessionId({
  sessionId: 'sid-b',
  projects,
  tabs: activeTabs,
})

assert.equal(activeProjectMatch?.tab, projectBChat)
assert.equal(activeProjectMatch?.ownerProject, projects[1])

const missingMatch = findChatBySessionId({
  sessionId: 'sid-missing',
  projects,
  tabs: activeTabs,
})

assert.equal(missingMatch, null)

console.log('codex session routing test passed')
