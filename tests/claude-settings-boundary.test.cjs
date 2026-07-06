const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const claudeAgentPath = path.join(repoRoot, 'packages/agent/electron/claudeAgent.js')
const claudeProviderFormPath = path.join(repoRoot, 'packages/agent/src/components/claudeCode/components/ProviderForm.vue')

test('claude settings writes strip MindCraft-owned fields before writing official settings.json', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(source, /function sanitizeClaudeSettingsForWrite\(/)

  for (const field of [
    'key',
    'url',
    'apiKey',
    'primaryApiKey',
    'baseURL',
    'apiBaseUrl',
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

test('claude runtime uses effective active provider config and provider activation syncs settings.json', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(
    source,
    /ipcMain\.handle\(CLAUDE_CHANNELS\.AGENT_QUERY[\s\S]*const runtime = resolveEffectiveRuntimeConfig\(\)/,
    'expected claude-agent-query to use effective active provider runtime config',
  )
  assert.match(
    source,
    /function buildClaudeRuntimeSettingsPatch\(/,
    'expected helper to build runtime settings patch from active provider config',
  )
  assert.match(
    source,
    /function patchClaudeRuntimeSettings\(/,
    'expected shared official settings patch helper for provider activation/runtime sync',
  )
  assert.match(
    source,
    /ipcMain\.handle\('claude-activate-provider'[\s\S]*confSet\('claudeProviders', \{ providers, activeIdx \}\)[\s\S]*const runtimeConfig = resolveEffectiveRuntimeConfig\(\)[\s\S]*patchClaudeRuntimeSettings\(buildClaudeRuntimeSettingsPatch\(runtimeConfig\)\)/,
    'expected provider activation to sync legacy projection and official runtime settings from active provider in main process',
  )
})

test('claude reused query failures finalize the run instead of leaving session stuck in running state', () => {
  const source = fs.readFileSync(claudeAgentPath, 'utf8')

  assert.match(
    source,
    /async function finalizeReusedQueryFailure\(existingSession, err\)/,
    'expected reused-query failure finalizer helper',
  )
  assert.match(
    source,
    /finalizeReusedQueryFailure\(existing, err\)/,
    'expected reused-query streamInput catch to delegate to failure finalizer',
  )
  assert.match(
    source,
    /async function finalizeReusedQueryFailure\(existingSession, err\)[\s\S]*safeSend\(sender, CLAUDE_CHANNELS\.AGENT_DONE, donePayload\)/,
    'expected reused-query failure finalizer to emit claude-agent-done',
  )
  assert.match(
    source,
    /async function finalizeReusedQueryFailure\(existingSession, err\)[\s\S]*clearCurrentTurn\(chatKey\)[\s\S]*agentSessions\.delete\(chatKey\)[\s\S]*pendingSessionMetaByChatKey\.delete\(chatKey\)/,
    'expected reused-query failure finalizer to clear runtime state after terminal failure',
  )
})

test('claude provider config editor keeps MindCraft app fields out of official config JSON', () => {
  const source = fs.readFileSync(claudeProviderFormPath, 'utf8')

  assert.match(source, /function sanitizeClaudeConfig\(/)
  assert.match(source, /function cloneConfigObject\(/)

  for (const field of [
    'key',
    'url',
    'apiKey',
    'primaryApiKey',
    'baseURL',
    'apiBaseUrl',
    'permissionPolicy',
    'theme',
    'website',
    'note',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
  ]) {
    assert.match(
      source,
      new RegExp(`delete\\s+parsed\\.${field}\\b`),
      `expected ProviderForm config editor to strip top-level ${field}`,
    )
  }
  assert.match(
    source,
    /if \(mindCraftAppLocales\.includes\(parsed\.language\)\) delete parsed\.language/,
    'expected ProviderForm config editor to strip MindCraft app locale from config.language',
  )
  assert.doesNotMatch(
    source,
    /if \(policy\.value\) parsed\.permissionPolicy = policy\.value/,
    'ProviderForm must not write MindCraft permissionPolicy into config JSON',
  )
  assert.doesNotMatch(
    source,
    /if \(lang\.value\) parsed\.language = lang\.value/,
    'ProviderForm must not write MindCraft app language into config JSON',
  )

  assert.match(
    source,
    /if \(initial\) \{[\s\S]*jsonText\.value = JSON\.stringify\(initial, null, 2\)[\s\S]*applyJsonToForm\(\)[\s\S]*syncFormToJson\(\)/,
    'expected initial provider config to be normalized before display',
  )
  assert.match(
    source,
    /function formatJson\(\) \{[\s\S]*applyJsonToForm\(\)[\s\S]*syncFormToJson\(\)/,
    'expected format action to normalize legacy top-level fields',
  )
  assert.match(
    source,
    /function handleToggle\(key, checked\) \{[\s\S]*const config = sanitizeClaudeConfig\(JSON\.parse\(jsonText\.value \|\| '\{\}'\)\)/,
    'expected toggle action to sanitize config before rewriting editor JSON',
  )
  assert.match(
    source,
    /configObj = sanitizeClaudeConfig\(JSON\.parse\(jsonText\.value \|\| '\{\}'\)\)/,
    'expected save action to emit sanitized config',
  )
})
