/**
 * B2 契约测试：Agent 消息卡片中的文件链接打开 mdViewer 时，
 * 必须携带 typed navigation intent 的 source 标识 'agent-file-link'，
 * 以便 mdRouting / Workbench 侧按来源路由与审计。
 *
 * 覆盖 4 处 openMdWin 调用点（claudeCode / codeX 各 2 处）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const AGENT_FILE_LINK_CALL_SITES = [
  'packages/agent/src/components/claudeCode/components/messages/ToolMessageCard.vue',
  'packages/agent/src/components/claudeCode/components/messages/tools/ToolRead.vue',
  'packages/agent/src/components/codeX/components/messages/ToolMessageCard.vue',
  'packages/agent/src/components/codeX/components/messages/tools/ToolRead.vue',
]

for (const relPath of AGENT_FILE_LINK_CALL_SITES) {
  test(`${relPath} openMdWin 调用必须携带 source: 'agent-file-link'`, () => {
    const source = readFileSync(path.join(repoRoot, relPath), 'utf8')
    assert.ok(
      source.includes('openMdWin'),
      `${relPath} 应通过 openMdWin 打开文档`
    )
    assert.ok(
      source.includes("source: 'agent-file-link'"),
      `${relPath} 的 openMdWin payload 缺少 source: 'agent-file-link'`
    )
  })
}

test('electron/mdRouting.js 必须为 pendingPayloads 实现 TTL 驱逐', () => {
  const source = readFileSync(path.join(repoRoot, 'electron/mdRouting.js'), 'utf8')
  assert.ok(source.includes('PAYLOAD_TTL_MS'), 'mdRouting 缺少 PAYLOAD_TTL_MS 常量')
  assert.ok(
    source.includes('evictExpiredPayloads'),
    'mdRouting 缺少 evictExpiredPayloads 驱逐函数'
  )
})
