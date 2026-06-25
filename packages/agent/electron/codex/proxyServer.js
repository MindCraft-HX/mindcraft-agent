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
const crypto = require('crypto')
const { StringDecoder } = require('string_decoder')
const { responsesToChatCompletions } = require('./transformRequest')
const { chatCompletionToResponse, chatErrorToResponseError } = require('./transformResponse')
const { createResponsesSseFromChat } = require('./transformStream')
const {
  appendCodexTurnDiagnostic,
  summarizeChatMessages,
  summarizeResponsesInputItems,
  summarizeSsePayload,
  writeCodexTurnDiagnosticArtifact,
} = require('./turnDiagnostics')

const requestPrefixHistory = new Map()

function canonicalizeForHash(value) {
  if (Array.isArray(value)) return value.map(canonicalizeForHash)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = canonicalizeForHash(value[key])
    return out
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(canonicalizeForHash(value))
}

function normalizeMessageForPrefix(message = {}) {
  const normalized = { role: message.role || '' }
  if (message.content !== undefined) normalized.content = canonicalizeForHash(message.content)
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) normalized.tool_calls = canonicalizeForHash(message.tool_calls)
  if (message.reasoning_content) normalized.reasoning_content = String(message.reasoning_content)
  if (message.tool_call_id) normalized.tool_call_id = String(message.tool_call_id)
  return normalized
}

function findFirstDiffIndex(prev = [], next = []) {
  const max = Math.max(prev.length, next.length)
  for (let i = 0; i < max; i++) {
    if (stableStringify(prev[i]) !== stableStringify(next[i])) return i
  }
  return -1
}

