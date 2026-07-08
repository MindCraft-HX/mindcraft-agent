const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { __test__ } = require('../packages/agent/electron/claudeAgent.js')

async function runClaudeSessionScanCachesTitlesTest(userDataDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-scan-cache-'))
  try {
    // Isolate SQLite DB from production and from other tests
    __test__.setSessionRegistryOptionsForTest({ userDataDir })

    const cwd = path.join(dir, 'repo')
    const oldReadFileSync = fs.readFileSync
    fs.mkdirSync(cwd, { recursive: true })

    const payload = __test__.buildClaudeAgentDonePayload({
      cwd,
      cliSessionId: '11111111-1111-1111-1111-111111111111',
    })
    fs.mkdirSync(path.dirname(payload.filePath), { recursive: true })
    fs.writeFileSync(payload.filePath, JSON.stringify({
      type: 'user',
      message: { role: 'user', content: 'Cached Claude title' },
    }) + '\n', 'utf8')

    __test__.clearClaudeSessionScanCaches()
    const first = await __test__.scanCliSessionsForProject(cwd)
    assert.equal(first.length, 1)
    assert.equal(first[0].title, 'Cached Claude title')

    let transcriptReadCount = 0
    fs.readFileSync = function patchedReadFileSync(target, ...args) {
      if (String(target).endsWith('.jsonl')) transcriptReadCount += 1
      return oldReadFileSync.call(this, target, ...args)
    }

    try {
      const second = await __test__.scanCliSessionsForProject(cwd)
      assert.equal(second.length, 1)
      assert.equal(second[0].title, 'Cached Claude title')
      assert.equal(transcriptReadCount, 0)
    } finally {
      fs.readFileSync = oldReadFileSync
      __test__.clearClaudeSessionScanCaches()
    }
  } finally {
    __test__.setSessionRegistryOptionsForTest(null)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-claude-scan-test-'))
  try {
    await runClaudeSessionScanCachesTitlesTest(userDataDir)
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
  console.log('claude session scan cache tests passed')
}

run()
