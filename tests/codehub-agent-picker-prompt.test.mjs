import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldAutoShowAgentPicker } from '../packages/agent/src/components/codeHub/agentPickerPrompt.mjs'

test('auto shows agent picker only for a truly empty fresh CodeHub state', () => {
  assert.equal(shouldAutoShowAgentPicker({
    tabs: [],
    savedTabId: '',
    requestedAgent: '',
    requestedProjectId: '',
    tabOrder: [],
  }), true)
})

test('does not auto show picker while a saved tab may still restore', () => {
  assert.equal(shouldAutoShowAgentPicker({
    tabs: [],
    savedTabId: 'codex:proj-1',
    requestedAgent: '',
    requestedProjectId: '',
    tabOrder: [],
  }), false)
})

test('does not auto show picker while route target may still restore', () => {
  assert.equal(shouldAutoShowAgentPicker({
    tabs: [],
    savedTabId: '',
    requestedAgent: 'codex',
    requestedProjectId: '',
    tabOrder: [],
  }), false)

  assert.equal(shouldAutoShowAgentPicker({
    tabs: [],
    savedTabId: '',
    requestedAgent: '',
    requestedProjectId: 'proj-1',
    tabOrder: [],
  }), false)
})

test('does not auto show picker while persisted tab order may still restore', () => {
  assert.equal(shouldAutoShowAgentPicker({
    tabs: [],
    savedTabId: '',
    requestedAgent: '',
    requestedProjectId: '',
    tabOrder: ['claudeCode:proj-1'],
  }), false)
})

test('does not auto show picker when tabs exist', () => {
  assert.equal(shouldAutoShowAgentPicker({
    tabs: [{ id: 'codex:proj-1' }],
    savedTabId: '',
    requestedAgent: '',
    requestedProjectId: '',
    tabOrder: [],
  }), false)
})
