/**
 * T118 迁移验证脚本 — 模拟 migration 逻辑
 * 运行: node test/verify-t118-migration.mjs
 *
 * 这个脚本不会修改真实的 ~/.claude/settings.json，
 * 只在内存中模拟迁移逻辑，验证各种场景。
 */

import { strict as assert } from 'node:assert'

// ═══════════════════════════════════════════════════════════════
// 模拟 confGet/confSet/readGlobalSettings/writeGlobalSettings
// ═══════════════════════════════════════════════════════════════

function simulate(initialSettings, initialInternalConf = {}) {
  let settings = JSON.parse(JSON.stringify(initialSettings))
  const internalConf = JSON.parse(JSON.stringify(initialInternalConf))
  let settingsWriteCount = 0

  console.log('\n─── 迁移前 ───')
  console.log('  settings.json:', JSON.stringify(settings))
  console.log('  internalConf:', JSON.stringify(internalConf))

  // ===== 迁移逻辑（与 claudeAgent.js L727-778 一致）=====
  let dirty = false
  if (settings.permissionPolicy !== undefined) {
    if (!internalConf.claudePermissionPolicy) {
      internalConf.claudePermissionPolicy = settings.permissionPolicy
    }
    delete settings.permissionPolicy
    dirty = true
  }
  if (settings.language && ['zh-CN', 'en-US'].includes(settings.language)) {
    if (!internalConf.claudeLanguage) {
      internalConf.claudeLanguage = settings.language
    }
    delete settings.language
    dirty = true
  }
  if (settings.pathToClaudeCodeExecutable !== undefined) {
    if (!internalConf.claudeExecutablePath) {
      internalConf.claudeExecutablePath = settings.pathToClaudeCodeExecutable
    }
    delete settings.pathToClaudeCodeExecutable
    dirty = true
  }
  if (settings.effortLevel === 'max') {
    settings.effortLevel = 'xhigh'
    dirty = true
  }
  if (settings.gitMirrorUrl !== undefined) {
    if (!internalConf.gitMirrorUrl) {
      internalConf.gitMirrorUrl = settings.gitMirrorUrl
    }
    delete settings.gitMirrorUrl
    dirty = true
  }
  if (settings.theme !== undefined) {
    delete settings.theme
    dirty = true
  }
  if (dirty) settingsWriteCount++

  // ===== 模拟 confGet (internalConf → settings.json → default) =====
  function confGetPermissionPolicy(def = 'ask') {
    return internalConf.claudePermissionPolicy || settings.permissionPolicy || def
  }
  function confGetLanguage(def = 'zh-CN') {
    return internalConf.claudeLanguage || settings.language || def
  }
  function confGetExecutablePath(def = '') {
    return internalConf.claudeExecutablePath || settings.pathToClaudeCodeExecutable || def
  }
  function confGetEffortLevel(def = 'medium') {
    return settings.effortLevel || def
  }

  console.log('\n─── 迁移后 ───')
  console.log('  settings.json:', JSON.stringify(settings))
  console.log('  internalConf:', JSON.stringify(internalConf))
  console.log('  settings 写入次数:', settingsWriteCount)
  console.log('  confGet permissionPolicy:', confGetPermissionPolicy())
  console.log('  confGet language:', confGetLanguage())
  console.log('  confGet executablePath:', confGetExecutablePath())
  console.log('  confGet effortLevel:', confGetEffortLevel())

  return {
    settings,
    internalConf,
    settingsWriteCount,
    confGetPermissionPolicy,
    confGetLanguage,
    confGetExecutablePath,
    confGetEffortLevel,
  }
}

// ═══════════════════════════════════════════════════════════════
// 场景 1: 典型污染用户 —— 有 polluted 字段 + effortLevel:max
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 1: 典型污染用户 ═════')
{
  const r = simulate({
    permissionPolicy: 'ask',
    language: 'zh-CN',
    pathToClaudeCodeExecutable: '/usr/local/bin/claude',
    effortLevel: 'max',
    gitMirrorUrl: 'https://git.example.com',
    theme: 'dark',
    // SDK 合法字段
    skipWebFetchPreflight: true,
    apiKeyHelper: 'keyring',
  })

  // effortLevel 是合法 SDK 字段，只修正值(max→xhigh)，保留在 settings.json
  assert.deepStrictEqual(r.settings, {
    effortLevel: 'xhigh',
    skipWebFetchPreflight: true,
    apiKeyHelper: 'keyring',
  }, '场景1: 污染字段应被清理，effortLevel 作为 SDK 字段保留')

  assert.deepStrictEqual(r.internalConf, {
    claudePermissionPolicy: 'ask',
    claudeLanguage: 'zh-CN',
    claudeExecutablePath: '/usr/local/bin/claude',
    gitMirrorUrl: 'https://git.example.com',
  }, '场景1: 字段应迁移到 internalConf')

  assert.strictEqual(r.settingsWriteCount, 1, '场景1: 应写入一次')
  assert.strictEqual(r.confGetPermissionPolicy(), 'ask')
  assert.strictEqual(r.confGetLanguage(), 'zh-CN')
  assert.strictEqual(r.confGetExecutablePath(), '/usr/local/bin/claude')
  assert.strictEqual(r.confGetEffortLevel(), 'xhigh', '场景1: max 应修正为 xhigh')
  console.log('  ✅ 通过')
}

