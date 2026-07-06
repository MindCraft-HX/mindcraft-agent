/**
 * MindCraft 插件管理器
 * 职责：插件市场清单拉取、插件下载/安装/卸载、插件数据存取、注册表管理
 * 存储位置：app.getPath('userData')/plugins/ — 与安装目录隔离，主程序升级不丢
 */
const { app, ipcMain, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const compressing = require('compressing')
const crypto = require('crypto')
const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels')

// ─── 常量 ─────────────────────────────────────────────
const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins')
const REGISTRY_FILE = path.join(app.getPath('userData'), 'plugin-registry.json')
const MARKETPLACE_URL = 'https://download.mindcraft.com.cn/MindCraft-Agent/plugins/marketplace.json'

// ─── 状态 ─────────────────────────────────────────────
let pluginRegistry = {}  // { [pluginId]: { id, name, version, installed, enabled, installPath, installedAt, devMode } }

// ─── 插件数据存储（原生 JSON 文件，替代 electron-conf）──
const PLUGIN_DATA_FILE = path.join(app.getPath('userData'), 'plugin-data.json')

function _readPluginData() {
  try {
    if (fs.existsSync(PLUGIN_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(PLUGIN_DATA_FILE, 'utf-8'))
    }
  } catch (_) { /* ignore */ }
  return {}
}

function _writePluginData(data) {
  try {
    fs.writeFileSync(PLUGIN_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (_) { /* ignore */ }
}

function getPluginDataConf() {
  return {
    get(pluginId, defaultValue) {
      const all = _readPluginData()
      return all[pluginId] !== undefined ? all[pluginId] : defaultValue
    },
    set(pluginId, value) {
      const all = _readPluginData()
      all[pluginId] = value
      _writePluginData(all)
    },
    delete(pluginId) {
      const all = _readPluginData()
      delete all[pluginId]
      _writePluginData(all)
    },
  }
}

// ─── 文件系统工具 ──────────────────────────────────────
function ensurePluginsDir() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true })
  }
}

function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      pluginRegistry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'))
    }
  } catch (_) {
    pluginRegistry = {}
  }
}

function saveRegistry() {
  ensurePluginsDir()
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(pluginRegistry, null, 2), 'utf-8')
}

// ─── 启动扫描 & 校验（由 main.js 调用）─────────────────
function scanAndValidate() {
  if (!fs.existsSync(PLUGINS_DIR)) return

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginDir = path.join(PLUGINS_DIR, entry.name)
    const manifestPath = path.join(pluginDir, 'manifest.json')

    // 孤儿目录：无 manifest.json → 清理
    if (!fs.existsSync(manifestPath)) {
      try { fs.rmSync(pluginDir, { recursive: true }) } catch (_) {}
      continue
    }

    // 注册表中无记录但目录存在 → 自动注册（恢复场景）
    if (!pluginRegistry[entry.name]) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        pluginRegistry[entry.name] = {
          id: entry.name,
          name: manifest.name || entry.name,
          version: manifest.version || '0.0.0',
          installed: true,
          enabled: true,
          installPath: pluginDir,
          installedAt: Date.now(),
          icon: manifest.icon || ''
        }
      } catch (_) {}
    } else {
      // 更新 installPath（可能 userData 路径变更）
      pluginRegistry[entry.name].installPath = pluginDir
    }
  }

  // 清理注册表中指向不存在目录的条目
  for (const id of Object.keys(pluginRegistry)) {
    const p = pluginRegistry[id]
    if (p.installPath && !fs.existsSync(p.installPath)) {
      delete pluginRegistry[id]
    }
  }
  saveRegistry()
}

// ─── 开发模式：扫描 dev-plugins/ ───────────────────────
function scanDevPlugins() {
  const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged
  if (isProduction) return

  const devPluginsDir = path.join(app.getAppPath(), 'dev-plugins')
  if (!fs.existsSync(devPluginsDir)) return

  const entries = fs.readdirSync(devPluginsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(devPluginsDir, entry.name, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const id = manifest.id || entry.name

    pluginRegistry[id] = {
      id,
      name: manifest.name || entry.name,
      version: (manifest.version || '0.0.0') + '-dev',
      installed: true,
      enabled: true,
      installPath: path.join(devPluginsDir, entry.name),
      installedAt: Date.now(),
      devMode: true,
      icon: manifest.icon || ''
    }
  }
  saveRegistry()
}

// ─── 广播：通知所有渲染进程插件列表已变更 ──────────────
function broadcastPluginChange() {
  const plugins = getInstalledPlugins()
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(CORE_CHANNELS.PLUGIN_REGISTRY_CHANGED, plugins)
    }
  })
}

