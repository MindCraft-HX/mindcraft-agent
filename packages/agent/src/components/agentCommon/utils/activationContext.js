/**
 * activationContext — 轻量 activation ID，仅用于 perf meta 串联同一次切换的各段探针。
 *
 * 不改变业务状态，不参与任何条件判断。格式：agentType:projectId:chatId:seq。
 *
 * 用法：
 *   import { startActivation, getActivationId } from './activationContext.js'
 *   // 在 codeHub.doSwitchProject 入口：
 *   const aid = startActivation(agentType, projectId, preferredChat?.id || '')
 *   // 在任意 perf 探针中（meta 传给 stop，不是 perfStart）：
 *   const stop = perfStart('codex.switchChat')
 *   // ... do work ...
 *   stop({ activationId: getActivationId() })
 */

let _currentActivationId = null
let _seq = 0

export function startActivation(agentType, projectId, chatId = '') {
  _seq += 1
  _currentActivationId = `${agentType || '?'}:${projectId || '?'}:${chatId || 'none'}:${_seq}`
  return _currentActivationId
}

export function getActivationId() {
  return _currentActivationId
}
