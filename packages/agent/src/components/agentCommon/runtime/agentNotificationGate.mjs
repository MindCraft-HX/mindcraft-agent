/**
 * Agent 通知闸门（PR 3）
 *
 * 职责：基于 agent:event 领域事件判断是否应播放通知音。
 * 维护一个小型去重窗口，防止 Claude 双 done / CodeX terminal+finally 重复播放。
 *
 * 不依赖 Electron IPC / Vue，可纯 Node 测试。
 *
 * ## 双面板注册的设计说明
 *
 * CodeHub 默认同时挂载 ClaudeCode 和 CodeX 面板，两者分别在 onMounted 注册
 * window.electronAPI.onAgentEvent。同一 agent:event 会触发两个回调，但共享的
 * _seenKeys Set 保证 dedup key 相同时只播放一次。这是有意设计：
 * - 任一面板卸载时，另一个仍能独立播放通知音
 * - 无需在 CodeHub 层引入额外的注册/分发逻辑
 * - 后续若需要 agent-specific 声音/开关，可在此处按 event.agent 分流
 */

import { isSoundEligible, notificationDedupeKey } from './agentProtocol.mjs'

/** 去重窗口大小（最多保留最近 N 个 dedupe key） */
const DEDUPE_WINDOW_SIZE = 32
/** @type {Set<string>} */
const _seenKeys = new Set()

/**
 * 清理过期 key，保持窗口不超 DEDUPE_WINDOW_SIZE
 * FIFO：超过上限时删除最旧的条目（Set 按插入顺序迭代）
 */
function _pruneWindow() {
  if (_seenKeys.size <= DEDUPE_WINDOW_SIZE) return
  const oldest = _seenKeys.values().next().value
  _seenKeys.delete(oldest)
}

/**
 * 判断给定 agent:event 是否应该触发通知音
 *
 * 规则：
 * 1. 仅 agent.turn.terminal + completed + hasAssistantOutput 才 eligible
 * 2. 同一 dedupe key 在窗口期内只允许播放一次
 *
 * @param {object} event - agent:event envelope
 * @returns {{ shouldPlay: boolean, reason: string }}
 */
export function shouldPlayNotificationSound(event) {
  if (!isSoundEligible(event)) {
    return { shouldPlay: false, reason: 'not-eligible' }
  }

  const key = notificationDedupeKey(event)
  if (_seenKeys.has(key)) {
    return { shouldPlay: false, reason: 'duplicate' }
  }

  _seenKeys.add(key)
  _pruneWindow()
  return { shouldPlay: true, reason: 'ok' }
}

/**
 * 清空去重窗口（仅用于测试）
 */
export function _resetDedupeWindow() {
  _seenKeys.clear()
}

/**
 * 获取当前去重窗口大小（仅用于测试）
 */
export function _getDedupeWindowSize() {
  return _seenKeys.size
}
