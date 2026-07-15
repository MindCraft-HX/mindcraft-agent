'use strict'

const MAX_RETAINED_PATCHES = 128
const MAX_RETAINED_FILE_ITEMS = 128

function normalizeFileChangePath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function makePathSignature(changes) {
  const paths = (Array.isArray(changes) ? changes : [])
    .map(change => normalizeFileChangePath(change?.path || change))
    .filter(Boolean)
    .sort()
  return paths.join('\u0000')
}

function patchChangesToFileChanges(changes) {
  if (Array.isArray(changes)) {
    return changes.map(change => ({
      ...change,
      path: change?.path || '',
      operation: change?.operation || change?.kind || 'modify',
      unified_diff: change?.unified_diff || '',
    }))
  }

  if (!changes || typeof changes !== 'object') return []
  return Object.entries(changes).map(([path, change]) => ({
    path,
    operation: change?.type === 'create'
      ? 'add'
      : change?.type === 'delete'
        ? 'delete'
        : change?.move_path
          ? 'rename'
          : 'modify',
    unified_diff: change?.unified_diff || '',
  }))
}

function extractPatchPathsFromInput(input) {
  const result = []
  // CodeX can serialize an apply_patch payload inside a JavaScript string, so
  // its line breaks arrive as literal "\\n" sequences in the JSONL.
  const text = String(input || '').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
  const re = /^\*\*\*\s+(?:Update|Add|Delete) File:\s*(.+?)\s*$/gm
  let match
  while ((match = re.exec(text))) result.push(match[1])
  return result
}

function extractMutationPathsFromItem(item) {
  if (!item || typeof item !== 'object') return []
  const type = String(item.type || '')
  const name = String(item.name || '').toLowerCase()
  if (type === 'custom_tool_call' && (name === 'apply_patch' || name === 'exec')) {
    return extractPatchPathsFromInput(item.input)
  }
  if (type !== 'function_call') return []
  if (!['write', 'write_file', 'create_file', 'edit', 'edit_file', 'str_replace', 'str_replace_editor', 'str_replace_based_edit'].includes(name)) return []
  try {
    const args = JSON.parse(item.arguments || '{}')
    const candidate = args.path || args.file_path || args.filePath
    return candidate ? [candidate] : []
  } catch (_) {
    return []
  }
}

function isPatchWrapperCall(call) {
  const name = String(call?.name || '').toLowerCase()
  return name === 'apply_patch' || (name === 'exec' && extractPatchPathsFromInput(call?.input).length > 0)
}

function isSamePathSet(leftChanges, rightChanges) {
  const left = makePathSignature(leftChanges)
  return Boolean(left) && left === makePathSignature(rightChanges)
}

function createCanonicalFileChangeItem(patchEnd, options = {}) {
  const changes = patchChangesToFileChanges(patchEnd?.changes)
  const patchId = String(patchEnd?.call_id || options.fallbackId || '')
  const canonicalId = String(options.canonicalId || `patch:${patchId}`)
  return {
    id: canonicalId,
    _fileChangeId: canonicalId,
    call_id: options.callId || patchId || canonicalId,
    type: 'file_change',
    status: patchEnd?.success === false || patchEnd?.status === 'failed' ? 'failed' : 'completed',
    changes,
    _diffAuthority: 'patch_apply_end',
  }
}

function trimQueue(queue, limit) {
  while (queue.length > limit) queue.shift()
}

/**
 * Reducer for one live CodeX run. It never reads files or sends IPC; callers
 * feed SDK/JSONL items and forward the returned canonical file_change item.
 */
