'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createRuntimeConf,
  resetRuntimeConfForTest,
} = require('../packages/agent/electron/shared/createRuntimeConf')

test('runtime conf falls back to an isolated in-memory store when Electron app is unavailable', () => {
  resetRuntimeConfForTest()
  class ThrowingConf {
    constructor() {
      throw new Error('Electron app is unavailable')
    }
  }

  const first = createRuntimeConf(ThrowingConf, { name: 'codex-test' })
  first.set('runtime', { model: 'gpt-5' })
  assert.deepEqual(first.get('runtime'), { model: 'gpt-5' })

  const second = createRuntimeConf(ThrowingConf, { name: 'codex-test' })
  assert.deepEqual(second.get('runtime'), { model: 'gpt-5' })
  second.delete('runtime')
  assert.equal(first.get('runtime', null), null)
})

test('runtime conf preserves the real store when construction succeeds', () => {
  class TestConf {
    constructor(options) {
      this.options = options
      this.values = new Map()
    }
    get(key, fallback) { return this.values.has(key) ? this.values.get(key) : fallback }
    set(key, value) { this.values.set(key, value) }
  }

  const conf = createRuntimeConf(TestConf, { name: 'real-store' })
  assert.ok(conf instanceof TestConf)
  conf.set('value', 1)
  assert.equal(conf.get('value'), 1)
})
