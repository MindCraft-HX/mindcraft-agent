/**
 * Agent notification gate.
 *
 * Responsibilities:
 * - Only agent.turn.terminal completed events with assistant output can play sound.
 * - Deduplicate near-simultaneous duplicate deliveries from dual panels / legacy bridges.
 *
 * The dedupe window must be time-based. Claude may reuse the same
 * chatKey + cliSessionId across many turns, so a permanent Set would suppress
 * completion sounds after the first turn in the same session.
 */

import { isSoundEligible, notificationDedupeKey } from './agentProtocol.mjs'

export const DEDUPE_TTL_MS = 1500
const DEDUPE_WINDOW_SIZE = 32

/** @type {Map<string, number>} */
const _seenKeys = new Map()

function _resolveNow(options) {
  if (typeof options?.now === 'number') return options.now
  if (typeof options?.now === 'function') return Number(options.now())
  return Date.now()
}

function _pruneWindow(now) {
  for (const [key, seenAt] of _seenKeys) {
    if (now - seenAt > DEDUPE_TTL_MS) {
      _seenKeys.delete(key)
    }
  }

  while (_seenKeys.size > DEDUPE_WINDOW_SIZE) {
    const oldest = _seenKeys.keys().next().value
    _seenKeys.delete(oldest)
  }
}

/**
 * @param {object} event - agent:event envelope
 * @param {{ now?: number | (() => number) }} [options]
 * @returns {{ shouldPlay: boolean, reason: string }}
 */
export function shouldPlayNotificationSound(event, options = undefined) {
  if (!isSoundEligible(event)) {
    return { shouldPlay: false, reason: 'not-eligible' }
  }

  const now = _resolveNow(options)
  _pruneWindow(now)

  const key = notificationDedupeKey(event)
  const seenAt = _seenKeys.get(key)
  if (typeof seenAt === 'number' && now - seenAt <= DEDUPE_TTL_MS) {
    return { shouldPlay: false, reason: 'duplicate' }
  }

  _seenKeys.set(key, now)
  _pruneWindow(now)
  return { shouldPlay: true, reason: 'ok' }
}

export function _resetDedupeWindow() {
  _seenKeys.clear()
}

export function _getDedupeWindowSize() {
  return _seenKeys.size
}
