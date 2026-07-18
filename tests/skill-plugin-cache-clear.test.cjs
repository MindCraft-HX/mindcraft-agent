/**
 * T200 回归测试：skill/plugin 操作后 slash command 缓存清除
 *
 * 对 claudeAgent.js 和 codexAgent.js 中每个 mutation handler，
 * 验证其函数体内包含必需的 cache.clear() 调用。
 *
 * 运行: node --test tests/skill-plugin-cache-clear.test.cjs
 *
 * 对应文档: docs/skill-plugin-cache-invalidation.md
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// ─── helpers ───────────────────────────────────────────────

/**
 * Locate a handler by its IPC channel rather than a fragile source line. Keep
 * the bounded body check so a cache clear in an unrelated handler cannot pass.
 */
function assertCacheClearInHandler(filePath, marker, needle, label, windowSize = 80) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const start = lines.findIndex(line => line.includes(marker))
  assert.ok(start >= 0, `${label}: handler ${marker} should exist`)
  const snippet = lines.slice(start, start + windowSize).join('\n')

  // 验证至少有一个 clear 调用（部分 handler 在 try + catch 中各有清除）
  const found = snippet.includes(needle)
  if (!found) {
    // 扩大搜索窗口输出诊断信息
    const extended = lines.slice(start, start + 140).join('\n')
    console.error(`\n[FAIL] ${label}: "${needle}" not found within ${windowSize} lines of ${marker}`)
    console.error(`Handler body (100 lines):\n${extended.substring(0, 2000)}`)
  }
  assert.ok(found, `${label}: ${needle} 应在 handler 函数体内`)
}

// ─── Claude ─────────────────────────────────────────────────

describe('Claude slashCommandsCache', () => {
  const file = path.join(ROOT, 'packages/agent/electron/claudeAgent.js')

  const claudeHandlers = [
    { ch: 'PLUGINS_INSTALL',       needle: 'slashCommandsCache.clear()' },
    { ch: 'PLUGINS_UNINSTALL',     needle: 'slashCommandsCache.clear()' },
    { ch: 'PLUGINS_ENABLE',        needle: 'slashCommandsCache.clear()' },
    { ch: 'PLUGINS_DISABLE',       needle: 'slashCommandsCache.clear()' },
    { ch: 'SKILLS_INSTALL',        needle: 'slashCommandsCache.clear()' },
    { ch: 'SKILLS_UNINSTALL',      needle: 'slashCommandsCache.clear()' },
    { ch: 'SKILLS_MARKET_INSTALL', needle: 'slashCommandsCache.clear()' },
  ]

  for (const h of claudeHandlers) {
    test(`${h.ch} handler 清除缓存`, () => {
      assertCacheClearInHandler(file, `ipcMain.handle(CORE_CHANNELS.${h.ch}`, h.needle, `Claude ${h.ch}`)
    })
  }

  test('全部 7 个 mutation handler 覆盖', () => {
    const content = fs.readFileSync(file, 'utf8')
    const count = (content.match(/slashCommandsCache\.clear\(\)/g) || []).length
    // 至少 7 次（每个 handler 至少一次）+ resetAgentRuntime 中可能有额外
    assert.ok(count >= 7, `slashCommandsCache.clear() 出现次数: ${count} (预期 >= 7)`)
  })
})

// ─── CodeX ──────────────────────────────────────────────────

describe('CodeX codexSlashCommandsCache', () => {
  const file = path.join(ROOT, 'packages/agent/electron/codexAgent.js')

  const codexHandlers = [
    { ch: 'INSTALL_SKILL',        needle: 'codexSlashCommandsCache.clear()' },
    { ch: 'UNINSTALL_SKILL',      needle: 'codexSlashCommandsCache.clear()' },
    { ch: 'MARKET_INSTALL_SKILL', needle: 'codexSlashCommandsCache.clear()' },
    { ch: 'INSTALL_PLUGIN',       needle: 'codexSlashCommandsCache.clear()' },
    { ch: 'UNINSTALL_PLUGIN',     needle: 'codexSlashCommandsCache.clear()' },
    { ch: 'ENABLE_PLUGIN',        needle: 'codexSlashCommandsCache.clear()' },
    { ch: 'DISABLE_PLUGIN',       needle: 'codexSlashCommandsCache.clear()' },
  ]

  for (const h of codexHandlers) {
    test(`${h.ch} handler 清除缓存`, () => {
      assertCacheClearInHandler(file, `ipcMain.handle(CODEX_CHANNELS.${h.ch}`, h.needle, `CodeX ${h.ch}`)
    })
  }

  test('全部 7 个 mutation handler 覆盖', () => {
    const content = fs.readFileSync(file, 'utf8')
    const count = (content.match(/codexSlashCommandsCache\.clear\(\)/g) || []).length
    assert.ok(count >= 7, `codexSlashCommandsCache.clear() 出现次数: ${count} (预期 >= 7)`)
  })
})

// ─── 渲染层事件 emit ────────────────────────────────────────

describe('渲染层事件绑定', () => {
  test('ManagePlugins.vue 三条路径都 emit plugin-toggled', () => {
    const file = path.join(ROOT, 'packages/agent/src/components/claudeCode/components/ManagePlugins.vue')
    const content = fs.readFileSync(file, 'utf8')

    // installPlugin → emit('plugin-toggled') (line 262)
    assertCacheClearInHandler(file, 'async function installPlugin', `emit('plugin-toggled')`, 'installPlugin emit', 20)
    // uninstallPlugin → emit('plugin-toggled') (line 280)
    assertCacheClearInHandler(file, 'async function uninstallPlugin', `emit('plugin-toggled')`, 'uninstallPlugin emit', 20)
    // togglePlugin → emit('plugin-toggled') (line 299)
    assertCacheClearInHandler(file, 'async function togglePlugin', `emit('plugin-toggled')`, 'togglePlugin emit', 20)

    const count = (content.match(/emit\('plugin-toggled'\)/g) || []).length
    assert.ok(count >= 3, `emit('plugin-toggled') 出现次数: ${count} (预期 >= 3)`)
  })

  test('ManageSkills.vue 三条路径都 emit skills-changed', () => {
    const file = path.join(ROOT, 'packages/agent/src/components/claudeCode/components/ManageSkills.vue')
    const content = fs.readFileSync(file, 'utf8')

    assertCacheClearInHandler(file, 'async function installSkill', `emit('skills-changed')`, 'installSkill emit', 20)
    assertCacheClearInHandler(file, 'async function uninstallSkill', `emit('skills-changed')`, 'uninstallSkill emit', 20)
    // 市场安装路径在 line 727 附近
    assertCacheClearInHandler(file, 'async function installMarketSkill', `emit('skills-changed')`, 'marketInstallSkill emit', 20)

    const count = (content.match(/emit\('skills-changed'\)/g) || []).length
    assert.ok(count >= 3, `emit('skills-changed') 出现次数: ${count} (预期 >= 3)`)
  })
})
