const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const e2eHookPath = path.join(repoRoot, 'electron', 'e2eSmokeHook.js')

test('e2e smoke provider CRUD uses CodeX provider APIs only', () => {
  const source = fs.readFileSync(e2eHookPath, 'utf8')

  assert.match(
    source,
    /const getFn = api\?\.codexGetProviders;/,
    'expected e2e smoke hook to read provider CRUD through codexGetProviders only',
  )
  assert.match(
    source,
    /const setFn = api\?\.codexSetProviders;/,
    'expected e2e smoke hook to write provider CRUD through codexSetProviders only',
  )
  assert.doesNotMatch(
    source,
    /const getFn = api\?\.claudeGetProviders \|\| api\?\.codexGetProviders;/,
    'e2e smoke hook must not fall back to Claude provider CRUD',
  )
  assert.doesNotMatch(
    source,
    /const setFn = api\?\.claudeSetProviders \|\| api\?\.codexSetProviders;/,
    'e2e smoke hook must not fall back to Claude provider CRUD',
  )
})
