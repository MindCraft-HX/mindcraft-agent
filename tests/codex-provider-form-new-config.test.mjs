import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('new Codex providers start empty instead of inheriting config.toml', () => {
  const source = fs.readFileSync(
    new URL('../packages/agent/src/components/codeX/components/APISetting.vue', import.meta.url),
    'utf8',
  )
  const start = source.indexOf('function addProvider()')
  const end = source.indexOf('\nasync function copyProvider', start)
  const body = source.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(body, /codexReadConfigToml/)
  assert.match(body, /name:\s*''/)
  assert.match(body, /key:\s*''/)
  assert.match(body, /url:\s*''/)
  assert.match(body, /model:\s*''/)
  assert.match(body, /tomlText:\s*''/)
})

test('API Base input exposes a button that can show all presets', () => {
  const source = fs.readFileSync(
    new URL('../packages/agent/src/components/agentCommon/components/ApiBaseInput.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /class="api-base-input__toggle"/)
  assert.match(source, /@mousedown\.prevent="togglePresetMenu"/)
  assert.match(source, /showAll\.value\s*\?\s*getApiBasePresets/)
})
