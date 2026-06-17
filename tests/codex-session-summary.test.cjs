const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { extractCodexSessionSummary } = require('../packages/agent/electron/sessionTitleUtils.js')

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

function runCodexSummaryModelTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-summary-'))
  try {
    const filePath = path.join(dir, 'thread-1.jsonl')
    writeJsonl(filePath, [
      {
        type: 'session_meta',
        payload: {
          id: 'thread-1',
          cwd: 'D:/repo',
          timestamp: '2026-06-17T01:02:03.000Z',
          model: 'gpt-5.4',
          model_reasoning_effort: 'high',
        },
      },
      {
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Fix the failing test' },
      },
    ])

    const summary = extractCodexSessionSummary(filePath, () => ({ shouldDefer: false }))

    assert.equal(summary.id, 'thread-1')
    assert.equal(summary.model, 'gpt-5.4')
    assert.equal(summary.reasoningEffort, 'high')
    assert.equal(summary.name, 'Fix the failing test')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

runCodexSummaryModelTest()
console.log('codex session summary tests passed')
