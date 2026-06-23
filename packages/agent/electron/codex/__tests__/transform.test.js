/**
 * CodeX 鍗忚杞崲浠ｇ悊 鈥?鑷姩鍖栨祴璇? *
 * 瑕嗙洊 transformStream / transformRequest / transformResponse
 * 娴嬭瘯鐢ㄤ緥瀵归綈 CC SWITCH 鐨?Rust 娴嬭瘯
 *
 * 杩愯: node packages/agent/electron/codex/__tests__/transform.test.js
 */
'use strict'

const assert = require('assert')
const { ChatToResponsesState, createResponsesSseFromChat } = require('../transformStream')
const { responsesToChatCompletions } = require('../transformRequest')
const { chatCompletionToResponse, chatErrorToResponseError } = require('../transformResponse')
const { patchTomlBaseUrl, hasProxyBaseUrl } = require('../chatProxyManager')

let passed = 0
let failed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
  } catch (err) {
    throw err
  }
}

function test(name, fn) {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') {
      // async test
      return r.then(
        () => { passed++; process.stdout.write(`  \x1b[32m鉁揬x1b[0m ${name}\n`) },
        err => {
          failed++
          failures.push({ name, error: err.message })
          process.stderr.write(`  \x1b[31m鉁梊x1b[0m ${name}\n    ${err.message}\n`)
        }
      )
    } else {
      passed++
      process.stdout.write(`  \x1b[32m鉁揬x1b[0m ${name}\n`)
      return Promise.resolve()
    }
  } catch (err) {
    failed++
    failures.push({ name, error: err.message })
    process.stderr.write(`  \x1b[31m鉁梊x1b[0m ${name}\n    ${err.message}\n`)
    return Promise.resolve()
  }
}

// 鈹€鈹€鈹€ helpers 鈹€鈹€鈹€

function makeChatChunk(data) {
  return `data: ${JSON.stringify(data)}\n\n`
}

function makeDone() {
  return 'data: [DONE]\n\n'
}

async function collect(events) {
  const result = []
  for await (const ev of events) result.push(ev)
  return result
}

async function* stringStream(chunks) {
  for (const c of chunks) yield c
}

function eventSequence(events) {
  return events
    .filter(e => e.startsWith('event:'))
    .map(e => { const m = e.match(/^event:\s*(\S+)/); return m ? m[1] : '?' })
}