function logPrefixStability(upstream, chatBody) {
  const haystack = `${chatBody?.model || ''} ${upstream || ''}`.toLowerCase()
  if (!haystack.includes('deepseek')) return

  const normalizedMessages = Array.isArray(chatBody?.messages)
    ? chatBody.messages.map(normalizeMessageForPrefix)
    : []
  const fingerprint = [
    String(upstream || '').replace(/\/+$/, ''),
    String(chatBody?.model || '').trim(),
  ].join('|')
  const serialized = stableStringify(normalizedMessages)
  const hash = crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16)
  const previous = requestPrefixHistory.get(fingerprint)

  const summary = {
    upstream: String(upstream || '').replace(/\/+$/, ''),
    model: chatBody?.model || '',
    messageCount: normalizedMessages.length,
    hash,
  }

  if (!previous) {
    console.log('[codex-proxy] prefix-stability:', { ...summary, baseline: true })
    requestPrefixHistory.set(fingerprint, { normalizedMessages, hash })
    return
  }

  const same = previous.hash === hash
  if (same) {
    console.log('[codex-proxy] prefix-stability:', { ...summary, sameAsPrevious: true })
    requestPrefixHistory.set(fingerprint, { normalizedMessages, hash })
    return
  }

  const diffIndex = findFirstDiffIndex(previous.normalizedMessages, normalizedMessages)
  const prevMsg = diffIndex >= 0 ? previous.normalizedMessages[diffIndex] : null
  const nextMsg = diffIndex >= 0 ? normalizedMessages[diffIndex] : null
  console.warn('[codex-proxy] prefix-stability:', {
    ...summary,
    sameAsPrevious: false,
    diffIndex,
    previousHash: previous.hash,
    previousMessageCount: previous.normalizedMessages.length,
    previousPreview: prevMsg ? stableStringify(prevMsg).slice(0, 240) : '',
    currentPreview: nextMsg ? stableStringify(nextMsg).slice(0, 240) : '',
  })
  requestPrefixHistory.set(fingerprint, { normalizedMessages, hash })
}

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

  const diagnosticRoutes = new Map()
  function registerDiagnosticRoute(diagnosticId = '') {
    const token = crypto.randomBytes(6).toString('hex')
    diagnosticRoutes.set(token, String(diagnosticId || ''))
    return token
  }

  const server = http.createServer((req, res) => {
    const rawUrl = String(req.url || '/')
    const diagMatch = rawUrl.match(/^\/diag\/([a-f0-9]+)(\/.*)?$/i)
    const routeDiagnosticId = diagMatch ? (diagnosticRoutes.get(diagMatch[1]) || '') : ''
    const normalizedUrl = diagMatch ? (diagMatch[2] || '/') : rawUrl
    if (diagMatch) req.url = normalizedUrl
    handleRequest(req, res, { upstream, apiKey, model, reasoningEffort, diagnosticId: routeDiagnosticId }).catch(err => {
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
        registerDiagnosticRoute,
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
  const { upstream, apiKey, model, reasoningEffort, diagnosticId } = opts

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

  // 🔍 诊断日志：原始 Responses 请求（看 CodeX CLI 实际发了什么）
  console.log('[codex-proxy] ← ORIGINAL:', {
    model: body?.model,
    hasInstructions: !!body?.instructions,
    instructionsType: typeof body?.instructions,
    inputLen: body?.input?.length,
    inputTypes: body?.input?.map(item => item?.type || item?.role || 'unknown'),
    stream: body?.stream,
    maxOutputTokens: body?.max_output_tokens,
    hasReasoning: !!body?.reasoning,
    reasoningEffort: body?.reasoning?.effort,
    hasTools: !!body?.tools,
    toolCount: body?.tools?.length,
    allKeys: Object.keys(body || {}),
  })

  // Step 1: 转换请求 Responses → Chat Completions
  console.log('[codex-proxy] → ORIGINAL INPUT ROLES:', (body?.input || []).map((item, i) => ({
    i,
    type: item?.type || '',
    role: item?.role || '',
    hasReasoning: !!item?.reasoning_content || Array.isArray(item?.summary),
    hasOutput: item?.output !== undefined,
    hasContent: item?.content !== undefined,
    hasToolName: !!item?.name,
    callId: item?.call_id || '',
  })))

  const chatBody = responsesToChatCompletions(body, model, upstream, reasoningEffort)
  logPrefixStability(upstream, chatBody)

  if (diagnosticId) {
    appendCodexTurnDiagnostic({
      kind: 'proxy.request',
      diagnosticId,
      upstream,
      model: chatBody?.model || body?.model || '',
      stream: Boolean(chatBody?.stream),
      originalInput: summarizeResponsesInputItems(body?.input),
      finalRequest: summarizeChatMessages(chatBody?.messages),
      toolCount: Array.isArray(chatBody?.tools) ? chatBody.tools.length : 0,
      toolChoice: chatBody?.tool_choice || null,
      parallelToolCalls: chatBody?.parallel_tool_calls ?? null,
      reasoningEffort: chatBody?.reasoning_effort || body?.reasoning?.effort || '',
    })
    writeCodexTurnDiagnosticArtifact(diagnosticId, 'proxy-original-request', body, { kind: 'json' })
    writeCodexTurnDiagnosticArtifact(diagnosticId, 'proxy-final-chat-request', chatBody, { kind: 'json' })
  }

  // 🔍 诊断日志：确认代理实际发送的请求
  const upstreamTarget = `${upstream}/chat/completions`
  console.log('[codex-proxy] → REQUEST:', {
    url: upstreamTarget,
    modelFromCodex: body?.model,
    modelToUpstream: chatBody.model,
    stream: chatBody.stream,
    msgCount: chatBody.messages?.length,
    msgRoles: chatBody.messages?.map(m => ({ role: m.role, contentLen: typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length })),
  })

  // Step 2: 转发到上游 Chat API
  console.log('[codex-proxy] → REQUEST FULL:', JSON.stringify({
    keys: Object.keys(chatBody || {}),
    toolCount: Array.isArray(chatBody?.tools) ? chatBody.tools.length : 0,
    toolNames: (chatBody?.tools || []).map(t => t?.function?.name || '').filter(Boolean),
    tool_choice: chatBody?.tool_choice,
    parallel_tool_calls: chatBody?.parallel_tool_calls,
    stream_options: chatBody?.stream_options,
    reasoning: chatBody?.reasoning,
    reasoning_effort: chatBody?.reasoning_effort,
    thinking: chatBody?.thinking,
    enable_thinking: chatBody?.enable_thinking,
    reasoning_split: chatBody?.reasoning_split,
    messages: (chatBody?.messages || []).map((m, i) => ({
      i,
      role: m?.role,
      hasToolCalls: Array.isArray(m?.tool_calls) && m.tool_calls.length > 0,
      hasReasoning: !!m?.reasoning_content,
      reasoningPreview: typeof m?.reasoning_content === 'string' ? m.reasoning_content.slice(0, 120) : '',
      contentType: Array.isArray(m?.content) ? 'array' : typeof m?.content,
      contentPreview: typeof m?.content === 'string' ? m.content.slice(0, 160) : JSON.stringify(m?.content).slice(0, 160),
      toolCalls: (m?.tool_calls || []).map(tc => ({
        id: tc?.id,
        name: tc?.function?.name,
        argumentsPreview: typeof tc?.function?.arguments === 'string' ? tc.function.arguments.slice(0, 120) : '',
      })),
    })),
  }, null, 2))

  if (isStream) {
    return handleStreamingChatWithRetries(res, upstreamTarget, apiKey, chatBody, { diagnosticId, upstream })
  }

  let upstreamRes = await fetchUpstreamChat(upstreamTarget, apiKey, chatBody)
  if (!upstreamRes) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      error: {
        type: 'upstream_connection_error',
        message: 'Failed to connect to upstream',
      },
    }))
  }

  // Step 3: 错误处理
  if (!upstreamRes.ok) {
    let errorBody = ''
    try { errorBody = await upstreamRes.text() } catch (_) {}
    console.error('[codex-proxy] upstream error:', { status: upstreamRes.status, headers: Object.fromEntries(upstreamRes.headers.entries()), body: errorBody.slice(0, 500) })
    if (diagnosticId) {
      appendCodexTurnDiagnostic({
        kind: 'proxy.upstream-error',
        diagnosticId,
        upstream,
        status: upstreamRes.status,
        contentType: upstreamRes.headers.get('content-type') || '',
        bodyPreview: errorBody.slice(0, 800),
      })
      writeCodexTurnDiagnosticArtifact(diagnosticId, 'proxy-upstream-error-body', errorBody, { kind: 'text', ext: 'txt' })
    }
    const normalizedError = chatErrorToResponseError(errorBody, upstreamRes.status)
    res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(normalizedError))
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

