const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { __test__ } = require('../packages/agent/electron/codexAgent.js')

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
}

function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-codex-file-change-'))
  try {
    const filePath = path.join(dir, 'session.jsonl')
    writeJsonl(filePath, [
      {
        timestamp: '2026-07-14T09:41:16.968Z',
        type: 'response_item',
        payload: {
          type: 'custom_tool_call', call_id: 'call-wrapper', name: 'exec', status: 'completed',
          input: [
            '*** Begin Patch',
            '*** Update File: tests/a.mjs',
            '*** Update File: tests/b.mjs',
            '*** End Patch',
          ].join('\n'),
        },
      },
      {
        timestamp: '2026-07-14T09:41:17.007Z',
        type: 'event_msg',
        payload: {
          type: 'patch_apply_end', call_id: 'exec-patch', turn_id: 'turn-1', success: true, status: 'completed',
          changes: {
            'tests/a.mjs': { type: 'update', unified_diff: '@@ -1 +1 @@\n-old a\n+new a' },
            'tests/b.mjs': { type: 'update', unified_diff: '@@ -1 +1 @@\n-old b\n+new b' },
          },
        },
      },
      {
        timestamp: '2026-07-14T09:41:17.317Z',
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', call_id: 'call-wrapper', output: 'ok' },
      },
    ])

    const history = __test__.readSessionFileRange(filePath, 0, 60)
    const fileChanges = history.messages.filter(message => message.rawType === 'file_change')
    assert.equal(fileChanges.length, 1)
    assert.equal(fileChanges[0].toolUseId, 'call-wrapper')
    const parsed = JSON.parse(fileChanges[0].text)
    assert.equal(parsed.changes.length, 2)
    assert.match(parsed.changes[0].unified_diff, /\+new a/)
    assert.match(parsed.changes[1].unified_diff, /\+new b/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

run()
console.log('codex file-change history convergence tests passed')
