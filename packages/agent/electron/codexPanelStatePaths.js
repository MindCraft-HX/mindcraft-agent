const path = require('path')
const os = require('os')
const { app } = require('electron')

function getCodexPanelStatePaths(options = {}) {
  const userDataDir = options.userDataDir || app.getPath('userData')
  const homeDir = options.homeDir || os.homedir()
  const primary = path.join(userDataDir, 'codex-panel-state.json')
  const legacy = path.join(homeDir, '.codex', 'codex-panel-state.json')
  return { primary, legacy }
}

function getCodexPanelStateReadCandidates(options = {}) {
  const { primary, legacy } = getCodexPanelStatePaths(options)
  return [...new Set([primary, legacy].filter(Boolean))]
}

module.exports = {
  getCodexPanelStatePaths,
  getCodexPanelStateReadCandidates,
}
