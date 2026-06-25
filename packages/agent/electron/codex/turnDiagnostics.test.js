const test = require('node:test')
const assert = require('node:assert/strict')

const {
  summarizeResponsesInputItems,
  summarizeChatMessages,
  summarizeSsePayload,
  summarizeCodexTerminalEvent,
  __test__,
} = require('./turnDiagnostics')

test('summarizeResponsesInputItems keeps role/type/call metadata', () => {
  const summary = summarizeResponsesInputItems([
    { role: 'user', content: 'hello' },
    { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call_1', output: { ok: true } },
  ])

  assert.equal(summary.count, 3)
  assert.equal(summary.items[0].role, 'user')
  assert.equal(summary.items[1].type, 'function_call')
  assert.equal(summary.items[1].callId, 'call_1')
  assert.equal(summary.items[2].hasOutput, true)
})

test('summarizeChatMessages keeps tool call and reasoning summaries', () => {
  const summary = summarizeChatMessages([
    {
      role: 'assistant',
      content: null,
      reasoning_content: 'Need context.',
      tool_calls: [
        { id: 'call_1', function: { name: 'read_file', arguments: '{"path":"README.md"}' } },
      ],
    },
    { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
  ])

  assert.equal(summary.count, 2)
  assert.equal(summary.messages[0].hasToolCalls, true)
  assert.deepEqual(summary.messages[0].toolCallIds, ['call_1'])
  assert.equal(summary.messages[0].hasReasoning, true)
  assert.equal(summary.messages[1].toolCallId, 'call_1')
})

test('summarizeSsePayload detects done and stop markers', () => {
  const summary = summarizeSsePayload('data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n')

  assert.equal(summary.hasDoneMarker, true)
  assert.equal(summary.hasFinishReason, true)
  assert.equal(summary.hasStopFinishReason, true)
})

test('summarizeCodexTerminalEvent extracts nested error and usage fields', () => {
  const summary = summarizeCodexTerminalEvent({
    type: 'turn.failed',
    payload: { error: { type: 'empty_upstream_response', message: 'Empty response from upstream chat API' } },
    usage: { input_tokens: 10, output_tokens: 1, cached_input_tokens: 5 },
  })

  assert.equal(summary.type, 'turn.failed')
  assert.equal(summary.errorType, 'empty_upstream_response')
  assert.equal(summary.usage.inputTokens, 10)
  assert.equal(summary.usage.cachedInputTokens, 5)
})

test('sanitizeFileName strips invalid path characters', () => {
  assert.equal(__test__.sanitizeFileName('bad:/name*?'), 'bad-name')
})
