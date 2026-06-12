import { ref, reactive, computed } from 'vue'

/**
 * 简易对话 - 会话持久化
 * 会话数据存储在 {userData}/chat-sessions/ 目录下
 */
export function useChatSession() {
  const sessionList = ref([])
  const currentSessionId = ref(null)
  const currentSession = reactive({
    id: null,
    title: '',
    createdAt: null,
    updatedAt: null,
    provider: 'claude',
    model: '',
    thinkingEnabled: false,
    thinkingBudget: 4000,
    webSearchEnabled: false,
    messages: [],
    contextSummary: '', // 上下文压缩后的摘要
  })
  const loading = ref(false)

  const api = () => window.electronAPI || {}

  /** 加载会话列表 */
  async function loadList() {
    try {
      const index = await api().chatListSessions?.()
      sessionList.value = index?.sessions || []
    } catch (e) {
      console.warn('[useChatSession] loadList failed:', e)
    }
  }

  /** 创建新会话 */
  async function createSession(provider = 'claude') {
    const id = crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    const now = Date.now()
    currentSessionId.value = id
    Object.assign(currentSession, {
      id,
      title: '新对话',
      createdAt: now,
      updatedAt: now,
      provider,
      model: '',
      thinkingEnabled: false,
      thinkingBudget: 4000,
      webSearchEnabled: false,
      messages: [],
    })
    await saveSession()
    await loadList()
    return id
  }

  /** 切换到指定会话 */
  async function switchSession(id) {
    if (id === currentSessionId.value) return
    loading.value = true
    try {
      // 先保存当前会话
      if (currentSessionId.value && currentSession.messages.length > 0) {
        await saveSession()
      }

      const data = await api().chatGetSession?.(id)
      if (data) {
        currentSessionId.value = id
        Object.assign(currentSession, data)
      }
    } catch (e) {
      console.warn('[useChatSession] switchSession failed:', e)
    } finally {
      loading.value = false
    }
  }

  /** 保存当前会话 */
  async function saveSession() {
    if (!currentSession.id) return
    currentSession.updatedAt = Date.now()
    try {
      await api().chatSaveSession?.(currentSession.id, JSON.parse(JSON.stringify(currentSession)))
    } catch (e) {
      console.warn('[useChatSession] saveSession failed:', e)
    }
  }

  /** 删除会话 */
  async function deleteSession(id) {
    try {
      await api().chatDeleteSession?.(id)
      if (id === currentSessionId.value) {
        currentSessionId.value = null
        Object.assign(currentSession, {
          id: null, title: '', createdAt: null, updatedAt: null,
          provider: 'claude', model: '', thinkingEnabled: false,
          thinkingBudget: 4000, webSearchEnabled: false, messages: [],
        })
      }
      await loadList()
    } catch (e) {
      console.warn('[useChatSession] deleteSession failed:', e)
    }
  }

  /** 添加消息到当前会话（仅内存，不立即持久化） */
  function addMessage(msg) {
    currentSession.messages.push(msg)
    currentSession.updatedAt = Date.now()
    // 如果标题还是默认的，用第一条用户消息更新
    if (currentSession.title === '新对话' && msg.role === 'user') {
      const text = extractText(msg)
      if (text) {
        currentSession.title = text.slice(0, 30)
      }
    }
  }

  /** 更新最后一条 assistant 消息 */
  function updateLastAssistant(updates) {
    const msgs = currentSession.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        Object.assign(msgs[i], updates)
        return msgs[i]
      }
    }
    return null
  }

  /** 获取最后一条助手消息 */
  function getLastAssistant() {
    const msgs = currentSession.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i]
    }
    return null
  }

  /** 提取消息中的文本 */
  function extractText(msg) {
    if (!msg?.content) return ''
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join(' ')
    }
    return ''
  }

  /** 清空消息（保留会话和上下文摘要） */
  function clearMessages() {
    currentSession.messages = []
    currentSession.updatedAt = Date.now()
  }

  /** 设置上下文摘要 */
  function setSummary(summary) {
    currentSession.contextSummary = summary || ''
    currentSession.updatedAt = Date.now()
  }

  const hasCurrentSession = computed(() => !!currentSession.id)

  return {
    sessionList,
    currentSessionId,
    currentSession,
    loading,
    hasCurrentSession,
    loadList,
    createSession,
    switchSession,
    saveSession,
    deleteSession,
    addMessage,
    updateLastAssistant,
    getLastAssistant,
    extractText,
    clearMessages,
    setSummary,
  }
}
