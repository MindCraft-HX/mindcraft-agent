/**
 * CodeX Chat Completions 协议转换 — Chat SSE → Responses SSE 流式转换
 *
 * 从 CC SWITCH streaming_codex_chat.rs 移植
 * 参考: reference_project/cc-switch/src-tauri/src/proxy/providers/streaming_codex_chat.rs
 *
 * 维护状态机，逐 chunk 将 Chat Completions SSE 事件
 * 转换为 Responses API SSE 事件序列。
 *
 * 每个 SSE 事件的 JSON 字段名/字段结构严格对齐 CC SWITCH。
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

    this.nextOutputIndex = 0
    this.outputItems = []

    this.reasoning = {
      outputIndex: null,
      itemId: '',
      text: '',
      added: false,
      done: false,
    }

    this.text = {
      outputIndex: null,
      itemId: '',
      text: '',
      added: false,
      done: false,
    }

    this.inlineThink = {
      mode: 'detecting',
      buffer: '',
    }

    this.tools = new Map()

    this.latestUsage = null
    this.finishReason = null
  }

  // ─── base_response(), 对齐 CC SWITCH line 741 ───
  baseResponse(status, output) {
    return {
      id: this.responseId,
      object: 'response',
      created_at: this.created || Math.floor(Date.now() / 1000),
      status,
      model: this.model || '',
      output: output || [],
      usage: this.latestUsage
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
        : { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    }
  }

  // ─── handle_chat_chunk(), 对齐 CC SWITCH line 101 ───
  handleChunk(chunk) {
    const events = []

    if (!chunk) return events

    if (chunk.id && this.responseId === 'resp_ccswitch') {
      this.responseId = chunk.id.startsWith('resp_') ? chunk.id : `resp_${chunk.id}`
    }
    if (chunk.model && !this.model) this.model = chunk.model
    if (chunk.created && !this.created) this.created = chunk.created

    events.push(...this.ensureResponseStarted())

    if (chunk.usage) {
      this.latestUsage = chunk.usage
    }

    const choice = chunk.choices?.[0]
    if (!choice) {
      return events
    }

    const delta = choice.delta || {}

    // reasoning_content / reasoning
    const reasoningText = delta.reasoning_content || (typeof delta.reasoning === 'string' ? delta.reasoning : '')
    if (reasoningText) {
      events.push(...this.pushReasoningDelta(reasoningText))
    }

    // content — CC SWITCH: skip empty string (as_str() + !is_empty())
    if (delta.content !== undefined && delta.content !== null && delta.content !== '') {
      events.push(...this.pushContentDelta(delta.content))
    }

    // tool_calls — CC SWITCH 在 tool_calls 出现前会 flush inline think + finalize reasoning
    if (Array.isArray(delta.tool_calls)) {
      events.push(...this.flushInlineThinkAtBoundary())
      const reasoningForTool = this.currentReasoningText()
      events.push(...this.finalizeReasoning())
      for (const tc of delta.tool_calls) {
        events.push(...this.pushToolCallDelta(tc, reasoningForTool))
      }
    }

    if (choice.finish_reason) {
      this.finishReason = choice.finish_reason
    }

    if (chunk.usage) {
      this.latestUsage = chunk.usage
    }

    return events
  }

  // ─── ensure_response_started(), 对齐 CC SWITCH line 252 ───
  ensureResponseStarted() {
    if (this.responseStarted) return []
    this.responseStarted = true

    const response = this.baseResponse('in_progress', [])

    return [
      `event: response.created\n` +
      `data: ${JSON.stringify({ type: 'response.created', response })}\n`,
      `event: response.in_progress\n` +
      `data: ${JSON.stringify({ type: 'response.in_progress', response })}\n`,
    ]
  }

  // ─── push_reasoning_delta(), 对齐 CC SWITCH line 278 ───
  pushReasoningDelta(delta) {
    const events = []

    if (!this.reasoning.added) {
      const outputIndex = this.nextOutputIndex++
      const itemId = `rs_${this.responseId}`
      this.reasoning.outputIndex = outputIndex
      this.reasoning.itemId = itemId
      this.reasoning.added = true

      events.push(
        `event: response.output_item.added\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: outputIndex,
          item: {
            id: itemId,
            type: 'reasoning',
            status: 'in_progress',
            summary: [],
          },
        })}\n`
      )

      events.push(
        `event: response.reasoning_summary_part.added\n` +
        `data: ${JSON.stringify({
          type: 'response.reasoning_summary_part.added',
          item_id: itemId,
          output_index: outputIndex,
          summary_index: 0,
          part: { type: 'summary_text', text: '' },
        })}\n`
      )
    }

    this.reasoning.text += delta
    const outputIndex = this.reasoning.outputIndex

    events.push(
      `event: response.reasoning_summary_text.delta\n` +
      `data: ${JSON.stringify({
        type: 'response.reasoning_summary_text.delta',
        item_id: this.reasoning.itemId,
        output_index: outputIndex,
        summary_index: 0,
        delta,
      })}\n`
    )

    return events
  }

  // ─── push_content_delta(), 对齐 CC SWITCH line 160 ───
  pushContentDelta(text) {
    if (text === null || text === undefined) return []

    switch (this.inlineThink.mode) {
      case 'text':
        return [
          ...this.finalizeReasoning(),
          ...this.emitTextDelta(text),
        ]

      case 'detecting': {
        this.inlineThink.buffer += text
        const decision = this.leadingThinkPrefixDecision(this.inlineThink.buffer)
        if (decision === 'needMore') return []
        if (decision === 'reasoning') {
          this.inlineThink.mode = 'reasoning'
          return this.drainCompleteInlineThink()
        }
        // decision === 'text'
        this.inlineThink.mode = 'text'
        const flushed = this.inlineThink.buffer
        this.inlineThink.buffer = ''
        return [
          ...this.finalizeReasoning(),
          ...this.emitTextDelta(flushed),
        ]
      }

      case 'reasoning': {
        this.inlineThink.buffer += text
        return this.drainCompleteInlineThink()
      }
    }
  }

  // ─── helper: leading_think_prefix_decision(), 对齐 CC SWITCH line 795 ───
  leadingThinkPrefixDecision(buffer) {
    const trimmed = buffer.trimStart()
    if (trimmed === '') return 'needMore'
    if (trimmed.startsWith('<think>')) return 'reasoning'
    if ('<think>'.startsWith(trimmed)) return 'needMore'
    return 'text'
  }

  // ─── drain_complete_inline_think(), 对齐 CC SWITCH line 191 ───
  drainCompleteInlineThink() {
    const { reasoning, answer } = splitLeadingThinkBlock(this.inlineThink.buffer) || {}
    if (reasoning === undefined) return []

    this.inlineThink.mode = 'text'
    this.inlineThink.buffer = ''

    const events = []
    if (reasoning) {
      events.push(...this.pushReasoningDelta(reasoning))
      events.push(...this.finalizeReasoning())
    }
    if (answer) {
      events.push(...this.emitTextDelta(answer))
    }
    return events
  }

  // ─── flush_inline_think_at_boundary(), 对齐 CC SWITCH line 211 ───
  flushInlineThinkAtBoundary() {
    switch (this.inlineThink.mode) {
      case 'text':
        return []
      case 'detecting': {
        this.inlineThink.mode = 'text'
        const text = this.inlineThink.buffer
        this.inlineThink.buffer = ''
        if (!text) return []
        return [
          ...this.finalizeReasoning(),
          ...this.emitTextDelta(text),
        ]
      }
      case 'reasoning': {
        const buffered = this.inlineThink.buffer
        this.inlineThink.mode = 'text'
        this.inlineThink.buffer = ''
        const split = splitLeadingThinkBlock(buffered)
        if (split) {
          const events = []
          if (split.reasoning) {
            events.push(...this.pushReasoningDelta(split.reasoning))
            events.push(...this.finalizeReasoning())
          }
          if (split.answer) {
            events.push(...this.emitTextDelta(split.answer))
          }
          return events
        }
        const stripped = stripLeadingThinkOpenTag(buffered) || buffered
        if (!stripped) return []
        return [
          ...this.pushReasoningDelta(stripped),
          ...this.finalizeReasoning(),
        ]
      }
    }
  }

  // ─── emit_text_delta (rename from push_text_delta), 对齐 CC SWITCH line 332 ───
  emitTextDelta(delta) {
    const events = []

    if (!this.text.added) {
      const outputIndex = this.nextOutputIndex++
      const itemId = `${this.responseId}_msg`
      this.text.outputIndex = outputIndex
      this.text.itemId = itemId
      this.text.added = true

      events.push(
        `event: response.output_item.added\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: outputIndex,
          item: {
            id: itemId,
            type: 'message',
            status: 'in_progress',
            role: 'assistant',
            content: [],
          },
        })}\n`
      )

      events.push(
        `event: response.content_part.added\n` +
        `data: ${JSON.stringify({
          type: 'response.content_part.added',
          item_id: itemId,
          output_index: outputIndex,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [] },
        })}\n`
      )
    }

    this.text.text += delta
    const outputIndex = this.text.outputIndex

    events.push(
      `event: response.output_text.delta\n` +
      `data: ${JSON.stringify({
        type: 'response.output_text.delta',
        item_id: this.text.itemId,
        output_index: outputIndex,
        content_index: 0,
        delta,
      })}\n`
    )

    return events
  }

  // ─── current_reasoning_text(), 对齐 CC SWITCH line 388 ───
  currentReasoningText() {
    const t = this.reasoning.text.trim()
    return t || null
  }

  // ─── push_tool_call_delta(), 对齐 CC SWITCH line 392 ───
  pushToolCallDelta(tc, reasoning) {
    const chatIndex = tc.index ?? 0
    let shouldAdd = false
    let pendingArguments = ''

    // 首次出现: 初始化状态
    if (!this.tools.has(chatIndex)) {
      this.tools.set(chatIndex, {
        outputIndex: null,
        itemId: '',
        callId: '',
        name: '',
        arguments: '',
        reasoningContent: '',
        added: false,
        done: false,
      })
    }

    const state = this.tools.get(chatIndex)
    if (tc.id) state.callId = tc.id
    if (tc.function?.name) state.name = tc.function.name
    if (tc.function?.arguments) state.arguments += tc.function.arguments
    if (!state.reasoningContent && reasoning) {
      state.reasoningContent = reasoning
    }

    if (!state.added && (state.callId || state.name)) {
      shouldAdd = true
      pendingArguments = state.arguments
    }

    const events = []

    if (shouldAdd) {
      const outputIndex = this.nextOutputIndex++
      state.added = true
      if (!state.callId) state.callId = `call_${chatIndex}`
      if (!state.name) state.name = 'unknown_tool'
      state.outputIndex = outputIndex
      state.itemId = `fc_${state.callId}`

      const item = {
        id: state.itemId,
        type: 'function_call',
        call_id: state.callId,
        name: state.name,
        arguments: '',
        status: 'in_progress',
      }
      if (state.reasoningContent) {
        item.reasoning_content = state.reasoningContent
      }

      events.push(
        `event: response.output_item.added\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: outputIndex,
          item,
        })}\n`
      )

      if (pendingArguments) {
        events.push(
          `event: response.function_call_arguments.delta\n` +
          `data: ${JSON.stringify({
            type: 'response.function_call_arguments.delta',
            item_id: state.itemId,
            output_index: outputIndex,
            delta: pendingArguments,
          })}\n`
        )
      }
    } else if (tc.function?.arguments) {
      events.push(
        `event: response.function_call_arguments.delta\n` +
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.delta',
          item_id: state.itemId,
          output_index: state.outputIndex,
          delta: tc.function.arguments,
        })}\n`
      )
    }

    return events
  }

  // ─── finalize_reasoning(), 对齐 CC SWITCH line 533 ───
  finalizeReasoning() {
    if (!this.reasoning.added || this.reasoning.done) return []

    const outputIndex = this.reasoning.outputIndex
    const itemId = this.reasoning.itemId
    const text = this.reasoning.text

    this.outputItems.push([outputIndex, {
      id: itemId,
      type: 'reasoning',
      summary: [{ type: 'summary_text', text }],
    }])
    this.reasoning.done = true

    return [
      `event: response.reasoning_summary_text.done\n` +
      `data: ${JSON.stringify({
        type: 'response.reasoning_summary_text.done',
        item_id: itemId,
        output_index: outputIndex,
        summary_index: 0,
        text,
      })}\n`,
      `event: response.reasoning_summary_part.done\n` +
      `data: ${JSON.stringify({
        type: 'response.reasoning_summary_part.done',
        item_id: itemId,
        output_index: outputIndex,
        summary_index: 0,
        part: { type: 'summary_text', text },
      })}\n`,
      `event: response.output_item.done\n` +
      `data: ${JSON.stringify({
        type: 'response.output_item.done',
        output_index: outputIndex,
        item: { id: itemId, type: 'reasoning', summary: [{ type: 'summary_text', text }] },
      })}\n`,
    ]
  }

  // ─── finalize_text(), 对齐 CC SWITCH line 587 ───
  finalizeText() {
    if (!this.text.added || this.text.done) return []

    const outputIndex = this.text.outputIndex
    const itemId = this.text.itemId
    const text = this.text.text

    this.outputItems.push([outputIndex, {
      id: itemId,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }],
    }])
    this.text.done = true

    return [
      `event: response.output_text.done\n` +
      `data: ${JSON.stringify({
        type: 'response.output_text.done',
        item_id: itemId,
        output_index: outputIndex,
        content_index: 0,
        text,
      })}\n`,
      `event: response.content_part.done\n` +
      `data: ${JSON.stringify({
        type: 'response.content_part.done',
        item_id: itemId,
        output_index: outputIndex,
        content_index: 0,
        part: { type: 'output_text', text, annotations: [] },
      })}\n`,
      `event: response.output_item.done\n` +
      `data: ${JSON.stringify({
        type: 'response.output_item.done',
        output_index: outputIndex,
        item: {
          id: itemId,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      })}\n`,
    ]
  }

  // ─── finalize_tools(), 对齐 CC SWITCH line 643 ───
  finalizeTools() {
    const events = []

    for (const [key, state] of this.tools) {
      if (state.done) continue

      if (!state.added && !state.done) {
        const outputIndex = this.nextOutputIndex++
        state.added = true
        if (!state.callId) state.callId = `call_${key}`
        if (!state.name) state.name = 'unknown_tool'
        state.outputIndex = outputIndex
        state.itemId = `fc_${state.callId}`

        const item = {
          id: state.itemId,
          type: 'function_call',
          call_id: state.callId,
          name: state.name,
          arguments: '',
          status: 'in_progress',
        }
        if (state.reasoningContent) {
          item.reasoning_content = state.reasoningContent
        }

        events.push(
          `event: response.output_item.added\n` +
          `data: ${JSON.stringify({
            type: 'response.output_item.added',
            output_index: outputIndex,
            item,
          })}\n`
        )
      }

      state.done = true
      const outputIndex = state.outputIndex

      const completedItem = {
        id: state.itemId,
        type: 'function_call',
        call_id: state.callId,
        name: state.name,
        arguments: state.arguments,
        status: 'completed',
      }
      if (state.reasoningContent) {
        completedItem.reasoning_content = state.reasoningContent
      }

      this.outputItems.push([outputIndex, completedItem])

      events.push(
        `event: response.function_call_arguments.done\n` +
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.done',
          item_id: state.itemId,
          output_index: outputIndex,
          arguments: state.arguments,
        })}\n`
      )
      events.push(
        `event: response.output_item.done\n` +
        `data: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: outputIndex,
          item: completedItem,
        })}\n`
      )
    }

    return events
  }

  // ─── finalize(), 对齐 CC SWITCH line 505 ───
  finalize() {
    if (this.completed) return []
    this.completed = true

    const events = [
      ...this.ensureResponseStarted(),
      ...this.flushInlineThinkAtBoundary(),
      ...this.finalizeReasoning(),
      ...this.finalizeText(),
      ...this.finalizeTools(),
    ]

    // completed_output_items(), 对齐 CC SWITCH line 732
    const sorted = [...this.outputItems].sort((a, b) => a[0] - b[0])
    const output = sorted.map(([, item]) => item)

    // CC SWITCH: response_status_from_finish_reason — only "length" → "incomplete"
    const status = this.finishReason === 'length' ? 'incomplete' : 'completed'
    const response = this.baseResponse(status, output)
    if (status === 'incomplete') {
      response.incomplete_details = { reason: 'max_output_tokens' }
    }

    events.push(
      `event: response.completed\n` +
      `data: ${JSON.stringify({ type: 'response.completed', response })}\n`
    )

    return events
  }
}

// ── free functions matching CC SWITCH ──

/**
 * split_leading_think_block — returns { reasoning, answer } or null
 * Aligned with CC SWITCH `split_leading_think_block` in codex_chat_common.rs
 */
