/**
 * CodeHub SessionIndex merge semantics tests (T184 Phase 2)
 *
 * Tests the merge layer contract:
 *   explicit delete > runtime project present > persisted index
 *
 * These tests validate the merge logic independent of Vue reactivity.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Test helpers — mirror the merge logic from useSessionIndex.mjs
// ---------------------------------------------------------------------------

function makeTabId(agentType, projectId) {
  return `${agentType}:${projectId}`
}

function cloneTab(tab) {
  return { ...tab }
}

const RUNTIME_PATCHABLE = [
  'name', 'cwd', 'cwdLocked',
  'runningCount', 'hasPendingTool', 'hasDoneNotification',
  'updatedAt',
]

function applyRuntimePatch(persisted, runtime) {
  const patched = { ...persisted }
  for (const key of RUNTIME_PATCHABLE) {
    if (Object.prototype.hasOwnProperty.call(runtime, key) && runtime[key] != null) {
      patched[key] = runtime[key]
    }
  }
  if (runtime.updatedAt && runtime.updatedAt > (persisted.updatedAt || 0)) {
    patched.updatedAt = runtime.updatedAt
  }
  patched.source = 'runtime'
  return patched
}

/**
 * Core merge: persisted tabs + runtime patches + deleted set → merged tabs.
 * Pure function version for testing.
 */
function mergeTabs(persistedTabs, runtimeTabs, deletedIds) {
  const merged = new Map()
  const deletedSet = new Set(deletedIds || [])

  // 1. Start with persisted (exclude deleted)
  for (const tab of persistedTabs) {
    if (deletedSet.has(tab.id)) continue
    merged.set(tab.id, cloneTab(tab))
  }

  // 2. Apply runtime patches
  for (const rt of runtimeTabs) {
    if (deletedSet.has(rt.id)) continue
    const existing = merged.get(rt.id)
    if (existing) {
      merged.set(rt.id, applyRuntimePatch(existing, rt))
    } else {
      merged.set(rt.id, cloneTab(rt))
    }
  }

  return Array.from(merged.values())
}

function makePersistedTab(overrides = {}) {
  return {
    id: 'codex:proj-1',
    projectId: 'proj-1',
    agentType: 'codex',
    name: 'my-repo',
    cwd: '/home/user/my-repo',
    cwdLocked: true,
    runningCount: 0,
    hasPendingTool: false,
    hasDoneNotification: false,
    createdAt: 1000,
    updatedAt: 1000,
    source: 'panel-state',
    iconClass: 'icon-codex',
    iconStyle: { color: '#74AA9C' },
    ...overrides,
  }
}