function createFileChangeEventReducer() {
  const pendingPatches = []
  const pendingFileItems = []
  const pendingMutations = []

  function findSingleMatch(entries, changes) {
    const matches = entries.filter(entry => !entry.consumed && isSamePathSet(entry.changes, changes))
    return matches.length === 1 ? matches[0] : null
  }

  function ingestFileChange(item) {
    const changes = Array.isArray(item?.changes) ? item.changes : []
    const byCallId = pendingPatches.find(entry => !entry.consumed && entry.patch.call_id && entry.patch.call_id === item?.call_id)
    const patchEntry = byCallId || findSingleMatch(pendingPatches, changes)
    if (!patchEntry) {
      const mutationEntry = pendingMutations.find(entry => !entry.consumed && entry.callId && entry.callId === item?.call_id)
        || findSingleMatch(pendingMutations, changes)
      if (mutationEntry) {
        mutationEntry.consumed = true
        return {
          item: { ...item, id: mutationEntry.callId, call_id: mutationEntry.callId },
          matched: true,
        }
      }
      pendingFileItems.push({
        id: item?.id || '',
        callId: item?.call_id || '',
        changes,
        item,
        consumed: false,
      })
      trimQueue(pendingFileItems, MAX_RETAINED_FILE_ITEMS)
      return { item }
    }

    patchEntry.consumed = true
    const canonical = createCanonicalFileChangeItem(patchEntry.patch, {
      canonicalId: patchEntry.canonicalId,
      callId: item?.call_id || patchEntry.patch.call_id,
    })
    return { item: canonical, matched: true }
  }

  function ingestMutationCall(item) {
    const paths = extractMutationPathsFromItem(item)
    const callId = String(item?.call_id || '')
    if (!callId || !paths.length) return
    pendingMutations.push({ callId, changes: paths.map(path => ({ path })), consumed: false })
    trimQueue(pendingMutations, MAX_RETAINED_FILE_ITEMS)
  }

  function ingestPatchApplyEnd(patchEnd) {
    const changes = patchChangesToFileChanges(patchEnd?.changes)
    if (!changes.length) return null

    const byCallId = pendingFileItems.find(entry => !entry.consumed && entry.callId && entry.callId === patchEnd?.call_id)
    const fileEntry = byCallId || findSingleMatch(pendingFileItems, changes)
    if (fileEntry) {
      fileEntry.consumed = true
      return {
        item: createCanonicalFileChangeItem(patchEnd, {
          canonicalId: fileEntry.id || `patch:${patchEnd.call_id || ''}`,
          callId: fileEntry.callId || patchEnd.call_id,
        }),
        matched: true,
      }
    }

    const mutationEntry = pendingMutations.find(entry => !entry.consumed && entry.callId === patchEnd?.call_id)
      || findSingleMatch(pendingMutations, changes)
    if (mutationEntry) mutationEntry.consumed = true

    const canonicalId = mutationEntry?.callId || `patch:${patchEnd?.call_id || ''}`
    pendingPatches.push({ patch: patchEnd, changes, canonicalId, consumed: false })
    trimQueue(pendingPatches, MAX_RETAINED_PATCHES)
    return {
      item: createCanonicalFileChangeItem(patchEnd, { canonicalId, callId: mutationEntry?.callId || patchEnd?.call_id }),
      matched: Boolean(mutationEntry),
    }
  }

  return {
    ingestFileChange,
    ingestMutationCall,
    ingestPatchApplyEnd,
  }
}

function isInternalExecWrapper(item) {
  return String(item?.type || '') === 'custom_tool_call'
    && String(item?.name || '').toLowerCase() === 'exec'
}

function findPatchWrapperCallId(pendingCalls, patchEnd) {
  if (!pendingCalls || !patchEnd) return ''
  const entries = Object.entries(pendingCalls)
    .filter(([, entry]) => entry?.call && isPatchWrapperCall(entry.call))
  const direct = entries.find(([callId]) => callId === patchEnd.call_id)
  if (direct) return direct[0]

  const changedPaths = patchChangesToFileChanges(patchEnd.changes)
  const matches = entries.filter(([, entry]) => isSamePathSet(
    extractPatchPathsFromInput(entry.call.input),
    changedPaths
  ))
  return matches.length === 1 ? matches[0][0] : ''
}

module.exports = {
  MAX_RETAINED_FILE_ITEMS,
  MAX_RETAINED_PATCHES,
  createCanonicalFileChangeItem,
  createFileChangeEventReducer,
  extractPatchPathsFromInput,
  extractMutationPathsFromItem,
  findPatchWrapperCallId,
  isPatchWrapperCall,
  isInternalExecWrapper,
  normalizeFileChangePath,
  patchChangesToFileChanges,
}
