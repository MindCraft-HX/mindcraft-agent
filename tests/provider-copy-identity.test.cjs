'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

for (const relativePath of [
  'packages/agent/src/components/claudeCode/components/APISetting.vue',
  'packages/agent/src/components/codeX/components/APISetting.vue',
]) {
  test(`${relativePath} copies providers as new repository rows`, () => {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    const start = source.indexOf('async function copyProvider(i)')
    const end = source.indexOf('\n}', start)
    const body = source.slice(start, end)

    assert.match(body, /const copy = JSON\.parse\(JSON\.stringify\(src\)\)/)
    assert.match(body, /delete copy\.id/)
    assert.ok(body.indexOf('delete copy.id') < body.indexOf('persistProviders()'))
  })
}
