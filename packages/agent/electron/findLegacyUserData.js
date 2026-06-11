const { app } = require('electron')
const path = require('path')
const fs = require('fs')

/**
 * 探测 mindcraft-electron 的 userData 目录
 * 按优先级尝试多个候选名称，找到第一个存在的目录
 * @returns {string|null} 找到的目录路径，或 null
 */
function findLegacyUserData() {
  const appData = app.getPath('appData')
  const candidates = [
    'MindCraft-BETA',
    'MindCraft',
    'com.gaotongfont.mindcraft-beta',
    'com.gaotongfont.mindcraft',
  ]
  for (const name of candidates) {
    const dir = path.join(appData, name)
    if (fs.existsSync(dir)) return dir
  }
  return null
}

module.exports = { findLegacyUserData }
