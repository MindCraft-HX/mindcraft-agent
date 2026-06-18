/**
 * CodeX Chat Completions 协议转换 — 公共工具函数
 *
 * 从 CC SWITCH codex_chat_common.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/
 */

/**
 * 从 Chat message 中提取 reasoning 文本
 * 优先级: reasoning_content > reasoning(字符串) > reasoning.content/text/summary
 */
function extractReasoningFieldText(message) {
  if (!message) return ''

  // 1. reasoning_content (DeepSeek 原生字段)
  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content.trim()
  }

  // 2. reasoning (OpenRouter 格式)
  const reasoning = message.reasoning
  if (!reasoning) return ''

  if (typeof reasoning === 'string' && reasoning.trim()) {
    return reasoning.trim()
  }
  if (typeof reasoning === 'object') {
    return String(reasoning.content || reasoning.text || reasoning.summary || '').trim()
  }

  return ''
}

/**
 * 从 Chat message 中获取正文 (去除 think 块)
 */
function getContentText(message) {
  if (!message) return ''
  const raw = String(message.content || '')

  // 去除内联 <think>...</think> 块
  const clean = stripThinkBlocks(raw)
  return clean.trim()
}

/**
 * 去除文本中的 <think>...</think> 块
 */
function stripThinkBlocks(text) {
  if (!text) return ''
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/**
 * 分割首部的 <think> 块
 * 返回 { reasoning, answer }
 */
function splitLeadingThinkBlock(text) {
  if (!text) return { reasoning: '', answer: '' }

  const match = text.match(/^\s*<think>([\s\S]*?)<\/think>/i)
  if (!match) return { reasoning: '', answer: text }

  return {
    reasoning: match[1].trim(),
    answer: text.slice(match[0].length).trim(),
  }
}

/**
 * 检测文本是否以未闭合的 <think> 开头
 * 返回 { isThink: boolean, tagContent: string }
 */
function detectOpenThinkTag(text) {
  if (!text) return { isThink: false, tagContent: '' }
  const match = text.match(/^\s*<think>/i)
  return { isThink: !!match, tagContent: match ? text.slice(match[0].length) : '' }
}

/**
 * 去除开头的 <think> 标签 (未闭合的情况)
 */
function stripLeadingThinkOpenTag(text) {
  if (!text) return ''
  return text.replace(/^\s*<think>/i, '')
}

/**
 * 构造 Responses 格式的 function_call output item
 */
function buildResponseFunctionCallItem(callId, name, args, status) {
  return {
    id: `fc_${callId || ''}`,
    type: 'function_call',
    call_id: callId || '',
    name: name || '',
    arguments: args || '',
    status: status || 'completed',
  }
}

/**
 * 将 Chat usage 转换为 Responses usage 格式
 */
function chatUsageToResponsesUsage(usage) {
  if (!usage) return null
  return {
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 0,
    input_tokens_details: {
      cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
    },
    output_tokens_details: {
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
    },
  }
}

/**
 * finish_reason 到 Responses status 的映射
 */
function responseStatusFromFinishReason(finishReason) {
  if (!finishReason) return 'completed'
  switch (finishReason) {
    case 'stop': return 'completed'
    case 'length': return 'completed'
    case 'tool_calls': return 'completed'
    case 'content_filter': return 'incomplete'
    default: return 'completed'
  }
}

module.exports = {
  extractReasoningFieldText,
  getContentText,
  stripThinkBlocks,
  splitLeadingThinkBlock,
  detectOpenThinkTag,
  stripLeadingThinkOpenTag,
  buildResponseFunctionCallItem,
  chatUsageToResponsesUsage,
  responseStatusFromFinishReason,
}
