const assert = require('assert')
const path = require('path')
const os = require('os')
const fs = require('fs')

const { createTestDb } = require('../packages/agent/electron/db')
const sessionsDao = require('../packages/agent/electron/db/dao/sessions')
const {
  backfillUserTitlesFromPanelState,
  ensureFromProviderScan,
  findByProviderScan,
  restorePanelState,
  setSessionTitle,
  upsertRuntimeByProvider,
} = require('../packages/agent/electron/sessionRepository')

async function withTempDb(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-session-repo-'))
  try {
    const db = await createTestDb()
    await run(db, dir)
    db.close()
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
}

async function runSkipsOrphanSqliteProjectBackfillTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::orphan-chat',
      agent: 'codex',
      projectId: '',
      cwd: '',
      title: 'orphan',
      titleSource: 'scan',
      createdAt: 1,
      updatedAt: 2,
      metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::orphan-chat',
      providerKey: 'codex::thread-orphan',
      cliSessionId: 'thread-orphan',
      filePath: '',
      source: 'scan',
      detached: false,
      resumeAllowed: true,
      updatedAt: 2,
    })

    const result = restorePanelState(db, 'codex', { lastCwd: '', projects: [] })
    assert.equal(result.changed, false)
    assert.deepEqual(result.panelState.projects, [])
  })
}

async function runAttachesSqliteSessionToExistingProjectByCwdTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::bound-chat',
      agent: 'codex',
      projectId: '',
      cwd: 'D:/repo',
      title: 'bound',
      titleSource: 'scan',
      createdAt: 1,
      updatedAt: 2,
      metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::bound-chat',
      providerKey: 'codex::thread-bound',
      cliSessionId: 'thread-bound',
      filePath: '',
      source: 'scan',
      detached: false,
      resumeAllowed: true,
      updatedAt: 2,
    })

    const panelState = {
      lastCwd: 'D:/repo',
      projects: [{ id: 'proj-1', name: 'repo', cwd: 'D:/repo', cwdLocked: true, hasDoneNotification: false, additionalDirectories: [], chats: [] }],
    }
    const result = restorePanelState(db, 'codex', panelState)
    assert.equal(result.changed, true)
    assert.equal(result.panelState.projects.length, 1)
    assert.equal(result.panelState.projects[0].chats.length, 1)
    assert.equal(result.panelState.projects[0].chats[0].sessionId, 'codex::bound-chat')
  })
}

async function runCreatesProjectWhenSqliteSessionHasCwdTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::new-project-chat',
      agent: 'codex',
      projectId: '',
      cwd: 'D:/fresh-repo',
      title: 'fresh',
      titleSource: 'scan',
      createdAt: 1,
      updatedAt: 2,
      metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::new-project-chat',
      providerKey: 'codex::thread-fresh',
      cliSessionId: 'thread-fresh',
      filePath: '',
      source: 'scan',
      detached: false,
      resumeAllowed: true,
      updatedAt: 2,
    })

    const result = restorePanelState(db, 'codex', { lastCwd: '', projects: [] })
    assert.equal(result.changed, true)
    assert.equal(result.panelState.projects.length, 1)
    assert.equal(result.panelState.projects[0].cwd, 'D:/fresh-repo')
    assert.equal(result.panelState.projects[0].chats[0].sessionId, 'codex::new-project-chat')
  })
}

async function runRepairsExistingProjectMetadataFromSqliteTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::repair-project-chat',
      agent: 'codex',
      projectId: 'proj-1',
      cwd: 'D:/mindcraft-agent',
      title: 'repair-me',
      titleSource: 'scan',
      createdAt: 1,
      updatedAt: 2,
      metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::repair-project-chat',
      providerKey: 'codex::thread-repair',
      cliSessionId: 'thread-repair',
      filePath: '',
      source: 'scan',
      detached: false,
      resumeAllowed: true,
      updatedAt: 2,
    })

    const panelState = {
      lastCwd: '',
      projects: [{ id: 'proj-1', name: 'New Project', cwd: '', cwdLocked: false, hasDoneNotification: false, additionalDirectories: [], chats: [] }],
    }
    const result = restorePanelState(db, 'codex', panelState)
    assert.equal(result.changed, true)
    assert.equal(result.repaired, 1)
    assert.equal(result.panelState.projects[0].cwd, 'D:/mindcraft-agent')
    assert.equal(result.panelState.projects[0].cwdLocked, true)
    assert.equal(result.panelState.projects[0].name, 'mindcraft-agent')
  })
}

