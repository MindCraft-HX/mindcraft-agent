/**
 * workspaceKey 契约 parity：renderer ESM 实现
 * （packages/agent/src/workbench/workspaceContext.mjs）与 main CJS 实现
 * （electron/workbench/workspaceKey.cjs）是同一身份契约的两个语言面，
 * 任何输入必须产出逐字节一致的结果。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  normalizeCwdForWorkspaceKey as normalizeEsm,
  workspaceKeyFromCwd as keyEsm,
} from '../packages/agent/src/workbench/workspaceContext.mjs'

const require = createRequire(import.meta.url)
const {
  normalizeCwdForWorkspaceKey: normalizeCjs,
  workspaceKeyFromCwd: keyCjs,
} = require('../electron/workbench/workspaceKey.cjs')

const FIXTURES = [
  'D:/repo',
  'D:\\repo\\sub\\',
  'D:/Repo/',
  'd:/repo',
  'D:\\REPO\\SUB',
  'C:/',
  'c:\\',
  '/home/User/Repo',
  '/home/user/repo/',
  '/',
  '\\\\SERVER\\Share\\Dir',
  '//server/share/dir/',
  'relative/path',
  'relative\\path\\',
  '',
  '   ',
  'D:/repo with spaces/sub',
  'D:/中文目录/子目录',
  '/ws/0',
  null,
  undefined,
  42,
]

test('workspaceKeyFromCwd ESM/CJS 全夹具 parity', () => {
  for (const fixture of FIXTURES) {
    assert.equal(
      keyEsm(fixture),
      keyCjs(fixture),
      `workspaceKeyFromCwd 对 ${JSON.stringify(fixture)} 不一致`
    )
  }
})

test('normalizeCwdForWorkspaceKey ESM/CJS 全夹具 parity', () => {
  for (const fixture of FIXTURES) {
    assert.equal(
      normalizeEsm(fixture),
      normalizeCjs(fixture),
      `normalizeCwdForWorkspaceKey 对 ${JSON.stringify(fixture)} 不一致`
    )
  }
})
