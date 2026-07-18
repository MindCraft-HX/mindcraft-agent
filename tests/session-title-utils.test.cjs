const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  extractClaudeSessionTitle,
  extractCodexSessionSummary,
} = require('../packages/agent/electron/sessionTitleUtils.js')

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

function runCodexInstructionOnlyTitleStrippedTest() {
  const content = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'session-instruction-only', cwd: 'D:/repo', timestamp: '2026-07-02T00:00:00.000Z' } }),
    JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: '<mindcraft_session_instruction>\n请在每句回复前加上 🦊\n</mindcraft_session_instruction>\n\n用户当前请求：\n好的，完成',
      },
    }),
    '',
  ].join('\n')
  withTempFile(content, (filePath) => {
    const result = extractCodexSessionSummary(filePath, () => ({ shouldDefer: false }))
    assert.ok(result)
    assert.equal(result.name, '好的，完成')
  })
}

function runCodexFallbackTitleDistinguishesNearbyUuidV7SessionsTest() {
  const id = '019f7471-8e6b-73b1-bdd2-1705d4cdf45f'
  const content = [
    JSON.stringify({ type: 'session_meta', payload: { id, cwd: 'D:/repo', timestamp: '2026-07-18T00:00:00.000Z' } }),
    '',
  ].join('\n')
  withTempFile(content, (filePath) => {
    const result = extractCodexSessionSummary(filePath, () => ({ shouldDefer: false }))
    assert.equal(result.name, 'session 019f7471-8e6b')
  })
}

function runClaudeInstructionOnlyTitleStrippedTest() {
  const content = [
    JSON.stringify({
      type: 'user',
      message: {
        content: '<mindcraft_session_instruction>\nignore me\n</mindcraft_session_instruction>\n\n用户当前请求：帮我看下错误',
      },
    }),
    '',
  ].join('\n')
  withTempFile(content, (filePath) => {
    const result = extractClaudeSessionTitle(filePath)
    assert.equal(result.title, '帮我看下错误')
    assert.equal(result.isCustomTitle, false)
  })
}

function run() {
  runClaudeTailCustomTitleTest()
  runCodexTailCustomTitleTest()
  runCodexInstructionOnlyTitleStrippedTest()
  runCodexFallbackTitleDistinguishesNearbyUuidV7SessionsTest()
  runClaudeInstructionOnlyTitleStrippedTest()
  console.log('session-title-utils tests passed')
}

run()
