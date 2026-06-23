/**
 * Chat 协议转换代理 — 单例管理器
 *
 * 跟随 apiFormat 状态自动管理代理生命周期：
 *   apiFormat === 'chat' → 启动代理 + 接管 config.toml base_url
 *   apiFormat !== 'chat' → 关闭代理 + 恢复 config.toml
 *   upstream 变更        → 重启代理（先恢复旧 toml，再接管新 toml）
 *
 * 不绑定 session —— 同一时间只有一个活跃配置。
 * toml 接管借鉴 CC SWITCH：改写 Codex CLI 的 config.toml base_url 指向代理，
 * 因为 CLI 优先读 toml 而非 --config 参数，不接管则请求直连绕过代理。
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const crypto = require('crypto')
const { startCodexProxy } = require('./proxyServer')

const CODEX_CONFIG_DIR = path.join(os.homedir(), '.codex')
const CONFIG_TOML_FILE = path.join(CODEX_CONFIG_DIR, 'config.toml')

/** @type {{ port: number, close: () => Promise<void> } | null} */
let server = null

/** 当前代理对应的上游标识（url + key 前8位），用于检测配置变更 */
let currentFingerprint = ''

/** 原始 config.toml 内容（仅首次接管时备份，恢复后清空） */
let originalToml = null

function splitLines(text) {
  return String(text || '').split(/\r?\n/)
}

function findTopLevelAssignmentIndex(lines, key) {
  let inSection = false
  for (let i = 0; i < lines.length; i++) {
    const trimmed = String(lines[i] || '').trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (/^\[.*\]$/.test(trimmed)) {
      inSection = true
      continue
    }
    if (!inSection && trimmed.startsWith(key + ' ')) return i
    if (!inSection && trimmed.startsWith(key + '=')) return i
  }
  return -1
}

function parseQuotedTomlValue(line) {
  const m = String(line || '').match(/^\s*[^=]+?\s*=\s*"((?:\\.|[^"])*)"/)
  return m ? m[1].replace(/\\"/g, '"') : ''
}

function findSectionBounds(lines, sectionName) {
  const header = '[' + sectionName + ']'
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const trimmed = String(lines[i] || '').trim()
    if (start < 0) {
      if (trimmed === header) start = i
      continue
    }
    if (/^\[.*\]$/.test(trimmed)) {
      end = i
      break
    }
  }
  return { start, end }
}

/**
 * 优先改 active model_provider 的 base_url；没有 active provider 时回退到顶层。
 */
function patchTomlBaseUrl(tomlContent, proxyUrl) {
  const lines = splitLines(tomlContent)
  const modelProviderIdx = findTopLevelAssignmentIndex(lines, 'model_provider')
  const activeProvider = modelProviderIdx >= 0 ? parseQuotedTomlValue(lines[modelProviderIdx]) : ''
  const targetLine = `base_url = "${proxyUrl}"`

  if (activeProvider) {
    const section = findSectionBounds(lines, `model_providers.${activeProvider}`)
    if (section.start >= 0) {
      let replaced = false
      for (let i = section.start + 1; i < section.end; i++) {
        const trimmed = String(lines[i] || '').trim()
        if (/^base_url\s*=/.test(trimmed)) {
          lines[i] = targetLine
          replaced = true
          break
        }
      }
      if (!replaced) lines.splice(section.end, 0, targetLine)
      return lines.join('\n')
    }

    const out = [...lines]
    if (out.length && out[out.length - 1].trim() !== '') out.push('')
    out.push(`[model_providers.${activeProvider}]`)
    out.push(targetLine)
    return out.join('\n')
  }

  const rootIdx = findTopLevelAssignmentIndex(lines, 'base_url')
  if (rootIdx >= 0) {
    lines[rootIdx] = targetLine
    return lines.join('\n')
  }

  lines.push(targetLine)
  return lines.join('\n')
}

function hasProxyBaseUrl(tomlContent) {
  return /base_url\s*=\s*"http:\/\/127\.0\.0\.1:\d+\/v1"/.test(String(tomlContent || ''))
}

/**
 * 确保代理运行（按需启动/复用/重启）
 *
 * @param {{ upstreamUrl: string, apiKey: string, model: string, reasoningEffort: string }} opts
 * @returns {Promise<{ port: number }>}
 */
async function ensureProxy(opts) {
  const { upstreamUrl, apiKey, model, reasoningEffort } = opts
  const keyHash = crypto.createHash('sha256').update(String(apiKey || '')).digest('hex')
  const fingerprint = `${upstreamUrl}|${keyHash}`

  // 配置没变 → 复用
  if (server && fingerprint === currentFingerprint) {
    return { port: server.port }
  }

  // 配置变了 → 关旧（会恢复 toml）
  if (server) {
    console.log('[codex] proxy config changed, restarting...')
    await shutdownProxy()
  }

  // 启动代理
  server = await startCodexProxy({ upstreamUrl, apiKey, model, reasoningEffort })
  currentFingerprint = fingerprint

  // 接管 config.toml：备份原始内容，改写 base_url 指向代理
  const proxyUrl = `http://127.0.0.1:${server.port}/v1`
  if (fs.existsSync(CONFIG_TOML_FILE)) {
    const current = fs.readFileSync(CONFIG_TOML_FILE, 'utf8')
    // 仅在首次接管时备份（后续恢复/切换由 shutdownProxy 管理备份生命周期）
    if (originalToml === null) {
      originalToml = current
    }
    const patched = patchTomlBaseUrl(current, proxyUrl)
    if (patched !== current) {
      fs.writeFileSync(CONFIG_TOML_FILE, patched, 'utf8')
      console.log('[codex] toml patched: base_url →', proxyUrl)
    }
  }

  console.log('[codex] proxy started:', { port: server.port, upstream: upstreamUrl })
  return { port: server.port }
}

/**
 * 关闭代理，恢复 config.toml
 */
async function shutdownProxy() {
  // 恢复 toml：仅在 toml 仍指向代理地址时才恢复（用户可能已切换配置）
  if (originalToml !== null && fs.existsSync(CONFIG_TOML_FILE)) {
    try {
      const current = fs.readFileSync(CONFIG_TOML_FILE, 'utf8')
      if (hasProxyBaseUrl(current)) {
        fs.writeFileSync(CONFIG_TOML_FILE, originalToml, 'utf8')
        console.log('[codex] toml restored')
      }
    } catch (_) {}
    originalToml = null
  }

  if (server) {
    try { await server.close() } catch (_) {}
    server = null
    currentFingerprint = ''
    console.log('[codex] proxy closed')
  }
}

/**
 * 代理当前是否在运行
 */
function isProxyRunning() {
  return server !== null
}

// 进程退出保护：恢复 toml + 释放端口
process.on('exit', () => {
  if (originalToml !== null && fs.existsSync(CONFIG_TOML_FILE)) {
    try {
      const current = fs.readFileSync(CONFIG_TOML_FILE, 'utf8')
      if (hasProxyBaseUrl(current)) {
        fs.writeFileSync(CONFIG_TOML_FILE, originalToml, 'utf8')
      }
    } catch (_) {}
  }
  if (server) {
    try { server.close() } catch (_) {}
  }
})

module.exports = { ensureProxy, shutdownProxy, isProxyRunning, patchTomlBaseUrl, hasProxyBaseUrl }
