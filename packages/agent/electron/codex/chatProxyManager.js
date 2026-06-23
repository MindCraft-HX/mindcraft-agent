/**
 * Chat protocol proxy lifecycle for Codex.
 *
 * Do not modify ~/.codex/config.toml here. Codex SDK exposes a per-process
 * config override that is passed to the spawned Codex CLI as --config values,
 * so the Chat proxy can be selected without touching user-owned CLI config.
 */

const crypto = require('crypto')
const { startCodexProxy } = require('./proxyServer')

const PROXY_PROVIDER_ID = 'mindcraft_chat_proxy'

/** @type {{ port: number, close: () => Promise<void> } | null} */
let server = null
let currentFingerprint = ''

function proxyFingerprint(upstreamUrl, apiKey) {
  const keyHash = crypto.createHash('sha256').update(String(apiKey || '')).digest('hex')
  return `${String(upstreamUrl || '').replace(/\/+$/, '')}|${keyHash}`
}

function buildProxyCodexConfig(proxyBaseUrl) {
  const baseUrl = String(proxyBaseUrl || '').replace(/\/+$/, '')
  if (!baseUrl) return {}

  return {
    model_provider: PROXY_PROVIDER_ID,
    wire_api: 'responses',
    model_providers: {
      [PROXY_PROVIDER_ID]: {
        name: 'MindCraft Chat Proxy',
        base_url: baseUrl,
        wire_api: 'responses',
      },
    },
  }
}

async function ensureProxy(opts) {
  const { upstreamUrl, apiKey, model, reasoningEffort } = opts
  const fingerprint = proxyFingerprint(upstreamUrl, apiKey)

  if (server && fingerprint === currentFingerprint) {
    const baseUrl = `http://127.0.0.1:${server.port}/v1`
    return { port: server.port, baseUrl, codexConfig: buildProxyCodexConfig(baseUrl) }
  }

  if (server) {
    console.log('[codex] proxy config changed, restarting...')
    await shutdownProxy()
  }

  server = await startCodexProxy({ upstreamUrl, apiKey, model, reasoningEffort })
  currentFingerprint = fingerprint

  const baseUrl = `http://127.0.0.1:${server.port}/v1`
  console.log('[codex] proxy started:', { port: server.port, upstream: upstreamUrl })
  return { port: server.port, baseUrl, codexConfig: buildProxyCodexConfig(baseUrl) }
}

async function shutdownProxy() {
  if (server) {
    try { await server.close() } catch (_) {}
    server = null
    currentFingerprint = ''
    console.log('[codex] proxy closed')
  }
}

function isProxyRunning() {
  return server !== null
}

process.on('exit', () => {
  if (server) {
    try { server.close() } catch (_) {}
  }
})

module.exports = {
  ensureProxy,
  shutdownProxy,
  isProxyRunning,
  buildProxyCodexConfig,
  PROXY_PROVIDER_ID,
}