// ═══════════════════════════════════════════════════════
//  IPC Handlers
// ═══════════════════════════════════════════════════════

// ─── 市场清单 ──────────────────────────────────────────
async function fetchMarketplaceListing() {
  try {
    const res = await axios.get(MARKETPLACE_URL, { timeout: 15000 })
    return res.data
  } catch (_cdnErr) {
    // 回退 1：生产模式用 dist/，开发模式用 public/
    const basePath = app.getAppPath()
    const candidates = [
      path.join(basePath, 'dist', 'plugins', 'marketplace.json'),
      path.join(basePath, 'public', 'plugins', 'marketplace.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'))
      }
    }
    // 回退 2：返回空清单，不抛异常
    console.warn('[pluginManager] 市场清单不可用，返回空列表')
    return { version: 1, plugins: [] }
  }
}

// ─── 下载插件 ZIP ──────────────────────────────────────
async function downloadPlugin(pluginMeta) {
  const url = pluginMeta.downloadUrl
  const tempDir = path.join(app.getPath('temp'), 'mindcraft-plugin-temp')
  fs.mkdirSync(tempDir, { recursive: true })
  const tempZip = path.join(tempDir, `${pluginMeta.id}.zip`)

  const writer = fs.createWriteStream(tempZip)
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 300000  // 5 分钟超时，适应大插件
  })

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      // SHA256 校验（如果 marketplace.json 中声明了）
      if (pluginMeta.sha256) {
        try {
          const fileBuffer = fs.readFileSync(tempZip)
          const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
          if (hash !== pluginMeta.sha256) {
            try { fs.unlinkSync(tempZip) } catch (_) {}
            return reject(new Error('SHA256_MISMATCH: 下载文件校验失败，请重试'))
          }
        } catch (e) {
          if (e.message.startsWith('SHA256')) throw e
          // 读文件失败也清理
        }
      }
      resolve(tempZip)
    })
    writer.on('error', reject)
  })
}

// ─── 安装插件 ──────────────────────────────────────────
async function installPlugin(pluginMeta) {
  ensurePluginsDir()
  const installPath = path.join(PLUGINS_DIR, pluginMeta.id)

  // 删除旧版本
  if (fs.existsSync(installPath)) {
    fs.rmSync(installPath, { recursive: true })
  }

  let tempZip = null
  try {
    tempZip = await downloadPlugin(pluginMeta)

    // 解压
    await compressing.zip.uncompress(tempZip, installPath)

    // 校验 manifest.json 存在
    const manifestPath = path.join(installPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('INVALID_PLUGIN: 插件包缺少 manifest.json')
    }

    // 读取 manifest 获取元信息
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

    // 版本兼容性检查
    if (manifest.minAppVersion) {
      const appVersion = app.getVersion()
      if (compareVersions(appVersion, manifest.minAppVersion) < 0) {
        // 不兼容：仍然安装但标记
        console.warn(`[pluginManager] 插件 ${pluginMeta.id} 要求最低版本 ${manifest.minAppVersion}，当前 ${appVersion}`)
      }
    }

    // 注册
    pluginRegistry[pluginMeta.id] = {
      id: pluginMeta.id,
      name: manifest.name || pluginMeta.name,
      version: manifest.version || pluginMeta.version,
      installed: true,
      enabled: true,
      installPath,
      installedAt: Date.now(),
      icon: manifest.icon || ''
    }
    saveRegistry()
    broadcastPluginChange()

    return { success: true, plugin: pluginRegistry[pluginMeta.id] }
  } finally {
    // 清理临时文件
    if (tempZip) {
      try { fs.unlinkSync(tempZip) } catch (_) {}
    }
    const tempDir = path.join(app.getPath('temp'), 'mindcraft-plugin-temp')
    try { fs.rmSync(tempDir, { recursive: true }) } catch (_) {}
  }
}

// ─── 卸载插件 ──────────────────────────────────────────
function uninstallPlugin(pluginId) {
  if (!pluginRegistry[pluginId]) {
    throw new Error('NOT_INSTALLED: 插件未安装')
  }

  const target = pluginRegistry[pluginId]
  // dev 插件：只从注册表移除，不删 dev-plugins/ 中的源文件
  if (target.devMode) {
    delete pluginRegistry[pluginId]
    saveRegistry()
    broadcastPluginChange()
    return { success: true, devMode: true }
  }

  if (target.installPath && fs.existsSync(target.installPath)) {
    fs.rmSync(target.installPath, { recursive: true })
  }

  delete pluginRegistry[pluginId]
  saveRegistry()
  broadcastPluginChange()

  return { success: true }
}

