/**
 * B4 契约测试：ActiveWorkspaceContext 的 workspaceKey 规范化。
 *
 * 设计约束（docs/workbench-split-and-terminal.md 4.1）：
 * workspaceKey = `cwd:<normalized-cwd>`；Claude 与 CodeX 指向同一
 * 规范化 cwd 时必须得到同一 key（大小写/斜杠差异不得分裂身份）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCwdForWorkspaceKey,
  workspaceKeyFromCwd,
} from '../packages/agent/src/workbench/workspaceContext.mjs'

test('workspaceKey 使用 cwd: 前缀', () => {
  assert.equal(workspaceKeyFromCwd('D:/repo'), 'cwd:d:/repo')
})

test('反斜杠与尾部斜杠归一', () => {
  assert.equal(workspaceKeyFromCwd('D:\\repo\\sub\\'), 'cwd:d:/repo/sub')
  assert.equal(workspaceKeyFromCwd('D:/repo/'), 'cwd:d:/repo')
})

test('Windows 盘符路径大小写折叠，同一 cwd 不同写法得到同一 key', () => {
  const a = workspaceKeyFromCwd('D:/Repo/Sub')
  const b = workspaceKeyFromCwd('d:/repo/sub')
  const c = workspaceKeyFromCwd('D:\\REPO\\SUB')
  assert.equal(a, b)
  assert.equal(b, c)
})

test('POSIX 路径保持大小写敏感', () => {
  assert.equal(workspaceKeyFromCwd('/home/User/Repo'), 'cwd:/home/User/Repo')
})

test('UNC 路径按 Windows 规则折叠', () => {
  assert.equal(workspaceKeyFromCwd('\\\\SERVER\\Share\\Dir'), 'cwd://server/share/dir')
})

test('空 cwd 返回空 key，context 构造方据此返回 null', () => {
  assert.equal(workspaceKeyFromCwd(''), '')
  assert.equal(workspaceKeyFromCwd(null), '')
  assert.equal(workspaceKeyFromCwd(undefined), '')
  assert.equal(workspaceKeyFromCwd('   '), '')
  assert.equal(normalizeCwdForWorkspaceKey('/'), '')
})
