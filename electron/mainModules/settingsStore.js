/**
 * 应用设置持久化（原生 JSON 文件存储，替代 electron-conf）
 * 可用于主进程任意模块和渲染进程 IPC
 *
 * T198: Routed through settingsFacade — no longer directly reads/writes
 * app-settings.json. This module is now a thin proxy over the facade's
 * misc namespace.
 */
const { getMisc, setMisc } = require('../../packages/agent/electron/settingsFacade')

function getSetting(key) {
  if (!key) return getMisc(key, undefined)
  return getMisc(key)
}

function setSetting(key, value) {
  setMisc(key, value)
}

module.exports = { getSetting, setSetting }
