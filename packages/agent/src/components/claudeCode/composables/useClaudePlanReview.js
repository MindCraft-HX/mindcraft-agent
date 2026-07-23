import { computed, ref } from 'vue'

const MAX_PLAN_PREVIEW_CHARS = 50_000

function isExitPlanTool(msg) {
  const name = String(msg?.toolName || '').toLowerCase()
  return name === 'exitplanmode' || name === 'exit_plan_mode'
}

function readPlanData(msg) {
  try {
    const input = JSON.parse(msg?.text || '{}')
    return {
      plan: typeof input?.plan === 'string' ? input.plan : '',
      planFilePath: typeof input?.planFilePath === 'string' ? input.planFilePath : '',
    }
  } catch (_) {
    return { plan: '', planFilePath: '' }
  }
}

function findLatestAssistantText(tab) {
  const messages = Array.isArray(tab?.messages) ? tab.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && typeof message.text === 'string' && message.text.trim()) {
      return message.text
    }
  }
  return ''
}

export function findPendingClaudePlanReview(tab) {
  const messages = Array.isArray(tab?.messages) ? tab.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.planReview && isExitPlanTool(message) && message.status === 'pending' && message.requestId) {
      return message
    }
  }
  return null
}

export function useClaudePlanReview({ getActiveTab, sendResponse, onAccepted, notifyError }) {
  const visible = ref(false)
  const toolMsg = ref(null)
  const submitting = ref(false)
  const responseError = ref('')
  let wasOpenOnDeactivate = false

  const plan = computed(() => {
    const msg = toolMsg.value
    if (!msg) return ''
    const inputPlan = readPlanData(msg).plan
    const value = inputPlan || findLatestAssistantText(getActiveTab())
    return value.length > MAX_PLAN_PREVIEW_CHARS
      ? `${value.slice(0, MAX_PLAN_PREVIEW_CHARS)}\n\n[Plan preview truncated]`
      : value
  })
  const planFilePath = computed(() => readPlanData(toolMsg.value).planFilePath)

  function show(msg) {
    const activeTab = getActiveTab()
    if (!msg || msg.status !== 'pending' || !msg.planReview || msg.sessionId !== activeTab?.sessionId) return false
    toolMsg.value = msg
    responseError.value = msg.planResponseError || ''
    visible.value = true
    return true
  }

  function syncActiveTab({ force = false } = {}) {
    const tab = getActiveTab()
    const pending = tab?.thinking ? findPendingClaudePlanReview(tab) : null
    if (visible.value && toolMsg.value !== pending) visible.value = false
    if (pending && (force || !pending.planDialogDismissed)) show(pending)
  }

  async function finish(action) {
    const msg = toolMsg.value
    if (!msg?.requestId || submitting.value) return
    submitting.value = true
    msg.planSubmitting = true
    msg.planResponseError = ''
    responseError.value = ''
    try {
      const result = await sendResponse({
        sessionId: msg.sessionId,
        requestId: msg.requestId,
        action,
      })
      if (!result?.ok) {
        const stale = result?.error === 'stale-request'
        const message = stale
          ? '该计划审查已失效，Claude 未收到操作。请重新发送消息。'
          : (result?.error || '计划操作提交失败，请重试。')
        msg.planResponseError = message
        responseError.value = message
        if (stale) {
          msg.status = 'error'
          visible.value = false
        }
        notifyError?.(message)
        return
      }

      msg.planReviewAnswered = true
      msg.planAction = action.type
      msg.status = action.type === 'accept' ? 'done' : 'denied'
      if (action.type === 'feedback') msg.planFeedback = action.feedback || ''
      visible.value = false
      if (action.type === 'accept') onAccepted?.(msg)
    } catch (error) {
      const message = error?.message || '计划操作提交失败，请重试。'
      msg.planResponseError = message
      responseError.value = message
      notifyError?.(message)
    } finally {
      submitting.value = false
      msg.planSubmitting = false
    }
  }

  function close() {
    if (toolMsg.value) toolMsg.value.planDialogDismissed = true
    visible.value = false
  }

  function reopen(msg) {
    if (msg) msg.planDialogDismissed = false
    show(msg)
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
    plan,
    planFilePath,
    submitting,
    responseError,
    show,
    reopen,
    close,
    finish,
    syncActiveTab,
    deactivate,
    activate,
  }
}
