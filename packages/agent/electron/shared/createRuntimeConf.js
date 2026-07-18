'use strict'

const stores = new Map()

function createMemoryConf(options = {}) {
  const name = String(options.name || options.configName || 'mindcraft-runtime')
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }

  return {
    get(key, fallback) {
      return store.has(key) ? store.get(key) : fallback
    },
    set(key, value) {
      store.set(key, value)
    },
    delete(key) {
      store.delete(key)
    },
  }
}

/**
 * electron-conf requires Electron's app path during construction. Keep the
 * production store when available, while allowing pure Node contract tests to
 * load main-process modules without inventing an Electron app mock.
 */
function createRuntimeConf(Conf, options) {
  try {
    return new Conf(options)
  } catch (_) {
    return createMemoryConf(options)
  }
}

function resetRuntimeConfForTest() {
  stores.clear()
}

module.exports = { createRuntimeConf, resetRuntimeConfForTest }
