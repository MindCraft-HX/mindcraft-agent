import { ref } from 'vue'

const MAX_TOOL_ITERATIONS = 5

const SYSTEM_PROMPT = `你是 MindCraft 智能助手，可以回答问题、进行联网搜索和识别图片。

## 能力
- 回答各类知识问题
- 使用 web_search 工具搜索互联网获取实时信息
- 识别和分析用户上传的图片内容

## 行为准则
- 使用中文回复
- 回答简洁有条理
- 对于需要最新信息的问题，主动使用 web_search 工具
- 如果搜索不到相关信息，诚实告知用户

## 技术信息
当前日期：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}`

const WEB_SEARCH_TOOL_CLAUDE = {
  name: 'web_search',
  description: '搜索互联网获取最新信息。当需要查询实时信息、新闻、或用户明确要求搜索时使用。',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    },
    required: ['query']
  }
}

const WEB_SEARCH_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '搜索互联网获取最新信息。当需要查询实时信息、新闻、或用户明确要求搜索时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' }
      },
      required: ['query']
    }
  }
}

/**
 * 简易对话 - 流式管理 + Tool Loop
 *
 * @param {Object} chatSession - useChatSession 返回的 chatSession
 * @param {Ref} chatSession.currentSession - 当前会话 reactive
 * @param {Function} chatSession.addMessage - 添加消息
 * @param {Function} chatSession.updateLastAssistant - 更新最后一条 assistant 消息
 * @param {Function} chatSession.saveSession - 持久化保存
 */
