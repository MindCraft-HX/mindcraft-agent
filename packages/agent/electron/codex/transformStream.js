/**
 * CodeX Chat Completions 协议转换 — Chat SSE → Responses SSE 流式转换
 *
 * 从 CC SWITCH streaming_codex_chat.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/streaming_codex_chat.rs
 *
 * 维护状态机，逐 chunk 将 Chat Completions SSE 事件
 * 转换为 Responses API SSE 事件序列
 */

const { detectOpenThinkTag } = require('./common')

/**
 * Chat SSE → Responses SSE 转换状态机
 */
class ChatToResponsesState {
  constructor() {
    this.responseId = 'resp_ccswitch'
    this.model = ''
    this.created = 0

    this.responseStarted = false
    this.completed = false

    // 输出项追踪
    this.nextOutputIndex = 0
    this.outputItems = []

    // 推理文本状态
    this.reasoning = {
      outputIndex: null,
      itemId: '',
      text: '',
      added: false,
      done: false,
    }

    // 正文状态
    this.text = {
      outputIndex: null,
      itemId: '',
      text: '',
      added: false,
      done: false,
    }

    // 内联 <think> 标签检测状态机
    this.inlineThink = {
      mode: 'detecting', // detecting | reasoning | text
      buffer: '',
    }

    // 工具调用追踪: index → {outputIndex, itemId, callId, name, args}
    this.tools = new Map()

    // usage 收集
    this.latestUsage = null
    this.finishReason = null
  }

