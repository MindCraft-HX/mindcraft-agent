/**
 * CodeX Chat Completions 协议转换 — Responses → Chat 请求转换
 *
 * 从 CC SWITCH transform_codex_chat.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/transform_codex_chat.rs
 */

const { applyReasoningToChatBody, inferReasoningConfig } = require('./reasoningMapper')

function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue)
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalizeJsonValue(value[key])
    }
    return out
  }
  return value
}

function canonicalJsonStringify(value) {
  return JSON.stringify(canonicalizeJsonValue(value))
}

function canonicalizeJsonStringIfParseable(raw) {
  const text = String(raw || '')
  if (!text.trim()) return text
  try {
    return canonicalJsonStringify(JSON.parse(text))
  } catch (_) {
    return text
  }
}

/**
 * 将 CodeX Responses API 请求转换为 OpenAI Chat Completions 请求
 *
 * @param {object} body - Responses API 请求体
 * @param {string} model - 模型名称 (用于推理配置推断)
 * @param {string} baseUrl - 上游 API URL (用于推理配置推断)
 * @returns {object} Chat Completions 请求体
 */
function responsesToChatCompletions(body, model, baseUrl, runtimeReasoningEffort) {
  const result = {}

  // model
  if (body.model) {
    result.model = body.model
  } else if (model) {
    result.model = model
  }

  // messages — instructions + input[]
  const messages = []
  if (body.instructions) {
    const text = instructionText(body.instructions)
    if (text) messages.push({ role: 'system', content: text })
  }
  if (Array.isArray(body.input)) {
    appendInputMessages(body.input, messages)
  }
  appendWindowsKimiShellCompatibilityInstruction(messages, result.model)
  result.messages = collapseSystemMessages(messages)

  // max_tokens / max_output_tokens
  if (body.max_output_tokens !== undefined) {
    result.max_tokens = body.max_output_tokens
  }

  // temperature, top_p, stream, stop
  for (const key of ['temperature', 'top_p', 'stream', 'stop']) {
    if (body[key] !== undefined) {
      result[key] = body[key]
    }
  }

  const reasoningConfig = inferReasoningConfig(result.model, baseUrl)
  const sanitizerContext = { model: result.model, baseUrl, reasoningConfig }

  // tools
  if (Array.isArray(body.tools) && body.tools.length) {
    result.tools = body.tools
      .map(tool => sanitizeResponsesToolForChat(tool, sanitizerContext))
      .filter(Boolean)
    if (result.tools.length === 0) delete result.tools
  }

  // tool_choice
  if (body.tool_choice !== undefined && Array.isArray(result.tools) && result.tools.length) {
    result.tool_choice = sanitizeToolChoiceForChat(
      responsesToolChoiceToChat(body.tool_choice),
      result.tools
    )
  }

  // parallel_tool_calls
  if (Array.isArray(result.tools) && result.tools.length && body.parallel_tool_calls !== undefined) {
    result.parallel_tool_calls = body.parallel_tool_calls
  }

  // stream_options — 确保 include_usage 以获取 token 统计
  if (result.stream) {
    result.stream_options = { ...(result.stream_options || {}), include_usage: true }
  }

  const reasoningEffort = body.reasoning?.effort || body.reasoning_effort || runtimeReasoningEffort || ''
  if (reasoningEffort || reasoningConfig) {
    applyReasoningToChatBody(result, reasoningEffort, reasoningConfig)
  }

  return result
}

function appendWindowsKimiShellCompatibilityInstruction(messages, model, platform = process.platform) {
  if (platform !== 'win32' || !/kimi/i.test(String(model || ''))) return
  messages.push({
    role: 'system',
    content: 'Windows shell commands must use ASCII quotes and ASCII backticks only. Never place full-width or smart quotation marks/backticks in PowerShell commands, especially when sending multiline patches.',
  })
}

function shouldFilterDeferredCodexTools() {
  // Keep this proxy transform aligned with the supported external Codex CLI.
  // accepts the tool schema but returns a tool output like:
  //   "unsupported call: multi_agent_v1"
  // That means the protocol bridge is fine, but the local runtime cannot execute
  // the deferred sub-agent tool yet. Keep filtering it in chat-proxy mode until
  // runtime capability gating exists.
  return true
}

/**
 * 从 Responses instructions 提取文本
 * instructions 可以是: string | [{type:"text", text:"..."}]
 */
