/**
 * CodeX Chat Completions 协议转换代理 — HTTP 服务器
 *
 * 在 Electron 主进程内启动本地 HTTP 代理，
 * 将 CodeX CLI 的 Responses API 请求转换为 Chat Completions，
 * 再把响应转换回 Responses 格式。
 *
 * 从 CC SWITCH handlers.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/
 */

const http = require('http')
const { responsesToChatCompletions } = require('./transformRequest')
const { chatCompletionToResponse, chatErrorToResponseError } = require('./transformResponse')
const { createResponsesSseFromChat } = require('./transformStream')

/**
 * 启动本地 CodeX 协议转换代理
 *
 * @param {object} opts
 * @param {string} opts.upstreamUrl - 真实 Chat API base URL
 * @param {string} opts.apiKey - API Key
 * @param {string} opts.model - 模型名称
 * @param {string} opts.reasoningEffort - 推理强度
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
async function startCodexProxy(opts) {
  const { upstreamUrl, apiKey, model, reasoningEffort } = opts

  // 归一化 upstream URL (去除尾部斜杠)
  const upstream = String(upstreamUrl || '').replace(/\/+$/, '')

  if (!upstream) {
    throw new Error('Codex proxy requires upstream URL')
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res, { upstream, apiKey, model, reasoningEffort }).catch(err => {
      console.error('[codex-proxy] unhandled error:', err)
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: { type: 'proxy_error', message: 'Internal proxy error' },
        }))
      }
    })
  })

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      console.log(`[codex-proxy] listening on 127.0.0.1:${port}, upstream: ${upstream}`)
      resolve({
        port,
        close: () => new Promise((r) => {
          console.log('[codex-proxy] closing...')
          server.close(() => {
            console.log('[codex-proxy] closed')
            r()
          })
        }),
      })
    })
    server.on('error', reject)
  })
}

/**
 * 处理 HTTP 请求
 */
async function handleRequest(req, res, opts) {
  const { method } = req
  const { upstream, apiKey, model, reasoningEffort } = opts

  // 归一化 URL (去除查询参数，只比较路径)
  let pathname = req.url || '/'
  const qi = pathname.indexOf('?')
  if (qi >= 0) pathname = pathname.slice(0, qi)

  // CORS headers (CodeX CLI 可能发送预检请求)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  // POST /v1/responses — Responses API 核心入口
  if ((pathname === '/v1/responses' || pathname === '/responses') && method === 'POST') {
    return handleResponses(req, res, opts)
  }

  // POST /v1/responses/compact — 同 responses 处理 (compact 使用相同协议)
  if ((pathname === '/v1/responses/compact' || pathname === '/responses/compact') && method === 'POST') {
    return handleResponses(req, res, opts)
  }

  // GET /v1/models — 透传上游模型列表
  if ((pathname === '/v1/models' || pathname === '/models') && method === 'GET') {
    return forwardModels(req, res, opts)
  }

  // 其他请求 — 透传到上游
  return forwardToUpstream(req, res, opts)
}

/**
 * 处理 POST /v1/responses — 核心协议转换
 */
async function handleResponses(req, res, opts) {
  const { upstream, apiKey, model, reasoningEffort } = opts

  let body
  try {
    body = await readJsonBody(req)
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      error: { type: 'invalid_request', message: 'Invalid JSON body' },
    }))
  }

  const isStream = body?.stream === true

  // Step 1: 转换请求 Responses → Chat Completions
  const chatBody = responsesToChatCompletions(body, model, upstream)

  // Step 2: 转发到上游 Chat API
  let upstreamRes
  try {
    upstreamRes = await fetch(`${upstream}/chat/completions`, {
      method: 'POST',
      headers: buildUpstreamHeaders(apiKey),
      body: JSON.stringify(chatBody),
      signal: AbortSignal.timeout(300000), // 5 分钟超时
    })
  } catch (err) {
    console.error('[codex-proxy] upstream fetch error:', err.message)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      error: {
        type: 'upstream_connection_error',
        message: `Failed to connect to upstream: ${err.message}`,
      },
    }))
  }

  // Step 3: 错误处理
  if (!upstreamRes.ok) {
    let errorBody = ''
    try { errorBody = await upstreamRes.text() } catch (_) {}
    const normalizedError = chatErrorToResponseError(errorBody, upstreamRes.status)
    res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(normalizedError))
  }

  // Step 4: 流式响应
  if (isStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    try {
      // Node.js fetch ReadableStream → async iterable
      const reader = upstreamRes.body.getReader()
      const streamIterable = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              try {
                const { done, value } = await reader.read()
                if (done) return { done: true }
                const text = typeof value === 'string'
                  ? value
                  : Buffer.from(value).toString('utf8')
                return { value: text, done: false }
              } catch (err) {
                return { done: true }
              }
            },
          }
        },
      }

      for await (const event of createResponsesSseFromChat(streamIterable)) {
        res.write(event)
      }
    } catch (err) {
      console.error('[codex-proxy] stream error:', err.message)
    }

    return res.end()
  }

  // Step 5: 非流式响应
  let chatResponse
  try {
    chatResponse = await upstreamRes.json()
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      error: { type: 'upstream_error', message: 'Failed to parse upstream response' },
    }))
  }

  const responsesBody = chatCompletionToResponse(chatResponse)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(responsesBody))
}

/**
 * 透传 GET /v1/models
 */
async function forwardModels(req, res, opts) {
  const { upstream, apiKey } = opts

  try {
    const upstreamRes = await fetch(`${upstream}/models`, {
      method: 'GET',
      headers: buildUpstreamHeaders(apiKey),
      signal: AbortSignal.timeout(30000),
    })

    res.writeHead(upstreamRes.status, {
      'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
    })

    const body = await upstreamRes.text()
    res.end(body)
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      error: { type: 'upstream_error', message: `Models fetch failed: ${err.message}` },
    }))
  }
}

/**
 * 通用透传
 */
async function forwardToUpstream(req, res, opts) {
  const { upstream, apiKey } = opts
  const url = `${upstream}${req.url || ''}`

  try {
    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await readRawBody(req)
      : undefined

    const fetchHeaders = buildUpstreamHeaders(apiKey)
    if (req.headers['content-type']) {
      fetchHeaders['Content-Type'] = req.headers['content-type']
    }

    const upstreamRes = await fetch(url, {
      method: req.method,
      headers: fetchHeaders,
      body,
      signal: AbortSignal.timeout(120000),
    })

    res.writeHead(upstreamRes.status, {
      'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
    })

    const responseBody = await upstreamRes.text()
    res.end(responseBody)
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      error: { type: 'upstream_error', message: `Forward failed: ${err.message}` },
    }))
  }
}

/**
 * 构造上游请求头
 */
function buildUpstreamHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  return headers
}

/**
 * 读取 JSON 请求体
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : null) }
      catch (e) { reject(e) }
    })
  })
}

/**
 * 读取原始请求体
 */
function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

module.exports = { startCodexProxy }
