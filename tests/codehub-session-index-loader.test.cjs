/**
 * CodeHub SessionIndex loader unit tests (T184 Phase 1)
 *
 * Tests the main-process read-only loader: codehubSessionIndex.js
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')
const os = require('os')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory for test data */
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codehub-si-test-'))
  return dir
}

/** Write JSON to a file */
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

// We can't easily mock `app.getPath('userData')` in a unit test,
// so we test the pure functions extracted from the module.
const {
  __test__: {
    toCodeHubAgentType,
    deriveProjectName,
    extractTabsFromPanelState,
    toSafeTab,
    TAB_WHITELIST,
  },
} = require('../packages/agent/electron/codehubSessionIndex.js')

// ---------------------------------------------------------------------------
// toCodeHubAgentType
// ---------------------------------------------------------------------------

test('toCodeHubAgentType maps known agents', () => {
  assert.equal(toCodeHubAgentType('claude'), 'claudeCode')
  assert.equal(toCodeHubAgentType('claudecode'), 'claudeCode')
  assert.equal(toCodeHubAgentType('claude-code'), 'claudeCode')
  assert.equal(toCodeHubAgentType('codex'), 'codex')
  assert.equal(toCodeHubAgentType('codexcode'), 'codex')
  assert.equal(toCodeHubAgentType('code-x'), 'codex')
})

test('toCodeHubAgentType returns null for unknown', () => {
  assert.equal(toCodeHubAgentType(null), null)
  assert.equal(toCodeHubAgentType(undefined), null)
  assert.equal(toCodeHubAgentType(''), null)
  assert.equal(toCodeHubAgentType('unknown'), null)
})

// ---------------------------------------------------------------------------
// deriveProjectName
// ---------------------------------------------------------------------------

test('deriveProjectName uses name when meaningful', () => {
  assert.equal(deriveProjectName({ name: 'my-project' }), 'my-project')
  assert.equal(deriveProjectName({ name: 'my-project', cwd: '/some/path' }), 'my-project')
})

test('deriveProjectName falls back to cwd basename when name is default', () => {
  assert.equal(
    deriveProjectName({ name: '未命名项目', cwd: 'D:\\repo\\mindcraft-agent' }),
    'mindcraft-agent'
  )
  assert.equal(
    deriveProjectName({ name: '新项目', cwd: 'D:\\repo\\mindcraft-agent' }),
    'mindcraft-agent'
  )
  assert.equal(
    deriveProjectName({ name: 'New Project', cwd: '/home/dev/mindcraft-agent' }),
    'mindcraft-agent'
  )
})

test('deriveProjectName uses name even if default when no cwd', () => {
  assert.equal(deriveProjectName({ name: '未命名项目' }), '未命名项目')
  assert.equal(deriveProjectName({ name: '新项目' }), '新项目')
  assert.equal(deriveProjectName({ name: 'New Project' }), 'New Project')
  assert.equal(deriveProjectName({}), '')
})

// ---------------------------------------------------------------------------
// toSafeTab — whitelist filtering
// ---------------------------------------------------------------------------

test('toSafeTab filters to whitelist fields only', () => {
  const raw = {
    id: 'codex:proj-1',
    projectId: 'proj-1',
    agentType: 'codex',
    name: 'test',
    cwd: '/tmp',
    cwdLocked: true,
    runningCount: 2,
    hasPendingTool: false,
    hasDoneNotification: true,
    createdAt: 100,
    updatedAt: 200,
    source: 'panel-state',
    extraField: 'should-be-removed',
    anotherJunk: 42,
  }
  const tab = toSafeTab(raw)
  assert.equal(tab.extraField, undefined)
  assert.equal(tab.anotherJunk, undefined)
  assert.equal(tab.id, 'codex:proj-1')
  assert.equal(tab.runningCount, 2)
  // Verify all expected fields are present
  for (const key of TAB_WHITELIST) {
    assert.ok(Object.prototype.hasOwnProperty.call(tab, key), `Missing whitelist key: ${key}`)
  }
})

