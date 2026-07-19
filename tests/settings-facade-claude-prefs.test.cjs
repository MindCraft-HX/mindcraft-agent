'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const facade = require('../packages/agent/electron/settingsFacade')

test('Claude runtime defaults are projected as one app-owned snapshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-settings-'))
  try {
    facade._reset()
    facade.init(dir)
    facade.setClaudePrefs({
      selectedTier: 'opus',
      model: 'provider-opus',
      effortLevel: 'high',
      tierModels: { opus: 'provider-opus' },
    })

    assert.equal(facade.getClaudePref('selectedTier'), 'opus')
    assert.equal(facade.getClaudePref('model'), 'provider-opus')
    assert.equal(facade.getClaudePref('effortLevel'), 'high')
    assert.deepEqual(facade.getClaudePref('tierModels'), { opus: 'provider-opus' })

    facade.flush()
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'app-settings.json'), 'utf8'))
    assert.equal(persisted.claudePrefs.selectedTier, 'opus')
    assert.equal(persisted.claudePrefs.effortLevel, 'high')
  } finally {
    facade._reset()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
