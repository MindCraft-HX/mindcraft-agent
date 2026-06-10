const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  extractClaudeSessionTitle,
  extractCodexSessionSummary,
} = require('../electron/mainModules/sessionTitleUtils')

function withTempFile(content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-session-title-'))
  const filePath = path.join(dir, 'session.jsonl')
  fs.writeFileSync(filePath, content, 'utf8')
  try {
    run(filePath)
  } finally {
    try { fs.unlinkSync(filePath) } catch (_) {}
    try { fs.rmdirSync(dir) } catch (_) {}
  }
}

function runClaudeTailCustomTitleTest() {
  const filler = Array.from({ length: 400 }, (_, i) => JSON.stringify({ type: 'assistant', text: `filler-${i}` })).join('\n')
  const content = [
    JSON.stringify({ type: 'user', message: { content: '默认标题' } }),
    filler,
    JSON.stringify({ type: 'custom-title', customTitle: '自定义标题' }),
    '',
  ].join('\n')
  withTempFile(content, (filePath) => {
    const result = extractClaudeSessionTitle(filePath)
    assert.equal(result.title, '自定义标题')
    assert.equal(result.isCustomTitle, true)
  })
}

function runCodexTailCustomTitleTest() {
  const filler = Array.from({ length: 500 }, (_, i) => JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: `tail-${i}` } })).join('\n')
  const content = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'session-12345678', cwd: 'D:/repo', timestamp: '2026-06-08T00:00:00.000Z' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '默认标题' } }),
    filler,
    JSON.stringify({ type: 'custom-title', customTitle: 'Codex 自定义标题', sessionId: 'session-12345678' }),
    '',
  ].join('\n')
  withTempFile(content, (filePath) => {
    const result = extractCodexSessionSummary(filePath, () => ({ shouldDefer: false }))
    assert.ok(result)
    assert.equal(result.name, 'Codex 自定义标题')
    assert.equal(result._isCustomTitle, true)
  })
}

function run() {
  runClaudeTailCustomTitleTest()
  runCodexTailCustomTitleTest()
  console.log('session-title-utils tests passed')
}

run()
