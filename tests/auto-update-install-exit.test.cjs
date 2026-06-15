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

const mainSource = readText('electron/main.js')
const updaterSource = readText('electron/mainModules/autoUpdate.js')
const settingsSource = readText('packages/agent/src/components/agentCommon/components/SystemSettings.vue')
const zh = readJson('src/locales/zh-CN.json')
const en = readJson('src/locales/en.json')

assert.match(
  mainSource,
  /let\s+isQuittingForUpdate\s*=\s*false/,
  'main process should track update-install quit state before quitAndInstall closes windows'
)

assert.match(
  mainSource,
  /function\s+prepareForUpdateInstall\s*\(\)\s*\{[\s\S]*isQuittingForUpdate\s*=\s*true[\s\S]*\}/,
  'main process should enter update-install quit state before invoking the updater'
)

assert.match(
  mainSource,
  /if\s*\(\s*isQuittingForUpdate\s*\|\|\s*isAppQuitting\s*\)\s*\{[\s\S]*return[\s\S]*\}[\s\S]*e\.preventDefault\(\)[\s\S]*win\.hide\(\)/,
  'production close handler should allow real quit during update install instead of hiding to tray'
)

assert.match(
  mainSource,
  /setupAutoUpdater\(NODE_ENV,\s*win,\s*\{[\s\S]*beforeInstall:\s*prepareForUpdateInstall[\s\S]*\}\)/,
  'auto updater setup should receive the update-install cleanup hook'
)

assert.match(
  updaterSource,
  /function\s+setupAutoUpdater\s*\(\s*env,\s*win,\s*\{\s*beforeInstall[\s\S]*\}\s*=\s*\{\s*\}\s*\)/,
  'setupAutoUpdater should accept a beforeInstall hook'
)

assert.match(
  updaterSource,
  /ipcMain\.on\('install-update'[\s\S]*beforeInstall\?\.\(\)[\s\S]*autoUpdater\.quitAndInstall/,
  'install-update IPC should run beforeInstall before quitAndInstall'
)

assert.match(
  settingsSource,
  /v-if="updateState !== 'downloaded'"/,
  'downloaded update state should not render the check-for-updates button as a second action'
)

assert.strictEqual(zh.settings.appUpdateDownloaded, '更新包已下载')
assert.strictEqual(zh.settings.restartToInstall, '退出并安装更新')
assert.strictEqual(en.settings.appUpdateDownloaded, 'Update downloaded')
assert.strictEqual(en.settings.restartToInstall, 'Quit and Install Update')

console.log('auto update install exit tests passed')
