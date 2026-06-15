import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldReloadClaudeChatFromDisk } from '../packages/agent/src/components/claudeCode/utils/sessionRefreshGuard.mjs'

test('reload remains allowed for idle chat without pending tools', () => {
  const chat = {
    thinking: false,
    messages: [{ role: 'assistant', text: 'done' }],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), true)
})

test('keeps runtime permission prompts from being overwritten by disk reload', () => {
  const chat = {
    filePath: 'C:/Users/me/.claude/projects/repo/live.jsonl',
    thinking: true,
    messages: [
      {
        role: 'tool',
        status: 'pending',
        toolName: 'Bash',
        requestId: 'perm-1',
      },
    ],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), false)
})

test('reload is blocked while ask-user-question is still pending', () => {
  const chat = {
    thinking: true,
    messages: [
      {
        role: 'tool',
        status: 'pending',
        toolName: 'AskUserQuestion',
      },
    ],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), false)
})

test('allows disk reload for recovered dangling tool prompts', () => {
  const chat = {
    filePath: 'C:/Users/me/.claude/projects/repo/interrupted.jsonl',
    thinking: false,
    _sessionIntegrity: {
      hasDanglingToolUse: true,
      danglingToolUseIds: ['toolu_1'],
    },
    messages: [
      {
        role: 'tool',
        status: 'pending',
        toolName: 'Bash',
        requestId: 'perm-1',
        toolUseId: 'toolu_1',
      },
    ],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), true)
})
