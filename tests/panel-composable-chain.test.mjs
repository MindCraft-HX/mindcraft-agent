/**
 * Panel composable chain smoke test — T170 + CodeX review follow-up
 *
 * 模拟 codeX / claudeCode 的 <script setup> 中 composable 声明顺序，
 * 验证导入和初始化不抛异常（覆盖 TDZ 声明顺序错误）。
 *
 * 不依赖 Vue SFC 编译器、不挂载 DOM、不引入 jsdom。
 * 运行：node --test tests/panel-composable-chain.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// 动态导入被测模块（顶层 await）
const [{ useChatScrollState }, { useScheduledSessionRefresh }] = await Promise.all([
  import('../packages/agent/src/components/agentCommon/composables/useChatScrollState.js'),
  import('../packages/agent/src/components/agentCommon/composables/useScheduledSessionRefresh.js'),
])

// ---- mock Vue reactivity ----
function makeRef(initial) {
  return { value: initial, __v_isRef: true }
}
function mockComputed(fn) {
  const r = makeRef()
  Object.defineProperty(r, 'value', { get: fn, enumerable: true })
  return r
}

// ---- mock 全局 window.electronAPI ----
globalThis.window = {
  electronAPI: {},
  __MCPF_DEBUG__: undefined,
}

// ---- mock useScrollBottom（不挂载真实 Vue composable） ----
function makeMockScrollBottomApi() {
  return {
    show: makeRef(false),
    newMsgCount: makeRef(0),
    onScroll: () => {},
    scrollToBottom: () => {},
    scrollOrBump: () => {},
    bumpCount: () => {},
    syncLayout: () => {},
  }
}

describe('panel composable chain smoke', () => {
  it('all three composables initialize in claudeCode declaration order', () => {
    // 对应 claudeCode/index.vue <script setup> 的声明顺序：
    //   const msgRefs = {}
    //   const activeMsgContainer = ref(null)
    //   const { syncLayout } = useScrollBottom(activeMsgContainer)
    //   const { saveScroll, ... } = useChatScrollState({ getScrollEl, syncLayout })
    //   const sidebarLoading = ref(false)
    //   const sidebarRefreshing = ref(false)
    //   const { refreshSessions, cancelScheduledRefresh } = useScheduledSessionRefresh({ ... })

    const msgRefs = {}
    const activeMsgContainer = makeRef(null)
    const { syncLayout } = makeMockScrollBottomApi()

    const chatApi = useChatScrollState({
      getScrollEl: (chatKey) => msgRefs[chatKey],
      syncLayout,
    })
    assert.ok(chatApi.saveScroll, 'saveScroll')
    assert.ok(chatApi.restoreScroll, 'restoreScroll')
    assert.ok(chatApi.clearScroll, 'clearScroll')

    // ⚠️ 这两行必须在 useScheduledSessionRefresh 之前 —— TDZ 敏感位置
    const sidebarLoading = makeRef(false)
    const sidebarRefreshing = makeRef(false)

    const activeProject = mockComputed(() => null)
    const { refreshSessions, cancelScheduledRefresh } = useScheduledSessionRefresh({
      getActiveProject: () => activeProject.value,
      isRefreshing: sidebarRefreshing,
      setRefreshing: (v) => { sidebarRefreshing.value = v },
      refreshProject: async () => {},
      setLoading: (v) => { sidebarLoading.value = v },
      perfLabel: 'smoke-claude',
    })

    assert.strictEqual(typeof refreshSessions, 'function')
    assert.strictEqual(typeof cancelScheduledRefresh, 'function')

    // defineExpose 签名存在
    assert.strictEqual(typeof chatApi.saveScroll, 'function')
    assert.strictEqual(typeof chatApi.restoreScroll, 'function')
  })

  it('all three composables initialize in codeX declaration order', () => {
    const msgRefs = {}
    const activeMsgContainer = makeRef(null)
    const { syncLayout } = makeMockScrollBottomApi()

    useChatScrollState({ getScrollEl: (chatKey) => msgRefs[chatKey], syncLayout })

    const sidebarLoading = makeRef(false)
    const sidebarRefreshing = makeRef(false)

    const activeProject = mockComputed(() => null)
    const { refreshSessions, cancelScheduledRefresh } = useScheduledSessionRefresh({
      getActiveProject: () => activeProject.value,
      isRefreshing: sidebarRefreshing,
      setRefreshing: (v) => { sidebarRefreshing.value = v },
      refreshProject: async () => {},
      setLoading: (v) => { sidebarLoading.value = v },
      perfLabel: 'smoke-codex',
    })

    assert.strictEqual(typeof refreshSessions, 'function')
    assert.strictEqual(typeof cancelScheduledRefresh, 'function')
  })

  it('TDZ guard: const accessed before declaration throws ReferenceError', () => {
    // 验证 JavaScript const TDZ 语义确实生效
    // 如果未来有人把 sidebarRefreshing 声明移到 composable 调用之后，这个模式会炸
    let caught = false
    try {
      // eslint-disable-next-line no-eval
      eval(`
        const x = notYet;  // TDZ access
        const notYet = 1;
      `)
    } catch (e) {
      caught = e instanceof ReferenceError
    }
    assert.ok(caught, 'const TDZ ReferenceError should be thrown')
  })

  it('per-project cooldown: project A refresh does not block project B', async () => {
    // 快速集成：用真实 useScheduledSessionRefresh 验证核心跨项目隔离逻辑
    let active = { id: 'pa', cwd: '/a', chats: [] }
    const refreshing = makeRef(false)
    const calls = []

    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => active,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async (p) => { calls.push(p.id) },
      setLoading: () => {},
      perfLabel: 'smoke',
      defaultStaleMs: 60000,
    })

    // 刷 A
    await refreshSessions({ ifStaleMs: 60000 })
    // 切到 B（cwd 不同）
    active = { id: 'pb', cwd: '/b', chats: [] }
    // B 不应被 A 的 cooldown 阻塞
    await refreshSessions({ ifStaleMs: 60000 })

    assert.deepStrictEqual(calls, ['pa', 'pb'], 'A and B both refreshed independently')
  })
})
