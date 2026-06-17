const os = require('os')
const path = require('path')
const { app } = require('electron')

function getStableFallbackUserDataDir({ homeDir = os.homedir() } = {}) {
  const base = typeof homeDir === 'string' && homeDir.trim()
    ? homeDir.trim()
    : process.cwd()
  return path.join(base, '.mindcraft-agent', 'userData')
}

function getMindCraftUserDataDir(options = {}) {
  const appRef = options.app || app
  try {
    if (appRef && typeof appRef.getPath === 'function') {
      const userData = appRef.getPath('userData')
      if (typeof userData === 'string' && userData.trim()) return userData
    }
  } catch (_) {}
  return getStableFallbackUserDataDir(options)
}

module.exports = {
  getMindCraftUserDataDir,
  getStableFallbackUserDataDir,
}