function instructionText(instructions) {
  if (!instructions) return ''

  if (typeof instructions === 'string') return instructions

  if (Array.isArray(instructions)) {
    return instructions
      .map(item => {
        if (typeof item === 'string') return item
        if (item && item.type === 'text') return item.text || ''
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return String(instructions)
}

/**
 * 将 Responses input[] 追加到 messages[]
 */
function appendInputMessages(input, messages) {
  const pendingToolCalls = []
  let pendingReasoning = ''
  let lastAssistantIndex = null

  function appendReasoning(text) {
    const t = String(text || '').trim()
    if (!t) return
    pendingReasoning = pendingReasoning ? (pendingReasoning + '\n\n' + t) : t
  }

  function flushPendingToolCalls() {
    if (!pendingToolCalls.length) return
    const msg = {
      role: 'assistant',
      content: null,
      tool_calls: pendingToolCalls.splice(0, pendingToolCalls.length),
      reasoning_content: pendingReasoning || 'tool call',
    }
    pendingReasoning = ''
    lastAssistantIndex = messages.length
    messages.push(msg)
  }

  function canonicalizeOutput(output) {
    if (output === undefined || output === null) return ''
    if (typeof output === 'string') return canonicalizeJsonStringIfParseable(output)
    try { return canonicalJsonStringify(output) } catch (_) { return String(output) }
  }

  for (const item of input) {
    if (!item) continue

    switch (item.type || item.role) {
      case 'function_call': {
        if (item.reasoning_content) appendReasoning(item.reasoning_content)
        pendingToolCalls.push(responsesFunctionCallToToolCall(item))
        break
      }
      case 'function_call_output': {
        flushPendingToolCalls()
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id || '',
          content: canonicalizeOutput(item.output),
        })
        break
      }
      case 'reasoning': {
        const text = responsesReasoningItemText(item)
        if (!pendingToolCalls.length && lastAssistantIndex !== null && messages[lastAssistantIndex] && messages[lastAssistantIndex].role === 'assistant') {
          const prev = messages[lastAssistantIndex]
          const merged = [prev.reasoning_content, text].filter(Boolean).join('\n\n').trim()
          if (merged) messages[lastAssistantIndex] = { ...prev, reasoning_content: merged }
        } else {
          appendReasoning(text)
        }
        break
      }
      case 'item_reference': {
        break
      }
      case 'message':
      default: {
        flushPendingToolCalls()
        if (item.role || item.content !== undefined) {
          const msg = responsesMessageToChatMessage(item)
          if (msg) {
            if (msg.role === 'assistant') {
              const merged = [pendingReasoning, item.reasoning_content].filter(Boolean).join('\n\n').trim()
              if (merged) msg.reasoning_content = merged
              pendingReasoning = ''
              lastAssistantIndex = messages.length
            } else if (msg.role !== 'tool') {
              pendingReasoning = ''
              lastAssistantIndex = null
            }
            messages.push(msg)
          }
        }
      }
    }
  }

  flushPendingToolCalls()
}

function responsesMessageToChatMessage(item) {
  const rawRole = item.role || 'user'
  // 角色映射 —— 对齐 CC SWITCH responses_role_to_chat_role():
  //   system/developer → system（多数 Chat provider 只认 system/user/assistant/tool）
  //   latest_reminder   → user（系统级提醒在 Chat API 中无对应角色，当用户消息处理）
  const role = (() => {
    switch (rawRole) {
      case 'system': case 'developer': return 'system'
      case 'assistant': return 'assistant'
      case 'tool': return 'tool'
      case 'user': case 'latest_reminder': return 'user'
      default: return 'user'
    }
  })()
  const content = []

  if (typeof item.content === 'string') {
    return { role, content: item.content }
  }

  if (Array.isArray(item.content)) {
    for (const part of item.content) {
      switch (part.type) {
        case 'input_text':
        case 'output_text':
        case 'text':
          content.push({ type: 'text', text: part.text || '' })
          break
        case 'input_image':
          content.push({
            type: 'image_url',
            image_url: { url: part.image_url || part.url || '' },
          })
          break
        case 'input_file':
          content.push({
            type: 'file',
            file: { file_id: part.file_id || '' },
          })
          break
        default:
          if (part.text !== undefined) {
            content.push({ type: 'text', text: String(part.text) })
          }
      }
    }
  }

  if (content.length === 0) {
    return { role, content: '' }
  }
  if (content.every(part => part.type === 'text')) {
    return { role, content: content.map(part => part.text || '').join('') }
  }

  return { role, content }
}

/**
 * Responses function_call → Chat assistant message with tool_calls
 */
function responsesFunctionCallToToolCall(item) {
  return {
    id: item.call_id || '',
    type: 'function',
    function: {
      name: item.name || '',
      arguments: typeof item.arguments === 'string'
        ? canonicalizeJsonStringIfParseable(item.arguments)
        : canonicalJsonStringify(item.arguments || {}),
    },
  }
}

function responsesFunctionCallToChatMessage(item) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [responsesFunctionCallToToolCall(item)],
  }
}

