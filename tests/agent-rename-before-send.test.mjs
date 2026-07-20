import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function readRenameHandler(relativePath, nextFunctionName) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const start = source.indexOf('async function handleRenameChat')
  const end = source.indexOf(`\n${nextFunctionName}`, start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

for (const [name, relativePath, nextFunctionName] of [
  ['Claude', '../packages/agent/src/components/claudeCode/index.vue', 'async function requestDeleteProject'],
  ['Codex', '../packages/agent/src/components/codeX/index.vue', 'function selectDir'],
]) {
  test(`${name} drafts can be renamed before a provider transcript exists`, () => {
    const handler = readRenameHandler(relativePath, nextFunctionName)
    assert.match(handler, /setSessionTitle/)
    assert.doesNotMatch(handler, /!chat\.cliSessionId\s*&&\s*!chat\.filePath/)
    assert.doesNotMatch(handler, /renameFirst/)
  })
}
