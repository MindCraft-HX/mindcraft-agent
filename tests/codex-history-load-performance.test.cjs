const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { __test__ } = require('../packages/agent/electron/codexAgent.js')

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-history-perf-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function runReadSessionFileRangeSkipsNoisyTailTest() {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'session.jsonl')
    const rows = [
      {
        timestamp: '2026-07-01T08:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'thread-1', cwd: 'D:/repo', timestamp: '2026-07-01T08:00:00.000Z' },
      },
      {
        timestamp: '2026-07-01T08:00:01.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'What changed?' }] },
      },
      {
        timestamp: '2026-07-01T08:00:02.000Z',
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The parser now reads farther back.' }] },
      },
    ]

    for (let i = 0; i < 1200; i += 1) {
      rows.push({
        timestamp: `2026-07-01T08:10:${String(i % 60).padStart(2, '0')}.000Z`,
        type: 'event_msg',
        payload: { type: 'token_count', info: { last_token_usage: { input_tokens: i + 1, output_tokens: 1, total_tokens: i + 2 } } },
      })
    }

    writeJsonl(filePath, rows)
    const history = __test__.readSessionFileRange(filePath, 0, 60)

    assert.ok(history.messages.some(message => message.role === 'user' && message.text === 'What changed?'))
    assert.ok(history.messages.some(message => message.role === 'assistant' && message.text === 'The parser now reads farther back.'))
  })
}

async function runListSessionsByCwdCachesSummariesTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-history-perf-'))
  try {
    const oldStatSync = fs.statSync
    const sessionsDir = path.join(dir, 'sessions')
    const dayDir = path.join(sessionsDir, '2026', '07', '01')
    fs.mkdirSync(dayDir, { recursive: true })

    const filePath = path.join(dayDir, 'rollout-thread-1.jsonl')
    writeJsonl(filePath, [
      {
        timestamp: '2026-07-01T08:00:00.000Z',
        type: 'session_meta',
        payload: { id: 'thread-1', cwd: 'D:/repo', timestamp: '2026-07-01T08:00:00.000Z' },
      },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Cached title' } },
    ])

    __test__.setSessionsDirForTest(sessionsDir)
    await __test__.listSessionsByCwd('D:/repo')

    let jsonlStatCount = 0
    fs.statSync = function patchedStatSync(target, ...args) {
      if (String(target).endsWith('.jsonl')) jsonlStatCount += 1
      return oldStatSync.call(this, target, ...args)
    }

    try {
      const sessions = await __test__.listSessionsByCwd('D:/repo')
      assert.equal(sessions.length, 1)
      assert.equal(sessions[0].name, 'Cached title')
      // T183/T185: outer scan cache still skips JSONL parsing, but the scan
      // signature must stat JSONL files so growing rollout files invalidate
      // stale updatedAt/fileSize summaries.
      assert.equal(jsonlStatCount, 1)
    } finally {
      fs.statSync = oldStatSync
      __test__.clearCodexJsonlCaches()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function runListSessionsByCwdInvalidatesWhenJsonlGrowsTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-history-perf-'))
  try {
    const sessionsDir = path.join(dir, 'sessions')
    const dayDir = path.join(sessionsDir, '2026', '07', '01')
    fs.mkdirSync(dayDir, { recursive: true })

    const threadId = `thread-grow-${Date.now()}`
    const filePath = path.join(dayDir, `rollout-${threadId}.jsonl`)
    writeJsonl(filePath, [
      {
        timestamp: '2026-07-01T08:00:00.000Z',
        type: 'session_meta',
        payload: { id: threadId, cwd: 'D:/repo', timestamp: '2026-07-01T08:00:00.000Z' },
      },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Initial title' } },
    ])

    __test__.setSessionsDirForTest(sessionsDir)
    const before = await __test__.listSessionsByCwd('D:/repo')
    assert.equal(before.length, 1)
    assert.equal(before[0].name, 'Initial title')
    const beforeSize = before[0].fileSize

    fs.appendFileSync(filePath, JSON.stringify({
      timestamp: '2026-07-01T09:00:00.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'Later response' },
    }) + '\n', 'utf8')
    const later = new Date(Date.now() + 2000)
    fs.utimesSync(filePath, later, later)

    const after = await __test__.listSessionsByCwd('D:/repo')
    assert.equal(after.length, 1)
    assert.ok(after[0].fileSize > beforeSize)
    assert.notEqual(after[0].updatedAt, before[0].updatedAt)

    __test__.clearCodexJsonlCaches()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

runReadSessionFileRangeSkipsNoisyTailTest()
runListSessionsByCwdCachesSummariesTest()
runListSessionsByCwdInvalidatesWhenJsonlGrowsTest()
console.log('codex history load performance tests passed')
