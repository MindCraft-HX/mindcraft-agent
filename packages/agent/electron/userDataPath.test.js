const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const {
  getMindCraftUserDataDir,
  getStableFallbackUserDataDir,
} = require('./userDataPath')

test('getMindCraftUserDataDir uses Electron app userData when available', () => {
  const app = { getPath: (name) => name === 'userData' ? 'D:/MindCraft/UserData' : '' }
  assert.equal(getMindCraftUserDataDir({ app, homeDir: 'C:/Users/demo' }), 'D:/MindCraft/UserData')
})

test('getMindCraftUserDataDir falls back to stable home directory instead of OS temp', () => {
  const app = { getPath: () => { throw new Error('not ready') } }
  assert.equal(
    getMindCraftUserDataDir({ app, homeDir: 'C:/Users/demo' }),
    path.join('C:/Users/demo', '.mindcraft-agent', 'userData'),
  )
})

test('getStableFallbackUserDataDir handles missing home directory', () => {
  assert.equal(
    getStableFallbackUserDataDir({ homeDir: '' }),
    path.join(process.cwd(), '.mindcraft-agent', 'userData'),
  )
})
