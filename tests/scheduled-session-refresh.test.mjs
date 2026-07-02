/**
 * useScheduledSessionRefresh 单元测试 — T170 CodeX review follow-up
 *
 * 测试纯逻辑层：cooldown、per-project 隔离、defer 去重、force 绕过、
 * isRefreshing 守卫、silent 模式、错误恢复、cancelScheduledRefresh。
 *
 * 不依赖 Vue/DOM/Electron；所有注入回调均为 mock。
 * 运行：node --test tests/scheduled-session-refresh.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

const { useScheduledSessionRefresh } = await import('../packages/agent/src/components/agentCommon/composables/useScheduledSessionRefresh.js')

/** 简易 ref mock */
function makeRef(initial) {
  return { value: initial }
}

/** 简易 project mock */
function mkProject(id = 'p1', cwd = '/test/project', chats = []) {
  return { id, cwd, chats }
}

describe('useScheduledSessionRefresh', () => {
  it('refreshSessions calls refreshProject and records cooldown', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const refreshCalls = []
    const loadingCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: (v) => { refreshing.value = v },
      refreshProject: async (p) => { refreshCalls.push(p.id) },
      setLoading: (v) => { loadingCalls.push(v) },
      perfLabel: 'test',
    })

    await refreshSessions({ reason: 'test', ifStaleMs: 0 })

    assert.deepStrictEqual(refreshCalls, ['p1'])
    assert.strictEqual(refreshing.value, false)
    // loading 不应被调（project 没有 chats，默认非 silent → 应调 setLoading）
    assert.ok(loadingCalls.includes(true))
    assert.ok(loadingCalls.includes(false))
  })

  it('cooldown blocks same project within ifStaleMs', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const refreshCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async (p) => { refreshCalls.push(p.id) },
      setLoading: () => {},
      perfLabel: 'test',
      defaultStaleMs: 60000, // 60s cooldown
    })

    await refreshSessions({ ifStaleMs: 60000 })
    assert.strictEqual(refreshCalls.length, 1)

    // 同一 project，15s 后仍在 cooldown 内 → 应跳过
    await refreshSessions({ ifStaleMs: 60000 })
    assert.strictEqual(refreshCalls.length, 1, 'second call blocked by cooldown')
  })

  it('different projects have independent cooldowns', async () => {
    const projA = mkProject('pa')
    const projB = mkProject('pb', '/test/project-b')
    let active = projA
    const refreshing = makeRef(false)
    const refreshCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => active,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async (p) => { refreshCalls.push(p.id) },
      setLoading: () => {},
      perfLabel: 'test',
      defaultStaleMs: 60000,
    })

    // 刷新 A
    await refreshSessions({ ifStaleMs: 60000 })
    assert.deepStrictEqual(refreshCalls, ['pa'])

    // 切换到 B 再刷新 → B 有自己的 cooldown，不应被 A 阻塞
    active = projB
    await refreshSessions({ ifStaleMs: 60000 })
    assert.deepStrictEqual(refreshCalls, ['pa', 'pb'])
  })

  it('force bypasses cooldown', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const refreshCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async (p) => { refreshCalls.push(p.id) },
      setLoading: () => {},
      perfLabel: 'test',
      defaultStaleMs: 60000,
    })

    await refreshSessions({ ifStaleMs: 60000 })
    assert.strictEqual(refreshCalls.length, 1)

    // force: true 应绕过 cooldown
    await refreshSessions({ force: true, ifStaleMs: 60000 })
    assert.strictEqual(refreshCalls.length, 2)
  })

  it('defer only keeps the last scheduled refresh', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const refreshCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async (p) => { refreshCalls.push(p.id) },
      setLoading: () => {},
      perfLabel: 'test',
    })

    // 快速连续三次 defer（模拟快速切 tab）
    void refreshSessions({ reason: 'first', deferMs: 30, ifStaleMs: 0 })
    void refreshSessions({ reason: 'second', deferMs: 30, ifStaleMs: 0 })
    void refreshSessions({ reason: 'third', deferMs: 30, ifStaleMs: 0 })

    // 等待足够时间让最后一次执行完毕
    await setTimeout(80)

    // 只有最后一次真正执行了刷新
    assert.strictEqual(refreshCalls.length, 1, 'only last deferred refresh executes')
  })

  it('cancelScheduledRefresh cancels pending deferred refresh', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const refreshCalls = []
    const { refreshSessions, cancelScheduledRefresh } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async (p) => { refreshCalls.push(p.id) },
      setLoading: () => {},
      perfLabel: 'test',
    })

    void refreshSessions({ deferMs: 30, ifStaleMs: 0 })
    cancelScheduledRefresh()

    await setTimeout(60)
    assert.strictEqual(refreshCalls.length, 0, 'cancelled defer should not execute')
  })

  it('isRefreshing guard drops concurrent requests', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const refreshCalls = []
    let resolveFirst = null
    const firstDone = new Promise(r => { resolveFirst = r })

    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: (v) => { refreshing.value = v },
      refreshProject: async (p) => {
        refreshCalls.push(p.id)
        await firstDone // 挂起第一次刷新，让第二次来
      },
      setLoading: () => {},
      perfLabel: 'test',
    })

    // 发起第一次（会挂起在 refreshProject 中）
    const first = refreshSessions({ ifStaleMs: 0 })
    // 第一次已经 setRefreshing(true)，此时 isRefreshing.value === true
    await refreshSessions({ ifStaleMs: 0 })

    resolveFirst()
    await first

    assert.strictEqual(refreshCalls.length, 1, 'concurrent request dropped by isRefreshing guard')
  })

  it('null active project returns early', async () => {
    const refreshing = makeRef(false)
    const loadingCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => null,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async () => { throw new Error('should not be called') },
      setLoading: (v) => { loadingCalls.push(v) },
      perfLabel: 'test',
    })

    await refreshSessions({ ifStaleMs: 0 })
    // 不应抛异常，不应调 setLoading
    assert.strictEqual(refreshing.value, false)
    assert.strictEqual(loadingCalls.length, 0)
  })

  it('project without cwd returns early', async () => {
    const proj = mkProject('p1', null) // no cwd
    const refreshing = makeRef(false)
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async () => { throw new Error('should not be called') },
      setLoading: () => {},
      perfLabel: 'test',
    })

    await refreshSessions({ ifStaleMs: 0 })
    assert.strictEqual(refreshing.value, false)
  })

  it('silent flag skips setLoading calls', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const loadingCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: (v) => { refreshing.value = v },
      refreshProject: async () => {},
      setLoading: (v) => { loadingCalls.push(v) },
      perfLabel: 'test',
    })

    await refreshSessions({ silent: true, ifStaleMs: 0 })
    assert.strictEqual(loadingCalls.length, 0, 'silent should not call setLoading')
    assert.strictEqual(refreshing.value, false)
  })

  it('refreshProject error still resets refreshing and loading', async () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const loadingCalls = []
    const { refreshSessions } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: (v) => { refreshing.value = v },
      refreshProject: async () => { throw new Error('scan failed') },
      setLoading: (v) => { loadingCalls.push(v) },
      perfLabel: 'test',
    })

    await refreshSessions({ ifStaleMs: 0 })

    assert.strictEqual(refreshing.value, false, 'refreshing should be reset after error')
    assert.ok(loadingCalls.includes(false), 'loading should be set to false in finally')
  })

  it('cancelScheduledRefresh with no pending timer is a safe no-op', () => {
    const proj = mkProject()
    const refreshing = makeRef(false)
    const { cancelScheduledRefresh } = useScheduledSessionRefresh({
      getActiveProject: () => proj,
      isRefreshing: refreshing,
      setRefreshing: () => {},
      refreshProject: async () => {},
      setLoading: () => {},
      perfLabel: 'test',
    })

    // 不应抛异常
    cancelScheduledRefresh()
    cancelScheduledRefresh() // 连续两次
  })
})