function splitLeadingThinkBlock(text) {
  if (!text) return null
  const idx = text.indexOf('</think>')
  if (idx < 0) return null

  // 取出 <think> 与 </think> 之间的内容
  const rawReasoning = text.slice(0, idx)
  // 去除开头的 <think> 标签（可能带前导空白）
  const reasoning = rawReasoning.replace(/^\s*<think>/i, '')
  const answer = text.slice(idx + '</think>'.length)
  return { reasoning, answer }
}

/**
 * strip_leading_think_open_tag
 */
function stripLeadingThinkOpenTag(text) {
  if (!text) return text
  const trimmed = text.trimStart()
  if (trimmed.startsWith('<think>')) {
    return trimmed.slice('<think>'.length)
  }
  return text
}

/**
 * 创建一个 Responses SSE 流 (async generator)
 *
 * @param {AsyncIterable<string>} chatStream - 上游 Chat API 的 SSE 响应流
 * @returns {AsyncGenerator<string>} Responses SSE 事件行
 */
async function* createResponsesSseFromChat(chatStream) {
  const state = new ChatToResponsesState()
  let buffer = ''

  let chunkCount = 0
  let currentEventName = null
  try {
    for await (const chunk of chatStream) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      buffer += text
      chunkCount++

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          currentEventName = null
          continue
        }

        // 跟踪 SSE event: 字段 (CC SWITCH 用于检测 error 事件)
        if (trimmed.startsWith('event: ')) {
          currentEventName = trimmed.slice('event: '.length).trim()
          continue
        }

        if (!trimmed.startsWith('data: ')) continue

        const data = trimmed.slice('data: '.length)
        if (data === '[DONE]') {
          console.log('[codex-proxy] stream: [DONE] received, finalizing')
          yield* emitEvents(state.finalize())
          return
        }

        try {
          const parsed = JSON.parse(data)

          // CC SWITCH: 上游 SSE error 事件或 chunk 自带 error 字段 → response.failed
          if (currentEventName === 'error' || parsed.error) {
            const errSource = parsed.error || parsed
            const message = errSource.message || errSource.detail || errSource.status_msg
              || (typeof errSource === 'string' ? errSource : JSON.stringify(errSource))
            const errorType = errSource.type || errSource.code || ''
            console.error('[codex-proxy] stream: upstream SSE error:', { message, errorType })
            yield* emitFailedEvent(state, message, errorType)
            return
          }

          const events = state.handleChunk(parsed)
          yield* emitEvents(events)
        } catch (_) {
          // 忽略无法解析的行
        }

        currentEventName = null
      }
    }

    // 流自然结束 (没有 [DONE] 标记)
    console.log('[codex-proxy] stream: natural end (no [DONE]), finalizing. chunks=', chunkCount)
    yield* emitEvents(state.finalize())
  } catch (err) {
    // 流错误 — 发送 response.failed（对齐 CC SWITCH failed_event）
    console.error('[codex-proxy] stream: generator error:', err.message)
    yield* emitFailedEvent(state, String(err.message || err), 'stream_error')
  }
}

/**
 * 发送 response.failed SSE 事件 (对齐 CC SWITCH ChatToResponsesState::failed_event)
 */
async function* emitFailedEvent(state, message, errorType) {
  if (state.completed) return
  state.completed = true
  const output = [...state.outputItems].sort((a, b) => a[0] - b[0]).map(([, item]) => item)
  const error = { message }
  if (errorType) error.type = errorType

  const response = state.baseResponse('failed', output)
  response.error = error

  yield `event: response.failed\n` +
    `data: ${JSON.stringify({ type: 'response.failed', response })}\n`
}

async function* emitEvents(events) {
  for (const event of events) {
    yield event + '\n'
  }
}

module.exports = {
  ChatToResponsesState,
  createResponsesSseFromChat,
}
