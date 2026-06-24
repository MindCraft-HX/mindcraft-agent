/**
 * Chat proxy manager lifecycle tests.
 *
 * Run:
 *   node packages/agent/electron/codex/__tests__/chatProxyManager.test.js
 */
'use strict'

const assert = require('assert')
const {
  ensureProxy,
  shutdownProxy,
  __test__,
} = require('../chatProxyManager')

async function run() {
  const shared = {
    upstreamUrl: 'http://127.0.0.1:9',
    apiKey: 'test-key',
    reasoningEffort: 'high',
  }

  const first = await ensureProxy({ ...shared, model: 'deepseek-v4-pro' })
  const again = await ensureProxy({ ...shared, model: 'deepseek-v4-pro' })
  assert.equal(first.port, again.port, 'same fingerprint should reuse proxy')

  const second = await ensureProxy({ ...shared, model: 'kimi-k2.7-code' })
  assert.notEqual(first.port, second.port, 'different fingerprint should use isolated proxy')

  assert.equal(
    __test__.proxyFingerprint(shared.upstreamUrl, shared.apiKey, 'deepseek-v4-pro', shared.reasoningEffort)
      !== __test__.proxyFingerprint(shared.upstreamUrl, shared.apiKey, 'kimi-k2.7-code', shared.reasoningEffort),
    true,
    'different runtime identities should hash differently'
  )

  await shutdownProxy()
  console.log('chatProxyManager tests passed')
}

run().catch(async (error) => {
  try { await shutdownProxy() } catch (_) {}
  console.error(error)
  process.exit(1)
})
