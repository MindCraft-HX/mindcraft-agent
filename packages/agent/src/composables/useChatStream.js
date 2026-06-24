import { ref } from 'vue'

const MAX_TOOL_ITERATIONS = 5
/** 无任何流式活动超过该时长则自动中止（毫秒）
 *  大模型（GPT 5.x/o 系列等）首个 token 延迟可能 >60s，需给足余量 */
const STALL_TIMEOUT = 180_000

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

/** 思考档位 → Claude budget_tokens / OpenAI reasoning_effort
 *  简易对话场景使用保守值，避免第三方模型在 thinking 模式产生过长输出导致 OOM
 */
const THINKING_LEVELS = {
  low:    { budget: 512,   effort: 'low' },
  medium: { budget: 2048,  effort: 'medium' },
  high:   { budget: 4096,  effort: 'high' },
}

/** 上下文自动压缩阈值：200K 窗口的 80% = 160K tokens（当前主流模型均 ≥ 200K） */
const AUTO_COMPRESS_THRESHOLD = 160000
/** 粗糙 token 估算：中文 ~1.5 chars/token，英文 ~4 chars/token，取折中 *//** 粗糙 token 估算：中文 ~1.5 chars/token，英文 ~4 chars/token，取折中 */
function estimateTokens(session) {
  let chars = SYSTEM_PROMPT.length
  if (session.contextSummary) chars += session.contextSummary.length
  for (const m of (session.messages || [])) {
    const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }]
    for (const b of content) {
      if (b.type === 'text' && b.text) chars += b.text.length
      else if (b.type === 'tool_use') chars += JSON.stringify(b.input || {}).length
      else if (b.type === 'image' && b.data) chars += Math.round(b.data.length * 0.25)
    }
  }
  return Math.ceil(chars / 1.5)
}

function genChatId() {
  return (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
}



/**
 * 大图压缩：超过 1024px 缩放到 1024px 并转 JPEG 0.8 质量
 * 防止原始大图 base64（可达 10-15 MB）在工具循环中反复序列化导致 OOM
 */
async function compressLargeImage(data, mediaType) {
  const MAX_DIM = 1024
  const JPEG_QUALITY = 0.8

  // 如果已经是小图或 JPEG，跳过
  if (mediaType === 'image/jpeg') return { data, mediaType }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.width <= MAX_DIM && img.height <= MAX_DIM) {
        resolve({ data, mediaType })
        return
      }
      const ratio = Math.min(MAX_DIM / img.width, MAX_DIM / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]
      resolve({ data: compressed, mediaType: 'image/jpeg' })
    }
    img.onerror = () => resolve({ data, mediaType })
    img.src = `data:${mediaType};base64,${data}`
  })
}

/**
 * 简易对话 - 流式管理 + Tool Loop
 *
 * 会话内消息使用统一的内部格式（与 provider 无关），发请求时按 provider 转换：
 * - user:      { role:'user', content:[{type:'image', mediaType, data}..., {type:'text', text}] }
 * - assistant: { role:'assistant', content:[{type:'text',text}, {type:'tool_use', id, name, input}] }
 * - tool:      { role:'tool', toolUseId, toolName, query, resultCount, content }
 */
