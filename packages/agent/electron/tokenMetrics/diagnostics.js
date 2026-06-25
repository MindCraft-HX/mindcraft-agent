/**
 * Token Metrics 诊断日志模块 (Phase 0)
 *
 * 在不改行为的前提下，把每次 metric sample 的 source/phase/provider/数值/rawUsage 摘要
 * 写入 userData 下诊断文件，用于对比 live/result/poll 三类样本的数值差异。
 *
 * 开关：app-settings.json 中 diagnostics.tokenMetricsDebug，默认 false。
 * 切换方式：调用 setTokenMetricsDebug(enabled, options)。
 */

const fs = require('fs')
const path = require('path')
const {
  appendLogLineWithRotation,
  getMindCraftSettingsPath,
  ensureDirSync,
} = require('../diagnosticsFileUtils')
const { getMindCraftUserDataDir } = require('../userDataPath')

const DIAGNOSTICS_KEY = 'tokenMetricsDebug'
const LOG_FILE_NAME = 'token-metrics-diagnostics.log'

function getLogPath(options = {}) {
  return path.join(getMindCraftUserDataDir(options), LOG_FILE_NAME)
}

function readSettings(options = {}) {
  try {
    const p = getMindCraftSettingsPath(options)
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_) { return {} }
}

function writeSettings(settings, options = {}) {
  const p = getMindCraftSettingsPath(options)
  ensureDirSync(path.dirname(p))
  const tmp = `${p}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(settings || {}, null, 2), 'utf8')
  try { fs.renameSync(tmp, p) }
  catch (_) { fs.copyFileSync(tmp, p); try { fs.unlinkSync(tmp) } catch (_) {} }
  return p
}

function isTokenMetricsDebugEnabled(options = {}) {
  const settings = readSettings(options)
  const value = settings?.diagnostics?.[DIAGNOSTICS_KEY]
  return typeof value === 'boolean' ? value : false
}

function setTokenMetricsDebugEnabled(enabled, options = {}) {
  const settings = readSettings(options)
  if (!settings.diagnostics || typeof settings.diagnostics !== 'object') settings.diagnostics = {}
  settings.diagnostics[DIAGNOSTICS_KEY] = Boolean(enabled)
  const settingsPath = writeSettings(settings, options)
  return { ok: true, enabled: Boolean(enabled), path: settingsPath }
}

/**
 * 生成 rawUsage 摘要，避免整段 JSON 塞爆日志。
 * 只保留 usage 中有值的字段及其值。
 */
function summarizeRawUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const summary = {}
  for (const [k, v] of Object.entries(usage)) {
    if (v != null && v !== 0 && v !== '') {
      summary[k] = typeof v === 'object' ? summarizeRawUsage(v) : v
    }
  }
  // 全零空 usage 返回 null
  return Object.keys(summary).length > 0 ? summary : null
}

/**
 * 记录一条 metric sample。
 *
 * @param {Object} sample
 * @param {string} sample.provider       'claude' | 'codex' | 'chat'
 * @param {string} sample.source         'sdk-live' | 'sdk-result' | 'jsonl-poll' | 'token-count' | ...
 * @param {string} sample.chatKey
 * @param {string} sample.providerSessionId
 * @param {string} sample.phase          'live' | 'final' | 'history' | 'session'
 * @param {number} sample.inputTokens
 * @param {number} sample.outputTokens
 * @param {number} sample.cacheReadTokens
 * @param {number} sample.cacheCreationTokens
 * @param {number} [sample.contextUsage]
 * @param {number} [sample.durationMs]
 * @param {Object} [sample.rawUsage]
 * @param {Object} [options]
 */
function logMetricSample(sample, options = {}) {
  if (!isTokenMetricsDebugEnabled(options)) return
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      provider: sample.provider || 'unknown',
      source: sample.source || 'unknown',
      chatKey: sample.chatKey || '',
      providerSessionId: sample.providerSessionId || '',
      phase: sample.phase || 'unknown',
      in: toSafeInt(sample.inputTokens),
      out: toSafeInt(sample.outputTokens),
      cacheR: toSafeInt(sample.cacheReadTokens),
      cacheC: toSafeInt(sample.cacheCreationTokens),
      ctx: toSafeInt(sample.contextUsage),
      durMs: toSafeInt(sample.durationMs),
      raw: summarizeRawUsage(sample.rawUsage),
    })
    appendLogLineWithRotation(getLogPath(options), line + '\n', { respectDiagnosticsToggle: false })
  } catch (_) {
    // 静默失败，不影响正常流程
  }
}

function toSafeInt(v) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

module.exports = {
  getLogPath,
  isTokenMetricsDebugEnabled,
  logMetricSample,
  setTokenMetricsDebugEnabled,
  summarizeRawUsage,
}
