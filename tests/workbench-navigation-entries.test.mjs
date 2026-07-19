// Contract: Home 卡片与侧栏入口统一走 typed navigation intent（设计 4.4）。
// - Home.vue / Main.vue 侧栏不再直接 router.push 到 workbench 业务面
// - Home.vue 不再写 mindcraft_agent_chat_target_session（写入端已删除）
// - ChatView 从路由 query 消费 sessionId，localStorage key 仅迁移期读一次

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const homeSource = fs.readFileSync(path.join(root, 'src/views/Home.vue'), 'utf8')
const mainSource = fs.readFileSync(path.join(root, 'src/Main.vue'), 'utf8')
const chatViewSource = fs.readFileSync(path.join(root, 'packages/agent/src/views/ChatView.vue'), 'utf8')

test('Home entries dispatch typed intents instead of raw router.push', () => {
  assert.ok(homeSource.includes('createLegacyNavigationAdapter'), 'Home must build intents via the navigation adapter')
  assert.ok(homeSource.includes("type: 'focus-chat'"), 'chat entries must dispatch focus-chat intents')
  assert.ok(homeSource.includes("type: 'focus-agent'"), 'project entries must dispatch focus-agent intents')
  assert.ok(homeSource.includes("type: 'open-document'"), 'docs entry must dispatch an open-document intent')
  assert.ok(homeSource.includes("source: 'home'"), 'Home intents must be labeled with the home source')
  assert.ok(homeSource.includes('chatTarget: { sessionId: chat.id }'), 'openChat must carry the sessionId in the intent')
  assert.ok(!homeSource.includes("router.push('/main/codeHub')"), 'no raw codeHub push remains')
  assert.ok(!homeSource.includes("router.push('/main/mdViewer')"), 'no raw mdViewer push remains')
  assert.ok(!homeSource.includes("router.push('/main/chat')"), 'no raw chat push remains')
})

test('Home no longer writes the legacy chat target session key', () => {
  assert.ok(
    !homeSource.includes("localStorage.setItem('mindcraft_agent_chat_target_session'"),
    'the localStorage write side must be deleted (migration read stays in ChatView)',
  )
})

test('sidebar entries dispatch typed intents with the sidebar source', () => {
  assert.ok(mainSource.includes("source: 'sidebar'"), 'sidebar intents must be labeled with the sidebar source')
  assert.ok(mainSource.includes('openAgentHub'), 'project nav item must dispatch a focus-agent intent')
  assert.ok(mainSource.includes('openChatHome'), 'chat nav item must dispatch a focus-chat intent')
  assert.ok(!mainSource.includes("$router.push('/main/codeHub')"), 'no raw sidebar codeHub push remains')
  assert.ok(!mainSource.includes("$router.push('/main/chat')"), 'no raw sidebar chat push remains')
  assert.ok(!mainSource.includes("router.push('/main/mdViewer')"), 'openMdBrowser must not push directly')
})

test('ChatView consumes sessionId from the route query and keeps the migration read', () => {
  assert.ok(chatViewSource.includes('route.query?.sessionId'), 'ChatView must read the target session from the route query')
  assert.ok(
    chatViewSource.includes("localStorage.getItem('mindcraft_agent_chat_target_session')"),
    'legacy key stays as a one-shot migration fallback',
  )
  assert.ok(
    chatViewSource.includes("localStorage.removeItem('mindcraft_agent_chat_target_session')"),
    'migration fallback must clear the legacy key after reading',
  )
  // keep-alive 缓存下靠 watch 处理再次进入
  assert.ok(chatViewSource.includes('watch(routeTargetSessionId'), 'ChatView must watch query sessionId for keep-alive re-entry')
})
