const assert = require('assert')
const path = require('path')
const os = require('os')
const fs = require('fs')

const { createTestDb } = require('../packages/agent/electron/db')
const sessionsDao = require('../packages/agent/electron/db/dao/sessions')
const { restorePanelState } = require('../packages/agent/electron/sessionRepository')

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

async function run() {
  await runSkipsOrphanSqliteProjectBackfillTest()
  await runAttachesSqliteSessionToExistingProjectByCwdTest()
  await runCreatesProjectWhenSqliteSessionHasCwdTest()
  await runRepairsExistingProjectMetadataFromSqliteTest()
  await runSkipsMissingTranscriptSessionMarkedNonResumableTest()
  console.log('session-repository restorePanelState tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
