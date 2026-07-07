/**
 * Sessions DAO contract tests (T201 Step 2)
 *
 * Covers: sessions, session_bindings, session_runtime CRUD
 *
 * Run: node --test packages/agent/electron/db/dao/sessions.test.js
 */
const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')

let SQL = null
let sessionsDao = null

async function getSql() {
  if (!SQL) {
    const mod = require('sql.js')
    const init = mod.default || mod
    SQL = await init()
  }
  return SQL
}

async function createFreshDb() {
  const sql = await getSql()
  const db = new sql.Database()
  const { runMigrations } = require('../migrations/v1_initial')
  const migResult = runMigrations(db)
  if (!migResult.ok) throw new Error(`Migration failed: ${migResult.message}`)
  return db
}

before(async () => {
  sessionsDao = require('./sessions')
  await getSql() // warm up WASM
})

// ─── Sessions CRUD ─────────────────────────────────────────

describe('sessions CRUD', () => {

  test('listSessions returns empty for fresh DB', async () => {
    const db = await createFreshDb()
    const sessions = sessionsDao.listSessions(db)
    assert.deepStrictEqual(sessions, [])
    db.close()
  })

  test('upsertSession creates new session', async () => {
    const db = await createFreshDb()
    const result = sessionsDao.upsertSession(db, {
      chatKey: 'claude::abc123',
      agent: 'claude',
      projectId: 'proj-1',
      cwd: '/home/user/project',
      title: 'My Session',
      titleSource: 'scan',
      description: 'A test session',
      metadata: { foo: 'bar' },
      createdAt: 1000000,
      updatedAt: 1000001,
    })
    assert.equal(result.ok, true)

    const session = sessionsDao.getSession(db, 'claude::abc123')
    assert.ok(session)
    assert.equal(session.chatKey, 'claude::abc123')
    assert.equal(session.agent, 'claude')
    assert.equal(session.projectId, 'proj-1')
    assert.equal(session.title, 'My Session')
    assert.equal(session.titleSource, 'scan')
    assert.equal(session.description, 'A test session')
    assert.deepStrictEqual(session.metadata, { foo: 'bar' })
    assert.equal(session.createdAt, 1000000)
    assert.equal(session.updatedAt, 1000001)
    db.close()
  })

  test('upsertSession updates existing on conflict', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, {
      chatKey: 'claude::abc123',
      title: 'Old Title',
      createdAt: 1000000,
      updatedAt: 1000000,
    })

    sessionsDao.upsertSession(db, {
      chatKey: 'claude::abc123',
      title: 'New Title',
      updatedAt: 2000000,
    })

    const session = sessionsDao.getSession(db, 'claude::abc123')
    assert.equal(session.title, 'New Title')
    assert.equal(session.updatedAt, 2000000)
    // createdAt should NOT be overwritten by ON CONFLICT (not in UPDATE SET)
    assert.equal(session.createdAt, 1000000)
    db.close()
  })

  test('getSession returns null for missing', async () => {
    const db = await createFreshDb()
    const session = sessionsDao.getSession(db, 'nonexistent')
    assert.equal(session, null)
    db.close()
  })

  test('deleteSession removes session + bindings + runtime', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'ck', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'ck', providerKey: 'pk' })
    sessionsDao.upsertSessionRuntime(db, 'ck', { model: 'gpt-4' })

    const result = sessionsDao.deleteSession(db, 'ck')
    assert.equal(result.ok, true)
    assert.equal(sessionsDao.getSession(db, 'ck'), null)
    assert.deepStrictEqual(sessionsDao.listSessionBindings(db, 'ck'), [])
    assert.equal(sessionsDao.getSessionRuntime(db, 'ck'), null)
    db.close()
  })

  test('listSessions filters by agent', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'c1', agent: 'claude', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSession(db, { chatKey: 'c2', agent: 'codex', createdAt: 2, updatedAt: 2 })
    sessionsDao.upsertSession(db, { chatKey: 'c3', agent: 'claude', createdAt: 3, updatedAt: 3 })

    const result = sessionsDao.listSessions(db, { agent: 'claude' })
    assert.equal(result.length, 2)
    assert.ok(result.every(s => s.agent === 'claude'))
    db.close()
  })

  test('listSessions enforces limit', async () => {
    const db = await createFreshDb()
    for (let i = 0; i < 5; i++) {
      sessionsDao.upsertSession(db, { chatKey: `s${i}`, agent: 'claude', createdAt: i, updatedAt: i })
    }

    const result = sessionsDao.listSessions(db, { limit: 3 })
    assert.equal(result.length, 3)
    db.close()
  })

  test('listSessions orders by updated_at DESC', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'old', agent: 'claude', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSession(db, { chatKey: 'new', agent: 'claude', createdAt: 2, updatedAt: 100 })

    const result = sessionsDao.listSessions(db)
    assert.equal(result[0].chatKey, 'new')
    assert.equal(result[1].chatKey, 'old')
    db.close()
  })
})

// ─── Session Bindings ──────────────────────────────────────