export function useChatStream(chatSession) {
  const isStreaming = ref(false)
  /** 当前正在执行的工具调用信息（UI 展示） */
  const activeToolCall = ref(null)
  /** 流式错误 */
  const streamError = ref(null)

  let currentChatId = null
  let userAborted = false

  const api = () => window.electronAPI || {}

  function thinkingConf() {
    const level = chatSession.currentSession.thinkingLevel
    if (!level || level === 'off') return null
    return THINKING_LEVELS[level] || THINKING_LEVELS.medium
  }

  // ── 内部格式 → provider wire 格式 ──

  function extractTextFromBlocks(content) {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => c.text || '').join('')
    }
    return ''
  }

  /** 从会话消息重建 API 消息列表（单一数据源，自动净化） */
  function buildApiMessages(provider) {
    const out = []
    for (const m of (chatSession.currentSession.messages || [])) {
      if (m.role === 'user') {
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }]
        const text = blocks.filter(b => b.type === 'text').map(b => b.text || '').join('')
        const images = blocks.filter(b => b.type === 'image' && (b.data || b.base64))
        if (!text.trim() && !images.length) continue

        if (provider === 'claude') {
          const content = []
          for (const img of images) {
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.data || img.base64 },
            })
          }
          if (text.trim()) content.push({ type: 'text', text })
          out.push({ role: 'user', content })
        } else {
          if (images.length) {
            const content = []
            if (text.trim()) content.push({ type: 'text', text })
            for (const img of images) {
              content.push({
                type: 'image_url',
                image_url: { url: `data:${img.mediaType || 'image/png'};base64,${img.data || img.base64}` },
              })
            }
            out.push({ role: 'user', content })
          } else {
            out.push({ role: 'user', content: text })
          }
        }
      } else if (m.role === 'assistant') {
        const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }]
        const text = blocks.filter(b => b.type === 'text').map(b => b.text || '').join('')
        const toolUses = blocks.filter(b => b.type === 'tool_use' && b.id)
        // 净化：空的 assistant 消息（中止/出错残留）直接跳过
        if (!text.trim() && !toolUses.length) continue

        if (provider === 'claude') {
          const content = []
          if (text.trim()) content.push({ type: 'text', text })
          for (const tu of toolUses) {
            content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input || {} })
          }
          out.push({ role: 'assistant', content })
        } else {
          const msg = { role: 'assistant', content: text.trim() ? text : null }
          if (toolUses.length) {
            msg.tool_calls = toolUses.map(tu => ({
              id: tu.id,
              type: 'function',
              function: { name: tu.name, arguments: JSON.stringify(tu.input || {}) },
            }))
          }
          out.push(msg)
        }
      } else if (m.role === 'tool') {
        if (!m.toolUseId) continue
        if (provider === 'claude') {
          out.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: m.toolUseId, content: m.content || '' }],
          })
        } else {
          out.push({ role: 'tool', tool_call_id: m.toolUseId, content: m.content || '' })
        }
      }
    }
    return out
  }

  /** 执行一次 API 调用（流式渲染 + 结果以 invoke 返回值为准） */
  async function doApiCall(iteration = 0) {
    const provider = chatSession.currentSession.provider
    const chatId = genChatId()
    currentChatId = chatId
    streamError.value = null

    // 构建请求参数
    const payload = { chatId, messages: buildApiMessages(provider) }

    // system prompt（含上下文摘要）
    let systemText = SYSTEM_PROMPT
    const summary = chatSession.currentSession?.contextSummary
    if (summary) {
      systemText = `## 之前的对话摘要\n${summary}\n\n---\n\n${SYSTEM_PROMPT}`
    }
    if (provider === 'claude') {
      payload.system = systemText
    } else {
      payload.messages = [{ role: 'system', content: systemText }, ...payload.messages]
    }

    if (chatSession.currentSession.model) {
      payload.model = chatSession.currentSession.model
    }

    if (chatSession.currentSession.webSearchEnabled) {
      payload.tools = provider === 'claude' ? [WEB_SEARCH_TOOL_CLAUDE] : [WEB_SEARCH_TOOL_OPENAI]
    }

    // 思考档位
    const tc = thinkingConf()
    // 简易对话 max_tokens 硬上限（防止第三方模型 thinking 模式产生过长输出导致 OOM）
    const MAX_RESPONSE_TOKENS = 8192
    if (provider === 'claude') {
      if (tc) {
        payload.thinking = { type: 'enabled', budget_tokens: tc.budget }
        // max_tokens 必须 > budget_tokens，但 capped 防止 OOM
        payload.max_tokens = Math.min(Math.max(tc.budget + 1024, 4096), MAX_RESPONSE_TOKENS)
      } else {
        // 显式关闭思考（第三方 provider 可能忽略此参数，已尽力）
        payload.thinking = { type: 'disabled' }
      }
      if (!payload.max_tokens) payload.max_tokens = MAX_RESPONSE_TOKENS
    } else {
      // CodeX / Responses API：reasoning.effort 精确控制
      // 'off' → 'none'（彻底关），其他 → 对应 effort 值
      const effort = chatSession.currentSession.thinkingLevel === 'off'
        ? 'none'
        : (tc?.effort || 'medium')
      payload.reasoning = { effort }
    }

    // assistant 占位消息（流式渲染目标）
    const assistantMsg = {
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      isStreaming: true,
      thinkingChars: 0,
      thinkingText: '',
    }
    chatSession.addMessage(assistantMsg)

    const disposers = []
    let lastActivity = Date.now()
    let stallTimer = null

    try {
      const appendText = (text) => {
        lastActivity = Date.now()
        const msg = chatSession.getLastAssistant?.()
        if (!msg) return
        const textBlock = Array.isArray(msg.content) ? msg.content.find(c => c.type === 'text') : null
        if (textBlock) textBlock.text += text
      }
      const onThinking = (text) => {
        lastActivity = Date.now()
        const msg = chatSession.getLastAssistant?.()
        if (msg) {
          msg.thinkingChars = (msg.thinkingChars || 0) + (text?.length || 0)
          msg.thinkingText = (msg.thinkingText || '') + (text || '')
        }
      }

      if (provider === 'claude') {
        const d1 = api().onClaudeStreamChunk?.((ev) => { if (ev?.chatId === chatId) appendText(ev.text || '') })
        const d2 = api().onClaudeStreamThinking?.((ev) => { if (ev?.chatId === chatId) onThinking(ev.text || '') })
        const d3 = api().onClaudeStreamToolStart?.((ev) => {
          if (ev?.chatId !== chatId) return
          lastActivity = Date.now()
          activeToolCall.value = { id: ev.id, name: ev.name, input: '' }
        })
        const d4 = api().onClaudeStreamToolInput?.((ev) => {
          if (ev?.chatId !== chatId) return
          lastActivity = Date.now()
          if (activeToolCall.value?.id === ev.id) activeToolCall.value.input += ev.partial || ''
        })
        disposers.push(d1, d2, d3, d4)
      } else {
        const d1 = api().onCodexStreamChunk?.((ev) => { if (ev?.chatId === chatId) appendText(ev.text || '') })
        const d2 = api().onCodexStreamThinking?.((ev) => { if (ev?.chatId === chatId) onThinking(ev.text || '') })
        const d3 = api().onCodexStreamToolDelta?.((ev) => {
          if (ev?.chatId !== chatId) return
          lastActivity = Date.now()
          if (!activeToolCall.value) activeToolCall.value = { id: ev.id || '', name: '', input: '' }
          if (ev.id) activeToolCall.value.id = ev.id
          if (ev.name) activeToolCall.value.name += ev.name
          if (ev.arguments) activeToolCall.value.input += ev.arguments
        })
        disposers.push(d1, d2, d3)
      }

      // 看门狗：长时间无活动自动中止（防止上游挂起导致永久转圈）
      stallTimer = setInterval(() => {
        if (Date.now() - lastActivity > STALL_TIMEOUT) {
          streamError.value = '响应超时，已自动中止'
          abortCurrent()
        }
      }, 5000)

      // 发起调用，invoke 返回值即权威结果
      const invoke = provider === 'claude'
        ? (iteration === 0 ? api().claudeChat : api().claudeChatContinue)
        : (iteration === 0 ? api().codexChat : api().codexChatContinue)
      if (typeof invoke !== 'function') {
        throw new Error('对话接口不可用（请重启应用后重试）')
      }

      let result
      try {
        result = await invoke(payload)
      } catch (e) {
        if (userAborted) return { stop_reason: 'aborted' }
        // Electron invoke 错误前缀清理
        const msg = String(e?.message || '请求失败').replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
        streamError.value = msg
        return { stop_reason: 'error' }
      }
      return result || { stop_reason: 'error' }
    } finally {
      if (stallTimer) clearInterval(stallTimer)
      disposers.forEach(d => { if (typeof d === 'function') d() })
      const lastMsg = chatSession.getLastAssistant?.()
      if (lastMsg) lastMsg.isStreaming = false
      if (currentChatId === chatId) currentChatId = null
    }
  }

  /** 执行工具调用（统一格式 {id, name, inputStr}） */
  async function executeTool(tb) {
    if (tb.name !== 'web_search') return null

    let input = {}
    try {
      input = typeof tb.inputStr === 'string' && tb.inputStr.trim() ? JSON.parse(tb.inputStr) : {}
    } catch (_) { input = {} }

    const query = input.query || ''
    if (!query) return { input, result: { error: '缺少搜索关键词', results: [] } }

    activeToolCall.value = { id: tb.id, name: tb.name, input: query }
    try {
      const result = await api().chatWebSearch?.({ query })
      return { input, result: { query, results: result?.results || [], error: result?.error } }
    } catch (e) {
      return { input, result: { query, results: [], error: e?.message || '搜索失败' } }
    } finally {
      activeToolCall.value = null
    }
  }

  /** 归一化工具调用块 → {id, name, inputStr} */
  function normalizeToolBlocks(provider, result) {
    if (provider === 'claude') {
      return (result?.toolUseBlocks || [])
        .filter(t => t.id && t.name)
        .map(t => ({ id: t.id, name: t.name, inputStr: t.input || '' }))
    }
    return (result?.toolCalls || [])
      .filter(t => t.id && t.function?.name)
      .map(t => ({ id: t.id, name: t.function.name, inputStr: t.function.arguments || '' }))
  }

  /** 发送消息（主入口） */
  async function sendMessage(text, images) {
    if (isStreaming.value) return
    if (!chatSession.currentSession.id) return

    // 上下文自动压缩：估算 token 超 160K 时自动处理
    try {
      if (estimateTokens(chatSession.currentSession) > AUTO_COMPRESS_THRESHOLD) {
        await compressContext()
      }
    } catch (_) {}

    isStreaming.value = true
    streamError.value = null
    activeToolCall.value = null
    userAborted = false

    try {
      const provider = chatSession.currentSession.provider

      // 1. 用户消息入会话（内部格式，provider 无关）→ 用户气泡立即可见
      const userContent = []
      for (const img of (images || [])) {
        const data = img.data || img.base64 || (typeof img.dataUrl === 'string' ? img.dataUrl.split(',')[1] : '')
        if (!data) continue
        // 压缩大图，防止 base64 过大导致 OOM
        const { data: compressed, mediaType: compressedType } = await compressLargeImage(data, img.mediaType || 'image/png')
        userContent.push({ type: 'image', mediaType: compressedType, data: compressed })
      }
      userContent.push({ type: 'text', text: text || '' })
      chatSession.addMessage({ role: 'user', content: userContent })

      // 2. 工具循环
      const turnStart = Date.now()
      const turnUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const result = await doApiCall(iter)

        // 累加 per-turn token（tool loop 多轮调用合并统计）
        if (result?.usage) {
          turnUsage.inputTokens += result.usage.input_tokens || 0
          turnUsage.outputTokens += result.usage.output_tokens || 0
          turnUsage.cacheReadTokens += result.usage.cache_read_input_tokens || 0
          turnUsage.cacheCreationTokens += result.usage.cache_creation_input_tokens || 0
        }

        if (userAborted || result?.stop_reason === 'aborted' || result?.finish_reason === 'aborted') break
        if (result?.stop_reason === 'timeout' || result?.finish_reason === 'timeout') {
          streamError.value = '响应超时（60s），已自动中止'
          // 移除空的 assistant 占位气泡
          const last = chatSession.currentSession.messages[chatSession.currentSession.messages.length - 1]
          if (last?.role === 'assistant' && !extractTextFromBlocks(last.content).trim()
              && !(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_use'))) {
            chatSession.currentSession.messages.pop()
          }
          break
        }
        if (result?.stop_reason === 'error') {
          // 检测上下文溢出，给友好提示
          if (streamError.value && /context.*(?:length|too.?long|exceed|overflow)|400|413|too.?many.?tokens|reduce.*(?:length|size)/i.test(streamError.value)) {
            streamError.value = '上下文已达上限，请点击顶部「压缩」按钮后再发送。'
          }
          // 错误时移除空的 assistant 占位气泡
          const last = chatSession.currentSession.messages[chatSession.currentSession.messages.length - 1]
          if (last?.role === 'assistant' && !extractTextFromBlocks(last.content).trim()
              && !(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_use'))) {
            chatSession.currentSession.messages.pop()
          }
          break
        }

        const toolBlocks = normalizeToolBlocks(provider, result)
        if (!toolBlocks.length) break

        // 3. tool_use 附加到 assistant 消息（持久化 + 重建 API 消息时需要）
        const lastMsg = chatSession.getLastAssistant?.()
        for (const tb of toolBlocks) {
          let parsed = {}
          try { parsed = tb.inputStr.trim() ? JSON.parse(tb.inputStr) : {} } catch (_) {}
          if (lastMsg && Array.isArray(lastMsg.content)) {
            lastMsg.content.push({ type: 'tool_use', id: tb.id, name: tb.name, input: parsed })
          }
        }

        // 4. 执行工具，结果入会话（每个 tool_use 必须有对应 tool_result）
        for (const tb of toolBlocks) {
          const exec = await executeTool(tb)
          const resultObj = exec?.result || { error: `不支持的工具：${tb.name}`, results: [] }
          chatSession.addMessage({
            role: 'tool',
            toolUseId: tb.id,
            toolName: tb.name,
            query: exec?.input?.query || '',
            resultCount: resultObj.results?.length || 0,
            content: JSON.stringify(resultObj, null, 2),
          })
        }

        if (userAborted) break
        // 5. 继续循环：下一轮 doApiCall 会从会话重建完整消息（含 tool_use + tool_result）
      }

      // 附着 per-turn token 到最后一条 assistant 消息
      if (turnUsage.inputTokens > 0 || turnUsage.outputTokens > 0) {
        const lastMsg = chatSession.getLastAssistant?.()
        if (lastMsg) {
          lastMsg._turnTokens = {
            ...turnUsage,
            durationMs: Date.now() - turnStart,
          }
        }
      }
    } catch (e) {
      console.error('[useChatStream] error:', e)
      streamError.value = e?.message || '请求失败'
    } finally {
      isStreaming.value = false
      activeToolCall.value = null
      userAborted = false
      try { await chatSession.saveSession?.() } catch (_) {}
    }
  }

  /** 中止当前主进程流 */
  function abortCurrent() {
    const id = currentChatId
    if (!id) return
    const provider = chatSession.currentSession.provider
    if (provider === 'claude') api().claudeChatAbort?.({ chatId: id })
    else api().codexChatAbort?.({ chatId: id })
  }

  /** 停止流式（用户点击停止按钮 / 安全复位） */
  function stopStreaming() {
    userAborted = true
    abortCurrent()
    // 安全网：如果当前无活跃 chatId（上次崩溃残留），强制复位 UI
    if (!currentChatId && isStreaming.value) {
      isStreaming.value = false
      activeToolCall.value = null
      streamError.value = null
    }
  }

  /** 压缩上下文：用 LLM 将历史对话压缩为摘要（直调 IPC，不污染会话） */
  async function compressContext() {
    const provider = chatSession.currentSession.provider
    const existingSummary = chatSession.currentSession.contextSummary || ''
    const history = chatSession.currentSession.messages || []
    if (!history.length && !existingSummary) return

    isStreaming.value = true
    streamError.value = null
    userAborted = false

    const compressPrompt = `请将以下对话内容压缩为一段简洁的摘要（200字以内），保留关键信息：\n- 用户的核心问题和需求\n- AI 提供的关键结论和发现\n- 重要的上下文信息\n\n仅输出摘要文本，不要加任何前缀。`

    // 带上已有摘要，避免二次压缩丢失信息
    let inputParts = []
    if (existingSummary) {
      inputParts.push(`## 之前的对话摘要\n${existingSummary}`)
    }
    const historyText = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        const role = m.role === 'user' ? '用户' : '助手'
        const text = extractTextFromBlocks(m.content)
        return text.trim() ? `[${role}] ${text}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
    if (historyText) {
      inputParts.push(`## 最近的对话\n${historyText}`)
    }
    if (!inputParts.length) return

    const fullInput = `${compressPrompt}\n\n${inputParts.join('\n\n')}`

    try {
      const chatId = genChatId()
      currentChatId = chatId
      const payload = {
        chatId,
        messages: [{ role: 'user', content: fullInput }],
        max_tokens: 1024,
      }
      if (chatSession.currentSession.model) payload.model = chatSession.currentSession.model

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

      if (summary && !userAborted) {
        // 覆盖（而非叠加）旧摘要，压缩后清空消息
        chatSession.currentSession.contextSummary = summary.trim()
        chatSession.currentSession.messages = []
        await chatSession.saveSession?.()
      }
    } catch (e) {
      console.warn('[compressContext] failed:', e)
      streamError.value = '上下文压缩失败：' + (e?.message || '未知错误')
    } finally {
      currentChatId = null
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