function responsesReasoningItemText(item) {
  if (!item) return ''
  if (typeof item.reasoning_content === 'string' && item.reasoning_content.trim()) return item.reasoning_content.trim()
  if (typeof item.text === 'string' && item.text.trim()) return item.text.trim()
  if (Array.isArray(item.summary)) {
    return item.summary.map(part => part && (part.text || part.content || '')).filter(Boolean).join('\n').trim()
  }
  return ''
}

function collapseSystemMessages(messages) {
  if (!messages.length) return messages

  const systems = []
  const others = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content)
          ? msg.content.map(c => c.text || '').join('\n')
          : '')
      if (text) systems.push(text)
    } else {
      others.push(msg)
    }
  }

  const result = []
  if (systems.length) {
    result.push({ role: 'system', content: systems.join('\n\n') })
  }
  result.push(...others)
  return result
}

/**
 * Responses tool definition → Chat tool definition
 */
function responsesToolToChat(tool) {
  if (!tool) return null

  return {
    type: 'function',
    function: {
      name: tool.name || '',
      description: tool.description || '',
      parameters: cleanToolSchema(tool.parameters || tool.input_schema || {}),
      strict: tool.strict,
    },
  }
}

function cleanToolSchema(schema) {
  if (schema === undefined || schema === null) {
    return { type: 'object', properties: {}, additionalProperties: false }
  }

  if (Array.isArray(schema)) {
    return schema.map(cleanToolSchema)
  }

  if (typeof schema !== 'object') return schema

  const out = { ...schema }
  if (Object.keys(out).length === 0) {
    return { type: 'object', properties: {}, additionalProperties: false }
  }

  if (out.properties && typeof out.properties === 'object' && !Array.isArray(out.properties)) {
    const nextProps = {}
    for (const [key, value] of Object.entries(out.properties)) {
      nextProps[key] = cleanToolSchema(value)
    }
    out.properties = nextProps
    if (!out.type) out.type = 'object'
  }

  if (out.items !== undefined) {
    out.items = cleanToolSchema(out.items)
  }

  return out
}

function chatToolName(chatTool) {
  return String(chatTool?.function?.name || '').trim()
}

function sanitizeResponsesToolForChat(tool, context = {}) {
  const chatTool = responsesToolToChat(tool)
  const name = chatToolName(chatTool)
  if (!name) return null

  if (shouldFilterDeferredCodexTools(context.model, context.baseUrl, context.reasoningConfig)) {
    if (name === 'multi_agent_v1') return null
  }

  return chatTool
}

/**
 * Responses tool_choice → Chat tool_choice
 */
function responsesToolChoiceToChat(toolChoice) {
  if (!toolChoice) return undefined

  if (typeof toolChoice === 'string') {
    switch (toolChoice) {
      case 'auto': return 'auto'
      case 'none': return 'none'
      case 'required': return 'required'
      default: return { type: 'function', function: { name: toolChoice } }
    }
  }

  if (toolChoice.type === 'function') {
    return {
      type: 'function',
      function: { name: toolChoice.name || '' },
    }
  }

  return toolChoice
}

function sanitizeToolChoiceForChat(toolChoice, tools) {
  if (toolChoice === undefined) return undefined
  if (toolChoice === 'none' || toolChoice === 'auto' || toolChoice === 'required') return toolChoice

  const available = new Set((tools || []).map(chatToolName).filter(Boolean))
  const name = toolChoice?.type === 'function'
    ? String(toolChoice?.function?.name || '').trim()
    : ''

  if (!name) return toolChoice
  return available.has(name) ? toolChoice : 'auto'
}

module.exports = {
  responsesToChatCompletions,
  appendWindowsKimiShellCompatibilityInstruction,
  instructionText,
  appendInputMessages,
  collapseSystemMessages,
  responsesToolToChat,
  cleanToolSchema,
  sanitizeResponsesToolForChat,
  responsesToolChoiceToChat,
  sanitizeToolChoiceForChat,
  responsesFunctionCallToToolCall,
  responsesReasoningItemText,
  canonicalJsonStringify,
  canonicalizeJsonStringIfParseable,
}
