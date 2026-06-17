const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { getCodexPanelStatePaths, getCodexPanelStateReadCandidates } = require('./codexPanelStatePaths')

test('codex panel state paths prefer MindCraft userData and keep legacy fallback', () => {
  const userDataDir = path.join('D:', 'MindCraftUserData')
  const homeDir = path.join('C:', 'Users', 'demo')

  const paths = getCodexPanelStatePaths({ userDataDir, homeDir })

  assert.equal(paths.primary, path.join(userDataDir, 'codex-panel-state.json'))
  assert.equal(paths.legacy, path.join(homeDir, '.codex', 'codex-panel-state.json'))
  assert.deepEqual(getCodexPanelStateReadCandidates({ userDataDir, homeDir }), [
    paths.primary,
    paths.legacy,
  ])
})
