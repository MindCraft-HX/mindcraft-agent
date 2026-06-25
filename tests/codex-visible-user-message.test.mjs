import test from 'node:test'
import assert from 'node:assert/strict'

import { stripSystemContextTags } from '../packages/agent/src/components/agentCommon/utils/helpers.js'
import {
  countVisibleCodexUserMessages,
  findFirstVisibleCodexUserMessage,
  isVisibleCodexUserMessage,
} from '../packages/agent/src/components/codeX/utils/visibleUserMessages.mjs'

test('CodeX visible user message helpers ignore stripped system-only text', () => {
  const hidden = {
    role: 'user',
    text: '<INSTRUCTIONS>internal</INSTRUCTIONS>',
    content: [{ type: 'text', text: '<INSTRUCTIONS>internal</INSTRUCTIONS>' }],
  }
  const visible = {
    role: 'user',
    text: 'real user input',
    content: [{ type: 'text', text: 'real user input' }],
  }

  assert.equal(isVisibleCodexUserMessage(hidden), false)
  assert.equal(isVisibleCodexUserMessage(visible), true)
  assert.equal(countVisibleCodexUserMessages([hidden, visible]), 1)
  assert.deepEqual(findFirstVisibleCodexUserMessage([hidden, visible]), visible)
})

test('CodeX visible user message helpers keep attachment-only user messages', () => {
  const attachmentOnly = {
    role: 'user',
    text: '',
    content: [{ type: 'input_image', image_url: 'file:///tmp/demo.png' }],
  }

  assert.equal(isVisibleCodexUserMessage(attachmentOnly), true)
})

test('shared system-context stripping removes markdown AGENTS instructions heading', () => {
  const leaked = '# AGENTS.md instructions for D:\\公司资料\\智匠MindCraft\\RD开发资料\\mindcraft-agent'

  assert.equal(stripSystemContextTags(leaked), '')
  assert.equal(isVisibleCodexUserMessage({
    role: 'user',
    text: leaked,
    content: [{ type: 'text', text: leaked }],
  }), false)
})
