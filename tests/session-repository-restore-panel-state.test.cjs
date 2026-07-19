const assert = require('assert')
const path = require('path')
const os = require('os')
const fs = require('fs')

const { createTestDb } = require('../packages/agent/electron/db')
const sessionsDao = require('../packages/agent/electron/db/dao/sessions')
const {
  backfillUserTitlesFromPanelState,
  claimScannedProviderBinding,
  ensureFromProviderScan,
  findByProviderScan,
  getOwnedProviderBinding,
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
    assert.equal(bindings.every(binding => binding.source === 'scan'), true)

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
    setSessionTitle(db, 'claude::runtime-chat', 'Runtime title', {
      agent: 'claude', cliSessionId: 'thread-runtime', filePath: 'D:/transcripts/thread-runtime.jsonl',
    })
    assert.equal(sessionsDao.listSessionBindings(db, 'claude::runtime-chat').every(binding => binding.source === 'runtime'), true)
  })
}

async function runRuntimeWriteRejectsSecondOwnedThreadTest() {
  await withTempDb(async (db) => {
    assert.equal(upsertRuntimeByProvider(db, {
      agent: 'codex', chatKey: 'codex::single-thread', cliSessionId: 'thread-first',
      filePath: 'D:/transcripts/thread-first.jsonl', runtime: { model: 'first-model' },
    }).ok, true)

    const second = upsertRuntimeByProvider(db, {
      agent: 'codex', chatKey: 'codex::single-thread', cliSessionId: 'thread-second',
      filePath: 'D:/transcripts/thread-second.jsonl', runtime: { model: 'second-model' },
    })

    assert.equal(second.ok, false)
    assert.match(second.error, /different provider thread/)
    const bindings = sessionsDao.listSessionBindings(db, 'codex::single-thread')
    assert.equal(bindings.length, 2)
    assert.equal(bindings.every(binding => binding.cliSessionId === 'thread-first'), true)
    assert.equal(sessionsDao.getSessionRuntime(db, 'codex::single-thread').model, 'first-model')
  })
}

async function runClaimRejectsSecondOwnedThreadTest() {
  await withTempDb(async (db) => {
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::claim-conflict', agent: 'codex', projectId: '', cwd: 'D:/repo',
      title: 'Claim conflict', titleSource: 'scan', createdAt: 1, updatedAt: 2, metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::claim-conflict', providerKey: 'codex::thread-owned',
      cliSessionId: 'thread-owned', source: 'runtime', resumeAllowed: true, updatedAt: 1,
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::claim-conflict', providerKey: 'codex::thread-scanned',
      cliSessionId: 'thread-scanned', source: 'scan', resumeAllowed: true, updatedAt: 2,
    })

    const result = claimScannedProviderBinding(db, {
      agent: 'codex', chatKey: 'codex::claim-conflict', cliSessionId: 'thread-scanned', filePath: '',
    })

    assert.equal(result.ok, false)
    assert.match(result.error, /different provider thread/)
    const scanned = sessionsDao.listSessionBindings(db, 'codex::claim-conflict')
      .find(binding => binding.cliSessionId === 'thread-scanned')
    assert.equal(scanned.source, 'scan')
  })
}

async function runClaimedBindingSurvivesFreshScanTest() {
  await withTempDb(async (db) => {
    const summary = {
      cliSessionId: 'thread-claimed',
      filePath: 'D:/transcripts/thread-claimed.jsonl',
      title: 'Claimed',
    }
    const scanned = ensureFromProviderScan(db, 'codex', summary, { cwd: 'D:/repo' })
    assert.equal(scanned.provider.source, 'scan')
    assert.equal(claimScannedProviderBinding(db, {
      agent: 'codex', chatKey: scanned.chatKey, cliSessionId: summary.cliSessionId, filePath: summary.filePath,
    }).ok, true)

    const rescanned = ensureFromProviderScan(db, 'codex', summary, { cwd: 'D:/repo' })
    assert.equal(rescanned.provider.source, 'user')
    assert.equal(rescanned.provider.resumeAllowed, true)
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
    assert.equal(result.panelState.projects[0].chats[0]._resumeAllowed, false)
  })
}

async function runRestorePrefersClaimedThreadOverRuntimeFragmentsTest() {
  await withTempDb(async (db, dir) => {
    const oldFile = path.join(dir, 'rollout-2026-07-18T20-00-00-thread-old.jsonl')
    const newFile = path.join(dir, 'rollout-2026-07-18T21-00-00-thread-new.jsonl')
    fs.writeFileSync(oldFile, 'old')
    fs.writeFileSync(newFile, 'newer')
    sessionsDao.upsertSession(db, {
      chatKey: 'codex::split-chat', agent: 'codex', projectId: 'proj-split', cwd: 'D:/repo',
      title: 'Split recovery', titleSource: 'user', createdAt: 1, updatedAt: 20, metadata: {},
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::split-chat', providerKey: 'codex::thread-old', cliSessionId: 'thread-old',
      filePath: oldFile, source: 'user', resumeAllowed: true, updatedAt: 10,
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'codex::split-chat', providerKey: 'codex::thread-new', cliSessionId: 'thread-new',
      filePath: newFile, source: 'runtime', resumeAllowed: true, updatedAt: 20,
    })

    assert.equal(getOwnedProviderBinding(db, 'codex::split-chat').cliSessionId, 'thread-old')
    const result = restorePanelState(db, 'codex', {
      lastCwd: 'D:/repo', projects: [{ id: 'proj-split', name: 'repo', cwd: 'D:/repo', chats: [] }],
    })
    const chat = result.panelState.projects[0].chats[0]
    assert.equal(chat.cliSessionId, 'thread-old')
    assert.equal(chat.filePath, oldFile)
    assert.equal(chat.fileSize, 3)
    assert.equal(chat._resumeAllowed, true)
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
  await runRuntimeWriteRejectsSecondOwnedThreadTest()
  await runClaimRejectsSecondOwnedThreadTest()
  await runClaimedBindingSurvivesFreshScanTest()
  await runScanRejectsSplitProviderIdentityTest()
  await runRestoreSkipsUnboundSessionTest()
  await runRestoreConvertsDbTimestampsForRendererTest()
  await runRestorePrefersClaimedThreadOverRuntimeFragmentsTest()
  console.log('session-repository restorePanelState tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
