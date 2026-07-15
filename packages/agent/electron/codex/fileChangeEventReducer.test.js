const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createFileChangeEventReducer,
  findPatchWrapperCallId,
  isInternalExecWrapper,
  patchChangesToFileChanges,
} = require('./fileChangeEventReducer')

function patchEnd(callId, paths) {
  return {
    type: 'patch_apply_end',
    call_id: callId,
    status: 'completed',
    success: true,
    changes: Object.fromEntries(paths.map(path => [path, {
      type: 'update',
      unified_diff: `@@ -1 +1 @@\n-old ${path}\n+new ${path}`,
    }])),
  }
}

test('patch_apply_end preserves authoritative diff when no SDK item can be linked', () => {
  const reducer = createFileChangeEventReducer()
  const result = reducer.ingestPatchApplyEnd(patchEnd('exec-1', ['src/a.js']))

  assert.equal(result.matched, false)
  assert.equal(result.item.id, 'patch:exec-1')
  assert.equal(result.item._diffAuthority, 'patch_apply_end')
  assert.match(result.item.changes[0].unified_diff, /\+new/)
})

test('patch event first and weak SDK file_change later share one canonical id', () => {
  const reducer = createFileChangeEventReducer()
  const first = reducer.ingestPatchApplyEnd(patchEnd('exec-2', ['src/a.js']))
  const second = reducer.ingestFileChange({
    id: 'sdk-file-2', type: 'file_change', status: 'completed', changes: [{ path: 'src/a.js', kind: 'update' }],
  })

  assert.equal(first.item.id, 'patch:exec-2')
  assert.equal(second.item.id, 'patch:exec-2')
  assert.match(second.item.changes[0].unified_diff, /\+new/)
})

test('weak SDK file_change first is enriched in place by patch_apply_end', () => {
  const reducer = createFileChangeEventReducer()
  reducer.ingestFileChange({
    id: 'sdk-file-3', call_id: 'call-file-3', type: 'file_change', status: 'completed', changes: [{ path: 'src/a.js', kind: 'update' }],
  })
  const result = reducer.ingestPatchApplyEnd(patchEnd('exec-3', ['src/a.js']))

  assert.equal(result.matched, true)
  assert.equal(result.item.id, 'sdk-file-3')
  assert.equal(result.item.call_id, 'call-file-3')
  assert.match(result.item.changes[0].unified_diff, /\+new/)
})

test('known write call gives a later weak SDK file_change the same canonical id', () => {
  const reducer = createFileChangeEventReducer()
  reducer.ingestMutationCall({
    type: 'function_call', call_id: 'call-write', name: 'write',
    arguments: JSON.stringify({ path: 'src/a.js', content: 'new' }),
  })
  const result = reducer.ingestFileChange({
    id: 'sdk-file-write', type: 'file_change', changes: [{ path: 'src/a.js', kind: 'add' }],
  })

  assert.equal(result.matched, true)
  assert.equal(result.item.id, 'call-write')
  assert.equal(result.item.call_id, 'call-write')
})

test('known apply_patch call gives patch_apply_end the existing card id', () => {
  const reducer = createFileChangeEventReducer()
  reducer.ingestMutationCall({
    type: 'custom_tool_call', call_id: 'call-apply', name: 'apply_patch',
    input: '*** Begin Patch\n*** Update File: src/a.js\n*** End Patch',
  })
  const result = reducer.ingestPatchApplyEnd(patchEnd('call-apply', ['src/a.js']))

  assert.equal(result.matched, true)
  assert.equal(result.item.id, 'call-apply')
  assert.equal(result.item.call_id, 'call-apply')
})

test('ambiguous same-path SDK items are never assigned another patch diff', () => {
  const reducer = createFileChangeEventReducer()
  reducer.ingestFileChange({ id: 'sdk-a', type: 'file_change', changes: [{ path: 'src/a.js' }] })
  reducer.ingestFileChange({ id: 'sdk-b', type: 'file_change', changes: [{ path: 'src/a.js' }] })
  const result = reducer.ingestPatchApplyEnd(patchEnd('exec-4', ['src/a.js']))

  assert.equal(result.matched, false)
  assert.equal(result.item.id, 'patch:exec-4')
})

test('history wrapper recognition accepts call_* exec plus exec-* patch by exact path set', () => {
  const pendingCalls = {
    'call-wrapper': {
      call: {
        type: 'custom_tool_call',
        name: 'exec',
        input: '*** Begin Patch\n*** Update File: tests/a.mjs\n*** Update File: tests/b.mjs\n*** End Patch',
      },
    },
  }
  const match = findPatchWrapperCallId(pendingCalls, patchEnd('exec-5', ['tests/a.mjs', 'tests/b.mjs']))
  assert.equal(match, 'call-wrapper')
})

test('history wrapper recognition accepts a patch embedded in an escaped JavaScript string', () => {
  const pendingCalls = {
    'call-wrapper': {
      call: {
        type: 'custom_tool_call',
        name: 'exec',
        input: 'const patch = "*** Begin Patch\\n*** Update File: tests/a.mjs\\n*** End Patch"',
      },
    },
  }
  const match = findPatchWrapperCallId(pendingCalls, patchEnd('exec-escaped', ['tests/a.mjs']))
  assert.equal(match, 'call-wrapper')
})

test('history wrapper recognition rejects partial path matches', () => {
  const pendingCalls = {
    'call-wrapper': {
      call: {
        type: 'custom_tool_call',
        name: 'exec',
        input: '*** Begin Patch\n*** Update File: tests/a.mjs\n*** End Patch',
      },
    },
  }
  const match = findPatchWrapperCallId(pendingCalls, patchEnd('exec-6', ['tests/a.mjs', 'tests/b.mjs']))
  assert.equal(match, '')
})

test('patch changes normalize object and array shapes', () => {
  assert.equal(patchChangesToFileChanges({ 'src/a.js': { type: 'create' } })[0].operation, 'add')
  assert.equal(patchChangesToFileChanges([{ path: 'src/a.js', kind: 'delete' }])[0].operation, 'delete')
})

test('all custom exec wrappers are internal, even when they do not carry a patch', () => {
  assert.equal(isInternalExecWrapper({ type: 'custom_tool_call', name: 'exec', input: 'npm test' }), true)
  assert.equal(isInternalExecWrapper({ type: 'custom_tool_call', name: 'apply_patch' }), false)
  assert.equal(isInternalExecWrapper({ type: 'function_call', name: 'exec' }), false)
})
