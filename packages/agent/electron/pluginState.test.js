/**
 * readPluginsState() 单元测试
 *
 * 覆盖场景：
 *   1. 空目录 → 返回空
 *   2. 单 marketplace / 单插件
 *   3. 多 marketplace 同名插件去重
 *   4. 黑名单过滤
 *   5. 安装量排序
 *   6. 市场源 (`known_marketplaces.json`) 解析
 *   7. plugin.json 格式不完整/损坏 → 跳过
 *   8. const→let 回归检查：确保无 TypeError
 *
 * 运行: node --test packages/agent/electron/pluginState.test.js
 */
const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')
const { readPluginsState } = require('./pluginState')

/** 在临时目录中创建文件结构的工具 */
function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeJson(filePath, obj) {
  mkdirp(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8')
}

let tmpDir

before(() => {
  tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pluginState-test-'))
})

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function testDir(name) {
  const dir = path.join(tmpDir, name)
  mkdirp(dir)
  return dir
}

describe('readPluginsState', () => {

  test('空目录 → 返回 { plugins:[], marketplaces:[] }', () => {
    const dir = testDir('empty')
    const result = readPluginsState(dir)
    assert.deepStrictEqual(result, { plugins: [], marketplaces: [] })
  })

  test('不存在的目录 → 返回空', () => {
    const result = readPluginsState('/nonexistent/path/plugins')
    assert.deepStrictEqual(result, { plugins: [], marketplaces: [] })
  })

  test('单 marketplace / 单插件', () => {
    const dir = testDir('single')
    // marketplaces/m1/plugins/my-plugin/.claude-plugin/plugin.json
    writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', 'my-plugin', '.claude-plugin', 'plugin.json'), {
      name: 'My Plugin',
      description: 'A test plugin',
      author: { name: 'tester' },
    })

    const result = readPluginsState(dir)

    assert.strictEqual(result.plugins.length, 1)
    assert.strictEqual(result.plugins[0].id, 'my-plugin@m1')
    assert.strictEqual(result.plugins[0].name, 'My Plugin')
    assert.strictEqual(result.plugins[0].description, 'A test plugin')
    assert.strictEqual(result.plugins[0].author, 'tester')
    assert.strictEqual(result.plugins[0].market, 'm1')
    assert.strictEqual(result.plugins[0].installed, false)
  })

  test('多 marketplace / 多插件', () => {
    const dir = testDir('multi')

    // m1: plugin-a, plugin-b
    for (const name of ['plugin-a', 'plugin-b']) {
      writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', name, '.claude-plugin', 'plugin.json'), {
        name: name, description: `desc ${name}`,
      })
    }
    // m2: plugin-a (重复), plugin-c
    for (const name of ['plugin-a', 'plugin-c']) {
      writeJson(path.join(dir, 'marketplaces', 'm2', 'plugins', name, '.claude-plugin', 'plugin.json'), {
        name: name, description: `desc ${name} from m2`,
      })
    }

    const result = readPluginsState(dir)

    // 去重后应有 3 个（plugin-a 只保留一条）
    assert.strictEqual(result.plugins.length, 3)
    const ids = result.plugins.map(p => p.id).sort()
    assert.deepStrictEqual(ids, ['plugin-a@m1', 'plugin-b@m1', 'plugin-c@m2'])
  })

  test('去重：同名插件优先保留安装量高的', () => {
    const dir = testDir('dedup-installs')

    writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', 'dup', '.claude-plugin', 'plugin.json'), {
      name: 'dup',
    })
    writeJson(path.join(dir, 'marketplaces', 'm2', 'plugins', 'dup', '.claude-plugin', 'plugin.json'), {
      name: 'dup',
    })

    // m1 中的 dup 安装量 1000，m2 中的 500 → 排序后应保留 m1 的
    writeJson(path.join(dir, 'install-counts-cache.json'), {
      counts: [
        { plugin: 'dup@m1', unique_installs: 1000 },
        { plugin: 'dup@m2', unique_installs: 500 },
      ],
    })

    const result = readPluginsState(dir)

    assert.strictEqual(result.plugins.length, 1)
    assert.strictEqual(result.plugins[0].id, 'dup@m1')
    assert.strictEqual(result.plugins[0].installs, 1000)
  })

  test('黑名单过滤', () => {
    const dir = testDir('blocklist')
    writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', 'good', '.claude-plugin', 'plugin.json'), {
      name: 'good',
    })
    writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', 'bad', '.claude-plugin', 'plugin.json'), {
      name: 'bad',
    })
    writeJson(path.join(dir, 'blocklist.json'), {
      plugins: [{ plugin: 'bad@m1' }],
    })

    const result = readPluginsState(dir)

    assert.strictEqual(result.plugins.length, 2) // 仍存在，但标记为 blocked
    const good = result.plugins.find(p => p.name === 'good')
    const bad = result.plugins.find(p => p.name === 'bad')
    assert.strictEqual(good.blocked, false)
    assert.strictEqual(bad.blocked, true)
  })

  test('安装量排序：高→低', () => {
    const dir = testDir('sorted')
    for (const name of ['a', 'b', 'c']) {
      writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', name, '.claude-plugin', 'plugin.json'), { name })
    }
    writeJson(path.join(dir, 'install-counts-cache.json'), {
      counts: [
        { plugin: 'a@m1', unique_installs: 10 },
        { plugin: 'b@m1', unique_installs: 999 },
        { plugin: 'c@m1', unique_installs: 100 },
      ],
    })

    const result = readPluginsState(dir)
    const names = result.plugins.map(p => p.name)
    assert.deepStrictEqual(names, ['b', 'c', 'a']) // 999 > 100 > 10
  })

  test('市场源 known_marketplaces.json', () => {
    const dir = testDir('markets-info')
    writeJson(path.join(dir, 'known_marketplaces.json'), {
      'market-a': {
        source: { source: 'github', repo: 'org/repo-a' },
        lastUpdated: '2026-01-01T00:00:00Z',
      },
    })

    const result = readPluginsState(dir)
    assert.strictEqual(result.marketplaces.length, 1)
    assert.strictEqual(result.marketplaces[0].id, 'market-a')
    assert.strictEqual(result.marketplaces[0].url, 'https://github.com/org/repo-a')
  })

  test('plugin.json 格式损坏 → 跳过不崩溃', () => {
    const dir = testDir('corrupt')
    mkdirp(path.join(dir, 'marketplaces', 'm1', 'plugins', 'broken', '.claude-plugin'))
    fs.writeFileSync(
      path.join(dir, 'marketplaces', 'm1', 'plugins', 'broken', '.claude-plugin', 'plugin.json'),
      'not valid json {{{',
      'utf8',
    )

    const result = readPluginsState(dir)
    assert.strictEqual(result.plugins.length, 0)
    // 不应抛异常
  })

  test('无 .claude-plugin 目录的插件目录 → 跳过', () => {
    const dir = testDir('no-meta')
    mkdirp(path.join(dir, 'marketplaces', 'm1', 'plugins', 'no-plugin-json'))

    const result = readPluginsState(dir)
    assert.strictEqual(result.plugins.length, 0)
  })

  // ─── 回归测试：确保 const→let 修复后不再抛 TypeError ───
  test('回归：plugins 变量可被 filter 重新赋值（const→let 修复验证）', () => {
    const dir = testDir('regression')
    // 至少 2 个插件触发 filter 逻辑
    for (const name of ['x', 'y']) {
      writeJson(path.join(dir, 'marketplaces', 'm1', 'plugins', name, '.claude-plugin', 'plugin.json'), {
        name, description: `Plugin ${name}`,
      })
    }

    // 不应抛 TypeError: Assignment to constant variable
    const result = readPluginsState(dir)
    assert.strictEqual(result.plugins.length, 2)
    assert.strictEqual(typeof result.marketplaces, 'object')
  })
})