function allData(events) {
  return events
    .filter(e => e.includes('data:'))
    .map(e => { const m = e.match(/\ndata:\s*(.+)/); return m ? JSON.parse(m[1]) : null })
    .filter(Boolean)
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// 娴嬭瘯濂椾欢
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function runTests() {
  console.log('\n鈺愨晲鈺?娴佸紡杞崲 transformStream.js 鈺愨晲鈺怽n')

  await test('text: response.created 鈫?in_progress 鈫?deltas 鈫?completed', async () => {
    const chunks = [
      makeChatChunk({ id: 'chatcmpl_1', created: 123, model: 'ds-v4', choices: [{ delta: { content: 'Hel' } }] }),
      makeChatChunk({ id: 'chatcmpl_1', created: 123, model: 'ds-v4', choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const seq = eventSequence(events)

    assert.deepStrictEqual(seq.slice(0, 2), ['response.created', 'response.in_progress'])
    assert.ok(seq.includes('response.output_text.delta'))
    assert.ok(seq.includes('response.output_text.done'))
    assert.ok(seq.includes('response.completed'))

    const completed = allData(events).find(d => d.type === 'response.completed')
    assert.strictEqual(completed.response.status, 'completed')
    assert.strictEqual(completed.response.output[0].content[0].text, 'Hello')
    assert.strictEqual(completed.response.usage.input_tokens, 4)
    assert.ok(!events.join('').includes('[DONE]'))
  })

  await test('text: 鎵€鏈夊唴瀹逛簨浠跺寘鍚?item_id', async () => {
    const chunks = [
      makeChatChunk({ id: 'chatcmpl_2', model: 'm', choices: [{ delta: { content: 'X' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const data = allData(events)

    for (const d of data) {
      if (d.type === 'response.created' || d.type === 'response.in_progress' || d.type === 'response.completed') continue
      if (d.type === 'response.failed') continue
      assert.ok(d.item_id || (d.item && d.item.id), `浜嬩欢 ${d.type} 缂?item_id`)
    }
  })

  await test('reasoning: 浣跨敤 summary_index 鑰岄潪 content_index', async () => {
    const chunks = [
      makeChatChunk({ id: 'r1', created: 123, model: 'ds-r', choices: [{ delta: { reasoning_content: 'Think...' } }] }),
      makeChatChunk({ id: 'r1', created: 123, model: 'ds-r', choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10, completion_tokens_details: { reasoning_tokens: 3 } } }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const data = allData(events)

    const rDelta = data.find(d => d.type === 'response.reasoning_summary_text.delta')
    assert.ok(rDelta)
    assert.strictEqual(rDelta.summary_index, 0)
    assert.strictEqual(rDelta.content_index, undefined)

    const tDelta = data.find(d => d.type === 'response.output_text.delta')
    assert.ok(tDelta)
    assert.strictEqual(tDelta.content_index, 0)

    const done = data.find(d => d.type === 'response.completed')
    assert.ok(done.response.usage.output_tokens_details.reasoning_tokens >= 0)
  })

  await test('reasoning: 鍦?text 涔嬪墠杈撳嚭', async () => {
    const chunks = [
      makeChatChunk({ id: 'r2', model: 'm', choices: [{ delta: { reasoning_content: 'R' } }] }),
      makeChatChunk({ id: 'r2', model: 'm', choices: [{ delta: { content: 'T' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const seq = eventSequence(events)
    const rIdx = seq.findIndex(e => e === 'response.reasoning_summary_text.delta')
    const tIdx = seq.findIndex(e => e === 'response.output_text.delta')
    assert.ok(rIdx >= 0 && tIdx >= 0)
    assert.ok(rIdx < tIdx, `reasoning(${rIdx}) should be before text(${tIdx})`)
  })

  await test('reasoning: output_item.added 甯?summary:[]', async () => {
    const chunks = [
      makeChatChunk({ id: 'r3', model: 'm', choices: [{ delta: { reasoning_content: 'R' } }] }),
      makeChatChunk({ id: 'r3', model: 'm', choices: [{ delta: { content: 'T' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const data = allData(events)
    const added = data.find(d => d.type === 'response.output_item.added' && d.item.type === 'reasoning')
    assert.ok(added)
    assert.deepStrictEqual(added.item.summary, [])
  })

  await test('inline think: <think> 杞负 reasoning锛屾爣绛句笉娉勬紡', async () => {
    const chunks = [
      makeChatChunk({ id: 'it1', created: 123, model: 'minimax', choices: [{ delta: { content: '<think>\nNeed context.\n</think>\n\npong' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const raw = events.join('')
    assert.ok(raw.includes('reasoning_summary_text.delta'))
    assert.ok(!raw.includes('<think>'))
    assert.ok(!raw.includes('</think>'))
    assert.ok(raw.includes('Need context.'))
    assert.ok(raw.includes('pong'))
  })

  await test('inline think: 璺?chunk 澶勭悊', async () => {
    const chunks = [
      makeChatChunk({ id: 'it2', created: 123, model: 'minimax', choices: [{ delta: { content: '<think>\nNeed' } }] }),
      makeChatChunk({ id: 'it2', created: 123, model: 'minimax', choices: [{ delta: { content: ' context.\n</think>\n\npong' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const raw = events.join('')
    assert.ok(!raw.includes('<think>'))
    assert.ok(raw.includes('Need context.'))
    assert.ok(raw.includes('pong'))
  })

  await test('inline think: 绾枃鏈笉瑙﹀彂 reasoning', async () => {
    const chunks = [
      makeChatChunk({ id: 'it3', model: 'm', choices: [{ delta: { content: 'Hello' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const seq = eventSequence(events)
    assert.ok(!seq.includes('response.reasoning_summary_text.delta'))
    assert.ok(seq.includes('response.output_text.delta'))
  })

  await test('tool call: 鍩烘湰娴佺▼', async () => {
    const chunks = [
      makeChatChunk({ id: 'tc1', model: 'm', choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_weather' } }] } }] }),
      makeChatChunk({ id: 'tc1', model: 'm', choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"Tokyo"}' } }] }, finish_reason: 'tool_calls' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const data = allData(events)
    const seq = eventSequence(events)

    assert.ok(seq.includes('response.function_call_arguments.delta'))
    assert.ok(seq.includes('response.function_call_arguments.done'))
    const done = data.find(d => d.type === 'response.output_item.done' && d.item.type === 'function_call')
    assert.ok(done)
    assert.strictEqual(done.item.call_id, 'call_1')
    assert.strictEqual(done.item.name, 'get_weather')
    assert.strictEqual(done.item.status, 'completed')
  })

  await test('tool call: reasoning_content is passed to item', async () => {
    const chunks = [
      makeChatChunk({ id: 'tcr1', model: 'ds', choices: [{ delta: { reasoning_content: 'Need file.' } }] }),
      makeChatChunk({ id: 'tcr1', model: 'ds', choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file' } }] } }] }),
      makeChatChunk({ id: 'tcr1', model: 'ds', choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"README.md"}' } }] }, finish_reason: 'tool_calls' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const data = allData(events)

    const addItem = data.find(d => d.type === 'response.output_item.added' && d.item.type === 'function_call')
    assert.ok(addItem)
    assert.strictEqual(addItem.item.reasoning_content, 'Need file.')

    const doneItem = data.find(d => d.type === 'response.output_item.done' && d.item.type === 'function_call')
    assert.strictEqual(doneItem.item.reasoning_content, 'Need file.')
  })

  await test('usage: missing usage chunk defaults to zero values', async () => {
    const chunks = [
      makeChatChunk({ id: 'u1', model: 'm', choices: [{ delta: { content: 'Hi' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const data = allData(events)
    for (const d of data) {
      if (d.response && d.response.usage) {
        assert.strictEqual(typeof d.response.usage.input_tokens, 'number')
        assert.strictEqual(typeof d.response.usage.output_tokens, 'number')
      }
    }
  })

  await test('error: 涓婃父 SSE error 浜嬩欢 鈫?response.failed', async () => {
    const events = await collect(createResponsesSseFromChat(stringStream([
      'event: error\ndata: {"error":{"message":"bad request","type":"invalid_request_error"}}\n\n',
    ])))
    const data = allData(events)
    assert.strictEqual(data[0].type, 'response.failed')
    assert.ok(data[0].response.error.message.includes('bad request'))
  })

  await test('error: chunk 鍐呭祵 error 瀛楁 鈫?response.failed', async () => {
    const events = await collect(createResponsesSseFromChat(stringStream([
      'data: {"error":{"message":"quota exceeded","code":"rate_limit_exceeded"}}\n\n',
    ])))
    const data = allData(events)
    assert.strictEqual(data[0].type, 'response.failed')
    assert.ok(data[0].response.error.message.includes('quota exceeded'))
  })

  await test('error: failed 鍚庝笉鍑虹幇 completed', async () => {
    const events = await collect(createResponsesSseFromChat(stringStream([
      'event: error\ndata: {"error":{"message":"boom"}}\n\n',
      'data: [DONE]\n\n',
    ])))
    const seq = eventSequence(events)
    assert.ok(seq.includes('response.failed'))
    assert.ok(!seq.includes('response.completed'))
  })

  await test('edge: empty content is skipped', async () => {
    const chunks = [
      makeChatChunk({ id: 'e1', model: 'm', choices: [{ delta: { content: '' } }] }),
      makeChatChunk({ id: 'e1', model: 'm', choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const deltas = allData(events).filter(d => d.type === 'response.output_text.delta')
    assert.strictEqual(deltas.length, 1)
    assert.strictEqual(deltas[0].delta, 'OK')
  })

  await test('edge: natural end without DONE still completes', async () => {
    const chunks = [
      makeChatChunk({ id: 'nd1', model: 'm', choices: [{ delta: { content: 'Hi' }, finish_reason: 'stop' }] }),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    assert.ok(eventSequence(events).includes('response.completed'))
  })

  await test('edge: responseId 涓嶅弻閲嶅墠缂€', async () => {
    const chunks = [
      makeChatChunk({ id: 'resp_already', model: 'm', choices: [{ delta: { content: 'X' }, finish_reason: 'stop' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const done = allData(events).find(d => d.type === 'response.completed')
    assert.strictEqual(done.response.id, 'resp_already')
  })

  await test('edge: finish_reason=length 鈫?incomplete + incomplete_details', async () => {
    const chunks = [
      makeChatChunk({ id: 'len1', model: 'm', choices: [{ delta: { content: 'cut' }, finish_reason: 'length' }] }),
      makeDone(),
    ]
    const events = await collect(createResponsesSseFromChat(stringStream(chunks)))
    const done = allData(events).find(d => d.type === 'response.completed')
    assert.strictEqual(done.response.status, 'incomplete')
    assert.deepStrictEqual(done.response.incomplete_details, { reason: 'max_output_tokens' })
  })

  // 鈺愨晲鈺?璇锋眰杞崲 鈺愨晲鈺?
  console.log('\n鈺愨晲鈺?璇锋眰杞崲 transformRequest.js 鈺愨晲鈺怽n')

  test('request: 鍩烘湰鏂囨湰', () => {
    const body = { model: 'ds-v4', instructions: 'You are helpful.', input: [{ role: 'user', content: 'Hello' }], stream: true }
    const result = responsesToChatCompletions(body)
    assert.strictEqual(result.model, 'ds-v4')
    assert.strictEqual(result.messages.length, 2)
    assert.strictEqual(result.messages[0].role, 'system')
    assert.strictEqual(result.messages[1].role, 'user')
    assert.strictEqual(result.stream_options.include_usage, true)
  })

  test('request: developer 鈫?system', () => {
    const result = responsesToChatCompletions({ model: 'm', input: [{ role: 'developer', content: 'Rules.' }] })
    assert.strictEqual(result.messages[0].role, 'system')
  })

  test('request: latest_reminder 鈫?user', () => {
    const result = responsesToChatCompletions({ model: 'm', input: [{ role: 'latest_reminder', content: 'Brief.' }] })
    assert.strictEqual(result.messages[0].role, 'user')
  })

  test('request: multiple system messages collapse to first position', () => {
    const body = { model: 'm', instructions: 'You are Codex.', input: [
      { role: 'developer', content: 'Permissions' }, { role: 'user', content: 'Hi' }, { role: 'developer', content: 'Collab' }
    ]}
    const result = responsesToChatCompletions(body)
    const systems = result.messages.filter(m => m.role === 'system')
    assert.strictEqual(systems.length, 1)
    assert.ok(systems[0].content.includes('You are Codex.'))
    assert.strictEqual(result.messages[0].role, 'system')
  })

  test('request: tools 杞崲', () => {
    const body = { model: 'm', input: [], tools: [{ type: 'function', name: 'w', description: 'd', parameters: {} }] }
    const result = responsesToChatCompletions(body)
    assert.strictEqual(result.tools[0].type, 'function')
    assert.strictEqual(result.tools[0].function.name, 'w')
  })


  test('request: generic provider keeps valid tools and drops empty-name tools', () => {
    const result = responsesToChatCompletions({
      model: 'm',
      input: [],
      tools: [
        { type: 'function', name: 'shell_command', description: 'run command', parameters: {} },
        { type: 'function', name: 'multi_agent_v1', description: 'deferred tool', parameters: {} },
        { type: 'function', name: '', description: 'invalid', parameters: {} },
      ],
      tool_choice: { type: 'function', name: 'multi_agent_v1' },
      parallel_tool_calls: false,
    }, 'm', 'https://api.example.com/v1')

    assert.deepStrictEqual(result.tools.map(t => t.function.name), ['shell_command', 'multi_agent_v1'])
    assert.strictEqual(result.tool_choice.function.name, 'multi_agent_v1')
    assert.strictEqual(result.parallel_tool_calls, false)
  })

  test('request: mindcraft deepseek filters incompatible deferred tools only', () => {
    const result = responsesToChatCompletions({
      model: 'deepseek-v4-pro',
      input: [],
      tools: [
        { type: 'function', name: 'shell_command', description: 'run command', parameters: {} },
        { type: 'function', name: 'update_plan', description: 'plan', parameters: {} },
        { type: 'function', name: 'multi_agent_v1', description: 'deferred tool', parameters: {} },
        { type: 'function', name: '', description: 'invalid', parameters: {} },
      ],
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }, 'deepseek-v4-pro', 'https://api.mindcraft.com.cn/v1')

    assert.deepStrictEqual(result.tools.map(t => t.function.name), ['shell_command', 'update_plan'])
    assert.strictEqual(result.tool_choice, 'auto')
    assert.strictEqual(result.parallel_tool_calls, false)
  })

  test('request: filtered forced tool_choice degrades to auto', () => {
    const result = responsesToChatCompletions({
      model: 'deepseek-v4-pro',
      input: [],
      tools: [
        { type: 'function', name: 'shell_command', description: 'run command', parameters: {} },
        { type: 'function', name: 'multi_agent_v1', description: 'deferred tool', parameters: {} },
      ],
      tool_choice: { type: 'function', name: 'multi_agent_v1' },
    }, 'deepseek-v4-pro', 'https://api.mindcraft.com.cn/v1')

    assert.deepStrictEqual(result.tools.map(t => t.function.name), ['shell_command'])
    assert.strictEqual(result.tool_choice, 'auto')
  })
  test('request: max_output_tokens 鈫?max_tokens', () => {
    const result = responsesToChatCompletions({ model: 'm', input: [], max_output_tokens: 4096 })
    assert.strictEqual(result.max_tokens, 4096)
  })

  // 鈺愨晲鈺?闈炴祦寮忓搷搴旇浆鎹?鈺愨晲鈺?
  test('request: function_call + function_call_output flushes assistant tool_calls before tool message', () => {
    const result = responsesToChatCompletions({
      model: 'm',
      input: [
        { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: { path: 'README.md' } },
        { type: 'function_call_output', call_id: 'call_1', output: { ok: true } },
      ],
    })
    assert.strictEqual(result.messages.length, 2)
    assert.strictEqual(result.messages[0].role, 'assistant')
    assert.strictEqual(result.messages[0].tool_calls[0].id, 'call_1')
    assert.strictEqual(result.messages[0].reasoning_content, 'tool call')
    assert.strictEqual(result.messages[1].role, 'tool')
    assert.strictEqual(result.messages[1].content, '{"ok":true}')
  })

  test('request: reasoning item attaches back to previous assistant message', () => {
    const result = responsesToChatCompletions({
      model: 'm',
      input: [
        { type: 'message', role: 'assistant', content: 'First answer' },
        { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Need more context.' }] },
      ],
    })
    assert.strictEqual(result.messages.length, 1)
    assert.strictEqual(result.messages[0].role, 'assistant')
    assert.strictEqual(result.messages[0].reasoning_content, 'Need more context.')
  })

  test('request: trailing reasoning attaches to tool-call assistant message', () => {
    const result = responsesToChatCompletions({
      model: 'm',
      input: [
        { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{}' },
        { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Need to inspect file.' }] },
        { type: 'function_call_output', call_id: 'call_1', output: 'done' },
      ],
    })
    assert.strictEqual(result.messages[0].role, 'assistant')
    assert.strictEqual(result.messages[0].reasoning_content, 'Need to inspect file.')
  })

  test('toml: patchTomlBaseUrl only patches active model_provider section', () => {
    const input = [
      'model_provider = "vendor_a"',
      '',
      '[model_providers.vendor_a]',
      'base_url = "https://a.example/v1"',
      '',
      '[model_providers.vendor_b]',
      'base_url = "https://b.example/v1"',
      '',
    ].join('\n')
    const out = patchTomlBaseUrl(input, 'http://127.0.0.1:4312/v1')
    assert.ok(out.includes('[model_providers.vendor_a]'))
    assert.ok(out.includes('base_url = "http://127.0.0.1:4312/v1"'))
    assert.ok(out.includes('[model_providers.vendor_b]\nbase_url = "https://b.example/v1"'))
  })

  test('toml: hasProxyBaseUrl detects only local proxy base_url', () => {
    assert.strictEqual(hasProxyBaseUrl('base_url = "http://127.0.0.1:4312/v1"'), true)
    assert.strictEqual(hasProxyBaseUrl('base_url = "https://api.example.com/v1"'), false)
  })

  test('request: runtime reasoningEffort enables deepseek thinking', () => {
    const result = responsesToChatCompletions({ model: 'deepseek-v4-pro', input: [], stream: true }, 'deepseek-v4-pro', 'https://api.mindcraft.com.cn/v1', 'high')
    assert.deepStrictEqual(result.thinking, { type: 'enabled' })
    assert.strictEqual(result.reasoning_effort, 'high')
  })

  test('request: inferred deepseek without explicit effort does not force thinking disabled', () => {
    const result = responsesToChatCompletions({ model: 'deepseek-v4-pro', input: [], stream: true }, 'deepseek-v4-pro', 'https://api.mindcraft.com.cn/v1')
    assert.strictEqual(result.thinking, undefined)
    assert.strictEqual(result.reasoning_effort, undefined)
  })

  console.log('\n鈺愨晲鈺?闈炴祦寮忓搷搴?transformResponse.js 鈺愨晲鈺怽n')

  test('response: 鍩烘湰鏂囨湰', () => {
    const body = { id: 'chatcmpl_1', created: 123, model: 'm', choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }
    const r = chatCompletionToResponse(body)
    assert.strictEqual(r.id, 'resp_chatcmpl_1')
    assert.strictEqual(r.status, 'completed')
    assert.strictEqual(r.output[0].content[0].text, 'Hi')
    assert.strictEqual(r.usage.input_tokens, 5)
  })

  test('response: reasoning_content 鎻愬彇', () => {
    const body = { id: 'c2', model: 'ds', choices: [{ message: { reasoning_content: 'Think.', content: 'Ans' }, finish_reason: 'stop' }] }
    const r = chatCompletionToResponse(body)
    assert.strictEqual(r.output[0].type, 'reasoning')
    assert.strictEqual(r.output[0].summary[0].text, 'Think.')
    assert.strictEqual(r.output[1].type, 'message')
  })

  test('response: tool calls', () => {
    const body = { id: 'c3', model: 'm', choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', function: { name: 'read', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
    const r = chatCompletionToResponse(body)
    const tc = r.output.find(o => o.type === 'function_call')
    assert.ok(tc)
    assert.strictEqual(tc.call_id, 'call_1')
  })

  test('error: OpenAI standard', () => {
    const r = chatErrorToResponseError('{"error":{"message":"bad","type":"auth"}}', 401)
    assert.strictEqual(r.error.message, 'bad')
    assert.strictEqual(r.error.type, 'auth')
  })

  test('error: MiniMax base_resp', () => {
    const r = chatErrorToResponseError('{"base_resp":{"status_code":2013,"status_msg":"bad role"}}', 400)
    assert.strictEqual(r.error.message, 'bad role')
  })

  // 鈺愨晲鈺?缁撴灉 鈺愨晲鈺?
  console.log(`\n${'='.repeat(50)}`)
  if (failed === 0) {
    console.log(`\x1b[32m鍏ㄩ儴閫氳繃: ${passed} tests\x1b[0m\n`)
  } else {
    console.log(`\x1b[31m${passed} passed, ${failed} failed\x1b[0m\n`)
    for (const f of failures) {
      console.log(`  \x1b[31m鉁梊x1b[0m ${f.name}: ${f.error}`)
    }
    console.log('')
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