test('toSafeTab skips missing whitelist fields', () => {
  const raw = { id: 'test', name: 'hello' }
  const tab = toSafeTab(raw)
  assert.equal(tab.id, 'test')
  assert.equal(tab.name, 'hello')
  assert.equal(tab.runningCount, undefined) // not present in raw
})

// ---------------------------------------------------------------------------
// extractTabsFromPanelState
// ---------------------------------------------------------------------------

test('extractTabsFromPanelState returns tabs from valid panel-state', () => {
  const panelState = {
    projects: [
      {
        id: 'proj-1',
        name: 'repo-alpha',
        cwd: '/home/user/repo-alpha',
        cwdLocked: true,
        createdAt: 1000,
        chats: [
          { id: 'chat-1', updatedAt: 2000 },
          { id: 'chat-2', updatedAt: 1500 },
        ],
      },
      {
        id: 'proj-2',
        name: 'repo-beta',
        cwd: '/home/user/repo-beta',
        cwdLocked: false,
        createdAt: 500,
        chats: [],
      },
    ],
  }

  const warnings = []
  const tabs = extractTabsFromPanelState(panelState, 'codex', new Map(), warnings)

  assert.equal(tabs.length, 2)
  assert.equal(warnings.length, 0)

  // Tab 1
  assert.equal(tabs[0].id, 'codex:proj-1')
  assert.equal(tabs[0].projectId, 'proj-1')
  assert.equal(tabs[0].agentType, 'codex')
  assert.equal(tabs[0].name, 'repo-alpha')
  assert.equal(tabs[0].cwd, '/home/user/repo-alpha')
  assert.equal(tabs[0].cwdLocked, true)
  assert.equal(tabs[0].createdAt, 1000)
  assert.equal(tabs[0].updatedAt, 2000) // max chat updatedAt
  assert.equal(tabs[0].runningCount, 0) // default
  assert.equal(tabs[0].source, 'panel-state')

  // Tab 2
  assert.equal(tabs[1].id, 'codex:proj-2')
  assert.equal(tabs[1].updatedAt, 500) // no chats, use project createdAt
})

test('extractTabsFromPanelState handles null/missing projects', () => {
  const warnings = []
  assert.equal(extractTabsFromPanelState(null, 'codex', new Map(), warnings).length, 0)
  assert.equal(extractTabsFromPanelState({}, 'codex', new Map(), warnings).length, 0)
  assert.equal(extractTabsFromPanelState({ projects: null }, 'codex', new Map(), warnings).length, 0)
})

test('extractTabsFromPanelState skips empty placeholder projects', () => {
  const panelState = {
    projects: [
      { id: 'placeholder', name: 'New Project', cwd: '', cwdLocked: false, chats: [] },
      { id: 'has-chat', name: 'Draft Project', cwd: '', cwdLocked: false, chats: [{ id: 'c1', updatedAt: 200 }] },
      { id: 'has-cwd', name: 'Repo', cwd: '/tmp/repo', cwdLocked: false, chats: [] },
    ],
  }

  const tabs = extractTabsFromPanelState(panelState, 'claudeCode', new Map(), [])

  assert.equal(tabs.length, 2)
  assert.equal(tabs.some(t => t.projectId === 'placeholder'), false)
  assert.equal(tabs.some(t => t.projectId === 'has-chat'), true)
  assert.equal(tabs.some(t => t.projectId === 'has-cwd'), true)
})

test('extractTabsFromPanelState warns on invalid project entries', () => {
  const panelState = {
    projects: [
      null,
      { noId: true },
      { id: 'valid', name: 'ok', cwd: '/tmp' },
    ],
  }

  const warnings = []
  const tabs = extractTabsFromPanelState(panelState, 'claudeCode', new Map(), warnings)

  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].id, 'claudeCode:valid')
  assert.ok(warnings.length >= 2, `Expected at least 2 warnings, got ${warnings.length}`)
})