// ─── 启用/禁用 ─────────────────────────────────────────
function togglePlugin(pluginId, enabled) {
  if (!pluginRegistry[pluginId]) {
    throw new Error('NOT_INSTALLED: 插件未安装')
  }
  pluginRegistry[pluginId].enabled = enabled
  saveRegistry()
  broadcastPluginChange()
  return { success: true }
}

// ─── 获取已安装列表 ────────────────────────────────────
function getInstalledPlugins() {
  const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged
  const all = Object.values(pluginRegistry)
  // 生产模式下过滤掉 dev 模式插件（避免 dev 注册记录残留到生产环境）
  const plugins = isProduction ? all.filter(p => !p.devMode) : all
  return plugins.map(p => ({
    id: p.id,
    name: p.name,
    version: p.version,
    installed: p.installed,
    enabled: p.enabled,
    installPath: p.installPath,
    devMode: p.devMode || false,
    icon: p.icon || ''
  }))
}

// ─── 读取插件入口文件 ──────────────────────────────────
function readPluginEntry(pluginId) {
  const p = pluginRegistry[pluginId]
  if (!p) throw new Error('NOT_INSTALLED: 插件未安装')

  const manifestPath = path.join(p.installPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('MANIFEST_NOT_FOUND')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const entryFile = manifest.entry || 'index.js'
  const entryPath = path.join(p.installPath, entryFile)

  if (!fs.existsSync(entryPath)) throw new Error('ENTRY_NOT_FOUND: 插件入口文件不存在')

  return fs.readFileSync(entryPath, 'utf-8')
}

// ─── 读取插件资源（图标、图片等）────────────────────────
function readPluginAsset(pluginId, relativePath) {
  const p = pluginRegistry[pluginId]
  if (!p) throw new Error('NOT_INSTALLED: 插件未安装')

  const fullPath = path.join(p.installPath, relativePath)
  const resolved = path.resolve(fullPath)

  // 安全检查：防止路径穿越
  const baseDir = path.resolve(p.installPath)
  if (!resolved.startsWith(baseDir)) {
    throw new Error('PATH_TRAVERSAL_DETECTED')
  }
  if (!fs.existsSync(resolved)) throw new Error('FILE_NOT_FOUND')

  // 返回 file:// URL，Electron 可直接加载
  return `file://${resolved.replace(/\\/g, '/')}`
}

// ─── 插件数据存取（JSON 文件，按 pluginId 隔离）─
function getPluginData(pluginId, key) {
  const conf = getPluginDataConf()
  const allData = conf.get(pluginId, {})
  return key !== undefined && key !== null ? allData[key] : allData
}

function setPluginData(pluginId, key, value) {
  const conf = getPluginDataConf()
  const allData = conf.get(pluginId, {})
  allData[key] = value
  conf.set(pluginId, allData)
  return { success: true }
}

function deletePluginData(pluginId, key) {
  const conf = getPluginDataConf()
  if (key !== undefined && key !== null) {
    const allData = conf.get(pluginId, {})
    delete allData[key]
    conf.set(pluginId, allData)
  } else {
    conf.delete(pluginId)
  }
  return { success: true }
}

// ─── 版本号比较工具 ────────────────────────────────────
function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

// ═══════════════════════════════════════════════════════
//  对外暴露
// ═══════════════════════════════════════════════════════

function registerIPCHandlers() {
  ipcMain.handle(CORE_CHANNELS.PLUGIN_MARKETPLACE_LISTING, fetchMarketplaceListing)
  ipcMain.handle(CORE_CHANNELS.PLUGIN_MARKETPLACE_INSTALL, async (_e, pluginMeta) => installPlugin(pluginMeta))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_MARKETPLACE_UNINSTALL, async (_e, pluginId) => uninstallPlugin(pluginId))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_MARKETPLACE_ENABLE, async (_e, pluginId) => togglePlugin(pluginId, true))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_MARKETPLACE_DISABLE, async (_e, pluginId) => togglePlugin(pluginId, false))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_GET_INSTALLED, async () => getInstalledPlugins())
  ipcMain.handle(CORE_CHANNELS.PLUGIN_READ_ENTRY, async (_e, pluginId) => readPluginEntry(pluginId))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_READ_ASSET, async (_e, pluginId, relativePath) => readPluginAsset(pluginId, relativePath))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_GET_DATA, async (_e, pluginId, key) => getPluginData(pluginId, key))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_SET_DATA, async (_e, pluginId, key, value) => setPluginData(pluginId, key, value))
  ipcMain.handle(CORE_CHANNELS.PLUGIN_DELETE_DATA, async (_e, pluginId, key) => deletePluginData(pluginId, key))
}

module.exports = {
  loadRegistry,
  scanAndValidate,
  scanDevPlugins,
  registerIPCHandlers,
  getInstalledPlugins
}
