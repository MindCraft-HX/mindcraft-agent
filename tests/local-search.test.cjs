const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  __test__,
} = require('../electron/mainModules/localSearch.js')
const agentLocalSearch = require('../packages/agent/electron/localSearch.js')

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-local-search-'))
  try {
    run(dir)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
}

function runDetectPreferenceTest() {
  const result = __test__.pickSearchBackend({
    bundled: { available: true, path: 'D:/tools/rg.exe', version: '1.0.0' },
    system: { available: true, path: 'C:/rg.exe', version: '0.9.0' },
    powershell: { available: true },
  })
  assert.equal(result.backend, 'bundled-rg')
  assert.equal(result.source, 'D:/tools/rg.exe')
}

function runSystemFallbackTest() {
  const result = __test__.pickSearchBackend({
    bundled: { available: false, path: '', version: '' },
    system: { available: true, path: 'C:/rg.exe', version: '1.1.0' },
    powershell: { available: true },
  })
  assert.equal(result.backend, 'system-rg')
  assert.equal(result.source, 'C:/rg.exe')
}

function runPowerShellFallbackTest() {
  const result = __test__.pickSearchBackend({
    bundled: { available: false, path: '', version: '' },
    system: { available: false, path: '', version: '' },
    powershell: { available: true },
  })
  assert.equal(result.backend, 'powershell')
  assert.equal(result.fallbackAvailable, true)
}

function runEnvPrependTest() {
  const env = __test__.prependToolDirToEnvPath({
    PATH: 'C:\\Windows\\System32',
  }, 'D:\\tools\\rg')
  assert.equal(env.PATH.startsWith('D:\\tools\\rg;'), true)
  assert.equal(env.Path, env.PATH)
}

function runDedupPrependTest() {
  const env = __test__.prependToolDirToEnvPath({
    PATH: 'D:\\tools\\rg;C:\\Windows\\System32',
  }, 'D:\\tools\\rg')
  assert.equal(env.PATH, 'D:\\tools\\rg;C:\\Windows\\System32')
}

function runLowercasePathPrependTest() {
  const env = __test__.prependToolDirToEnvPath({
    Path: 'C:\\Windows\\System32',
  }, 'D:\\tools\\rg')
  assert.equal(env.Path.startsWith('D:\\tools\\rg;'), true)
  assert.equal(env.PATH, env.Path)
}

function runResultNormalizationTest() {
  const normalized = __test__.normalizeRgLines([
    { filePath: 'src/main.js', line: 2, column: 4, text: 'createApp()' },
  ], 50)
  assert.deepEqual(normalized, {
    results: [{ filePath: 'src/main.js', line: 2, column: 4, text: 'createApp()' }],
    truncated: false,
  })
}

function runFileSuggestionRootQueryTest() {
  const suggestions = __test__.suggestFilePaths([
    'src/main.js',
    'src/utils/helper.js',
    'README.md',
    '.env',
  ], '')
  assert.deepEqual(suggestions, [
    'src/',
    'README.md',
    '.env',
  ])
}

function runFileSuggestionNestedQueryTest() {
  const suggestions = __test__.suggestFilePaths([
    'src/main.js',
    'src/utils/helper.js',
    'src/utils/http/client.js',
    'src/views/home.vue',
  ], 'src/u')
  assert.deepEqual(suggestions, [
    'src/utils/',
  ])
}

function runFileSuggestionTrailingSlashTest() {
  const suggestions = __test__.suggestFilePaths([
    'src/main.js',
    'src/utils/helper.js',
    'src/utils/http/client.js',
  ], 'src/utils/')
  assert.deepEqual(suggestions, [
    'src/utils/http/',
    'src/utils/helper.js',
  ])
}

function runAgentListFilesQueryDoesNotUseDisplayLimitAsEnumLimitTest() {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, 'aaa'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'aaa', 'first.txt'), 'x', 'utf8')
    fs.writeFileSync(path.join(dir, 'src', 'components', 'demo.vue'), 'x', 'utf8')

    const result = agentLocalSearch.listFiles({ cwd: dir, query: 'src/co', maxResults: 1, fileEnumLimit: 100 })
    assert.equal(Boolean(result && !result.error), true)
    assert.deepEqual(result.suggestions, ['src/components/'])
  })
}

function runAgentRegistrationBoundaryTest() {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')
  const agentEntrySource = fs.readFileSync(path.join(__dirname, '..', 'packages', 'agent', 'electron', 'index.js'), 'utf8')
  assert.doesNotMatch(mainSource, /registerLocalSearchIpc\s*\(\s*ipcMain\s*\)/)
  assert.match(mainSource, /registerAgentIPCs\s*\(/)
  assert.match(agentEntrySource, /registerLocalSearchIpc\s*\(\s*ipcMain\s*\)/)
  assert.equal(typeof agentLocalSearch.registerLocalSearchIpc, 'function')
}

function runCodexRuntimeUsesBundledRgForSlashCommandsTest() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'packages', 'agent', 'electron', 'codexAgent.js'), 'utf8')
  assert.match(
    source,
    /codex-list-slash-commands[\s\S]*new Codex\(\{[\s\S]*env:\s*augmentEnvWithBundledRg\(/,
  )
}

function runPtyRuntimeUsesBundledRgTest() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'mainModules', 'ptyManager.js'), 'utf8')
  assert.match(source, /augmentEnvWithBundledRg/)
  assert.match(source, /env:\s*augmentEnvWithBundledRg\(/)
}

function run() {
  withTempDir(() => {
    runDetectPreferenceTest()
    runSystemFallbackTest()
    runPowerShellFallbackTest()
    runEnvPrependTest()
    runDedupPrependTest()
    runLowercasePathPrependTest()
    runResultNormalizationTest()
    runFileSuggestionRootQueryTest()
    runFileSuggestionNestedQueryTest()
    runFileSuggestionTrailingSlashTest()
    runAgentListFilesQueryDoesNotUseDisplayLimitAsEnumLimitTest()
    runAgentRegistrationBoundaryTest()
    runCodexRuntimeUsesBundledRgForSlashCommandsTest()
    runPtyRuntimeUsesBundledRgTest()
  })
  console.log('local search tests passed')
}

run()
