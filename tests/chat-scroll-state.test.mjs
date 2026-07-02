/**
 * useChatScrollState 单元测试 — T170 Phase 3 (refined v2)
 *
 * 测试纯逻辑层：不依赖 Vue/DOM，使用 mock element 模拟 scroll 行为。
 * 覆盖：atBottom 保存/恢复（200px 阈值与 useScrollBottom 对齐）、
 *       scrollTop clamp、真实 maxScroll（替换魔法数 999999）、syncLayout 回调。
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

function makeApi(els, opts) {
  let syncCalled = false
  const api = useChatScrollState({
    getScrollEl: (key) => els[key],
    syncLayout: () => { syncCalled = true },
    ...opts,
  })
  api._syncCalled = () => syncCalled
  api._resetSync = () => { syncCalled = false }
  return api
}

describe('useChatScrollState', () => {
  it('restoreScroll scrolls to bottom when no saved state (real maxScroll)', () => {
    const els = { chat1: mockScrollEl(0) }
    const { restoreScroll } = makeApi(els)
    restoreScroll('chat1')
    // 不再用魔法数 999999，而是真正的 maxScroll = scrollHeight - clientHeight
    assert.strictEqual(els.chat1.scrollTop, 1400) // 2000 - 600
    assert.strictEqual(els.chat1._lastScrollTo, null) // 直接设值，不调 scrollTo
  })

  it('restoreScroll restores saved scrollTop when not at bottom (threshold=200)', () => {
    const els = { chat1: mockScrollEl(500, 2000, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    // 用户在中间位置（距底部 900px > threshold 200，非 atBottom）
    els.chat1.scrollTop = 500
    saveScroll('chat1')

    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 500)
    assert.strictEqual(els.chat1._lastScrollTo, null) // 直接设值，不调 scrollTo
  })

  it('restoreScroll scrolls to bottom when saved atBottom=true (threshold=200)', () => {
    // maxScroll = 2000-600 = 1400, scrollTop=1300 → 1300 >= 1400-200=1200 → atBottom=true
    const els = { chat1: mockScrollEl(1300, 2000, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    els.chat1.scrollTop = 1300
    saveScroll('chat1')

    // 重置位置
    els.chat1.scrollTop = 0

    restoreScroll('chat1')
    // atBottom → 滚到真实 maxScroll
    assert.strictEqual(els.chat1.scrollTop, 1400)
    assert.strictEqual(els.chat1._lastScrollTo, null)
  })

  it('atBottom threshold aligns with useScrollBottom default (200px)', () => {
    // scrollHeight=2000, clientHeight=600 → maxScroll=1400
    const els = { chat1: mockScrollEl(0, 2000, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    // 距底部 50px → 应记 atBottom
    els.chat1.scrollTop = 1350
    saveScroll('chat1')
    els.chat1.scrollTop = 0
    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 1400, '1350 (50px from bottom) → atBottom')

    // 距底部 200px（边界）→ 应记 atBottom
    els.chat1.scrollTop = 1200
    saveScroll('chat1')
    els.chat1.scrollTop = 0
    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 1400, '1200 (200px from bottom) → atBottom')

    // 距底部 250px → 应记非 atBottom
    els.chat1.scrollTop = 1150
    saveScroll('chat1')
    els.chat1.scrollTop = 0
    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 1150, '1150 (250px from bottom) → not atBottom')
  })

  it('restoreScroll clamps scrollTop to max scrollable range', () => {
    const els = { chat1: mockScrollEl(500, 800, 600) }
    const { saveScroll, restoreScroll } = makeApi(els)

    // 保存时 scrollHeight=2000, scrollTop=500（距底部 900px > 200，非 atBottom）
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

    // 空的容器 maxScroll=0 时，_calcAtBottom 返回 true（maxScroll <= 0）
    // 所以 atBottom=true → scrollTop 设为 maxScroll = 0
    els.chat1.scrollTop = 50
    saveScroll('chat1')

    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 0)
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
    // 无保存 → atBottom 路径 → 真实 maxScroll
    assert.strictEqual(els.chat1.scrollTop, 1400)
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
    // 无保存 → atBottom → 真实 maxScroll
    assert.strictEqual(els.b.scrollTop, 1400)
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

  it('custom threshold is respected', () => {
    const els = { chat1: mockScrollEl(0, 2000, 600) }
    const { saveScroll, restoreScroll } = makeApi(els, { threshold: 500 })

    // maxScroll=1400, threshold=500 → atBottom when scrollTop >= 900
    // scrollTop=1000 >= 900 → atBottom=true
    els.chat1.scrollTop = 1000
    saveScroll('chat1')
    els.chat1.scrollTop = 0
    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 1400, '1000 >= 900 → atBottom with threshold=500')

    // scrollTop=800 < 900 → atBottom=false
    els.chat1.scrollTop = 800
    saveScroll('chat1')
    els.chat1.scrollTop = 0
    restoreScroll('chat1')
    assert.strictEqual(els.chat1.scrollTop, 800, '800 < 900 → not atBottom with threshold=500')
  })

  it('very tall session reaches real bottom', () => {
    // 模拟几十 MB session：scrollHeight 远超 999999
    const els = { chat1: mockScrollEl(0, 5000000, 600) }
    const { restoreScroll } = makeApi(els)

    restoreScroll('chat1')
    // 不再被 999999 截断
    assert.strictEqual(els.chat1.scrollTop, 5000000 - 600) // 4,999,400
  })
})