describe('session bindings', () => {

  test('upsertSessionBinding + list', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'ck', createdAt: 1, updatedAt: 1 })

    const result = sessionsDao.upsertSessionBinding(db, {
      chatKey: 'ck',
      providerKey: 'claude::cli123',
      cliSessionId: 'cli123',
      filePath: '/path/to/transcript.jsonl',
      source: 'scan',
    })
    assert.equal(result.ok, true)

    const bindings = sessionsDao.listSessionBindings(db, 'ck')
    assert.equal(bindings.length, 1)
    assert.equal(bindings[0].providerKey, 'claude::cli123')
    assert.equal(bindings[0].cliSessionId, 'cli123')
    assert.equal(bindings[0].detached, false)
    assert.equal(bindings[0].resumeAllowed, true)
    db.close()
  })

  test('upsertSessionBinding updates on conflict', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'ck', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'ck', providerKey: 'pk', cliSessionId: 'old' })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'ck', providerKey: 'pk', cliSessionId: 'new' })

    const bindings = sessionsDao.listSessionBindings(db, 'ck')
    assert.equal(bindings.length, 1)
    assert.equal(bindings[0].cliSessionId, 'new')
    db.close()
  })

  test('findSessionByProviderKey returns session with provider', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, {
      chatKey: 'ck', agent: 'claude', title: 'Test',
      createdAt: 1, updatedAt: 1,
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'ck', providerKey: 'claude::pk1',
      cliSessionId: 'cli-1', filePath: '/f1',
    })

    const session = sessionsDao.findSessionByProviderKey(db, 'claude::pk1')
    assert.ok(session)
    assert.equal(session.chatKey, 'ck')
    assert.equal(session.title, 'Test')
    assert.equal(session.provider.cliSessionId, 'cli-1')
    assert.equal(session.provider.filePath, '/f1')
    db.close()
  })

  test('findSessionByProviderKey returns null for unknown key', async () => {
    const db = await createFreshDb()
    const session = sessionsDao.findSessionByProviderKey(db, 'unknown')
    assert.equal(session, null)
    db.close()
  })

  test('findSessionsByProviderKeys bulk lookup', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'a', title: 'A', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSession(db, { chatKey: 'b', title: 'B', createdAt: 2, updatedAt: 2 })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'a', providerKey: 'pk-a' })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'b', providerKey: 'pk-b' })

    const result = sessionsDao.findSessionsByProviderKeys(db, ['pk-a', 'pk-b'])
    assert.equal(result.length, 2)
    const titles = result.map(s => s.title).sort()
    assert.deepStrictEqual(titles, ['A', 'B'])
    db.close()
  })

  test('deleteSessionBinding removes specific binding only', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'ck', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'ck', providerKey: 'pk-a' })
    sessionsDao.upsertSessionBinding(db, { chatKey: 'ck', providerKey: 'pk-b' })

    sessionsDao.deleteSessionBinding(db, 'ck', 'pk-a')
    const bindings = sessionsDao.listSessionBindings(db, 'ck')
    assert.equal(bindings.length, 1)
    assert.equal(bindings[0].providerKey, 'pk-b')
    db.close()
  })
})

// ─── Session Runtime ───────────────────────────────────────

describe('session runtime', () => {

  test('upsertSessionRuntime + get round-trip', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'ck', createdAt: 1, updatedAt: 1 })

    sessionsDao.upsertSessionRuntime(db, 'ck', {
      model: 'claude-sonnet-4-20250514',
      effort: 'medium',
      modelTier: 'pro',
      reasoningEffort: 'high',
    })

    const rt = sessionsDao.getSessionRuntime(db, 'ck')
    assert.ok(rt)
    assert.equal(rt.model, 'claude-sonnet-4-20250514')
    assert.equal(rt.effort, 'medium')
    assert.equal(rt.modelTier, 'pro')
    assert.equal(rt.reasoningEffort, 'high')
    db.close()
  })

  test('getSessionRuntime returns null for missing', async () => {
    const db = await createFreshDb()
    assert.equal(sessionsDao.getSessionRuntime(db, 'nonexistent'), null)
    db.close()
  })

  test('upsertSessionRuntime updates on conflict', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, { chatKey: 'ck', createdAt: 1, updatedAt: 1 })
    sessionsDao.upsertSessionRuntime(db, 'ck', { model: 'old' })
    sessionsDao.upsertSessionRuntime(db, 'ck', { model: 'new' })

    const rt = sessionsDao.getSessionRuntime(db, 'ck')
    assert.equal(rt.model, 'new')
    db.close()
  })
})

// ─── Persistence round-trip ────────────────────────────────

describe('persistence', () => {

  test('persists sessions across export/reload', async () => {
    const db = await createFreshDb()
    sessionsDao.upsertSession(db, {
      chatKey: 'test-ck', agent: 'claude', title: 'Persist Test',
      metadata: { x: 1 },
      createdAt: 1000000, updatedAt: 1000000,
    })
    sessionsDao.upsertSessionBinding(db, {
      chatKey: 'test-ck', providerKey: 'pk', cliSessionId: 'cli-1',
    })
    sessionsDao.upsertSessionRuntime(db, 'test-ck', { model: 'test-model' })

    // Export
    const buffer = Buffer.from(db.export())
    db.close()

    // Reload
    const sql = await getSql()
    const db2 = new sql.Database(buffer)
    // Re-run migrations (should be no-op since v5 already applied)
    const { runMigrations } = require('../migrations/v1_initial')
    runMigrations(db2)

    const session = sessionsDao.getSession(db2, 'test-ck')
    assert.ok(session)
    assert.equal(session.title, 'Persist Test')
    assert.deepStrictEqual(session.metadata, { x: 1 })

    const binding = sessionsDao.findSessionByProviderKey(db2, 'pk')
    assert.ok(binding)
    assert.equal(binding.provider.cliSessionId, 'cli-1')

    const rt = sessionsDao.getSessionRuntime(db2, 'test-ck')
    assert.ok(rt)
    assert.equal(rt.model, 'test-model')

    db2.close()
  })
})
