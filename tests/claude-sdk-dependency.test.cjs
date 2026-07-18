'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const appPackage = require(path.join(root, 'package.json'))
const packageLock = require(path.join(root, 'package-lock.json'))
const agentSdkPackage = require(path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json'))

test('Claude Agent SDK and its protocol peers stay on one compatible dependency set', () => {
  assert.equal(appPackage.dependencies['@anthropic-ai/claude-agent-sdk'], agentSdkPackage.version)

  for (const peerName of Object.keys(agentSdkPackage.peerDependencies || {})) {
    const declaredVersion = appPackage.dependencies[peerName]
    assert.ok(declaredVersion, `${peerName} must be an explicit runtime dependency`)
    assert.match(declaredVersion, /^\d+\.\d+\.\d+$/, `${peerName} must use a tested exact version`)
  }

  const lockPackages = packageLock.packages || {}
  assert.equal(
    lockPackages['node_modules/@anthropic-ai/claude-agent-sdk']?.version,
    agentSdkPackage.version,
  )

  const nestedProtocolPackages = Object.keys(lockPackages).filter((entry) =>
    entry.startsWith('node_modules/@anthropic-ai/claude-agent-sdk/node_modules/'),
  )
  assert.deepEqual(nestedProtocolPackages, [])
})

test('Claude Agent SDK keeps the external CLI integration surface used by MindCraft', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  assert.equal(typeof sdk.query, 'function')

  const types = fs.readFileSync(
    path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.d.ts'),
    'utf8',
  )
  for (const surface of [
    'pathToClaudeCodeExecutable?: string',
    'canUseTool?: CanUseTool',
    'streamInput(stream:',
    'supportedCommands():',
  ]) {
    assert.ok(types.includes(surface), `missing required SDK surface: ${surface}`)
  }
})
