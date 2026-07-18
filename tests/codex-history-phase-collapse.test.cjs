const test = require('node:test')
const assert = require('node:assert/strict')

const electronPath = require.resolve('electron')
const originalElectron = require.cache[electronPath]
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: { getPath: () => process.cwd() },
    ipcMain: { handle() {}, on() {} },
  },
}

const { __test__ } = require('../packages/agent/electron/codexAgent')

test.after(() => {
  if (originalElectron) require.cache[electronPath] = originalElectron
  else delete require.cache[electronPath]
})

test('completed turn keeps final answer and hides its commentary messages', () => {
  const messages = [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'working', _codexPhase: 'commentary', _codexTurnId: 'turn-1' },
    { role: 'assistant', text: 'final', _codexPhase: 'final_answer', _codexTurnId: 'turn-1' },
  ]

  assert.deepEqual(__test__.collapseCodexAssistantPhases(messages).map(message => message.text), [
    'question',
    'final',
  ])
})

test('interrupted turn keeps only its last commentary message', () => {
  const messages = [
    { role: 'assistant', text: 'first update', _codexPhase: 'commentary', _codexTurnId: 'turn-1' },
    { role: 'tool', text: 'tool output', toolUseId: 'tool-1' },
    { role: 'assistant', text: 'last update', _codexPhase: 'commentary', _codexTurnId: 'turn-1' },
  ]

  assert.deepEqual(__test__.collapseCodexAssistantPhases(messages).map(message => message.text), [
    'tool output',
    'last update',
  ])
})

test('legacy assistant messages without phase metadata remain unchanged', () => {
  const messages = [{ role: 'assistant', text: 'legacy answer' }]
  assert.deepEqual(__test__.collapseCodexAssistantPhases(messages), messages)
})
