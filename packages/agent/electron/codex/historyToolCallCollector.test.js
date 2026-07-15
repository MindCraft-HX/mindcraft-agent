const test = require('node:test')
const assert = require('node:assert/strict')
const { createHistoryToolCallCollector } = require('./historyToolCallCollector')

function patchEnd(callId, paths) {
  return {
    type: 'patch_apply_end', call_id: callId, success: true, status: 'completed',
    changes: Object.fromEntries(paths.map(path => [path, { type: 'update', unified_diff: `@@\n-old\n+new ${path}` }])),
  }
}

test('exec wrapper and mismatched patch ID emit one canonical file-change action', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest({
    type: 'custom_tool_call', call_id: 'call-wrapper', name: 'exec',
    input: '*** Begin Patch\n*** Update File: src/a.js\n*** End Patch',
  })
  collector.ingest(patchEnd('exec-patch', ['src/a.js']))
  collector.ingest({ type: 'custom_tool_call_output', call_id: 'call-wrapper', output: 'ok' })

  assert.equal(actions.length, 1)
  assert.equal(actions[0].kind, 'file_change')
  assert.equal(actions[0].item.id, 'call-wrapper')
  assert.match(actions[0].item.changes[0].unified_diff, /\+new/)
})

test('orphan patch remains visible instead of being discarded', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest(patchEnd('exec-orphan', ['src/a.js']))

  assert.equal(actions.length, 1)
  assert.equal(actions[0].item.id, 'patch:exec-orphan')
})

test('ordinary calls retain call/output handling', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest({ type: 'function_call', call_id: 'call-read', name: 'read_file', arguments: '{}' })
  collector.ingest({ type: 'function_call_output', call_id: 'call-read', output: 'content' })

  assert.deepEqual(actions, [{
    kind: 'tool',
    call: { type: 'function_call', call_id: 'call-read', name: 'read_file', arguments: '{}' },
    output: 'content',
  }])
})

test('ordinary exec wrappers do not create transcript cards', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest({ type: 'custom_tool_call', call_id: 'call-exec', name: 'exec', input: 'npm test' })
  collector.ingest({ type: 'custom_tool_call_output', call_id: 'call-exec', output: 'ok' })
  collector.flushCompleted()

  assert.deepEqual(actions, [])
})

test('internal wait calls do not create transcript cards', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest({ type: 'function_call', call_id: 'call-wait', name: 'wait', arguments: '{}' })
  collector.ingest({ type: 'function_call_output', call_id: 'call-wait', output: 'done' })
  collector.flushCompleted()

  assert.deepEqual(actions, [])
})

test('ambiguous exec wrappers leave the authoritative orphan patch visible without synthetic cards', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  for (const callId of ['call-a', 'call-b']) {
    collector.ingest({
      type: 'custom_tool_call', call_id: callId, name: 'exec',
      input: '*** Begin Patch\n*** Update File: src/a.js\n*** End Patch',
    })
  }
  collector.ingest(patchEnd('exec-ambiguous', ['src/a.js']))
  collector.ingest({ type: 'custom_tool_call_output', call_id: 'call-a', output: 'a' })
  collector.flushCompleted()

  assert.deepEqual(actions.map(action => action.item.id), ['patch:exec-ambiguous'])
})

test('exec wrapper waits for patch_apply_end even when output arrives first', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest({
    type: 'custom_tool_call', call_id: 'call-wrapper', name: 'exec',
    input: '*** Begin Patch\n*** Update File: src/a.js\n*** End Patch',
  })
  collector.ingest({ type: 'custom_tool_call_output', call_id: 'call-wrapper', output: 'ok' })
  assert.equal(actions.length, 0)
  collector.ingest(patchEnd('exec-late', ['src/a.js']))

  assert.equal(actions.length, 1)
  assert.equal(actions[0].kind, 'file_change')
  assert.equal(actions[0].item.id, 'call-wrapper')
})

test('unresolved patch wrapper does not fabricate an Edited or exec JSON card', () => {
  const actions = []
  const collector = createHistoryToolCallCollector({ onAction: action => actions.push(action) })
  collector.ingest({
    type: 'custom_tool_call', call_id: 'call-wrapper', name: 'exec',
    input: 'const patch = "*** Begin Patch\\n*** Update File: src/a.js\\n*** End Patch"',
  })
  collector.ingest({ type: 'custom_tool_call_output', call_id: 'call-wrapper', output: 'interrupted' })
  collector.flushCompleted()

  assert.deepEqual(actions, [])
})
