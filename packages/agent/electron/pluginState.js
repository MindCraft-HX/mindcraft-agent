/**
 * 读取插件市场状态（纯函数，参数化路径依赖，可脱离 Electron 测试）
 *
 * 从 claudeAgent.js 提取，去除对 CLADUE_PLUGINS_DIR 常量的硬编码依赖，
 * 改为通过参数注入 pluginsDir，便于单元测试。
 */
const path = require('path')
const fs = require('fs')

function readPluginsState(pluginsDir) {
  const marketplacesDir = path.join(pluginsDir, 'marketplaces')
  let plugins = []

  // 读取安装量缓存
  const installCounts = {}
  try {
    const raw = fs.readFileSync(path.join(pluginsDir, 'install-counts-cache.json'), 'utf8')
    const j = JSON.parse(raw)
    for (const entry of (j.counts || [])) {
      installCounts[entry.plugin] = entry.unique_installs
    }
  } catch (_) {}

  // 读取黑名单
  const blocklist = new Set()
  try {
    const raw = fs.readFileSync(path.join(pluginsDir, 'blocklist.json'), 'utf8')
    const j = JSON.parse(raw)
    for (const entry of (j.plugins || [])) blocklist.add(entry.plugin)
  } catch (_) {}

  // 读取已知市场源
  const marketplaces = []
  let knownMarkets = {}
  try {
    const raw = fs.readFileSync(path.join(pluginsDir, 'known_marketplaces.json'), 'utf8')
    knownMarkets = JSON.parse(raw)
    for (const [id, info] of Object.entries(knownMarkets)) {
      marketplaces.push({ id, url: `https://github.com/${info.source?.repo || id}`, lastUpdated: info.lastUpdated })
    }
  } catch (_) {}

  // 扫描各市场的插件目录
  try {
    if (fs.existsSync(marketplacesDir)) {
      for (const marketId of fs.readdirSync(marketplacesDir)) {
        const marketPluginsDir = path.join(marketplacesDir, marketId, 'plugins')
        if (!fs.existsSync(marketPluginsDir)) continue
        for (const pluginName of fs.readdirSync(marketPluginsDir)) {
          const metaPath = path.join(marketPluginsDir, pluginName, '.claude-plugin', 'plugin.json')
          if (!fs.existsSync(metaPath)) continue
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            const pluginKey = `${pluginName}@${marketId}`
            plugins.push({
              id: pluginKey,
              name: meta.name || pluginName,
              description: meta.description || '',
              author: meta.author?.name || meta.author || marketId,
              market: marketId,
              installs: installCounts[pluginKey] || 0,
              blocked: blocklist.has(pluginKey),
              installed: false, // 由 claude plugin list 结果覆盖
            })
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  // 按安装量降序排列
  plugins.sort((a, b) => b.installs - a.installs)

  // 去重：同一插件目录名出现在多个 marketplace 镜像中时，只保留安装量最高的一条
  const seenDirNames = new Set()
  plugins = plugins.filter(p => {
    const dirName = (p.id || '').split('@')[0]
    if (!dirName || seenDirNames.has(dirName)) return false
    seenDirNames.add(dirName)
    return true
  })

  return { plugins, marketplaces }
}

module.exports = { readPluginsState }