  /**
   * 处理一个 Chat SSE data chunk
   * @param {object} chunk - 已解析的 Chat SSE chunk JSON
   * @returns {string[]} Responses SSE 事件行数组
   */
  handleChunk(chunk) {
    const events = []

    if (!chunk) return events

    // 记录 model/created
    if (chunk.model && !this.model) this.model = chunk.model
    if (chunk.created && !this.created) this.created = chunk.created
    if (chunk.id && this.responseId === 'resp_ccswitch') this.responseId = `resp_${chunk.id}`

    // 确保 response 已启动
    if (!this.responseStarted) {
      this.ensureResponseStarted(events)
    }

    const choice = chunk.choices?.[0]
    if (!choice) {
      // 可能只有 usage
      if (chunk.usage) this.latestUsage = chunk.usage
      return events
    }

    const delta = choice.delta || {}

    // 处理 finish_reason
    if (choice.finish_reason) {
      this.finishReason = choice.finish_reason
    }

    // 处理 usage
    if (chunk.usage) {
      this.latestUsage = chunk.usage
    }

    // === 处理 delta ===

    // reasoning_content (DeepSeek, Kimi, Qwen, GLM 等)
    if (delta.reasoning_content) {
      this.pushReasoningDelta(delta.reasoning_content, events)
    }

    // reasoning (OpenRouter 格式)
    if (delta.reasoning && typeof delta.reasoning === 'string') {
      this.pushReasoningDelta(delta.reasoning, events)
    }

    // content
    if (delta.content !== undefined && delta.content !== null) {
      this.pushContentDelta(delta.content, events)
    }

    // tool_calls
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        this.pushToolCallDelta(tc, events)
      }
    }

    return events
  }

  /**
   * 确保 response.created + response.in_progress 已发送
   */
  ensureResponseStarted(events) {
    // event: response.created
    events.push(
      `event: response.created\n` +
      `data: ${JSON.stringify({
        type: 'response.created',
        response: {
          id: this.responseId,
          object: 'response',
          created_at: this.created || Math.floor(Date.now() / 1000),
          status: 'in_progress',
          model: this.model || '',
          output: [],
        },
      })}\n`
    )
    this.responseStarted = true
  }

  /**
   * 追加 reasoning delta
   */
  pushReasoningDelta(text, events) {
    if (!text) return

    // 首次 reasoning: 发送 output_item.added + content_part.added
    if (!this.reasoning.added) {
      this.reasoning.outputIndex = this.nextOutputIndex++
      this.reasoning.itemId = `rs_${this.responseId}_${this.reasoning.outputIndex}`

      events.push(
        `event: response.output_item.added\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: this.reasoning.outputIndex,
          item: {
            id: this.reasoning.itemId,
            type: 'reasoning',
            status: 'in_progress',
          },
        })}\n`
      )

      events.push(
        `event: response.reasoning_summary_part.added\n` +
        `data: ${JSON.stringify({
          type: 'response.reasoning_summary_part.added',
          output_index: this.reasoning.outputIndex,
          content_index: 0,
          part: {
            type: 'summary_text',
            text: '',
          },
        })}\n`
      )

      this.reasoning.added = true
    }

    // 发送 delta
    events.push(
      `event: response.reasoning_summary_text.delta\n` +
      `data: ${JSON.stringify({
        type: 'response.reasoning_summary_text.delta',
        output_index: this.reasoning.outputIndex,
        content_index: 0,
        delta: text,
      })}\n`
    )

    this.reasoning.text += text
  }

  /**
   * 追加 content delta (处理内联 <think> 状态机)
   */
  pushContentDelta(text, events) {
    if (text === null || text === undefined) return

    let remaining = String(text)

    while (remaining.length > 0) {
      switch (this.inlineThink.mode) {
        case 'detecting': {
          // 检查是否是 think 块开始
          const detect = detectOpenThinkTag(this.inlineThink.buffer + remaining)
          if (detect.isThink) {
            this.inlineThink.mode = 'reasoning'
            this.inlineThink.buffer = detect.tagContent
            remaining = ''
          } else {
            // 确认不是 think 块，全部作为正文
            this.inlineThink.mode = 'text'
            // buffer 中积累的内容也作为正文
            const full = this.inlineThink.buffer + remaining
            this.inlineThink.buffer = ''
            remaining = ''
            this.emitTextDelta(full, events)
          }
          break
        }

        case 'reasoning': {
          const idx = remaining.indexOf('</think>')
          if (idx >= 0) {
            // think 块结束
            const thinkPart = remaining.slice(0, idx)
            const after = remaining.slice(idx + '</think>'.length)
            this.pushReasoningDelta(thinkPart, events)

            // 完成 reasoning
            if (this.reasoning.added && !this.reasoning.done) {
              events.push(
                `event: response.reasoning_summary_text.done\n` +
                `data: ${JSON.stringify({
                  type: 'response.reasoning_summary_text.done',
                  output_index: this.reasoning.outputIndex,
                  content_index: 0,
                  text: this.reasoning.text,
                })}\n`
              )
              events.push(
                `event: response.reasoning_summary_part.done\n` +
                `data: ${JSON.stringify({
                  type: 'response.reasoning_summary_part.done',
                  output_index: this.reasoning.outputIndex,
                  content_index: 0,
                  part: { type: 'summary_text', text: this.reasoning.text },
                })}\n`
              )
              events.push(
                `event: response.output_item.done\n` +
                `data: ${JSON.stringify({
                  type: 'response.output_item.done',
                  output_index: this.reasoning.outputIndex,
                  item: {
                    id: this.reasoning.itemId,
                    type: 'reasoning',
                    status: 'completed',
                  },
                })}\n`
              )
              this.reasoning.done = true
            }

            this.inlineThink.mode = 'text'
            this.inlineThink.buffer = ''
            remaining = after
            // 如果 after 以 <think> 开头，下一轮循环会再次进入 reasoning
          } else {
            // 还没到 </think>，继续累积
            this.pushReasoningDelta(remaining, events)
            remaining = ''
          }
          break
        }

        case 'text': {
          // 检测是否有新的 <think> 块开始
          const thinkStart = remaining.indexOf('<think>')
          if (thinkStart >= 0) {
            // 先发送 think 之前的文本
            if (thinkStart > 0) {
              this.emitTextDelta(remaining.slice(0, thinkStart), events)
            }
            this.inlineThink.mode = 'reasoning'
            remaining = remaining.slice(thinkStart + '<think>'.length)
          } else {
            this.emitTextDelta(remaining, events)
            remaining = ''
          }
          break
        }
      }
    }
  }

  /**
   * 发送纯文本 delta
   */
  emitTextDelta(text, events) {
    if (!text) return

    // 首次 text: 发送 output_item.added + content_part.added
    if (!this.text.added) {
      this.text.outputIndex = this.nextOutputIndex++
      this.text.itemId = `msg_${this.responseId}_${this.text.outputIndex}`

      events.push(
        `event: response.output_item.added\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: this.text.outputIndex,
          item: {
            id: this.text.itemId,
            type: 'message',
            role: 'assistant',
            status: 'in_progress',
            content: [],
          },
        })}\n`
      )

      events.push(
        `event: response.content_part.added\n` +
        `data: ${JSON.stringify({
          type: 'response.content_part.added',
          output_index: this.text.outputIndex,
          content_index: 0,
          part: {
            type: 'output_text',
            text: '',
            annotations: [],
          },
        })}\n`
      )

      this.text.added = true
    }

    events.push(
      `event: response.output_text.delta\n` +
      `data: ${JSON.stringify({
        type: 'response.output_text.delta',
        output_index: this.text.outputIndex,
        content_index: 0,
        delta: text,
      })}\n`
    )

    this.text.text += text
  }

  /**
   * 追加 tool_call delta
   */
  pushToolCallDelta(tc, events) {
    const index = tc.index ?? 0

    // 首次出现此 tool: 发送 output_item.added
    if (!this.tools.has(index)) {
      const outputIndex = this.nextOutputIndex++
      const itemId = `fc_${this.responseId}_${outputIndex}`
      this.tools.set(index, {
        outputIndex,
        itemId,
        callId: tc.id || '',
        name: '',
        args: '',
      })

      events.push(
        `event: response.output_item.added\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: outputIndex,
          item: {
            id: itemId,
            type: 'function_call',
            call_id: tc.id || '',
            name: '',
            arguments: '',
            status: 'in_progress',
          },
        })}\n`
      )
    }

    const tool = this.tools.get(index)
    if (!tool) return

    // 更新 call_id (如果首次出现)
    if (tc.id && !tool.callId) tool.callId = tc.id

    // function name delta
    if (tc.function?.name) {
      tool.name += tc.function.name
      events.push(
        `event: response.function_call_arguments.delta\n` +
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.delta',
          output_index: tool.outputIndex,
          delta: tc.function.name,
        })}\n`
      )
    }

    // function arguments delta
    if (tc.function?.arguments) {
      tool.args += tc.function.arguments
      events.push(
        `event: response.function_call_arguments.delta\n` +
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.delta',
          output_index: tool.outputIndex,
          delta: tc.function.arguments,
        })}\n`
      )
    }
  }

  /**
   * 流结束 — 发送所有完成事件
   * @returns {string[]} Responses SSE 事件行数组
   */
  finalize() {
    const events = []

    if (this.completed) return events
    this.completed = true

    // 确保 response 已启动 (空响应情况)
    if (!this.responseStarted) {
      this.ensureResponseStarted(events)
    }

    // 完成 reasoning (如果有且未完成)
    if (this.reasoning.added && !this.reasoning.done) {
      events.push(
        `event: response.reasoning_summary_text.done\n` +
        `data: ${JSON.stringify({
          type: 'response.reasoning_summary_text.done',
          output_index: this.reasoning.outputIndex,
          content_index: 0,
          text: this.reasoning.text,
        })}\n`
      )
      events.push(
        `event: response.reasoning_summary_part.done\n` +
        `data: ${JSON.stringify({
          type: 'response.reasoning_summary_part.done',
          output_index: this.reasoning.outputIndex,
          content_index: 0,
          part: { type: 'summary_text', text: this.reasoning.text },
        })}\n`
      )
      events.push(
        `event: response.output_item.done\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: this.reasoning.outputIndex,
          item: {
            id: this.reasoning.itemId,
            type: 'reasoning',
            status: 'completed',
          },
        })}\n`
      )
    }

    // 完成 text (如果有且未完成)
    if (this.text.added && !this.text.done) {
      events.push(
        `event: response.output_text.done\n` +
        `data: ${JSON.stringify({
          type: 'response.output_text.done',
          output_index: this.text.outputIndex,
          content_index: 0,
          text: this.text.text,
        })}\n`
      )
      events.push(
        `event: response.content_part.done\n` +
        `data: ${JSON.stringify({
          type: 'response.content_part.done',
          output_index: this.text.outputIndex,
          content_index: 0,
          part: {
            type: 'output_text',
            text: this.text.text,
            annotations: [],
          },
        })}\n`
      )
      events.push(
        `event: response.output_item.done\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: this.text.outputIndex,
          item: {
            id: this.text.itemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{
              type: 'output_text',
              text: this.text.text,
              annotations: [],
            }],
          },
        })}\n`
      )
      this.text.done = true
    }

    // 完成 tools
    for (const [, tool] of this.tools) {
      events.push(
        `event: response.function_call_arguments.done\n` +
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.done',
          output_index: tool.outputIndex,
          arguments: tool.args,
        })}\n`
      )
      events.push(
        `event: response.output_item.done\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: tool.outputIndex,
          item: {
            id: tool.itemId,
            type: 'function_call',
            call_id: tool.callId,
            name: tool.name,
            arguments: tool.args,
            status: 'completed',
          },
        })}\n`
      )
    }

    // response.completed
    const status = this.finishReason === 'content_filter' ? 'incomplete' : 'completed'
    const usage = this.latestUsage
      ? {
          input_tokens: this.latestUsage.prompt_tokens || 0,
          output_tokens: this.latestUsage.completion_tokens || 0,
          total_tokens: this.latestUsage.total_tokens || 0,
          input_tokens_details: {
            cached_tokens: this.latestUsage.prompt_tokens_details?.cached_tokens || 0,
          },
          output_tokens_details: {
            reasoning_tokens: this.latestUsage.completion_tokens_details?.reasoning_tokens || 0,
          },
        }
      : null

    events.push(
      `event: response.completed\n` +
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          id: this.responseId,
          object: 'response',
          created_at: this.created || Math.floor(Date.now() / 1000),
          status,
          model: this.model || '',
          output: this.buildOutputArray(),
          usage,
        },
      })}`
    )

    events.push('event: done\ndata: [DONE]')

    return events
  }

  /**
   * 构建 output items 数组 (用于 response.completed)
   */
  buildOutputArray() {
    const items = []

    if (this.reasoning.added) {
      items.push({
        id: this.reasoning.itemId,
        type: 'reasoning',
        status: 'completed',
        summary: [{ type: 'summary_text', text: this.reasoning.text }],
      })
    }

    if (this.text.added) {
      items.push({
        id: this.text.itemId,
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: this.text.text, annotations: [] }],
      })
    }

    for (const [, tool] of this.tools) {
      items.push({
        id: tool.itemId,
        type: 'function_call',
        call_id: tool.callId,
        name: tool.name,
        arguments: tool.args,
        status: 'completed',
      })
    }

    return items
  }
}

