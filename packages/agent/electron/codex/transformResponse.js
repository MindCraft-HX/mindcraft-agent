/**
 * CodeX Chat Completions 协议转换 — Chat → Responses 非流式响应转换
 *
 * 从 CC SWITCH transform_codex_chat.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/transform_codex_chat.rs
 */

const {
  extractReasoningFieldText,
  getContentText,
  splitLeadingThinkBlock,
  chatUsageToResponsesUsage,
  responseStatusFromFinishReason,
} = require('./common')

/**
 * 将 Chat Completions 响应转换为 Responses API 格式
 *
 * @param {object} body - Chat Completions 响应体
 * @returns {object} Responses API 响应体
 */
function chatCompletionToResponse(body) {
  const choice = body.choices?.[0]
  const message = choice?.message || {}
  const responseId = `resp_${body.id || Date.now()}`

  // 提取 reasoning
  let reasoning = extractReasoningFieldText(message)

  // 如果 reasoning_content 为空，尝试从 content 中提取 <think> 块
  if (!reasoning && message.content) {
    const split = splitLeadingThinkBlock(message.content)
    if (split.reasoning) {
      reasoning = split.reasoning
    }
  }

  const output = []
  let seq = 0

  // reasoning item
  if (reasoning) {
    output.push({
      id: `rs_${responseId}_${seq++}`,
      type: 'reasoning',
      status: 'completed',
      summary: [{ type: 'summary_text', text: reasoning }],
    })
  }

  // message item — 正文 (去除 think 块后)
  const contentText = getContentText(message)
  if (contentText || message.tool_calls) {
    // 如果有 tool_calls，assistant content 可能为 null/空
    const msgItem = {
      id: `msg_${responseId}_${seq++}`,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [],
    }

    if (contentText) {
      msgItem.content.push({
        type: 'output_text',
        text: contentText,
        annotations: [],
      })
    }

    output.push(msgItem)
  }

  // tool call items — 独立 output items
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      output.push({
        id: `fc_${responseId}_${seq++}`,
        type: 'function_call',
        call_id: tc.id || '',
        name: tc.function?.name || tc.name || '',
        arguments: tc.function?.arguments || tc.arguments || '',
        status: 'completed',
      })
    }
  }

  return {
    id: responseId,
    object: 'response',
    created_at: body.created || 0,
    status: responseStatusFromFinishReason(choice?.finish_reason),
    model: body.model || '',
    output,
    usage: chatUsageToResponsesUsage(body.usage),
    ...(body.system_fingerprint ? { system_fingerprint: body.system_fingerprint } : {}),
  }
}

/**
 * 将 Chat API 错误响应归一化为 Responses API 错误格式
 *
 * 处理多种上游错误格式:
 * - OpenAI 标准: {error:{message,type,code}}
 * - MiniMax: {base_resp:{status_code,status_msg}}
 * - 纯文本: 包装为 error message
 *
 * @param {string|object} body - 错误响应体
 * @param {number} statusCode - HTTP 状态码
 * @returns {object} 归一化的错误对象
 */
function chatErrorToResponseError(body, statusCode) {
  const defaultMsg = `upstream chat API error (HTTP ${statusCode || 0})`

  // 尝试解析 JSON
  let parsed = body
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body) } catch (_) { /* use as text */ }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      error: {
        type: 'upstream_error',
        code: String(statusCode || ''),
        message: String(body || defaultMsg),
      },
    }
  }

  // OpenAI 标准格式
  if (parsed.error && parsed.error.message) {
    return {
      error: {
        type: parsed.error.type || 'upstream_error',
        code: parsed.error.code || String(statusCode || ''),
        message: parsed.error.message,
      },
    }
  }

  // MiniMax base_resp 格式
  if (parsed.base_resp) {
    return {
      error: {
        type: 'upstream_error',
        code: String(parsed.base_resp.status_code || statusCode || ''),
        message: parsed.base_resp.status_msg || defaultMsg,
      },
    }
  }

  // 其他 JSON 格式 — 包裹整个对象
  return {
    error: {
      type: 'upstream_error',
      code: String(statusCode || ''),
      message: JSON.stringify(parsed),
    },
  }
}

module.exports = {
  chatCompletionToResponse,
  chatErrorToResponseError,
}
