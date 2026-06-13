/**
 * 应用设置持久化（原生 JSON 文件存储，替代 electron-conf）
 * 可用于主进程任意模块和渲染进程 IPC
 */
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const SETTINGS_FILE = path.join(app.getPath('userData'), 'app-settings.json')

function _read() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
    }
  } catch (_) {}
  return {}
}

function _write(data) {
  try {
    const dir = path.dirname(SETTINGS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (_) {}
}

/** 读取单个 key 或全部设置 */
function getSetting(key) {
  const all = _read()
  return key ? all[key] : all
}

/** 写入单个 key */
function setSetting(key, value) {
  const all = _read()
  all[key] = value
  _write(all)
}

module.exports = { getSetting, setSetting }
