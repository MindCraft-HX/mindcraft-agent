'use strict'

const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels')
const { WINDOW_ROLES } = require('./windowRoles')

/**
 * before-quit 是否继续退出的纯决策：
 * - ready → 继续；
 * - cancel / participant error → 中止（用户取消或 dirty participant 失败，
 *   用户可处理后再退）；
 * - 握手基础设施错误（timeout / window-unavailable / 无结果）→ 继续，
 *   避免 renderer 挂死导致应用无法退出。
 */
function shouldProceedWithQuit(result) {
  if (!result || typeof result !== 'object') return true
  if (result.status === 'ready') return true
  if (result.status === 'error' && (result.reason === 'timeout' || result.reason === 'window-unavailable')) return true
  return false
}

function createCloseHandshake({ ipcMain, roles, getMainWindow, now = () => Date.now(), timeoutMs = 15_000 } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('ipcMain.handle is required')
  if (!roles || typeof roles.isSenderInRole !== 'function') throw new Error('role registry is required')
  if (typeof getMainWindow !== 'function') throw new Error('getMainWindow is required')

  const pending = new Map()
  let sequence = 0
  const boundedTimeout = Math.max(100, Math.min(60_000, Number(timeoutMs) || 15_000))

  ipcMain.handle(CORE_CHANNELS.CLOSE_COORDINATOR_RESPONSE, (event, payload) => {
    if (!roles.isSenderInRole(event?.sender, WINDOW_ROLES.MAIN_WORKBENCH)) return { accepted: false, reason: 'unauthorized' }
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : ''
    const status = payload?.status
    const request = pending.get(requestId)
    if (!request || (status !== 'ready' && status !== 'cancel' && status !== 'error')) return { accepted: false, reason: 'unknown-request' }
    pending.delete(requestId)
    clearTimeout(request.timer)
    request.resolve({ requestId, status, reason: typeof payload.reason === 'string' ? payload.reason : '' })
    return { accepted: true }
  })

  function requestClose(reason = 'quit') {
    const window = getMainWindow()
    if (!window || window.isDestroyed?.()) return Promise.resolve({ requestId: '', status: 'error', reason: 'window-unavailable' })
    const requestId = `close-${now()}-${++sequence}`
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (!pending.delete(requestId)) return
        resolve({ requestId, status: 'error', reason: 'timeout' })
      }, boundedTimeout)
      pending.set(requestId, { resolve, timer })
      window.webContents.send(CORE_CHANNELS.CLOSE_COORDINATOR_REQUEST, { requestId, reason })
    })
  }

  return { requestClose }
}

module.exports = { createCloseHandshake, shouldProceedWithQuit }