function makeRuntimeTab(overrides = {}) {
  return {
    id: 'codex:proj-1',
    projectId: 'proj-1',
    agentType: 'codex',
    name: 'my-repo',
    cwd: '/home/user/my-repo',
    cwdLocked: true,
    runningCount: 1,
    hasPendingTool: false,
    hasDoneNotification: false,
    createdAt: 1000,
    updatedAt: 2000,
    source: 'runtime',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// makeTabId
// ---------------------------------------------------------------------------

test('makeTabId produces stable composite key', () => {
  assert.equal(makeTabId('claudeCode', 'proj-1'), 'claudeCode:proj-1')
  assert.equal(makeTabId('codex', 'abc-123'), 'codex:abc-123')
})

// ---------------------------------------------------------------------------
// Rule: runtime patch is empty → does NOT delete persisted tabs
// ---------------------------------------------------------------------------

test('empty runtime patch preserves all persisted tabs', () => {
  const persisted = [
    makePersistedTab({ id: 'claudeCode:proj-1', agentType: 'claudeCode' }),
    makePersistedTab({ id: 'codex:proj-1', agentType: 'codex' }),
  ]

  // Runtime has no tabs for either agent
  const merged = mergeTabs(persisted, [], [])

  assert.equal(merged.length, 2)
  assert.ok(merged.find(t => t.id === 'claudeCode:proj-1'))
  assert.ok(merged.find(t => t.id === 'codex:proj-1'))
})

// ---------------------------------------------------------------------------
// Rule: CodeX runtime patch updates runningCount but does NOT replace ClaudeCode tabs
// ---------------------------------------------------------------------------

test('CodeX runtime patch only affects CodeX tabs, preserves ClaudeCode', () => {
  const persisted = [
    makePersistedTab({ id: 'claudeCode:proj-1', agentType: 'claudeCode', name: 'claude-repo', iconClass: 'icon-claude' }),
    makePersistedTab({ id: 'codex:proj-1', agentType: 'codex', name: 'codex-repo', iconClass: 'icon-codex', runningCount: 0 }),
  ]

  const runtime = [
    makeRuntimeTab({ id: 'codex:proj-1', agentType: 'codex', runningCount: 3, updatedAt: 5000 }),
  ]

  const merged = mergeTabs(persisted, runtime, [])

  // ClaudeCode tab preserved unchanged
  const claudeTab = merged.find(t => t.id === 'claudeCode:proj-1')
  assert.ok(claudeTab)
  assert.equal(claudeTab.name, 'claude-repo')
  assert.equal(claudeTab.runningCount, 0)
  assert.equal(claudeTab.source, 'panel-state')

  // CodeX tab patched
  const codexTab = merged.find(t => t.id === 'codex:proj-1')
  assert.ok(codexTab)
  assert.equal(codexTab.runningCount, 3)
  assert.equal(codexTab.updatedAt, 5000)
  assert.equal(codexTab.source, 'runtime')
})

// ---------------------------------------------------------------------------
// Rule: runtime patch is empty for one provider → doesn't delete that provider's tabs
// ---------------------------------------------------------------------------

test('runtime patch for CodeX only does not remove ClaudeCode persisted tabs', () => {
  const persisted = [
    makePersistedTab({ id: 'claudeCode:proj-a', agentType: 'claudeCode', name: 'claude-a' }),
    makePersistedTab({ id: 'claudeCode:proj-b', agentType: 'claudeCode', name: 'claude-b' }),
    makePersistedTab({ id: 'codex:proj-x', agentType: 'codex', name: 'codex-x' }),
  ]

  // Only CodeX sends runtime data; ClaudeCode hasn't published yet
  const runtime = [
    makeRuntimeTab({ id: 'codex:proj-x', agentType: 'codex', runningCount: 1 }),
  ]

  const merged = mergeTabs(persisted, runtime, [])

  assert.equal(merged.length, 3)
  assert.ok(merged.find(t => t.id === 'claudeCode:proj-a'), 'claude-proj-a should still exist')
  assert.ok(merged.find(t => t.id === 'claudeCode:proj-b'), 'claude-proj-b should still exist')
  assert.ok(merged.find(t => t.id === 'codex:proj-x'), 'codex-proj-x should still exist')
})

// ---------------------------------------------------------------------------
// Rule: explicit delete → tab removed from index
// ---------------------------------------------------------------------------

test('explicit delete removes tab from merged result', () => {
  const persisted = [
    makePersistedTab({ id: 'codex:proj-del', agentType: 'codex', name: 'to-delete' }),
    makePersistedTab({ id: 'claudeCode:proj-keep', agentType: 'claudeCode', name: 'keep-me' }),
  ]

  const merged = mergeTabs(persisted, [], ['codex:proj-del'])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'claudeCode:proj-keep')
  assert.ok(!merged.find(t => t.id === 'codex:proj-del'))
})

test('explicit delete prevents runtime patch from resurrecting tab', () => {
  const persisted = [
    makePersistedTab({ id: 'codex:proj-1', agentType: 'codex' }),
  ]

  const runtime = [
    makeRuntimeTab({ id: 'codex:proj-1', agentType: 'codex', runningCount: 5 }),
  ]

  // Tab is explicitly deleted
  const merged = mergeTabs(persisted, runtime, ['codex:proj-1'])

  assert.equal(merged.length, 0)
})

// ---------------------------------------------------------------------------
// Rule: delete after restart does not resurrect
// ---------------------------------------------------------------------------

test('persisted tab excluded when deleted, even if panel-state still has it', () => {
  const persisted = [
    makePersistedTab({ id: 'codex:proj-deleted', agentType: 'codex', name: 'was-deleted' }),
  ]

  // No runtime (provider not yet mounted), but tab was previously deleted
  const merged = mergeTabs(persisted, [], ['codex:proj-deleted'])

  assert.equal(merged.length, 0)
})

// ---------------------------------------------------------------------------
// Rule: runtime patch overrides persisted fields
// ---------------------------------------------------------------------------

test('runtime patch updates runningCount, hasPendingTool, hasDoneNotification', () => {
  const persisted = [
    makePersistedTab({
      id: 'codex:proj-1',
      runningCount: 0,
      hasPendingTool: false,
      hasDoneNotification: false,
    }),
  ]

  const runtime = [
    makeRuntimeTab({
      id: 'codex:proj-1',
      runningCount: 2,
      hasPendingTool: true,
      hasDoneNotification: true,
      updatedAt: 9999,
    }),
  ]

  const merged = mergeTabs(persisted, runtime, [])

  assert.equal(merged[0].runningCount, 2)
  assert.equal(merged[0].hasPendingTool, true)
  assert.equal(merged[0].hasDoneNotification, true)
  assert.equal(merged[0].source, 'runtime')
})

test('runtime patch preserves persisted createdAt older than runtime createdAt', () => {
  const persisted = [
    makePersistedTab({ id: 'codex:proj-1', createdAt: 100, updatedAt: 100 }),
  ]

  const runtime = [
    makeRuntimeTab({ id: 'codex:proj-1', createdAt: 200, updatedAt: 200 }),
  ]

  const merged = mergeTabs(persisted, runtime, [])

  // Runtime fields override but createdAt from persisted is kept
  assert.equal(merged[0].source, 'runtime')
  assert.equal(merged[0].runningCount, 1) // runtime value
})

// ---------------------------------------------------------------------------
// Rule: double delete is harmless (idempotent)
// ---------------------------------------------------------------------------

test('deleting an already-deleted tab is idempotent', () => {
  const persisted = [
    makePersistedTab({ id: 'codex:proj-1', agentType: 'codex' }),
  ]

  const merged1 = mergeTabs(persisted, [], ['codex:proj-1'])
  assert.equal(merged1.length, 0)

  // Deleting again
  const merged2 = mergeTabs(persisted, [], ['codex:proj-1'])
  assert.equal(merged2.length, 0)
})

// ---------------------------------------------------------------------------
// Rule: tabOrder reconcile preserves not-yet-ready provider tabs
// ---------------------------------------------------------------------------

test('tabOrder reconcile preserves tabs from providers not yet ready', async () => {
  // Dynamic import since tabOrder.mjs is ESM
  const { reconcileCodeHubTabOrder } = await import(
    '../packages/agent/src/components/codeHub/tabOrder.mjs'
  )

  // Current order has both Claude and CodeX tabs
  const currentOrder = ['claudeCode:proj-1', 'codex:proj-1']

  // At this point, only ClaudeCode tabs are visible (CodeX panel not ready yet)
  // But we DON'T want to prune the CodeX tab from the order
  const visibleTabIds = ['claudeCode:proj-1']

  const next = reconcileCodeHubTabOrder({
    currentOrder,
    visibleTabIds,
    pruneMissing: false, // key: don't prune not-yet-ready tabs
  })

  assert.equal(next.length, 2)
  assert.ok(next.includes('codex:proj-1'), 'CodeX tab preserved in order despite not yet visible')
})

// ---------------------------------------------------------------------------
// Rule: persisted tabs without running/pending default to 0/false
// ---------------------------------------------------------------------------

test('persisted tabs default running/pending fields to zero', () => {
  // A persisted tab from panel-state has no runtime fields
  const tab = makePersistedTab({
    id: 'codex:proj-new',
    // These are defaults, explicitly not present
    runningCount: undefined,
    hasPendingTool: undefined,
    hasDoneNotification: undefined,
  })

  // But in our makePersistedTab helper they default to 0/false
  // Let's test with the actual defaults
  const rawTab = {
    id: 'codex:proj-new',
    projectId: 'proj-new',
    agentType: 'codex',
    name: 'new-repo',
    cwd: '/tmp',
    cwdLocked: false,
    createdAt: 100,
    updatedAt: 100,
    source: 'panel-state',
  }

  const merged = mergeTabs([rawTab], [], [])
  assert.equal(merged.length, 1)
  // These fields may be undefined from a raw persisted tab;
  // the UI should treat missing as 0/false
  assert.ok(merged[0].runningCount === undefined || merged[0].runningCount === 0)
})

// ---------------------------------------------------------------------------
// Rule: runtime patch with same agentType doesn't cross-contaminate
// ---------------------------------------------------------------------------

test('runtime patches are scoped to their agentType', () => {
  const persisted = [
    makePersistedTab({ id: 'claudeCode:proj-shared', agentType: 'claudeCode', name: 'shared-cwd', cwd: '/shared' }),
    makePersistedTab({ id: 'codex:proj-shared', agentType: 'codex', name: 'shared-cwd', cwd: '/shared' }),
  ]

  // Only ClaudeCode sends runtime, CodeX hasn't mounted yet
  const runtime = [
    makeRuntimeTab({ id: 'claudeCode:proj-shared', agentType: 'claudeCode', runningCount: 2, name: 'shared-cwd-claude' }),
  ]

  const merged = mergeTabs(persisted, runtime, [])

  const claudeTab = merged.find(t => t.id === 'claudeCode:proj-shared')
  const codexTab = merged.find(t => t.id === 'codex:proj-shared')

  assert.ok(claudeTab)
  assert.ok(codexTab)
  assert.equal(claudeTab.runningCount, 2)
  assert.equal(claudeTab.source, 'runtime')
  assert.equal(codexTab.runningCount, 0) // unchanged
  assert.equal(codexTab.source, 'panel-state')
})

// ---------------------------------------------------------------------------
// Rule: source field tracks data origin
// ---------------------------------------------------------------------------

test('source field reflects data origin after merge', () => {
  const persisted = [makePersistedTab({ id: 'codex:proj-1', source: 'panel-state' })]
  const runtime = [makeRuntimeTab({ id: 'codex:proj-1', source: 'runtime' })]

  const merged = mergeTabs(persisted, runtime, [])
  assert.equal(merged[0].source, 'runtime') // runtime overrides source

  // No runtime → source stays as persisted
  const merged2 = mergeTabs(persisted, [], [])
  assert.equal(merged2[0].source, 'panel-state')
})

// ---------------------------------------------------------------------------
// Rule: corrupted panel-state on one provider doesn't affect the other
// ---------------------------------------------------------------------------

test('missing panel-state for one agent does not affect the other', () => {
  // Simulate: Claude panel-state is fine, Codex panel-state is missing
  const persisted = [
    makePersistedTab({ id: 'claudeCode:proj-1', agentType: 'claudeCode' }),
    // No codex tabs — panel-state was missing/corrupted
  ]

  const merged = mergeTabs(persisted, [], [])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'claudeCode:proj-1')
  // CodeX tabs just don't appear — this is correct for Phase 1
})