test('extractTabsFromPanelState supplements updatedAt from registry index', () => {
  const panelState = {
    projects: [
      { id: 'proj-1', name: 'repo', cwd: '/tmp', createdAt: 1000, chats: [] },
    ],
  }

  const registryIndex = new Map()
  registryIndex.set('codex:proj-1', { maxUpdatedAt: 5000, sessionCount: 3 })

  const tabs = extractTabsFromPanelState(panelState, 'codex', registryIndex, [])

  assert.equal(tabs[0].updatedAt, 5000) // registry has newer timestamp
})

test('extractTabsFromPanelState derives name from cwd when name is default', () => {
  const panelState = {
    projects: [
      { id: 'proj-1', name: '未命名项目', cwd: '/home/dev/my-awesome-repo' },
    ],
  }

  const tabs = extractTabsFromPanelState(panelState, 'claudeCode', new Map(), [])
  assert.equal(tabs[0].name, 'my-awesome-repo')
})

// ---------------------------------------------------------------------------
// Integration: panel-state shape matches expected format
// ---------------------------------------------------------------------------

test('integration: ClaudeCode panel-state shape yields correct tabs', () => {
  // Simulate a real panel-state structure
  const panelState = {
    lastCwd: '/home/user/projects',
    projects: [
      {
        id: 'project-uuid-1',
        name: 'mindcraft-agent',
        cwd: 'D:\\公司资料\\智匠MindCraft\\RD开发资料\\mindcraft-agent',
        cwdLocked: true,
        hasDoneNotification: false,
        additionalDirectories: [],
        chats: [
          {
            id: 'chat-abc',
            sessionId: 'chat-key-abc',
            name: 'Fix the bug',
            model: 'sonnet',
            filePath: '/path/to/session.jsonl',
            createdAt: 1700000000000,
            updatedAt: 1700000001000,
          },
        ],
      },
    ],
  }

  const tabs = extractTabsFromPanelState(panelState, 'claudeCode', new Map(), [])
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].id, 'claudeCode:project-uuid-1')
  assert.equal(tabs[0].name, 'mindcraft-agent')
  assert.ok(tabs[0].cwd.includes('mindcraft-agent'))
  assert.equal(tabs[0].cwdLocked, true)
  assert.equal(tabs[0].updatedAt, 1700000001000)
  assert.equal(tabs[0].source, 'panel-state')
  // Runtime fields default
  assert.equal(tabs[0].runningCount, 0)
  assert.equal(tabs[0].hasPendingTool, false)
  assert.equal(tabs[0].hasDoneNotification, false)
})

test('integration: Codex panel-state shape yields correct tabs', () => {
  const panelState = {
    lastCwd: '/home/user',
    projects: [
      {
        id: 'codex-proj-1',
        name: 'api-server',
        cwd: '/home/user/api-server',
        cwdLocked: true,
        hasDoneNotification: true,
        chats: [
          { id: 'c1', updatedAt: 1700000002000 },
          { id: 'c2', updatedAt: 1700000003000 },
        ],
      },
    ],
  }

  const tabs = extractTabsFromPanelState(panelState, 'codex', new Map(), [])
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].id, 'codex:codex-proj-1')
  assert.equal(tabs[0].agentType, 'codex')
  assert.equal(tabs[0].name, 'api-server')
  assert.equal(tabs[0].updatedAt, 1700000003000)
})

test('extractTabsFromPanelState reads hasDoneNotification from project', () => {
  const panelState = {
    projects: [
      { id: 'p1', name: 'done-repo', cwd: '/tmp/done', hasDoneNotification: true },
      { id: 'p2', name: 'pending-repo', cwd: '/tmp/pending', hasDoneNotification: false },
      { id: 'p3', name: 'unspecified-repo', cwd: '/tmp/unspec' },
    ],
  }

  const tabs = extractTabsFromPanelState(panelState, 'codex', new Map(), [])

  assert.equal(tabs.length, 3)
  assert.equal(tabs.find(t => t.id === 'codex:p1').hasDoneNotification, true)
  assert.equal(tabs.find(t => t.id === 'codex:p2').hasDoneNotification, false)
  assert.equal(tabs.find(t => t.id === 'codex:p3').hasDoneNotification, false) // missing = false
})
