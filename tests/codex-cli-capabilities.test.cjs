const test = require('node:test')
const assert = require('node:assert/strict')

const {
  capabilitiesFromExecHelp,
  clearCodexCliCapabilitiesCache,
  getCodexCliCapabilities,
  normalizeCodexVersion,
} = require('../packages/agent/electron/codex/cliCapabilities')
const { findCodexCommandInPath } = require('../packages/agent/electron/codex/environment')
const path = require('node:path')

test('Codex CLI capabilities require the public JSON and resume protocol', () => {
  const capabilities = capabilitiesFromExecHelp(`
Commands:
  resume  Resume a previous session
Options:
      --json  Print events as JSONL
      --image <FILE>
      --add-dir <DIR>
      --skip-git-repo-check
`)
  assert.deepEqual(capabilities, {
    execJson: true,
    resume: true,
    images: true,
    additionalDirectories: true,
    skipGitRepoCheck: true,
  })
})

test('Codex CLI version display is normalized without SDK metadata', () => {
  assert.equal(normalizeCodexVersion('codex-cli 0.144.3\n'), '0.144.3')
  assert.equal(normalizeCodexVersion('v0.135.0'), '0.135.0')
})

test('executable discovery scans PATH command entries without shell where/which', () => {
  const fakeBin = path.join('C:', 'tools')
  const candidate = findCodexCommandInPath({ Path: fakeBin }, 'win32', (filePath) => {
    return filePath === path.join(fakeBin, 'codex.cmd')
  })

  assert.equal(candidate, path.join(fakeBin, 'codex.cmd'))
})

test('failed capability probes are removed from cache so a later run can retry', async () => {
  clearCodexCliCapabilitiesCache()
  let calls = 0
  const execFileImpl = (_command, _args, _options, callback) => {
    calls++
    callback(new Error('temporary failure'), '', '')
  }

  await assert.rejects(getCodexCliCapabilities('codex-test', { execFileImpl }))
  await assert.rejects(getCodexCliCapabilities('codex-test', { execFileImpl }))
  assert.equal(calls, 4)
  clearCodexCliCapabilitiesCache()
})
