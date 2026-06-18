/**
 * CodeX Chat Completions 协议转换 — Responses → Chat 请求转换
 *
 * 从 CC SWITCH transform_codex_chat.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/transform_codex_chat.rs
 */

const { applyReasoningToChatBody, inferReasoningConfig } = require('./reasoningMapper')

/**
 * 将 CodeX Responses API 请求转换为 OpenAI Chat Completions 请求
 *
 * @param {object} body - Responses API 请求体
 * @param {string} model - 模型名称 (用于推理配置推断)
 * @param {string} baseUrl - 上游 API URL (用于推理配置推断)
 * @returns {object} Chat Completions 请求体
 */
function responsesToChatCompletions(body, model, baseUrl) {
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

  // tools
  if (Array.isArray(body.tools) && body.tools.length) {
    result.tools = body.tools.map(responsesToolToChat).filter(Boolean)
    if (result.tools.length === 0) delete result.tools
  }

  // tool_choice
  if (body.tool_choice !== undefined) {
    result.tool_choice = responsesToolChoiceToChat(body.tool_choice)
  }

  // parallel_tool_calls
  if (body.parallel_tool_calls !== undefined) {
    result.parallel_tool_calls = body.parallel_tool_calls
  }

  // stream_options — 确保 include_usage 以获取 token 统计
  if (result.stream) {
    result.stream_options = { ...(result.stream_options || {}), include_usage: true }
  }

  // reasoning — 根据 provider 推断并应用推理参数
  const reasoningEffort = body.reasoning?.effort || body.reasoning_effort || ''
  const reasoningConfig = inferReasoningConfig(result.model, baseUrl)
  if (reasoningEffort || reasoningConfig) {
    applyReasoningToChatBody(result, reasoningEffort, reasoningConfig)
  }

  return result
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
  for (const item of input) {
    if (!item) continue

    switch (item.type || item.role) {
      case 'message': {
        const msg = responsesMessageToChatMessage(item)
        if (msg) messages.push(msg)
        break
      }
      case 'function_call': {
        const callMsg = responsesFunctionCallToChatMessage(item)
        if (callMsg) messages.push(callMsg)
        break
      }
      case 'function_call_output': {
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id || '',
          content: String(item.output || ''),
        })
        break
      }
      case 'item_reference': {
        // 跳过（SDK 内部引用）
        break
      }
      case 'reasoning': {
        // 跳过 reason items（SDK 会用 item_reference 引用）
        break
      }
      default: {
        // 尝试作为 message 处理
        if (item.role) {
          const msg = responsesMessageToChatMessage(item)
          if (msg) messages.push(msg)
        }
      }
    }
  }
}

/**
 * Responses message item → Chat message
 */
function responsesMessageToChatMessage(item) {
  const role = item.role || 'user'
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
  if (content.length === 1 && content[0].type === 'text') {
    return { role, content: content[0].text }
  }

  return { role, content }
}

/**
 * Responses function_call → Chat assistant message with tool_calls
 */
function responsesFunctionCallToChatMessage(item) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: item.call_id || '',
      type: 'function',
      function: {
        name: item.name || '',
        arguments: typeof item.arguments === 'string'
          ? item.arguments
          : JSON.stringify(item.arguments || {}),
      },
    }],
  }
}

/**
 * 合并所有 system 消息到头部, MiniMax 不允许多 system
 */
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
      parameters: tool.parameters || tool.input_schema || {},
      strict: tool.strict,
    },
  }
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

module.exports = {
  responsesToChatCompletions,
  instructionText,
  appendInputMessages,
  collapseSystemMessages,
  responsesToolToChat,
  responsesToolChoiceToChat,
}
