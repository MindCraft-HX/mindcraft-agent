import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('CodeX active-provider edits persist before notifying model consumers', () => {
  const source = fs.readFileSync(
    new URL('../packages/agent/src/components/codeX/components/APISetting.vue', import.meta.url),
    'utf8',
  )
  const saveStart = source.indexOf('async function handleProviderFormSave(payload)')
  const saveEnd = source.indexOf('\nfunction handleProviderFormClose()', saveStart)
  const body = source.slice(saveStart, saveEnd)

  assert.ok(body.indexOf('await persistProviders()') >= 0)
  assert.ok(body.indexOf("if (isEditingActive) emit('providerActivated')") > body.indexOf('await persistProviders()'))
})
