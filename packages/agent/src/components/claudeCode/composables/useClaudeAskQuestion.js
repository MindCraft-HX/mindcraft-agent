import { nextTick, ref } from 'vue'

export function parseClaudeAskQuestions(msg) {
  try {
    const obj = JSON.parse(msg?.text || '{}')
    const questions = Array.isArray(obj?.questions) ? obj.questions : []
    return questions.map(q => ({
      id: q?.id || '',
      prompt: q?.question || q?.prompt || '',
      header: q?.header || '',
      options: Array.isArray(q?.options) ? q.options : [],
    }))
  } catch (_) {
    return []
  }
}

export function findPendingClaudeAskMessage(tab) {
  const messages = Array.isArray(tab?.messages) ? tab.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    const name = String(msg?.toolName || '').toLowerCase()
    if (
      ['askuserquestion', 'ask_user_question'].includes(name) &&
      msg?.status === 'pending' &&
      !msg.askAnswered &&
      msg.requestId
    ) return msg
  }
  return null
}

function questionKey(question, index) {
  return question?.prompt || question?.header || `q${index + 1}`
}

function formatAnswers(answers) {
  return Object.entries(answers).map(([key, value]) => `${key}: ${value}`).join('; ')
}

export function useClaudeAskQuestion({ getActiveTab, sendResponse, notifyError }) {
  const visible = ref(false)
  const questions = ref([])
  const toolMsg = ref(null)
  const dialogRef = ref(null)
  const answers = ref({})
  const responseError = ref('')
  let wasOpenOnDeactivate = false

  function isActiveMessage(msg) {
    return Boolean(msg?.sessionId) && msg.sessionId === getActiveTab()?.sessionId
  }

  function show(msg, parsedQuestions = parseClaudeAskQuestions(msg), { force = false } = {}) {
    if (!msg || msg.status !== 'pending' || msg.askAnswered || !isActiveMessage(msg)) return false
    if (msg.askDialogDismissed && !force) return false
    if (!parsedQuestions.length) return false
    if (force) msg.askDialogDismissed = false
    toolMsg.value = msg
    questions.value = parsedQuestions
    answers.value = { ...(msg.askDraftAnswers || {}) }
    responseError.value = msg.askResponseError || ''
    visible.value = true
    const answeredCount = Object.keys(answers.value).length
    nextTick(() => dialogRef.value?.reset?.(answeredCount))
    return true
  }

  function reopen(msg) {
    show(msg, parseClaudeAskQuestions(msg), { force: true })
  }

  async function submit(msg, submittedAnswers) {
    if (!msg?.requestId || msg.askSubmitting) return
    msg.askSubmitting = true
    msg.askResponseError = ''
    responseError.value = ''
    try {
      const result = await sendResponse({
        sessionId: msg.sessionId,
        requestId: msg.requestId,
        answers: { ...submittedAnswers },
      })
      if (!result?.ok) {
        const stale = result?.error === 'stale-request'
        const message = stale
          ? '该询问已失效，Claude 未收到回答。请重新发送消息。'
          : (result?.error || '回答提交失败，请重试。')
        msg.askResponseError = message
        responseError.value = message
        if (stale) {
          msg.status = 'error'
          visible.value = false
        }
        notifyError?.(message)
        return
      }
      msg.askAnswered = true
      msg.askAnswerText = formatAnswers(submittedAnswers)
      msg.askDraftAnswers = null
      msg.askDialogDismissed = false
      msg.status = 'done'
      visible.value = false
    } catch (error) {
      const message = error?.message || '回答提交失败，请重试。'
      msg.askResponseError = message
      responseError.value = message
      notifyError?.(message)
    } finally {
      msg.askSubmitting = false
    }
  }

  function answer(question, option) {
    const msg = toolMsg.value
    if (!msg || msg.askSubmitting) return
    const index = questions.value.indexOf(question)
    const key = questionKey(question, index < 0 ? 0 : index)
    const nextAnswers = { ...answers.value, [key]: option.label }
    answers.value = nextAnswers
    msg.askDraftAnswers = nextAnswers
    if (Object.keys(nextAnswers).length >= questions.value.length) {
      void submit(msg, nextAnswers)
    }
  }

  function close() {
    if (toolMsg.value) toolMsg.value.askDialogDismissed = true
    visible.value = false
  }

  function syncActiveTab({ force = false } = {}) {
    const activeTab = getActiveTab()
    const pending = activeTab?.thinking ? findPendingClaudeAskMessage(activeTab) : null
    if (visible.value && toolMsg.value !== pending) visible.value = false
    if (pending) show(pending, parseClaudeAskQuestions(pending), { force })
  }

  function deactivate() {
    wasOpenOnDeactivate = visible.value
    visible.value = false
  }

  function activate() {
    syncActiveTab({ force: wasOpenOnDeactivate })
    wasOpenOnDeactivate = false
  }

  return {
    visible,
    questions,
    dialogRef,
    toolMsg,
    responseError,
    answer,
    close,
    reopen,
    show,
    syncActiveTab,
    deactivate,
    activate,
  }
}
