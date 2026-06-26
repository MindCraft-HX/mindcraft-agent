const assert = require('node:assert/strict')

async function main() {
  const cjs = require('../packages/agent/src/components/agentCommon/utils/codexEmptyDraft.cjs')
  const mjs = await import('../packages/agent/src/components/agentCommon/utils/codexEmptyDraft.mjs')

  const fixtures = [
    {
      label: 'default empty draft',
      chat: {
        name: '新对话',
        title: '新对话',
        description: '',
        instruction: { enabled: false, content: '', description: '', title: '', attachments: [] },
        provider: { cliSessionId: '', filePath: '' },
      },
      messages: [],
    },
    {
      label: 'draft with visible user text',
      chat: {
        name: '新对话',
        title: '新对话',
        description: '',
        instruction: { enabled: false, content: '', description: '', title: '', attachments: [] },
        provider: { cliSessionId: '', filePath: '' },
      },
      messages: [{ role: 'user', text: 'hello' }],
    },
    {
      label: 'draft with provider binding',
      chat: {
        name: '新对话',
        title: '新对话',
        description: '',
        provider: { cliSessionId: 'cli-1', filePath: '' },
      },
      messages: [],
    },
    {
      label: 'draft with attachment-only user message',
      chat: {
        name: '新对话',
        title: '新对话',
        description: '',
        provider: { cliSessionId: '', filePath: '' },
      },
      messages: [{ role: 'user', content: [{ file_url: 'file://x' }] }],
    },
  ]

  for (const fixture of fixtures) {
    assert.equal(
      cjs.hasVisibleUserMessage(fixture.messages),
      mjs.hasVisibleUserMessage(fixture.messages),
      `${fixture.label}: hasVisibleUserMessage parity`
    )
    assert.equal(
      cjs.isDefaultCodexDraftTitle(fixture.chat.title || fixture.chat.name),
      mjs.isDefaultCodexDraftTitle(fixture.chat.title || fixture.chat.name),
      `${fixture.label}: isDefaultCodexDraftTitle parity`
    )
    assert.equal(
      cjs.isMeaningfulCodexLocalDraft(fixture.chat, fixture.messages),
      mjs.isMeaningfulCodexLocalDraft(fixture.chat, fixture.messages),
      `${fixture.label}: isMeaningfulCodexLocalDraft parity`
    )
    assert.equal(
      cjs.isEmptyCodexLocalDraft(fixture.chat, fixture.messages),
      mjs.isEmptyCodexLocalDraft(fixture.chat, fixture.messages),
      `${fixture.label}: isEmptyCodexLocalDraft parity`
    )
  }

  console.log('codex empty draft parity tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
