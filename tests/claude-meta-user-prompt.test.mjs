import test from 'node:test'
import assert from 'node:assert/strict'

import {
  countVisibleClaudeUserMessages,
  findFirstVisibleClaudeUserMessage,
  isClaudeInternalPromptText,
  isClaudeMetaUserEntry,
  isClaudeMetaUserPromptMessage,
} from '../packages/agent/src/components/claudeCode/utils/internalPromptFilter.mjs'

test('filters Claude meta review prompt transcript entries', () => {
  assert.equal(isClaudeMetaUserEntry({
    type: 'user',
    isMeta: true,
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'Review target: `--effort high`\n\n## Phase 0 — Gather the diff' }],
    },
  }), true)

  assert.equal(isClaudeMetaUserEntry({
    type: 'user',
    isMeta: false,
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'Trace all callers of changed functions' }],
    },
  }), false)
})

test('filters normalized Claude meta review prompt messages', () => {
  const reviewPrompt = `Review target: \`--effort high\`

\`high effort -> 3+4 angles x 6 candidates -> 1-vote verify\`

## Phase 0 — Gather the diff

Run \`git diff @{upstream}...HEAD\`

You are reviewing for **recall** at high effort.`

  assert.equal(isClaudeInternalPromptText(reviewPrompt), true)
  assert.equal(isClaudeMetaUserPromptMessage({
    role: 'user',
    text: reviewPrompt,
    content: [{ type: 'text', text: reviewPrompt }],
  }), true)

  assert.equal(isClaudeMetaUserPromptMessage({
    role: 'user',
    text: 'Trace all callers of changed functions',
    content: [{ type: 'text', text: 'Trace all callers of changed functions' }],
  }), false)
})

test('visible Claude user message helpers ignore meta prompts', () => {
  const reviewPrompt = {
    role: 'user',
    _isMeta: true,
    text: 'Review target: `--effort high`\n\n## Phase 0 — Gather the diff',
    content: [{ type: 'text', text: 'Review target: `--effort high`\n\n## Phase 0 — Gather the diff' }],
  }
  const realUser = {
    role: 'user',
    text: 'Trace all callers of changed functions',
    content: [{ type: 'text', text: 'Trace all callers of changed functions' }],
  }

  assert.equal(countVisibleClaudeUserMessages([reviewPrompt, realUser]), 1)
  assert.deepEqual(findFirstVisibleClaudeUserMessage([reviewPrompt, realUser]), realUser)
})