export function useChatStream(chatSession) {
  const isStreaming = ref(false)
  const abortController = ref(null)
  /** 当前正在执行的工具调用信息 */
  const activeToolCall = ref(null)
  /** 流式错误 */
  const streamError = ref(null)

  const api = () => window.electronAPI || {}

  function cleanup() {
    abortController.value = null
    activeToolCall.value = null
    streamError.value = null
  }

  /** 构建消息列表 */
  function buildMessages(text, images) {
    const messages = chatSession.currentSession.messages || []

    // 构建当前用户消息内容
    const content = []
    if (images?.length) {
      for (const img of images) {
        if (chatSession.currentSession.provider === 'claude') {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType || 'image/png',
              data: img.base64 || img.data,
            }
          })
        } else {
          // OpenAI 格式
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mediaType || 'image/png'};base64,${img.base64 || img.data}`,
            }
          })
        }
      }
    }
    content.push({ type: 'text', text })

    return [
      { role: 'user', content: chatSession.currentSession.provider === 'claude' ? content : content },
    ]
  }

  /** 构建完整调用消息列表（system + 历史 + 新消息） */
  function buildCallMessages(text, images) {
    const provider = chatSession.currentSession.provider

    // 历史消息
    const msgList = [...(chatSession.currentSession.messages || [])]

    // 当前用户消息内容
    const content = []
    if (images?.length) {
      for (const img of images) {
        if (provider === 'claude') {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType || 'image/png',
              data: img.base64 || img.data,
            }
          })
        } else {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mediaType || 'image/png'};base64,${img.base64 || img.data}`,
              detail: 'auto',
            }
          })
        }
      }
    }
    content.push({ type: 'text', text: text })
    msgList.push({ role: 'user', content: provider === 'claude' ? content : content })

    return msgList
  }

  /** 执行一次 API 调用（流式 + 工具检测） */
  async function doApiCall(messages, iteration = 0) {
    const provider = chatSession.currentSession.provider
    const ac = new AbortController()
    abortController.value = ac
    streamError.value = null

    // 构建请求参数
    const payload = { messages }

    // system prompt（含上下文摘要）
    let systemText = SYSTEM_PROMPT
    const summary = chatSession.currentSession?.contextSummary
    if (summary) {
      systemText = `## 之前的对话摘要\n${summary}\n\n---\n\n${SYSTEM_PROMPT}`
    }
    if (provider === 'claude') {
      payload.system = systemText
    } else {
      // OpenAI: prepend system message
      payload.messages = [{ role: 'system', content: systemText }, ...messages]
    }

    // model
    if (chatSession.currentSession.model) {
      payload.model = chatSession.currentSession.model
    }

    // web search tool
    if (chatSession.currentSession.webSearchEnabled) {
      payload.tools = provider === 'claude'
        ? [WEB_SEARCH_TOOL_CLAUDE]
        : [WEB_SEARCH_TOOL_OPENAI]
    }

    // thinking (Claude only)
    if (provider === 'claude' && chatSession.currentSession.thinkingEnabled) {
      payload.thinking = {
        type: 'enabled',
        budget_tokens: chatSession.currentSession.thinkingBudget || 4000,
      }
    }

    // CodeX reasoning
    if (provider === 'codex' && chatSession.currentSession.thinkingEnabled) {
      payload.reasoning_effort = 'medium'
    }

    payload.max_tokens = 8096

    try {
      // 添加 assistant 占位消息
      const assistantMsg = {
        role: 'assistant',
        content: provider === 'claude'
          ? [{ type: 'text', text: '' }]
          : '',
        isStreaming: true,
      }
      chatSession.addMessage(assistantMsg)

      // 监听流式事件
      const disposers = []
      let result = null

      const resultPromise = new Promise((resolve, reject) => {
        // chunk
        const disposeChunk = provider === 'claude'
          ? api().onClaudeStreamChunk?.((text) => {
              const msg = chatSession.getLastAssistant?.()
              if (msg) {
                if (provider === 'claude') {
                  const textBlock = msg.content?.find(c => c.type === 'text')
                  if (textBlock) textBlock.text += text
                } else {
                  if (typeof msg.content === 'string') msg.content += text
                  else msg.content = (msg.content || '') + text
                }
              }
            })
          : api().onCodexStreamChunk?.((text) => {
              const msg = chatSession.getLastAssistant?.()
              if (msg) {
                if (typeof msg.content === 'string') msg.content += text
                else msg.content = (msg.content || '') + text
              }
            })
        if (disposeChunk) disposers.push(disposeChunk)

        // tool events
        if (provider === 'claude') {
          const disposeToolStart = api().onClaudeStreamToolStart?.(({ id, name }) => {
            activeToolCall.value = { id, name, input: '' }
          })
          if (disposeToolStart) disposers.push(disposeToolStart)

          const disposeToolInput = api().onClaudeStreamToolInput?.(({ id, partial }) => {
            if (activeToolCall.value?.id === id) {
              activeToolCall.value.input += partial
            }
          })
          if (disposeToolInput) disposers.push(disposeToolInput)
        } else {
          const disposeToolDelta = api().onCodexStreamToolDelta?.(({ index, id, name, arguments: args }) => {
            if (!activeToolCall.value) {
              activeToolCall.value = { id: id || '', name: '', input: '' }
            }
            if (id) activeToolCall.value.id = id
            if (name) activeToolCall.value.name += name
            if (args) activeToolCall.value.input += args
          })
          if (disposeToolDelta) disposers.push(disposeToolDelta)
        }

        // done
        const disposeDone = provider === 'claude'
          ? api().onClaudeStreamDone?.((data) => {
              resolve(data)
            })
          : api().onCodexStreamDone?.((data) => {
              resolve(data)
            })
        if (disposeDone) disposers.push(disposeDone)

        // error handling: if aborted
        ac.signal?.addEventListener?.('abort', () => {
          reject(new Error('aborted'))
        })
      })

      // 发起调用
      const invokePromise = provider === 'claude'
        ? (iteration === 0
            ? api().claudeChat?.(payload)
            : api().claudeChatContinue?.(payload))
        : (iteration === 0
            ? api().codexChat?.(payload)
            : api().codexChatContinue?.(payload))

      // Race invoke promise against stream events — if invoke rejects before done event fires
      const raceResult = await Promise.race([
        resultPromise,
        invokePromise.then(() => ({ _done: true })).catch(e => ({ _error: e?.message || '请求失败' })),
      ])
      if (raceResult?._error) streamError.value = raceResult._error
      result = !raceResult?._error ? raceResult : (result || { stop_reason: 'error' })

      // 清理监听器
      disposers.forEach(d => typeof d === 'function' && d())

      // 完成 assistant 消息
      const lastMsg = chatSession.getLastAssistant?.()
      if (lastMsg) {
        lastMsg.isStreaming = false
      }

      return result
    } catch (e) {
      if (e?.message === 'aborted') {
        // 用户手动停止
        const lastMsg = chatSession.getLastAssistant?.()
        if (lastMsg) lastMsg.isStreaming = false
        return { stop_reason: 'aborted' }
      }
      throw e
    }
  }

  /** 执行工具调用 */
  async function executeTool(toolBlock) {
    const name = toolBlock.name || toolBlock.function?.name
    if (name !== 'web_search') return null

    let input
    try {
      input = typeof toolBlock.input === 'string'
        ? JSON.parse(toolBlock.input)
        : (toolBlock.input || toolBlock.function?.arguments
            ? (typeof toolBlock.function.arguments === 'string'
                ? JSON.parse(toolBlock.function.arguments)
                : toolBlock.function.arguments)
            : {})
    } catch (_) {
      input = {}
    }

    const query = input.query || ''
    if (!query) return null

    try {
      const result = await api().chatWebSearch?.({ query })
      return { query, results: result?.results || [], error: result?.error }
    } catch (e) {
      return { query, results: [], error: e?.message || '搜索失败' }
    }
  }

  /** 构建工具结果消息 */
  function buildToolResultMessage(provider, toolBlock, execResult, toolUseId) {
    const toolName = toolBlock.name || toolBlock.function?.name

    if (provider === 'claude') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseId || toolBlock.id,
          content: JSON.stringify(execResult, null, 2),
        }]
      }
    } else {
      // OpenAI
      return {
        role: 'tool',
        tool_call_id: toolUseId || toolBlock.id,
        content: JSON.stringify(execResult, null, 2),
      }
    }
  }

  /** 发送消息（主入口） */
  async function sendMessage(text, images) {
    if (isStreaming.value) return
    isStreaming.value = true
    cleanup()

    try {
      const provider = chatSession.currentSession.provider
      let messages = buildCallMessages(text, images)

      // 工具循环
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        if (abortController.value?.signal?.aborted) break

        const result = await doApiCall(messages, iter)

        if (result?.stop_reason === 'aborted') break

        // 检查是否有工具调用
        let toolBlocks = []
        if (provider === 'claude') {
          toolBlocks = result?.toolUseBlocks || []
        } else {
          toolBlocks = result?.toolCalls || []
        }

        if (!toolBlocks.length || result?.stop_reason === 'end_turn' || result?.stop_reason === 'stop') {
          // 没有工具调用，对话完成
          break
        }

        // 执行工具
        activeToolCall.value = null
        for (const tb of toolBlocks) {
          const execResult = await executeTool(tb)
          if (!execResult) continue

          // 在历史中标记工具调用结果
          const lastMsg = chatSession.getLastAssistant?.()
          if (lastMsg && provider === 'claude') {
            // 为 Claude 添加 tool_use 到 content
            if (Array.isArray(lastMsg.content)) {
              // 替换占位 text block 为实际内容 + tool_use
              const toolUseBlock = {
                type: 'tool_use',
                id: tb.id,
                name: tb.name,
                input: typeof tb.input === 'string' ? JSON.parse(tb.input || '{}') : tb.input,
              }
              lastMsg.content.push(toolUseBlock)
            }
          }

          // 构建 tool_result 消息
          const trMsg = buildToolResultMessage(provider, tb, execResult, tb.id)
          messages.push(trMsg)
        }
      }
    } catch (e) {
      console.error('[useChatStream] error:', e)
      streamError.value = e?.message || '请求失败'
    } finally {
      isStreaming.value = false
      cleanup()
      // 保存会话
      try { await chatSession.saveSession?.() } catch (_) {}
    }
  }

  /** 停止流式 */
  function stopStreaming() {
    if (abortController.value) {
      abortController.value.abort?.()
    }
    isStreaming.value = false
  }

  /** 压缩上下文：用 LLM 将历史对话压缩为摘要 */
  async function compressContext() {
    const provider = chatSession.currentSession.provider
    const history = chatSession.currentSession.messages || []
    if (!history.length) return

    isStreaming.value = true
    streamError.value = null

    // 构建压缩提示词
    const compressPrompt = `请将以下对话内容压缩为一段简洁的摘要（200字以内），保留关键信息：\n- 用户的核心问题和需求\n- AI 提供的关键结论和发现\n- 重要的上下文信息\n\n仅输出摘要文本，不要加任何前缀。`

    // 将历史转为文本格式
    const historyText = history.map(m => {
      const role = m.role === 'user' ? '用户' : '助手'
      let text = ''
      if (typeof m.content === 'string') {
        text = m.content
      } else if (Array.isArray(m.content)) {
        text = m.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n')
      }
      return `[${role}] ${text}`
    }).join('\n\n')

    try {
      const payload = {
        messages: [{ role: 'user', content: `${compressPrompt}\n\n### 对话内容\n${historyText}` }],
        max_tokens: 1024,
      }

      let summary = ''
      if (provider === 'claude') {
        payload.system = '你是一个对话摘要助手。请简洁地总结对话内容。'
        const result = await api().claudeChat?.(payload)
        summary = result?.fullText || ''
      } else {
        payload.messages = [{ role: 'system', content: '你是一个对话摘要助手。' }, ...payload.messages]
        const result = await api().codexChat?.(payload)
        summary = result?.fullText || ''
      }

      if (summary) {
        chatSession.currentSession.contextSummary = summary.trim()
        // 压缩后清空消息（摘要已注入 system prompt）
        chatSession.currentSession.messages = []
        await chatSession.saveSession?.()
      }
    } catch (e) {
      console.warn('[compressContext] failed:', e)
      streamError.value = '上下文压缩失败：' + (e?.message || '未知错误')
    } finally {
      isStreaming.value = false
    }
  }

  return {
    isStreaming,
    streamError,
    activeToolCall,
    sendMessage,
    stopStreaming,
    compressContext,
  }
}
