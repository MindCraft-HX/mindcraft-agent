import test from 'node:test'
import assert from 'node:assert/strict'

function hasRichNormalizedFileChanges(fileChanges) {
  if (!Array.isArray(fileChanges) || !fileChanges.length) return false
  return fileChanges.some(change => Boolean(
    change?.unified_diff
    || (Array.isArray(change?.diffLines) && change.diffLines.length)
    || (Array.isArray(change?.diffHunks) && change.diffHunks.length)
    || (Array.isArray(change?._diffHunks) && change._diffHunks.length)
    || change?._oldStr
    || change?._newStr
  ))
}

function parseApplyPatchForNormalize(input) {
  const lines = input.split(/\r?\n/)
  const result = []
  let curDel = []
  let curAdd = []

  function parsePatchFileHeader(line) {
    const match = line.match(/^\*\*\*\s+(Update|Add|Delete) File:\s*(.+)$/)
    if (!match) return null
    const [, kind, rawPath] = match
    return {
      path: rawPath.trim(),
      operation: kind === 'Add' ? 'add' : kind === 'Delete' ? 'delete' : 'modify',
    }
  }

  function flushHunk() {
    if (curDel.length || curAdd.length) {
      const last = result[result.length - 1]
      if (last) last.diffHunks.push({ del: [...curDel], add: [...curAdd] })
    }
    curDel = []
    curAdd = []
  }

  for (const line of lines) {
    const fileHeader = parsePatchFileHeader(line)
    if (fileHeader) {
      flushHunk()
      result.push({ path: fileHeader.path, operation: fileHeader.operation, unified_diff: '', diffHunks: [] })
    } else if (line.startsWith('***')) {
      continue
    } else if (line.startsWith('@@')) {
      flushHunk()
    } else if (line.startsWith('-')) {
      curDel.push(line.slice(1))
    } else if (line.startsWith('+')) {
      curAdd.push(line.slice(1))
    }
  }
  flushHunk()
  return result
}

function normalizeFileChangeMessages(messages) {
  if (!messages?.length) return
  for (const msg of messages) {
    if (msg.role !== 'tool') continue
    const rawType = String(msg.rawType || msg.toolName || '')
    let parsedText = null
    try {
      parsedText = typeof msg.text === 'string' ? JSON.parse(msg.text) : msg.text
    } catch (_) {}
    const isFileChange = rawType === 'file_change'
    const isApplyPatch = rawType === 'apply_patch'
      || String(msg.toolName || '') === 'apply_patch'
      || parsedText?.name === 'apply_patch'
    if (!isFileChange && !isApplyPatch) continue
    if (hasRichNormalizedFileChanges(msg._fileChanges)) continue

    const changes = parsedText?.changes || null
    if (Array.isArray(changes) && changes.length) {
      msg.filePath = changes.map(c => c.path).filter(Boolean).join('\n')
      msg._fileChanges = changes.map(c => ({
        path: c.path || '',
        operation: c.operation || c.kind || '',
        unified_diff: c.unified_diff || '',
        _oldStr: '',
        _newStr: '',
        diffLines: [],
      }))
      if (hasRichNormalizedFileChanges(msg._fileChanges) || !isApplyPatch) continue
    }

    const input = parsedText?.input || parsedText?._inputText || ''
    if (isApplyPatch && input) {
      const fileChanges = parseApplyPatchForNormalize(input)
      if (fileChanges.length) {
        msg._fileChanges = fileChanges
        msg.filePath = fileChanges.map(c => c.path).filter(Boolean).join('\n')
      }
    }
  }
}

test('history restore rebuilds apply_patch diff when stored changes are weak', () => {
  const messages = [{
    role: 'tool',
    toolName: 'apply_patch',
    rawType: 'file_change',
    text: JSON.stringify({
      name: 'apply_patch',
      input: [
        '*** Begin Patch',
        '*** Update File: docs/TODO.md',
        '@@',
        '-old line',
        '+new line',
        '*** End Patch',
      ].join('\n'),
      changes: [{ path: 'docs/TODO.md', kind: 'update' }],
    }),
  }]

  normalizeFileChangeMessages(messages)

  assert.equal(messages[0].filePath, 'docs/TODO.md')
  assert.equal(messages[0]._fileChanges?.[0]?.path, 'docs/TODO.md')
  assert.equal(messages[0]._fileChanges?.[0]?.diffHunks?.length, 1)
})

test('history restore rebuilds apply_patch add-file diff when stored changes are weak', () => {
  const messages = [{
    role: 'tool',
    toolName: 'apply_patch',
    rawType: 'file_change',
    text: JSON.stringify({
      name: 'apply_patch',
      input: [
        '*** Begin Patch',
        '*** Add File: docs/NEW-FEATURE.md',
        '+# New Feature',
        '+Added from patch',
        '*** End Patch',
      ].join('\n'),
      changes: [{ path: 'docs/NEW-FEATURE.md', kind: 'add' }],
    }),
  }]

  normalizeFileChangeMessages(messages)

  assert.equal(messages[0].filePath, 'docs/NEW-FEATURE.md')
  assert.equal(messages[0]._fileChanges?.[0]?.path, 'docs/NEW-FEATURE.md')
  assert.equal(messages[0]._fileChanges?.[0]?.operation, 'add')
  assert.equal(messages[0]._fileChanges?.[0]?.diffHunks?.length, 1)
})
