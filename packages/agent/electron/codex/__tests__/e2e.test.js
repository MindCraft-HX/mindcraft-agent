/**
 * 端到端测试：启动模拟上游 → 代理转换 → 验证输出
 * 运行: node packages/agent/electron/codex/__tests__/e2e.test.js
 */
'use strict'

const http = require('http')
const assert = require('assert')
const { startCodexProxy } = require('../proxyServer')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`) },
        err => { failed++; console.error(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}`) }
      )
    }
    passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    return Promise.resolve()
  } catch (err) {
    failed++; console.error(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}`)
    return Promise.resolve()
  }
}

// ─── 启动模拟上游 ───
function startMockUpstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => server.close() })
    })
  })
}

// ─── 通过代理发请求 ───
async function proxyRequest(proxyPort, body) {
  const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, contentType: res.headers.get('content-type'), text }
}

async function proxyRawRequest(proxyPort, rawBuffers, contentType = 'application/json; charset=utf-8') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: proxyPort,
      path: '/v1/responses',
      method: 'POST',
      headers: { 'Content-Type': contentType },
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          text: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('error', reject)
    for (const chunk of rawBuffers) req.write(chunk)
    req.end()
  })
}

async function runTests() {
  console.log('\n═══ 端到端代理测试 ═══\n')

  // ─── 测试 1: 上游返回标准 SSE 流 ───
  await test('SSE streaming with content', async () => {
    const upstream = await startMockUpstream((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"id":"chatcmpl_1","created":123,"model":"m","choices":[{"delta":{"content":"Hello"}}]}\n\n')
      res.write('data: {"id":"chatcmpl_1","created":123,"model":"m","choices":[{"delta":{"content":" World"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })

    const proxy = await startCodexProxy({ upstreamUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'test', model: 'm' })
    const result = await proxyRequest(proxy.port, { model: 'm', input: [{ role: 'user', content: 'hi' }], stream: true })

    assert.ok(result.text.includes('event: response.created'))
    assert.ok(result.text.includes('event: response.in_progress'))
    assert.ok(result.text.includes('event: response.output_text.delta'))
    assert.ok(result.text.includes('Hello World'))
    assert.ok(result.text.includes('event: response.completed'))
    assert.ok(!result.text.includes('[DONE]'))

    await upstream.close()
    await proxy.close()
  })

  // ─── 测试 2: 上游返回非 SSE（application/json）───
  await test('non-SSE fallback: application/json', async () => {
    const upstream = await startMockUpstream((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: 'chatcmpl_2', created: 123, model: 'm',
        choices: [{ message: { role: 'assistant', content: 'Hi there' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }))
    })

    const proxy = await startCodexProxy({ upstreamUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'test', model: 'm' })
    const result = await proxyRequest(proxy.port, { model: 'm', input: [{ role: 'user', content: 'hi' }], stream: true })

    assert.strictEqual(result.contentType, 'application/json')
    const body = JSON.parse(result.text)
    assert.strictEqual(body.status, 'completed')
    assert.strictEqual(body.output[0].content[0].text, 'Hi there')
    assert.strictEqual(body.usage.input_tokens, 1)

    await upstream.close()
    await proxy.close()
  })

  // ─── 测试 3: 上游返回 SSE reasoning ───
  await test('SSE with reasoning_content', async () => {
    const upstream = await startMockUpstream((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"id":"r1","created":123,"model":"ds-r","choices":[{"delta":{"reasoning_content":"Think..."}}]}\n\n')
      res.write('data: {"id":"r1","created":123,"model":"ds-r","choices":[{"delta":{"content":"Answer"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":6,"total_tokens":7,"completion_tokens_details":{"reasoning_tokens":3}}}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })

    const proxy = await startCodexProxy({ upstreamUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'test', model: 'ds-r' })
    const result = await proxyRequest(proxy.port, { model: 'ds-r', input: [{ role: 'user', content: 'q' }], stream: true })

    assert.ok(result.text.includes('response.reasoning_summary_text.delta'))
    assert.ok(result.text.includes('Think...'))
    assert.ok(result.text.includes('Answer'))
    assert.ok(result.text.includes('response.completed'))

    await upstream.close()
    await proxy.close()
  })

  // ─── 测试 4: 上游返回错误 ───
  await test('upstream HTTP error → normalized response', async () => {
    const upstream = await startMockUpstream((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Invalid key', type: 'auth_error' } }))
    })

    const proxy = await startCodexProxy({ upstreamUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'test', model: 'm' })
    const result = await proxyRequest(proxy.port, { model: 'm', input: [{ role: 'user', content: 'hi' }], stream: true })

    assert.strictEqual(result.status, 401)
    const body = JSON.parse(result.text)
    assert.strictEqual(body.error.message, 'Invalid key')

    await upstream.close()
    await proxy.close()
  })

  // ─── 测试 5: 非流式请求 ───
  await test('non-streaming request → non-streaming response', async () => {
    const upstream = await startMockUpstream((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: 'chatcmpl_3', created: 123, model: 'm',
        choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
      }))
    })

    const proxy = await startCodexProxy({ upstreamUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'test', model: 'm' })
    const result = await proxyRequest(proxy.port, { model: 'm', input: [{ role: 'user', content: 'hi' }], stream: false })

    assert.strictEqual(result.contentType, 'application/json')
    const body = JSON.parse(result.text)
    assert.strictEqual(body.status, 'completed')
    assert.strictEqual(body.output[0].content[0].text, 'OK')

    await upstream.close()
    await proxy.close()
  })

  await test('UTF-8 request body split inside Chinese character', async () => {
    let capturedBody = ''
    const upstream = await startMockUpstream((req, res) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        capturedBody = Buffer.concat(chunks).toString('utf8')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'chatcmpl_utf8', created: 123, model: 'm',
          choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        }))
      })
    })

    const proxy = await startCodexProxy({ upstreamUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'test', model: 'm' })
    const raw = JSON.stringify({
      model: 'm',
      input: [
        { role: 'user', content: '你好，你是什么模型？' },
        { role: 'user', content: '收到请回复' },
      ],
      stream: false,
    })
    const bytes = Buffer.from(raw, 'utf8')
    const splitAt = Buffer.from(raw.slice(0, raw.indexOf('好')), 'utf8').length + 1
    const result = await proxyRawRequest(proxy.port, [
      bytes.subarray(0, splitAt),
      bytes.subarray(splitAt),
    ])

    assert.strictEqual(result.status, 200)
    const forwarded = JSON.parse(capturedBody)
    assert.strictEqual(forwarded.messages[0].content, '你好，你是什么模型？')
    assert.strictEqual(forwarded.messages[1].content, '收到请回复')

    await upstream.close()
    await proxy.close()
  })

  // ─── 结果 ───
  console.log(`\n${'═'.repeat(50)}`)
  if (failed === 0) {
    console.log(`\x1b[32m全部通过: ${passed} tests\x1b[0m\n`)
  } else {
    console.log(`\x1b[31m${passed} passed, ${failed} failed\x1b[0m\n`)
    process.exit(1)
  }
}

runTests().catch(err => { console.error(err); process.exit(1) })