async function runSkipsMissingTranscriptSessionMarkedNonResumableTest() {
  await withTempDb(async (db, dir) => {
    const missingFile = path.join(dir, 'missing.jsonl')
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::missing-transcript',
      agent: 'codex',
      projectId: 'proj-7',
      cwd: 'D:/fontlab-server',
      title: 'stale-session',
      titleSource: 'provider',
      createdAt: 1,
      updatedAt: 2,
      metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::missing-transcript',
      providerKey: 'codex::thread-missing',
      cliSessionId: 'thread-missing',
      filePath: missingFile,
      source: 'scan',
      detached: false,
      resumeAllowed: false,
      updatedAt: 2,
    })

    const panelState = {
      lastCwd: '',
      projects: [{ id: 'proj-7', name: 'fontlab-server', cwd: 'D:/fontlab-server', cwdLocked: true, hasDoneNotification: false, additionalDirectories: [], chats: [] }],
    }
    const result = restorePanelState(db, 'codex', panelState)
    assert.equal(result.changed, false)
    assert.equal(result.panelState.projects[0].chats.length, 0)
  })
}

async function runRenamePersistsProviderBindingTest() {
  await withTempDb(async (db) => {
    const result = setSessionTitle(db, 'codex::renamed-chat', 'User title', {
      agent: 'codex',
      projectId: 'proj-rename',
      cwd: 'D:/repo',
      cliSessionId: 'thread-rename',
      filePath: 'D:/transcripts/thread-rename.jsonl',
    })

    assert.equal(result.ok, true)
    const bindings = sessionsDao.listSessionBindings(db, 'codex::renamed-chat')
    assert.equal(bindings.length, 2)
    assert.equal(bindings.some(binding => binding.providerKey === 'codex::thread-rename'), true)
    assert.equal(bindings.some(binding => binding.providerKey === 'codex::D:/transcripts/thread-rename.jsonl'), true)

    ensureFromProviderScan(db, 'codex', {
      cliSessionId: 'thread-rename',
      filePath: 'D:/transcripts/thread-rename.jsonl',
      title: 'Scanned title',
      titleSource: 'scan',
    }, { projectId: 'proj-rename', cwd: 'D:/repo' })
    const restored = findByProviderScan(db, 'codex', { cliSessionId: 'thread-rename' })
    assert.equal(restored.chatKey, 'codex::renamed-chat')
    assert.equal(restored.title, 'User title')
    assert.equal(restored.titleSource, 'user')
  })
}

async function runLegacyPanelRenameBackfillTest() {
  await withTempDb(async (db) => {
    const panelState = {
      lastCwd: 'D:/repo',
      projects: [{
        id: 'proj-legacy', cwd: 'D:/repo', chats: [{
          sessionId: 'codex::legacy-chat',
          name: 'Legacy user title',
          titleSource: 'user',
          _userRenamed: true,
          cliSessionId: 'thread-legacy',
          filePath: 'D:/transcripts/thread-legacy.jsonl',
        }],
      }],
    }
    const result = backfillUserTitlesFromPanelState(db, 'codex', panelState)
    assert.deepEqual(result, { changed: true, count: 1 })

    ensureFromProviderScan(db, 'codex', {
      cliSessionId: 'thread-legacy',
      filePath: 'D:/transcripts/thread-legacy.jsonl',
      title: 'Scanned title',
      titleSource: 'scan',
    }, { projectId: 'proj-legacy', cwd: 'D:/repo' })
    const restored = findByProviderScan(db, 'codex', { filePath: 'D:/transcripts/thread-legacy.jsonl' })
    assert.equal(restored.chatKey, 'codex::legacy-chat')
    assert.equal(restored.title, 'Legacy user title')
    assert.equal(restored.titleSource, 'user')
  })
}

async function runScanDoesNotFabricateUpdatedAtTest() {
  await withTempDb(async (db) => {
    const summary = {
      cliSessionId: 'thread-stable',
      filePath: 'D:/transcripts/thread-stable.jsonl',
      title: 'Stable scan',
      titleSource: 'scan',
      createdAt: 1700000000000,
      updatedAt: 1700000200000,
    }
    const first = ensureFromProviderScan(db, 'codex', summary, { projectId: 'proj-stable', cwd: 'D:/repo' })
    const second = ensureFromProviderScan(db, 'codex', summary, { projectId: 'proj-stable', cwd: 'D:/repo' })
    assert.equal(first.updatedAt, 1700000200000)
    assert.equal(second.updatedAt, 1700000200000)
    assert.equal(sessionsDao.getSession(db, first.chatKey).updatedAt, 1700000200)
  })
}