async function fetchUpstreamChat(upstreamTarget, apiKey, chatBody) {
  try {
    return await fetch(upstreamTarget, {
      method: 'POST',
      headers: buildUpstreamHeaders(apiKey),
      body: JSON.stringify(chatBody),
      signal: AbortSignal.timeout(300000), // 5 分钟超时
    })
  } catch (err) {
    console.error('[codex-proxy] upstream fetch error:', err.message)
    return null
  }
}

function buildRetryChatBody(chatBody, attempt) {
  if (attempt === 0) return chatBody
  const next = { ...chatBody }

  // Some chat-compatible providers return an empty stop for reasoning-enabled
  // streams. Retry once with the same body, then retry without provider-specific
  // reasoning knobs before surfacing a failure to Codex.
  if (attempt >= 2) {
    delete next.thinking
    delete next.reasoning_effort
    delete next.reasoning
    delete next.enable_thinking
    delete next.reasoning_split
  }

  return next
}

function responseEventsHaveMeaningfulOutput(events) {
  const text = events.join('')
  if (text.includes('event: response.output_text.delta')) return true
  if (text.includes('event: response.reasoning_summary_text.delta')) return true
  if (text.includes('event: response.function_call_arguments.delta')) return true
  if (text.includes('"type":"function_call"')) return true
  return false
}

function writeSseHeaders(res) {
  if (res.headersSent) return
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
}

async function streamResponsesWithPrefixRetry(upstreamRes, res) {
  let sseEventCount = 0
  let rawChunkCount = 0
  let totalRawText = ''
  const prefixEvents = []
  let hasMeaningfulOutput = false
  let startedWriting = false

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
            rawChunkCount++
            totalRawText += text
            return { value: text, done: false }
          } catch (err) {
            console.error('[codex-proxy] upstream read error:', err.message)
            return { done: true }
          }
        },
      }
    },
  }

  for await (const event of createResponsesSseFromChat(streamIterable)) {
    sseEventCount++
    if (!startedWriting) {
      prefixEvents.push(event)
      if (responseEventsHaveMeaningfulOutput([event])) {
        hasMeaningfulOutput = true
        startedWriting = true
        writeSseHeaders(res)
        for (const buffered of prefixEvents) res.write(buffered)
      }
      continue
    }
    res.write(event)
  }

  if (!hasMeaningfulOutput) {
    hasMeaningfulOutput = responseEventsHaveMeaningfulOutput(prefixEvents)
  }

  return {
    prefixEvents,
    startedWriting,
    sseEventCount,
    rawChunkCount,
    totalRawText,
    emptyUpstream: !hasMeaningfulOutput && totalRawText.includes('"finish_reason"') && totalRawText.includes('"stop"'),
  }
}

