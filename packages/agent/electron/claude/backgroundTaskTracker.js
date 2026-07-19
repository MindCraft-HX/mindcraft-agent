'use strict'

const TERMINAL_NOTIFICATION_STATUSES = new Set(['completed', 'failed', 'stopped'])
const TERMINAL_UPDATED_STATUSES = new Set(['completed', 'failed', 'killed'])

function normalizeStatus(value) {
  return String(value || '').toLowerCase()
}

function createClaudeBackgroundTaskTracker() {
  const activeTasks = new Map()
  let pendingDonePayload = null

  function updateFromSdkMessage(msg) {
    if (msg?.type !== 'system') return activeTasks.size
    const subtype = String(msg.subtype || '')

    if (subtype === 'background_tasks_changed') {
      activeTasks.clear()
      for (const task of Array.isArray(msg.tasks) ? msg.tasks : []) {
        const taskId = String(task?.task_id || '')
        if (!taskId) continue
        activeTasks.set(taskId, {
          toolUseId: '',
          description: task.description || '',
        })
      }
      return activeTasks.size
    }

    const taskId = String(msg.task_id || '')
    if (!taskId) return activeTasks.size

    if (subtype === 'task_started') {
      activeTasks.set(taskId, {
        toolUseId: msg.tool_use_id || '',
        description: msg.description || '',
      })
      return activeTasks.size
    }

    if (subtype === 'task_notification') {
      if (TERMINAL_NOTIFICATION_STATUSES.has(normalizeStatus(msg.status))) {
        activeTasks.delete(taskId)
      }
      return activeTasks.size
    }

    if (subtype === 'task_updated') {
      if (TERMINAL_UPDATED_STATUSES.has(normalizeStatus(msg.patch?.status))) {
        activeTasks.delete(taskId)
      }
      return activeTasks.size
    }

    return activeTasks.size
  }

  return {
    updateFromSdkMessage,
    getActiveCount: () => activeTasks.size,
    hasActiveTasks: () => activeTasks.size > 0,
    setPendingDonePayload: (payload) => {
      pendingDonePayload = payload || null
    },
    hasPendingDonePayload: () => Boolean(pendingDonePayload),
    takePendingDonePayload: () => {
      const payload = pendingDonePayload
      pendingDonePayload = null
      return payload
    },
    clearPendingDonePayload: () => {
      pendingDonePayload = null
    },
  }
}

module.exports = {
  createClaudeBackgroundTaskTracker,
}
