'use strict'

const {
  createCanonicalFileChangeItem,
  findPatchWrapperCallId,
  isInternalExecWrapper,
  isPatchWrapperCall,
} = require('./fileChangeEventReducer')

/**
 * Replays the JSONL tool-call triplet without making UI assumptions. The caller
 * maps emitted actions to renderer messages, so both history pagination paths
 * share the same association rules.
 */
function createHistoryToolCallCollector({ onAction }) {
  const pendingCalls = Object.create(null)
  const seenCallIds = new Set()
  const seenPatchIds = new Set()

  function isInternalControlCall(payload) {
    return payload?.type === 'function_call' && String(payload.name || '').toLowerCase() === 'wait'
  }

  function emitCanonicalPatch(patchEnd, callId = '') {
    const patchId = String(patchEnd?.call_id || '')
    if (!patchId || seenPatchIds.has(patchId)) return
    seenPatchIds.add(patchId)
    onAction({
      kind: 'file_change',
      item: createCanonicalFileChangeItem(patchEnd, {
        canonicalId: callId || `patch:${patchId}`,
        callId: callId || patchId,
      }),
    })
  }

  function tryFlushCall(callId) {
    const entry = pendingCalls[callId]
    if (!entry?.call || seenCallIds.has(callId)) return
    // Native apply_patch emits patch_apply_end under the same call ID. An exec
    // wrapper can use a different ID, so wait for path-based association.
    if (isPatchWrapperCall(entry.call) && !entry.patchEnd) return

    seenCallIds.add(callId)
    if (entry.patchEnd && isPatchWrapperCall(entry.call)) {
      emitCanonicalPatch(entry.patchEnd, callId)
    } else if (!isPatchWrapperCall(entry.call) && !isInternalExecWrapper(entry.call)) {
      onAction({ kind: 'tool', call: entry.call, output: entry.output || '' })
    }
    delete pendingCalls[callId]
  }

  function ingest(payload) {
    if (!payload || typeof payload !== 'object') return false

    if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
      if (!payload.call_id) return true
      if (isInternalControlCall(payload)) return true
      pendingCalls[payload.call_id] = { call: payload }
      return true
    }

    if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
      if (seenCallIds.has(payload.call_id)) return true
      const entry = pendingCalls[payload.call_id]
      if (entry) {
        entry.output = payload.output || ''
        tryFlushCall(payload.call_id)
      }
      return true
    }

    if (payload.type === 'patch_apply_end') {
      const wrapperCallId = findPatchWrapperCallId(pendingCalls, payload)
      if (wrapperCallId) {
        pendingCalls[wrapperCallId].patchEnd = payload
        tryFlushCall(wrapperCallId)
      } else {
        emitCanonicalPatch(payload)
      }
      return true
    }

    return false
  }

  function flushCompleted() {
    for (const [callId, entry] of Object.entries(pendingCalls)) {
      if (!entry.output && !isInternalExecWrapper(entry.call)) continue
      tryFlushCall(callId)
    }
  }

  return { ingest, flushCompleted }
}

module.exports = { createHistoryToolCallCollector }
