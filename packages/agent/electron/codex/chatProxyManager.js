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

/** @type {Map<string, { port: number, close: () => Promise<void> }>} */
const serversByFingerprint = new Map()

function proxyFingerprint(upstreamUrl, apiKey, model, reasoningEffort) {
  const keyHash = crypto.createHash('sha256').update(String(apiKey || '')).digest('hex')
  return [
    String(upstreamUrl || '').replace(/\/+$/, ''),
    keyHash,
    String(model || '').trim(),
    String(reasoningEffort || '').trim(),
  ].join('|')
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
  const { upstreamUrl, apiKey, model, reasoningEffort, diagnosticId } = opts
  const fingerprint = proxyFingerprint(upstreamUrl, apiKey, model, reasoningEffort)
  const existing = serversByFingerprint.get(fingerprint)

  if (existing) {
    const routeToken = existing.registerDiagnosticRoute ? existing.registerDiagnosticRoute(diagnosticId) : ''
    const baseUrl = routeToken
      ? `http://127.0.0.1:${existing.port}/diag/${routeToken}/v1`
      : `http://127.0.0.1:${existing.port}/v1`
    return { port: existing.port, baseUrl, codexConfig: buildProxyCodexConfig(baseUrl) }
  }

  const server = await startCodexProxy({ upstreamUrl, apiKey, model, reasoningEffort, diagnosticId })
  serversByFingerprint.set(fingerprint, server)

  const routeToken = server.registerDiagnosticRoute ? server.registerDiagnosticRoute(diagnosticId) : ''
  const baseUrl = routeToken
    ? `http://127.0.0.1:${server.port}/diag/${routeToken}/v1`
    : `http://127.0.0.1:${server.port}/v1`
  console.log('[codex] proxy started:', { port: server.port, upstream: upstreamUrl })
  return { port: server.port, baseUrl, codexConfig: buildProxyCodexConfig(baseUrl) }
}

async function shutdownProxy(fingerprint) {
  const key = String(fingerprint || '').trim()
  if (key) {
    const server = serversByFingerprint.get(key)
    if (!server) return
    try { await server.close() } catch (_) {}
    serversByFingerprint.delete(key)
    console.log('[codex] proxy closed:', { fingerprint: key })
    return
  }

  const closers = Array.from(serversByFingerprint.entries())
  serversByFingerprint.clear()
  await Promise.allSettled(closers.map(async ([fp, server]) => {
    try { await server.close() } catch (_) {}
    console.log('[codex] proxy closed:', { fingerprint: fp })
  }))
}

function isProxyRunning(fingerprint) {
  const key = String(fingerprint || '').trim()
  if (key) return serversByFingerprint.has(key)
  return serversByFingerprint.size > 0
}

process.on('exit', () => {
  for (const server of serversByFingerprint.values()) {
    try { server.close() } catch (_) {}
  }
})

module.exports = {
  ensureProxy,
  shutdownProxy,
  isProxyRunning,
  buildProxyCodexConfig,
  PROXY_PROVIDER_ID,
  __test__: {
    proxyFingerprint,
  },
}