// ═══════════════════════════════════════════════════════════════
// 场景 2: 第二次启动（迁移已完成）
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 2: 第二次启动（幂等性）═════')
{
  const r = simulate(
    { skipWebFetchPreflight: true, apiKeyHelper: 'keyring' },
    {
      claudePermissionPolicy: 'allow_all',
      claudeLanguage: 'en-US',
      claudeExecutablePath: '/custom/claude',
      gitMirrorUrl: 'https://mirror.example.com',
    },
  )

  assert.strictEqual(r.settingsWriteCount, 0, '场景2: settings.json 干净，不应写入')
  assert.strictEqual(r.confGetPermissionPolicy(), 'allow_all', '场景2: 应从 internalConf 读取')
  assert.strictEqual(r.confGetLanguage(), 'en-US')
  console.log('  ✅ 通过')
}

// ═══════════════════════════════════════════════════════════════
// 场景 3: 新用户（settings.json 不存在/为空）
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 3: 新用户（空 settings）═════')
{
  const r = simulate({})

  assert.strictEqual(r.settingsWriteCount, 0, '场景3: 空 settings，不应写入')
  assert.strictEqual(r.confGetPermissionPolicy(), 'ask', '场景3: 应返回默认值')
  assert.strictEqual(r.confGetLanguage(), 'zh-CN', '场景3: 应返回默认值')
  console.log('  ✅ 通过')
}

// ═══════════════════════════════════════════════════════════════
// 场景 4: 仅部分字段污染
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 4: 部分污染 ═════')
{
  const r = simulate({
    language: 'zh-CN',
    skipWebFetchPreflight: true,
    // 没有 permissionPolicy, executablePath, gitMirrorUrl, theme
  })

  assert.deepStrictEqual(r.settings, {
    skipWebFetchPreflight: true,
  }, '场景4: 只应清理 language')

  assert.deepStrictEqual(r.internalConf, {
    claudeLanguage: 'zh-CN',
  }, '场景4: 只应迁移 language')

  assert.strictEqual(r.confGetLanguage(), 'zh-CN')
  assert.strictEqual(r.confGetPermissionPolicy(), 'ask', '场景4: 未污染字段返回默认值')
  console.log('  ✅ 通过')
}

// ═══════════════════════════════════════════════════════════════
// 场景 5: effortLevel 是合法值（非 max）
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 5: effortLevel = high (合法值) ═════')
{
  const r = simulate({
    effortLevel: 'high',
    skipWebFetchPreflight: true,
  })

  assert.strictEqual(r.settings.effortLevel, 'high', '场景5: high 应保持不变')
  assert.strictEqual(r.confGetEffortLevel(), 'high')
  console.log('  ✅ 通过')
}

// ═══════════════════════════════════════════════════════════════
// 场景 6: effortLevel = xhigh (已是合法值)
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 6: effortLevel = xhigh (已是合法值) ═════')
{
  const r = simulate({
    effortLevel: 'xhigh',
    skipWebFetchPreflight: true,
  })

  assert.strictEqual(r.settings.effortLevel, 'xhigh', '场景6: xhigh 应保持不变')
  assert.strictEqual(r.confGetEffortLevel(), 'xhigh')
  console.log('  ✅ 通过')
}

// ═══════════════════════════════════════════════════════════════
// 场景 7: language 不是 App UI 语言（保留为 SDK 设置）
// ═══════════════════════════════════════════════════════════════
console.log('\n═════ 场景 7: language = ja (非 App UI 语言，保留) ═════')
{
  const r = simulate({
    language: 'ja',
    skipWebFetchPreflight: true,
  })

  assert.strictEqual(r.settings.language, 'ja', '场景7: 非 App UI 语言应保留在 settings.json')
  assert.strictEqual(r.settingsWriteCount, 0, '场景7: 不应写入')
  console.log('  ✅ 通过')
}

console.log('\n══════════════════════════════════')
console.log('  🎉 全部 7 个场景通过！')
console.log('══════════════════════════════════\n')
