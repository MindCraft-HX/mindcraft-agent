'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createWorkspaceRegistry, MAX_WORKSPACES } = require('../electron/workbench/workspaceRegistry')

function createRegistry(overrides = {}) {
  return createWorkspaceRegistry({
    realpath: p => `real:${p}`,
    now: () => 1000,
    ...overrides,
  })
}

test('registerWorkspace 以规范化 workspaceKey 注册并返回 entry', () => {
  const registry = createRegistry()
  const entry = registry.registerWorkspace({
    cwd: 'D:\\Repo\\Sub\\',
    label: 'My Project',
    source: 'agent-codehub',
  })
  assert.deepEqual(entry, {
    workspaceKey: 'cwd:d:/repo/sub',
    cwd: 'D:\\Repo\\Sub\\',
    realpath: 'real:D:\\Repo\\Sub\\',
    label: 'My Project',
    source: 'agent-codehub',
    registeredAt: 1000,
  })
  assert.equal(registry.isAuthorized('cwd:d:/repo/sub'), true)
  assert.deepEqual(registry.resolveWorkspace('cwd:d:/repo/sub'), entry)
})

test('同一规范化 cwd 的不同写法合并为同一 key（upsert 不重复计数）', () => {
  const registry = createRegistry()
  registry.registerWorkspace({ cwd: 'D:/Repo', label: 'a' })
  registry.registerWorkspace({ cwd: 'd:\\repo\\', label: 'b' })
  assert.equal(registry.listWorkspaces().length, 1)
  assert.equal(registry.resolveWorkspace('cwd:d:/repo').label, 'b')
})

test('无 cwd / 非法 cwd 拒绝注册', () => {
  const registry = createRegistry()
  assert.equal(registry.registerWorkspace({}), null)
  assert.equal(registry.registerWorkspace({ cwd: '' }), null)
  assert.equal(registry.registerWorkspace({ cwd: '   ' }), null)
  assert.equal(registry.registerWorkspace(null), null)
  assert.equal(registry.listWorkspaces().length, 0)
})

test('未注册的 workspaceKey 一律未授权', () => {
  const registry = createRegistry()
  assert.equal(registry.isAuthorized('cwd:d:/nope'), false)
  assert.equal(registry.isAuthorized(''), false)
  assert.equal(registry.isAuthorized(null), false)
  assert.equal(registry.resolveWorkspace('cwd:d:/nope'), null)
})

test('realpath 失败（路径不存在）仍注册，realpath 置空', () => {
  const registry = createRegistry({
    realpath: () => { throw new Error('ENOENT') },
  })
  const entry = registry.registerWorkspace({ cwd: 'D:/ghost' })
  assert.equal(entry.realpath, '')
  assert.equal(registry.isAuthorized('cwd:d:/ghost'), true)
})

test('revokeWorkspace 吊销授权', () => {
  const registry = createRegistry()
  registry.registerWorkspace({ cwd: 'D:/repo' })
  assert.equal(registry.revokeWorkspace('cwd:d:/repo'), true)
  assert.equal(registry.isAuthorized('cwd:d:/repo'), false)
  assert.equal(registry.revokeWorkspace('cwd:d:/repo'), false)
})

test('label/source 字段长度界定', () => {
  const registry = createRegistry()
  const entry = registry.registerWorkspace({
    cwd: 'D:/repo',
    label: 'x'.repeat(300),
    source: 'y'.repeat(200),
  })
  assert.equal(entry.label, '')
  assert.equal(entry.source, 'unknown')
})

test('超过 MAX_WORKSPACES 驱逐最旧注册项', () => {
  const registry = createRegistry()
  for (let i = 0; i < MAX_WORKSPACES + 5; i += 1) {
    registry.registerWorkspace({ cwd: `/ws/${i}` })
  }
  const list = registry.listWorkspaces()
  assert.equal(list.length, MAX_WORKSPACES)
  assert.equal(registry.isAuthorized('cwd:/ws/0'), false)
  assert.equal(registry.isAuthorized('cwd:/ws/4'), false)
  assert.equal(registry.isAuthorized(`cwd:/ws/${MAX_WORKSPACES + 4}`), true)
})

test('resolveWorkspace/listWorkspaces 返回拷贝，外部改动不污染注册表', () => {
  const registry = createRegistry()
  registry.registerWorkspace({ cwd: 'D:/repo', label: 'a' })
  const entry = registry.resolveWorkspace('cwd:d:/repo')
  entry.label = 'mutated'
  assert.equal(registry.resolveWorkspace('cwd:d:/repo').label, 'a')
  const list = registry.listWorkspaces()
  list[0].label = 'mutated'
  assert.equal(registry.resolveWorkspace('cwd:d:/repo').label, 'a')
})