async function handleStreamingChatWithRetries(res, upstreamTarget, apiKey, chatBody, diagnostic = {}) {
  const maxAttempts = 3
  let lastCollected = null
  const diagnosticId = diagnostic?.diagnosticId || ''
  const upstream = diagnostic?.upstream || ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptBody = buildRetryChatBody(chatBody, attempt)
    const upstreamRes = await fetchUpstreamChat(upstreamTarget, apiKey, attemptBody)

    if (!upstreamRes) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({
        error: {
          type: 'upstream_connection_error',
          message: 'Failed to connect to upstream',
        },
      }))
    }

    if (!upstreamRes.ok) {
      let errorBody = ''
      try { errorBody = await upstreamRes.text() } catch (_) {}
      console.error('[codex-proxy] upstream error:', { status: upstreamRes.status, headers: Object.fromEntries(upstreamRes.headers.entries()), body: errorBody.slice(0, 500) })
      if (diagnosticId) {
        appendCodexTurnDiagnostic({
          kind: 'proxy.upstream-error',
          diagnosticId,
          upstream,
          attempt: attempt + 1,
          status: upstreamRes.status,
          contentType: upstreamRes.headers.get('content-type') || '',
          bodyPreview: errorBody.slice(0, 800),
        })
        writeCodexTurnDiagnosticArtifact(diagnosticId, `proxy-upstream-error-body-attempt-${attempt + 1}`, errorBody, { kind: 'text', ext: 'txt' })
      }
      const normalizedError = chatErrorToResponseError(errorBody, upstreamRes.status)
      res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(normalizedError))
    }

    const upstreamContentType = (upstreamRes.headers.get('content-type') || '').toLowerCase()

    if (!upstreamContentType.includes('text/event-stream')) {
      console.log('[codex-proxy] upstream returned non-SSE (content-type=' + upstreamContentType + '), treating as non-streaming')
      let fullBody = ''
      try { fullBody = await upstreamRes.text() } catch (_) {}
      console.log('[codex-proxy] ← RAW body (first 500):', fullBody.slice(0, 500))
      if (diagnosticId) {
        appendCodexTurnDiagnostic({
          kind: 'proxy.non-sse-response',
          diagnosticId,
          upstream,
          attempt: attempt + 1,
          status: upstreamRes.status,
          contentType: upstreamContentType,
          bodyPreview: fullBody.slice(0, 800),
        })
        writeCodexTurnDiagnosticArtifact(diagnosticId, `proxy-non-sse-response-attempt-${attempt + 1}`, fullBody, { kind: 'text', ext: 'json.txt' })
      }

      let chatResponse
      try { chatResponse = JSON.parse(fullBody) } catch (_) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: { type: 'upstream_error', message: 'Failed to parse upstream response' } }))
      }

      const responsesBody = chatCompletionToResponse(chatResponse)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(responsesBody))
    }

    console.log('[codex-proxy] upstream response:', { status: upstreamRes.status, contentType: upstreamContentType, attempt: attempt + 1 })
    const collected = await streamResponsesWithPrefixRetry(upstreamRes, res)
    lastCollected = collected
    if (diagnosticId) {
      appendCodexTurnDiagnostic({
        kind: 'proxy.sse-summary',
        diagnosticId,
        upstream,
        attempt: attempt + 1,
        status: upstreamRes.status,
        contentType: upstreamContentType,
        sseEventCount: collected.sseEventCount,
        rawChunkCount: collected.rawChunkCount,
        startedWriting: collected.startedWriting,
        emptyUpstream: collected.emptyUpstream,
        prefixEventsCount: Array.isArray(collected.prefixEvents) ? collected.prefixEvents.length : 0,
        rawSummary: summarizeSsePayload(collected.totalRawText),
      })
      writeCodexTurnDiagnosticArtifact(diagnosticId, `proxy-upstream-sse-attempt-${attempt + 1}`, collected.totalRawText, { kind: 'sse' })
    }

    if (collected.emptyUpstream && attempt < maxAttempts - 1) {
      console.warn('[codex-proxy] empty upstream stream, retrying:', {
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        sseEventCount: collected.sseEventCount,
        rawChunkCount: collected.rawChunkCount,
      })
      continue
    }

    if (!collected.startedWriting) {
      writeSseHeaders(res)
      for (const event of collected.prefixEvents) {
        res.write(event)
      }
    }

    if (collected.sseEventCount <= 3 && collected.totalRawText) {
      console.log('[codex-proxy] ⚠ low event count, raw response:', collected.totalRawText.slice(0, 800))
    }
    console.log('[codex-proxy] stream done:', {
      sseEventCount: collected.sseEventCount,
      rawChunkCount: collected.rawChunkCount,
      attempts: attempt + 1,
    })
    return res.end()
  }

  writeSseHeaders(res)
  for (const event of lastCollected?.prefixEvents || []) {
    res.write(event)
  }
  return res.end()
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

  console.log('[codex-proxy] ⚡ FALLTHROUGH (unmatched path):', { method: req.method, url })

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
    const decoder = new StringDecoder('utf8')
    let data = ''
    req.on('data', chunk => { data += decoder.write(chunk) })
    req.on('end', () => {
      data += decoder.end()
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
