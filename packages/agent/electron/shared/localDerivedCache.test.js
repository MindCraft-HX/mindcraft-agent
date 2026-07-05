/**
 * T183 Phase 1+3: Tests for createFileDerivedCache and trackDedup
 *
 * Uses monkey-patched fs.statSync for deterministic cache behavior testing.
 * All tests restore fs.statSync in finally blocks to avoid cross-test pollution.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const { createFileDerivedCache, trackDedup } = require('./localDerivedCache')

// Helpers

function mockStat(mtimeMs, size = 100) {
  return { mtimeMs, size, isFile: () => true }
}

function withStat(mtimeMs, size, fn) {
  const orig = fs.statSync
  fs.statSync = (p) => mockStat(mtimeMs, size)
  try { return fn() } finally { fs.statSync = orig }
}

function withStatThrowing(err = new Error('ENOENT')) {
  const orig = fs.statSync
  fs.statSync = () => { throw err }
  try { return () => { fs.statSync = orig } } finally { /* caller restores */ }
}

// ==================== Pattern A: mtimeMs only ====================

test('Pattern A: get returns cloned value on mtimeMs match', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs' })

    cache.set('/tmp/a.jsonl', { lines: ['a', 'b'] })

    withStat(1000, 500, () => {
      const result = cache.get('/tmp/a.jsonl')
      assert.deepEqual(result, { lines: ['a', 'b'] })
    })
  })
})

test('Pattern A: get returns null on mtimeMs mismatch (evicts)', () => {
  let cache
  withStat(1000, 500, () => {
    cache = createFileDerivedCache({ signature: 'mtimeMs' })
    cache.set('/tmp/a.jsonl', { lines: ['a'] })
  })

  // Different mtimeMs
  withStat(2000, 500, () => {
    const result = cache.get('/tmp/a.jsonl')
    assert.equal(result, null)
  })

  // After eviction, second get also returns null (entry gone)
  withStat(1000, 500, () => {
    const result = cache.get('/tmp/a.jsonl')
    assert.equal(result, null)
  })
})

test('Pattern A: get returns null + evicts on ENOENT', () => {
  let cache
  withStat(1000, 500, () => {
    cache = createFileDerivedCache({ signature: 'mtimeMs' })
    cache.set('/tmp/deleted.jsonl', { lines: ['x'] })
  })

  const restore = withStatThrowing()
  try {
    const result = cache.get('/tmp/deleted.jsonl')
    assert.equal(result, null)
    assert.equal(cache.has('/tmp/deleted.jsonl'), false)
  } finally {
    restore()
  }
})

test('Pattern A: clone function applied on get', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({
      signature: 'mtimeMs',
      clone: (v) => ({ lines: [...v.lines] }),
    })
    cache.set('/tmp/a.jsonl', { lines: ['a', 'b'] })

    withStat(1000, 500, () => {
      const r1 = cache.get('/tmp/a.jsonl')
      const r2 = cache.get('/tmp/a.jsonl')
      assert.notStrictEqual(r1, r2, 'each get returns new object')
      assert.notStrictEqual(r1.lines, r2.lines, 'nested array also cloned')
      assert.deepEqual(r1, { lines: ['a', 'b'] })
    })
  })
})

test('Pattern A: clone: true does shallow spread', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs', clone: true })
    cache.set('/tmp/a.jsonl', { lines: ['a'] })

    withStat(1000, 500, () => {
      const r1 = cache.get('/tmp/a.jsonl')
      const r2 = cache.get('/tmp/a.jsonl')
      assert.notStrictEqual(r1, r2, 'top-level is new object')
      assert.strictEqual(r1.lines, r2.lines, 'nested array is shared (shallow)')
    })
  })
})

test('Pattern A: no clone returns raw reference', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs' })
    const value = { lines: ['a'] }
    cache.set('/tmp/a.jsonl', value)

    withStat(1000, 500, () => {
      const result = cache.get('/tmp/a.jsonl')
      assert.strictEqual(result, value, 'same reference returned')
    })
  })
})

test('Pattern A: set silently no-ops on stat failure', () => {
  const restore = withStatThrowing()
  try {
    const cache = createFileDerivedCache({ signature: 'mtimeMs' })
    assert.doesNotThrow(() => cache.set('/tmp/bad.jsonl', { lines: ['x'] }))
    assert.equal(cache.has('/tmp/bad.jsonl'), false)
  } finally {
    restore()
  }
})

test('Pattern A: has returns false after eviction', () => {
  let cache
  withStat(1000, 500, () => {
    cache = createFileDerivedCache({ signature: 'mtimeMs' })
    cache.set('/tmp/a.jsonl', { lines: ['a'] })
  })

  withStat(2000, 500, () => {
    assert.equal(cache.has('/tmp/a.jsonl'), false)
  })
})

test('Pattern A: delete removes entry', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs' })
    cache.set('/tmp/a.jsonl', { lines: ['a'] })

    withStat(1000, 500, () => {
      assert.equal(cache.has('/tmp/a.jsonl'), true)
    })

    cache.delete('/tmp/a.jsonl')

    withStat(1000, 500, () => {
      assert.equal(cache.has('/tmp/a.jsonl'), false)
      assert.equal(cache.get('/tmp/a.jsonl'), null)
    })
  })
})

test('Pattern A: clear empties entire cache', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs' })
    cache.set('/tmp/a.jsonl', { lines: ['a'] })
    cache.set('/tmp/b.jsonl', { lines: ['b'] })
    cache.clear()

    withStat(1000, 500, () => {
      assert.equal(cache.get('/tmp/a.jsonl'), null)
      assert.equal(cache.get('/tmp/b.jsonl'), null)
    })
  })
})

