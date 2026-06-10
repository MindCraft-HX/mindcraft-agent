const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const agentRoot = path.join(root, 'packages', 'agent')

assert.ok(fs.existsSync(path.join(agentRoot, 'package.json')), 'packages/agent/package.json should exist')
assert.ok(fs.existsSync(path.join(agentRoot, 'src', 'index.js')), 'renderer entrypoint should exist')
assert.ok(fs.existsSync(path.join(agentRoot, 'electron', 'index.js')), 'electron entrypoint should exist')
assert.ok(fs.existsSync(path.join(agentRoot, 'preload', 'index.js')), 'preload entrypoint should exist')

const packageJson = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8'))
assert.equal(packageJson.name, '@mindcraft/agent')
assert.equal(packageJson.private, true)
assert.equal(packageJson.exports['.'], './src/index.js')
assert.equal(packageJson.exports['./render'], './src/components/agentCommon/render.js')
assert.equal(packageJson.exports['./electron'], './electron/index.js')
assert.equal(packageJson.exports['./preload'], './preload/index.js')

const rendererEntry = fs.readFileSync(path.join(agentRoot, 'src', 'index.js'), 'utf8')
assert.match(rendererEntry, /export\s+\{\s*default\s+as\s+CodeHub\s*\}/)

const electronEntry = require(path.join(agentRoot, 'electron', 'index.js'))
assert.equal(typeof electronEntry.registerAgentIPCs, 'function')
assert.equal(typeof electronEntry.resetCodexSdkRuntime, 'function')

const preloadEntry = require(path.join(agentRoot, 'preload', 'index.js'))
assert.equal(typeof preloadEntry.createAgentBridge, 'function')

console.log('agent shared entrypoints tests passed')
