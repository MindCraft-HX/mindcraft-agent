const assert = require('assert')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  getGitInfo,
} = require('../packages/agent/electron/claudeMetrics.js')
const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-codex-git-'))
  try {
    run(dir)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
}

function run() {
  withTempDir((dir) => {
    const nonRepo = getGitInfo(dir)
    assert.equal(nonRepo, null)
  })

  withTempDir((dir) => {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'MindCraft Test'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' })
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'draft\n', 'utf8')
    execFileSync('git', ['add', 'notes.txt'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'draft\nupdated\n', 'utf8')

    const filePath = path.join(dir, 'session.jsonl')
    fs.writeFileSync(filePath, [
      JSON.stringify({
        timestamp: '2026-06-08T12:00:00.000Z',
        type: 'event_msg',
        payload: { type: 'task_started' },
      }),
      JSON.stringify({
        timestamp: '2026-06-08T12:00:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 10,
              output_tokens: 5,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
        },
      }),
      '',
    ].join('\n'), 'utf8')

    const metrics = __test__.getCodexSessionMetricsByFile(filePath, '', dir)
    assert.ok(metrics)
    assert.ok(metrics.gitBranch)
    assert.equal(metrics.gitChanges > 0, true)
  })

  withTempDir((dir) => {
    const filePath = path.join(dir, 'session-turn-metrics.jsonl')
    fs.writeFileSync(filePath, [
      JSON.stringify({
        timestamp: '2026-06-08T12:00:00.000Z',
        type: 'event_msg',
        payload: { type: 'user_message' },
      }),
      JSON.stringify({
        timestamp: '2026-06-08T12:00:05.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 1000,
              output_tokens: 200,
              cached_input_tokens: 400,
              cache_creation_input_tokens: 0,
            },
            last_token_usage: {
              input_tokens: 1000,
              output_tokens: 200,
              cached_input_tokens: 400,
              total_tokens: 1400,
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-06-08T12:10:00.000Z',
        type: 'event_msg',
        payload: { type: 'user_message' },
      }),
      JSON.stringify({
        timestamp: '2026-06-08T12:10:07.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 1600,
              output_tokens: 280,
              cached_input_tokens: 700,
              cache_creation_input_tokens: 0,
            },
            last_token_usage: {
              input_tokens: 600,
              output_tokens: 80,
              cached_input_tokens: 300,
              total_tokens: 900,
            },
          },
        },
      }),
      '',
    ].join('\n'), 'utf8')

    const metrics = __test__.getCodexSessionMetricsByFile(filePath, '', dir)
    assert.ok(metrics)
    assert.equal(metrics.inputTokens, 600)
    assert.equal(metrics.outputTokens, 80)
    assert.equal(metrics.cacheReadTokens, 300)
    assert.equal(metrics.contextUsage, 900)
    assert.equal(metrics.durationMs, 7000)
  })

  withTempDir((dir) => {
    const filePath = path.join(dir, 'session-history.jsonl')
    fs.writeFileSync(filePath, [
      JSON.stringify({
        timestamp: '2026-06-08T12:10:00.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'call-edit-1',
          name: 'edit',
          arguments: JSON.stringify({
            file_path: 'src/demo.ts',
            old_string: 'const demo = 1\n',
            new_string: 'const demo = 2\n',
          }),
        },
      }),
      JSON.stringify({
        timestamp: '2026-06-08T12:10:01.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call-edit-1',
          output: 'ok',
        },
      }),
      '',
    ].join('\n'), 'utf8')

    const history = __test__.readSessionFileRange(filePath, 0, 20)
    assert.ok(history)
    assert.ok(Array.isArray(history.messages))
    const toolMsg = history.messages.find(msg => msg.role === 'tool' && msg.toolName === 'edit')
    assert.ok(toolMsg)
    assert.equal(toolMsg.filePath, 'src/demo.ts')
    assert.equal(toolMsg.newContent, 'const demo = 2\n')
    assert.deepEqual(toolMsg._diffInput, {
      oldStr: 'const demo = 1\n',
      newStr: 'const demo = 2\n',
    })
  })

  withTempDir((dir) => {
    const filePath = path.join(dir, 'session-history-new-tools.jsonl')
    fs.writeFileSync(filePath, [
      JSON.stringify({
        timestamp: '2026-06-09T08:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'call-create-1',
          name: 'create_file',
          arguments: JSON.stringify({
            file_path: 'src/new-file.ts',
            content: 'export const created = true\n',
          }),
        },
      }),
      JSON.stringify({
        timestamp: '2026-06-09T08:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call-create-1',
          output: 'ok',
        },
      }),
      JSON.stringify({
        timestamp: '2026-06-09T08:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'call-edit-file-1',
          name: 'edit_file',
          arguments: JSON.stringify({
            file_path: 'src/existing.ts',
            old_string: 'const before = 1\n',
            new_string: 'const before = 2\n',
          }),
        },
      }),
      JSON.stringify({
        timestamp: '2026-06-09T08:00:03.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call-edit-file-1',
          output: 'ok',
        },
      }),
      '',
    ].join('\n'), 'utf8')

    const history = __test__.readSessionFileRange(filePath, 0, 20)
    assert.ok(history)
    assert.ok(Array.isArray(history.messages))

    const createMsg = history.messages.find(msg => msg.role === 'tool' && msg.toolName === 'create_file')
    assert.ok(createMsg)
    assert.equal(createMsg.filePath, 'src/new-file.ts')
    assert.equal(createMsg.newContent, 'export const created = true\n')
    assert.deepEqual(createMsg._diffInput, {
      oldStr: '',
      newStr: 'export const created = true\n',
    })

    const editMsg = history.messages.find(msg => msg.role === 'tool' && msg.toolName === 'edit_file')
    assert.ok(editMsg)
    assert.equal(editMsg.filePath, 'src/existing.ts')
    assert.equal(editMsg.newContent, 'const before = 2\n')
    assert.deepEqual(editMsg._diffInput, {
      oldStr: 'const before = 1\n',
      newStr: 'const before = 2\n',
    })
  })

  withTempDir((dir) => {
    const filePath = path.join(dir, 'session-history-repeated-replies.jsonl')
    fs.writeFileSync(filePath, [
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '收到请回复即可' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: '收到。' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '收到。' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '收到请回复即可' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: '收到。' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '收到。' }] } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete' } }),
      '',
    ].join('\n'), 'utf8')

    const history = __test__.readSessionFileRange(filePath, 0, 20)
    const assistantReplies = history.messages.filter(msg => msg.role === 'assistant' && msg.text === '收到。')
    assert.equal(assistantReplies.length, 2)
  })

  console.log('codex git metrics tests passed')
}

run()