// ==================== Pattern B: mtimeMs + size ====================

test('Pattern B: get returns value on both mtimeMs and size match', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs+size' })
    cache.set('/tmp/a.jsonl', { result: { tokens: 100 } })

    withStat(1000, 500, () => {
      const r = cache.get('/tmp/a.jsonl')
      assert.deepEqual(r, { result: { tokens: 100 } })
    })
  })
})

test('Pattern B: get returns null on size mismatch (evicts)', () => {
  let cache
  withStat(1000, 500, () => {
    cache = createFileDerivedCache({ signature: 'mtimeMs+size' })
    cache.set('/tmp/a.jsonl', { result: { tokens: 100 } })
  })

  // Same mtimeMs, different size
  withStat(1000, 999, () => {
    assert.equal(cache.get('/tmp/a.jsonl'), null)
  })
})

test('Pattern B: get returns null on mtimeMs mismatch even if size matches', () => {
  let cache
  withStat(1000, 500, () => {
    cache = createFileDerivedCache({ signature: 'mtimeMs+size' })
    cache.set('/tmp/a.jsonl', { result: { tokens: 100 } })
  })

  // Same size, different mtimeMs
  withStat(2000, 500, () => {
    assert.equal(cache.get('/tmp/a.jsonl'), null)
  })
})

test('Pattern B: custom clone deep-clones nested result', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({
      signature: 'mtimeMs+size',
      clone: (v) => ({ result: { ...v.result }, cwd: v.cwd || '' }),
    })
    cache.set('/tmp/a.jsonl', { result: { tokens: 100 }, cwd: '/proj' })

    withStat(1000, 500, () => {
      const r1 = cache.get('/tmp/a.jsonl')
      const r2 = cache.get('/tmp/a.jsonl')
      assert.notStrictEqual(r1, r2, 'top-level new object')
      assert.notStrictEqual(r1.result, r2.result, 'nested result also new object')
      assert.deepEqual(r1, { result: { tokens: 100 }, cwd: '/proj' })
    })
  })
})

// ==================== Edge Cases ====================

test('Edge: get with null/undefined filePath returns null', () => {
  const cache = createFileDerivedCache({ signature: 'mtimeMs' })
  assert.equal(cache.get(null), null)
  assert.equal(cache.get(undefined), null)
  assert.equal(cache.get(''), null)
})

test('Edge: independent instances do not share state', () => {
  withStat(1000, 500, () => {
    const c1 = createFileDerivedCache({ signature: 'mtimeMs' })
    const c2 = createFileDerivedCache({ signature: 'mtimeMs' })
    c1.set('/tmp/a.jsonl', { lines: ['from-c1'] })
    c2.set('/tmp/a.jsonl', { lines: ['from-c2'] })

    withStat(1000, 500, () => {
      assert.deepEqual(c1.get('/tmp/a.jsonl'), { lines: ['from-c1'] })
      assert.deepEqual(c2.get('/tmp/a.jsonl'), { lines: ['from-c2'] })
    })
  })
})

test('Edge: default signature is mtimeMs+size', () => {
  let cache
  withStat(1000, 500, () => {
    cache = createFileDerivedCache()
    cache.set('/tmp/a.jsonl', { data: 1 })
  })

  // Same mtimeMs, different size → miss (dual-signature is default)
  withStat(1000, 999, () => {
    assert.equal(cache.get('/tmp/a.jsonl'), null)
  })
})

test('Edge: set then get with same stat returns consistent value', () => {
  withStat(1000, 500, () => {
    const cache = createFileDerivedCache({ signature: 'mtimeMs' })
    cache.set('/tmp/a.jsonl', { lines: ['hello', 'world'] })

    withStat(1000, 500, () => {
      const r = cache.get('/tmp/a.jsonl')
      assert.deepEqual(r, { lines: ['hello', 'world'] })
    })
  })
})

// ==================== trackDedup ====================

test('trackDedup: settles normally and removes from map', async () => {
  const map = new Map()
  const key = 'task-1'
  const p = trackDedup(map, key, Promise.resolve(42), 0)

  assert.equal(map.get(key), p, 'promise stored before settle')
  const result = await p
  assert.equal(result, 42)
  // After microtask flush, map entry should be cleaned
  await new Promise(r => setImmediate(r))
  assert.equal(map.has(key), false, 'dedup slot cleaned after resolve')
})

test('trackDedup: timeout releases slot, old settle does not delete new promise', async () => {
  const map = new Map()
  const key = 'task-2'

  // Promise A — never settles until we say so
  let resolveA
  const neverSettles = new Promise(r => { resolveA = r })
  trackDedup(map, key, neverSettles, 1) // 1ms timeout

  // Wait for timeout to fire and release the slot
  await new Promise(r => setTimeout(r, 20))

  assert.equal(map.has(key), false, 'slot released after timeout')

  // Promise B — controlled, does NOT auto-resolve
  let resolveB
  const controlledB = new Promise(r => { resolveB = r })
  trackDedup(map, key, controlledB, 0)

  assert.equal(map.get(key), controlledB, 'new promise occupies the slot')

  // Now settle the old Promise A
  resolveA('stale')
  await new Promise(r => setImmediate(r))

  // Identity guard: old settle must NOT delete Promise B's slot
  assert.equal(map.get(key), controlledB, 'new promise slot survived old settle')

  // Now settle Promise B normally
  resolveB('new')
  await controlledB
  await new Promise(r => setImmediate(r))
  assert.equal(map.has(key), false, 'slot cleaned after new promise settles')
})