async function runRuntimeWriteCreatesBothProviderBindingsTest() {
  await withTempDb(async (db) => {
    const result = upsertRuntimeByProvider(db, {
      agent: 'claude',
      chatKey: 'claude::runtime-chat',
      cliSessionId: 'thread-runtime',
      filePath: 'D:/transcripts/thread-runtime.jsonl',
      runtime: { model: 'claude-test', effort: 'high' },
    })
    assert.equal(result.ok, true)
    const bindings = sessionsDao.listSessionBindings(db, 'claude::runtime-chat')
    assert.equal(bindings.length, 2)
    assert.equal(findByProviderScan(db, 'claude', { cliSessionId: 'thread-runtime' }).chatKey, 'claude::runtime-chat')
    assert.equal(findByProviderScan(db, 'claude', { filePath: 'D:/transcripts/thread-runtime.jsonl' }).chatKey, 'claude::runtime-chat')
  })
}

async function runScanRejectsSplitProviderIdentityTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, { chatKey: 'codex::first', agent: 'codex', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSession(db, { chatKey: 'codex::second', agent: 'codex', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'codex::first', providerKey: 'codex::thread-split', cliSessionId: 'thread-split' })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'codex::second', providerKey: 'codex::D:/transcripts/thread-split.jsonl', filePath: 'D:/transcripts/thread-split.jsonl' })

    const result = ensureFromProviderScan(db, 'codex', {
      cliSessionId: 'thread-split',
      filePath: 'D:/transcripts/thread-split.jsonl',
      title: 'Must not merge arbitrarily',
    }, { cwd: 'D:/repo' })
    assert.equal(result, null)
    assert.equal(sessionsDao.getSession(db, 'codex::first').title, '')
    assert.equal(sessionsDao.getSession(db, 'codex::second').title, '')
  })
}

async function runRestoreSkipsUnboundSessionTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::unbound-chat', agent: 'codex', projectId: 'proj-unbound', cwd: 'D:/repo',
      title: 'Unbound', titleSource: 'user', createdAt: 1, updatedAt: 2, metadata: {},
    })
    const result = restorePanelState(db, 'codex', {
      lastCwd: 'D:/repo',
      projects: [{ id: 'proj-unbound', name: 'repo', cwd: 'D:/repo', chats: [] }],
    })
    assert.equal(result.changed, false)
    assert.equal(result.panelState.projects[0].chats.length, 0)
  })
}

async function runRestoreConvertsDbTimestampsForRendererTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::timestamp-chat', agent: 'codex', projectId: 'proj-time', cwd: 'D:/repo',
      title: 'Timestamp', titleSource: 'scan', createdAt: 100, updatedAt: 200, metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::timestamp-chat', providerKey: 'codex::thread-time', cliSessionId: 'thread-time',
      source: 'scan', detached: false, resumeAllowed: true, updatedAt: 200,
    })
    const result = restorePanelState(db, 'codex', {
      lastCwd: 'D:/repo', projects: [{ id: 'proj-time', name: 'repo', cwd: 'D:/repo', chats: [] }],
    })
    assert.equal(result.panelState.projects[0].chats[0].createdAt, 100000)
    assert.equal(result.panelState.projects[0].chats[0].updatedAt, 200000)
  })
}

async function run() {
  await runSkipsOrphanSqliteProjectBackfillTest()
  await runAttachesSqliteSessionToExistingProjectByCwdTest()
  await runCreatesProjectWhenSqliteSessionHasCwdTest()
  await runRepairsExistingProjectMetadataFromSqliteTest()
  await runSkipsMissingTranscriptSessionMarkedNonResumableTest()
  await runRenamePersistsProviderBindingTest()
  await runLegacyPanelRenameBackfillTest()
  await runScanDoesNotFabricateUpdatedAtTest()
  await runRuntimeWriteCreatesBothProviderBindingsTest()
  await runScanRejectsSplitProviderIdentityTest()
  await runRestoreSkipsUnboundSessionTest()
  await runRestoreConvertsDbTimestampsForRendererTest()
  console.log('session-repository restorePanelState tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
