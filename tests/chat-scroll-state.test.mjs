/**
 * useChatScrollState 单元测试 — T170 Phase 3 (refined)
 *
 * 测试纯逻辑层：不依赖 Vue/DOM，使用 mock element 模拟 scroll 行为。
 * 覆盖：atBottom 保存/恢复、scrollTop clamp、syncLayout 回调。
 * 运行：node --test tests/chat-scroll-state.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { useChatScrollState } = await import('../packages/agent/src/components/agentCommon/composables/useChatScrollState.js')

function mockScrollEl(scrollTop = 0, scrollHeight = 2000, clientHeight = 600) {
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    _lastScrollTo: null,
    scrollTo(opts) {
      this.scrollTop = opts.top
      this._lastScrollTo = opts
    },
  }
}

function makeApi(els) {
  let syncCalled = false
  const api = useChatScrollState({
    getScrollEl: (key) => els[key],
    syncLayout: () => { syncCalled = true },
  })
  api._syncCalled = () => syncCalled
  api._resetSync = () => { syncCalled = false }
  return api
}

describe('useChatScrollState', () => {
  it('restoreScroll scrolls to bottom when no saved state', () => {
    const els = { chat1: mockScrollEl(0) }
    const { restoreScroll } = makeApi(els)
    restoreScroll('chat1')
    assert.ok(els.chat1._lastScrollTo)
    assert.strictEqual(els.chat1._lastScrollTo.top, 999999)
    assert.strictEqual(els.chat1._lastScrollTo.behavior, 'instant')
  })

  it('restoreScroll restores saved scrollTop when not at bottom', () => {
    const els = { chat1: mockScrollEl(500, 2000, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    // 用户在中间位置（距底部 1500px，不是底部）
    els.chat1.scrollTop = 500
    saveScroll('chat1')

    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 500)
    assert.strictEqual(els.chat1._lastScrollTo, null) // 直接设值，不调 scrollTo
  })

  it('restoreScroll scrolls to bottom when saved atBottom=true', () => {
    const els = { chat1: mockScrollEl(1398, 2000, 600) } // scrollTop >= maxScroll - 2 → atBottom
    const { saveScroll, restoreScroll } = makeApi(els)

    els.chat1.scrollTop = 1398
    saveScroll('chat1')

    // 重置位置
    els.chat1.scrollTop = 0

    restoreScroll('chat1')
    // atBottom → should scroll to bottom (scrollTo)
    assert.ok(els.chat1._lastScrollTo)
    assert.strictEqual(els.chat1._lastScrollTo.top, 999999)
  })

  it('restoreScroll clamps scrollTop to max scrollable range', () => {
    const els = { chat1: mockScrollEl(500, 800, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    // 保存时 scrollHeight=2000, scrollTop=500（距底部 1500px，非 atBottom）
    els.chat1.scrollTop = 500
    els.chat1.scrollHeight = 2000
    saveScroll('chat1')

    // 恢复时 scrollHeight 已经缩减到 800（trimMessages 场景）
    els.chat1.scrollHeight = 800
    els.chat1.scrollTop = 0

    restoreScroll('chat1')
    // maxScroll = 800 - 600 = 200 → clamped to 200
    assert.strictEqual(els.chat1.scrollTop, 200)
  })

  it('restoreScroll handles empty container (maxScroll = 0)', () => {
    const els = { chat1: mockScrollEl(50, 600, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    // 保存时在某个位置（非 atBottom：maxScroll=0, scrollTop=50>0 → atBottom via maxScroll<=0）
    // 空的容器 maxScroll=0 时，_calcAtBottom 返回 true（maxScroll <= 0）
    // 所以 atBottom=true → 会滚到底
    els.chat1.scrollTop = 50
    saveScroll('chat1')

    restoreScroll('chat1')
    // atBottom=true → scrollTo(999999) → mock 将 scrollTop 设为 999999
    assert.ok(els.chat1._lastScrollTo)
  })

  it('syncLayout is called after restoreScroll', () => {
    const els = { chat1: mockScrollEl(500, 2000, 600) }
    const { saveScroll, restoreScroll, _syncCalled } = makeApi(els)

    els.chat1.scrollTop = 500
    saveScroll('chat1')

    restoreScroll('chat1')
    assert.strictEqual(_syncCalled(), true)
  })

  it('saveScroll is no-op for missing element', () => {
    const els = {}
    const { saveScroll } = makeApi(els)
    saveScroll('nonexistent')
    // 不应抛出
  })

  it('restoreScroll is no-op for missing element', () => {
    const els = {}
    const { restoreScroll } = makeApi(els)
    restoreScroll('nonexistent')
    // 不应抛出
  })

  it('clearScroll removes saved state', () => {
    const els = { chat1: mockScrollEl(300) }
    const { saveScroll, clearScroll, restoreScroll } = makeApi(els)

    els.chat1.scrollTop = 300
    saveScroll('chat1')
    clearScroll('chat1')

    restoreScroll('chat1')
    assert.ok(els.chat1._lastScrollTo)
    assert.strictEqual(els.chat1._lastScrollTo.top, 999999)
  })

  it('multiple chats maintain independent scroll states', () => {
    const els = { a: mockScrollEl(100, 2000, 600), b: mockScrollEl(200, 2000, 600), c: mockScrollEl(300, 2000, 600) }
    const { saveScroll, restoreScroll, clearScroll } = makeApi(els)

    saveScroll('a')
    saveScroll('b')
    saveScroll('c')

    els.a.scrollTop = 0
    els.b.scrollTop = 0
    els.c.scrollTop = 0

    restoreScroll('a')
    assert.strictEqual(els.a.scrollTop, 100)
    restoreScroll('b')
    assert.strictEqual(els.b.scrollTop, 200)
    restoreScroll('c')
    assert.strictEqual(els.c.scrollTop, 300)

    clearScroll('b')
    els.b.scrollTop = 0
    restoreScroll('b')
    assert.ok(els.b._lastScrollTo)
  })

  it('saveScroll with null/undefined key is no-op', () => {
    const { saveScroll } = makeApi({ chat1: mockScrollEl(100) })
    saveScroll(null)
    saveScroll(undefined)
  })

  it('restoreScroll with null/undefined key is no-op', () => {
    const { restoreScroll } = makeApi({ chat1: mockScrollEl(100) })
    restoreScroll(null)
    restoreScroll(undefined)
  })
})