/**
 * 创建一个 Responses SSE 流 (async generator)
 *
 * @param {ReadableStream|AsyncIterable} chatStream - 上游 Chat API 的 SSE 响应流
 * @returns {AsyncGenerator<string>} Responses SSE 事件行
 */
async function* createResponsesSseFromChat(chatStream) {
  const state = new ChatToResponsesState()
  let buffer = ''

  try {
    for await (const chunk of chatStream) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      buffer += text

      // SSE 按 \n\n 分割
      const lines = buffer.split('\n')
      // 保留最后一个不完整行
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (!trimmed.startsWith('data: ')) continue

        const data = trimmed.slice('data: '.length)
        if (data === '[DONE]') {
          // 流结束
          yield* emitEvents(state.finalize())
          return
        }

        try {
          const parsed = JSON.parse(data)
          const events = state.handleChunk(parsed)
          yield* emitEvents(events)
        } catch (_) {
          // 忽略无法解析的行
        }
      }
    }

    // 流自然结束 (没有 [DONE] 标记)
    yield* emitEvents(state.finalize())
  } catch (err) {
    // 错误处理: 发送 error 事件
    if (!state.completed) {
      yield `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: { type: 'stream_error', message: String(err.message || err) },
      })}\n`
    }
  }
}

/**
 * 辅助: 将事件数组转换为 yield 对象
 */
async function* emitEvents(events) {
  for (const event of events) {
    yield event + '\n'
  }
}

module.exports = {
  ChatToResponsesState,
  createResponsesSseFromChat,
}
