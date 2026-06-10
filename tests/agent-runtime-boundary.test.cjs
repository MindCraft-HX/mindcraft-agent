const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

function assertFilesIncludeAgentPackage(label, files) {
  assert.ok(Array.isArray(files), `${label} files should be an array`)
  assert.ok(
    files.includes('packages/agent/**/*'),
    `${label} should include packages/agent/**/* for packaged Electron runtime`
  )
}

function runWindowEntrypointTest() {
  const claudeWindow = readText('electron/claudeWindow/index.js')
  const codexWindow = readText('electron/codexWindow/index.js')

  assert.match(claudeWindow, /#\/main\/claudeCode/)
  assert.doesNotMatch(claudeWindow, /#\/claudeCode['"`]/)
  assert.match(codexWindow, /#\/main\/codex/)
}

function runPackagingFilesTest() {
  assertFilesIncludeAgentPackage('package.json build', readJson('package.json').build.files)
  assertFilesIncludeAgentPackage('build/builder.test.json', readJson('build/builder.test.json').files)
  assertFilesIncludeAgentPackage('build/builder.prod.json', readJson('build/builder.prod.json').files)
}

runWindowEntrypointTest()
runPackagingFilesTest()

console.log('agent runtime boundary tests passed')
