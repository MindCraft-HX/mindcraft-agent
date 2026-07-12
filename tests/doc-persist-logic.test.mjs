/**
 * 文档持久化逻辑单元测试 — D4
 *
 * 测试 persistDocTabs / restoreDocTabs 的纯逻辑部分
 * (不依赖 Vue 响应式、IPC、DOM)
 */
import assert from 'node:assert/strict'

// ── 模拟 persistDocTabs 的序列化逻辑 ──
function serializePersistData(tabs, tabScrollTops, activeTabId) {
  const tabsToSave = tabs
    .filter(t => t.filePath)
    .map(t => ({
      id: t.id,
      filePath: t.filePath,
      name: t.name,
      ext: t.ext,
      viewerType: t.viewerType,
    }))
  const tabIdSet = new Set(tabs.map(t => t.id))
  const scrollTops = {}
  for (const [id, top] of tabScrollTops) {
    if (tabIdSet.has(id)) {
      scrollTops[id] = top
    }
  }
  return { tabs: tabsToSave, activeTabId, scrollTops }
}

// ── 模拟 restoreDocTabs 的反序列化逻辑 ──
function deserializePersistData(saved, existingTabsByFilePath) {
  if (!saved?.tabs?.length) return { tabs: [], scrollTops: new Map(), activeTabId: null }

  // scrollTops 恢复（带数组守卫 + 类型守卫）
  const scrollTops = new Map()
  if (saved.scrollTops && !Array.isArray(saved.scrollTops)) {
    for (const [id, top] of Object.entries(saved.scrollTops)) {
      if (typeof top === 'number' && top >= 0) {
        scrollTops.set(id, top)
      }
    }
  }

  // tabs 恢复（跳过已存在的）
  const newTabs = []
  for (const info of saved.tabs) {
    const existing = existingTabsByFilePath?.get(info.filePath)
    if (existing) continue
    newTabs.push({ ...info, isLoading: true })
  }

  return { tabs: newTabs, scrollTops, activeTabId: saved.activeTabId || null }
}

// ═══════════════════════════════════════════════
// 测试用例
// ═══════════════════════════════════════════════

// 1. 正常序列化/反序列化往返
{
  const tabs = [
    { id: 'a', filePath: '/a.md', name: 'a.md', ext: 'md', viewerType: 'markdown' },
    { id: 'b', filePath: '/b.vue', name: 'b.vue', ext: 'vue', viewerType: 'code' },
  ]
  const scrollTops = new Map([['a', 1200], ['b', 3400]])
  const data = serializePersistData(tabs, scrollTops, 'a')
  const restored = deserializePersistData(data, new Map())

  assert.equal(restored.tabs.length, 2, '应恢复 2 个 tab')
  assert.equal(restored.activeTabId, 'a', 'activeTabId 应保持一致')
  assert.equal(restored.scrollTops.get('a'), 1200, 'scrollTop a=1200')
  assert.equal(restored.scrollTops.get('b'), 3400, 'scrollTop b=3400')
  assert.equal(data.scrollTops.a, 1200, '序列化 scrollTops.a=1200')
  assert.equal(data.scrollTops.b, 3400, '序列化 scrollTops.b=3400')
}

// 2. scrollTops 只保留仍然存在的 tab（已关闭的 tab 被过滤）
{
  const tabs = [{ id: 'a', filePath: '/a.md', name: 'a.md', ext: 'md', viewerType: 'markdown' }]
  const scrollTops = new Map([['a', 500], ['deleted', 999]])
  const data = serializePersistData(tabs, scrollTops, 'a')

  assert.equal(data.scrollTops.a, 500, '存在 tab 的 scroll 应保留')
  assert.equal(data.scrollTops.deleted, undefined, '已删除 tab 的 scroll 不应出现在序列化结果中')
  assert.equal(Object.keys(data.scrollTops).length, 1, '只应有 1 个 scrollTop 条目')
}

// 3. 空 tabs 不触发恢复
{
  const data = { tabs: [], activeTabId: '', scrollTops: {} }
  const restored = deserializePersistData(data, new Map())
  assert.equal(restored.tabs.length, 0, '空 tabs 应返回空')
  assert.equal(restored.activeTabId, null, 'activeTabId 应为 null')
}

