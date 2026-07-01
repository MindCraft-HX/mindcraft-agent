const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const claudeAgentPath = path.join(repoRoot, 'packages/agent/electron/claudeAgent.js')

test('claude settings writes strip MindCraft-owned fields before writing official settings.json', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(source, /function sanitizeClaudeSettingsForWrite\(/)

  for (const field of [
    'permissionPolicy',
    'pathToClaudeCodeExecutable',
    'gitMirrorUrl',
    'memoryInjectMode',
    'theme',
  ]) {
    assert.match(
      source,
      new RegExp(`delete\\s+next\\.${field}\\b`),
      `expected sanitizeClaudeSettingsForWrite to strip ${field}`,
    )
  }

  assert.match(
    source,
    /function writeGlobalSettings\(obj\)[\s\S]*sanitizeClaudeSettingsForWrite\(obj/,
    'expected writeGlobalSettings to sanitize official settings writes',
  )
  assert.match(
    source,
    /const merged = sanitizeClaudeSettingsForWrite\(\{ \.\.\.existing, \.\.\.patch \}, \{\s*preserveExistingInternal: true,/,
    'expected claude-patch-settings-json to sanitize merged settings',
  )
  assert.match(
    source,
    /next = sanitizeClaudeSettingsForWrite\(next, \{\s*preserveExistingInternal: true,/,
    'expected claude-repair-settings-json to sanitize repaired settings',
  )
})

test('claude memory inject mode is MindCraft-owned and persisted outside official settings.json', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(source, /function readMemoryInjectMode\(/)
  assert.match(source, /internalConf\.get\('claudeMemoryInjectMode'/)
  assert.match(source, /internalConf\.set\('claudeMemoryInjectMode', mode\)/)
  assert.doesNotMatch(
    source,
    /sj\.memoryInjectMode\s*=\s*mode[\s\S]{0,240}fs\.writeFileSync\(settingsPath/,
    'memoryInjectMode must not be directly written to ~/.claude/settings.json',
  )
})
