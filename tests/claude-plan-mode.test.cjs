const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  normalizeClaudeRunMode,
  resolveClaudePermissionMode,
} = require('../packages/agent/electron/claude/runMode')
const { normalizeClaudePlanReviewAction } = require('../packages/agent/electron/claude/planReview')

test('Claude run modes map plan mode to the SDK native permission mode', () => {
  assert.equal(normalizeClaudeRunMode('plan_mode'), 'plan_mode')
  assert.equal(resolveClaudePermissionMode('plan_mode'), 'plan')
  assert.equal(resolveClaudePermissionMode('ask_before_edits'), 'default')
  assert.equal(resolveClaudePermissionMode('edit_automatically'), 'default')
  assert.equal(normalizeClaudeRunMode('unknown'), 'edit_automatically')
})

test('plan review actions fail closed and bound feedback size', () => {
  assert.deepEqual(normalizeClaudePlanReviewAction({ type: 'accept' }), { type: 'accept' })
  assert.deepEqual(normalizeClaudePlanReviewAction({ type: 'reject' }), { type: 'reject' })
  assert.deepEqual(normalizeClaudePlanReviewAction({ type: 'feedback', feedback: '  revise it  ' }), {
    type: 'feedback',
    feedback: 'revise it',
  })
  assert.equal(normalizeClaudePlanReviewAction({ type: 'feedback', feedback: '   ' }), null)
  assert.equal(normalizeClaudePlanReviewAction({ type: 'unexpected' }), null)
  assert.equal(normalizeClaudePlanReviewAction({ type: 'feedback', feedback: 'x'.repeat(30_000) }).feedback.length, 20_000)
})

test('Claude Query and runtime mode changes use SDK permissionMode', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'packages', 'agent', 'electron', 'claudeAgent.js'),
    'utf8',
  )
  assert.match(source, /permissionMode:\s*resolveClaudePermissionMode\(mode\)/)
  assert.match(source, /s\.query\.setPermissionMode\(resolveClaudePermissionMode\(normalizedMode\)\)/)
  assert.match(source, /sessionRun\.runMode !== mode[\s\S]{0,160}q\.setPermissionMode\(resolveClaudePermissionMode\(sessionRun\.runMode\)\)/)
  assert.doesNotMatch(source, /mode === 'plan_mode'[\s\S]{0,300}当前模式为 Plan mode/)
})

test('PlanReviewDialog is rendered and excludes generic permission buttons', () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, '..', 'packages', 'agent', 'src', 'components', 'claudeCode', 'index.vue'),
    'utf8',
  )
  const cardSource = fs.readFileSync(
    path.join(__dirname, '..', 'packages', 'agent', 'src', 'components', 'claudeCode', 'components', 'messages', 'ToolMessageCard.vue'),
    'utf8',
  )
  assert.match(indexSource, /<PlanReviewDialog[\s\S]*:visible="planReviewVisible"/)
  assert.doesNotMatch(indexSource, /BISECT[^\n]*PlanReviewDialog/)
  assert.match(cardSource, /!isAskQuestion\s*&&\s*!isExitPlan/)
})