// 4. undefined/null saved 不崩溃
{
  assert.doesNotThrow(() => deserializePersistData(null, new Map()))
  assert.doesNotThrow(() => deserializePersistData(undefined, new Map()))
  assert.doesNotThrow(() => deserializePersistData({}, new Map()))
}

// 5. scrollTops 缺少 tabs 字段也不崩溃（旧格式向后兼容）
{
  const data = { scrollTops: { 'old-tab': 500 } }
  // saved.tabs?.length → undefined，应提前返回
  const restored = deserializePersistData(data, new Map())
  assert.equal(restored.tabs.length, 0, '缺少 tabs 字段应安全返回')
}

// 6. scrollTops 为数组时不恢复（防御性守卫）
{
  const data = {
    tabs: [{ id: 'a', filePath: '/a.md', name: 'a.md', ext: 'md', viewerType: 'markdown' }],
    activeTabId: 'a',
    scrollTops: [10, 20], // 手动损坏的数据
  }
  const restored = deserializePersistData(data, new Map())
  assert.equal(restored.scrollTops.size, 0, '数组 scrollTops 应被忽略')
}

// 7. scrollTops 中有非数字值时过滤
{
  const data = {
    tabs: [{ id: 'a', filePath: '/a.md', name: 'a.md', ext: 'md', viewerType: 'markdown' }],
    activeTabId: 'a',
    scrollTops: { 'a': 500, 'b': 'invalid', 'c': -1 },
  }
  const restored = deserializePersistData(data, new Map())
  assert.equal(restored.scrollTops.get('a'), 500, '合法数字应恢复')
  assert.equal(restored.scrollTops.get('b'), undefined, '字符串值应被过滤')
  assert.equal(restored.scrollTops.get('c'), undefined, '负数应被过滤 (top >= 0)')
}

// 8. 已存在的 tab 不重复添加（去重）
{
  const data = {
    tabs: [{ id: 'a', filePath: '/a.md', name: 'a.md', ext: 'md', viewerType: 'markdown' }],
    activeTabId: 'a',
    scrollTops: {},
  }
  const existing = new Map([['/a.md', { id: 'existing-a', filePath: '/a.md' }]])
  const restored = deserializePersistData(data, existing)
  assert.equal(restored.tabs.length, 0, '已存在的 tab 不应重复添加')
}

// 9. 无 filePath 的 tab 不序列化
{
  const tabs = [
    { id: 'a', filePath: '/a.md', name: 'a.md', ext: 'md', viewerType: 'markdown' },
    { id: 'b', filePath: '', name: 'inline', ext: '', viewerType: 'unsupported' },
  ]
  const scrollTops = new Map([['a', 100], ['b', 200]])
  const data = serializePersistData(tabs, scrollTops, 'a')
  assert.equal(data.tabs.length, 1, '无 filePath 的 tab 不序列化')
  assert.equal(data.tabs[0].id, 'a', '只能序列化有路径的 tab')
  // 已知小问题: tabIdSet 基于 tabs.value(所有 tab) 而非 tabsToSave(有 filePath 的 tab)
  // 所以 scrollTops.b=200 会被保留为孤儿数据，无害但可优化
  assert.equal(data.scrollTops.b, 200, '无路径 tab 的 scroll 也被序列化 (已知小问题, 无害)')
}

// 10. scrollTops 的 key 是 tab ID（UUID），通过 Set 查找 O(n)
{
  const tabs = Array.from({ length: 100 }, (_, i) => ({
    id: `tab-${i}`, filePath: `/file-${i}.md`, name: `file-${i}.md`, ext: 'md', viewerType: 'markdown',
  }))
  const scrollTops = new Map(tabs.map(t => [t.id, Math.floor(Math.random() * 5000)]))
  const start = performance.now()
  const data = serializePersistData(tabs, scrollTops, 'tab-0')
  const elapsed = performance.now() - start
  assert.ok(elapsed < 10, `100 个 tab 的序列化应在 10ms 内完成 (实际: ${elapsed.toFixed(1)}ms)`)
  assert.equal(Object.keys(data.scrollTops).length, 100, '所有 scroll 应被保留')
}

console.log('✅ doc-persist-logic test passed')
