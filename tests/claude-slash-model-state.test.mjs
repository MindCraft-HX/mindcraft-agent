import test from 'node:test'
import assert from 'node:assert/strict'

import { useSlashCommands } from '../packages/agent/src/components/claudeCode/composables/useSlashCommands.js'

test('Claude model panel displays current session state over global defaults', async () => {
  const originalWindow = globalThis.window
  const tab = { model: 'provider-opus-model', effort: 'high' }
  let globalEffortWrites = 0
  globalThis.window = {
    electronAPI: {
      claudeGetEffortLevel: async () => 'medium',
      claudeGetModel: async () => 'provider-sonnet-model',
      claudeGetSelectedTier: async () => 'sonnet',
      claudeGetThinkingEnabled: async () => true,
      claudeSetEffortLevel: async () => { globalEffortWrites += 1; return true },
    },
  }

  try {
    const state = useSlashCommands({
      getActiveTab: () => tab,
      onEffortChange: async (level, activeTab) => { activeTab.effort = level },
    })
    await state.loadModelPanelState()

    assert.equal(state.slashModelName.value, 'provider-opus-model')
    assert.equal(state.slashEffortLevel.value, 'high')

    await state.setEffortLevel('low')
    assert.equal(tab.effort, 'low')
    assert.equal(state.slashEffortLevel.value, 'low')
    assert.equal(globalEffortWrites, 0, 'session effort changes must not rewrite provider defaults')
  } finally {
    globalThis.window = originalWindow
  }
})
