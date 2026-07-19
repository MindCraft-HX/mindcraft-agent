// Contract: AgentInputDockShell 是纯数据契约 —— chat slot 约定 + anchor
// 注册/注销 + chat/terminal 模式互斥。不接真实 composer，不引 DOM/terminal。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INPUT_DOCK_MODE,
  INPUT_DOCK_SLOT,
  createInputDockShell,
} from '../packages/agent/src/workbench/inputDockShell.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('anchor registration dedups by id and activates the first anchor', () => {
  const shell = createInputDockShell({ now: () => 1000 })
  const first = shell.registerAnchor({ anchorId: 'claude:proj-1', agentType: 'claude' })
  assert.equal(first.ok, true)
  assert.equal(typeof first.unregister, 'function')
  assert.equal(shell.getActiveAnchor()?.anchorId, 'claude:proj-1')

  shell.registerAnchor({ anchorId: 'codex:proj-2', agentType: 'codex' })
  assert.equal(shell.getActiveAnchor()?.anchorId, 'claude:proj-1')
  assert.equal(shell.getSnapshot().anchors.length, 2)

  const dup = shell.registerAnchor({ anchorId: 'claude:proj-1', agentType: 'claude' })
  assert.equal(dup.ok, true)
  assert.equal(shell.getSnapshot().anchors.length, 2)
})

test('invalid anchors and non-chat slots are rejected', () => {
  const shell = createInputDockShell()
  assert.deepEqual(shell.registerAnchor(null), { ok: false, reason: 'invalid-anchor' })
  assert.deepEqual(shell.registerAnchor({}), { ok: false, reason: 'invalid-anchor' })
  assert.deepEqual(
    shell.registerAnchor({ anchorId: 'a', slot: 'terminal' }),
    { ok: false, reason: 'invalid-slot' },
  )
  assert.equal(INPUT_DOCK_SLOT.CHAT, 'chat')
})

test('anchor limit is enforced', () => {
  const shell = createInputDockShell()
  for (let i = 0; i < 8; i += 1) {
    assert.equal(shell.registerAnchor({ anchorId: `a${i}` }).ok, true)
  }
  assert.deepEqual(shell.registerAnchor({ anchorId: 'a8' }), { ok: false, reason: 'anchor-limit' })
})

test('terminal mode requires an active anchor; chat is the default', () => {
  const shell = createInputDockShell()
  assert.equal(shell.getMode(), INPUT_DOCK_MODE.CHAT)
  assert.deepEqual(shell.setMode(INPUT_DOCK_MODE.TERMINAL), { ok: false, reason: 'no-anchor' })
  assert.deepEqual(shell.setMode('split'), { ok: false, reason: 'invalid-mode' })

  shell.registerAnchor({ anchorId: 'a1' })
  assert.deepEqual(shell.setMode(INPUT_DOCK_MODE.TERMINAL), { ok: true })
  assert.equal(shell.getMode(), INPUT_DOCK_MODE.TERMINAL)
  // 幂等：重复设置不 bump revision
  const before = shell.getSnapshot().revision
  shell.setMode(INPUT_DOCK_MODE.TERMINAL)
  assert.equal(shell.getSnapshot().revision, before)
})

test('unregistering the active anchor falls back; last anchor resets to chat', () => {
  const shell = createInputDockShell()
  shell.registerAnchor({ anchorId: 'a1' })
  shell.registerAnchor({ anchorId: 'a2' })
  shell.setMode(INPUT_DOCK_MODE.TERMINAL)

  assert.equal(shell.unregisterAnchor('a1'), true)
  assert.equal(shell.getActiveAnchor()?.anchorId, 'a2')
  assert.equal(shell.getMode(), INPUT_DOCK_MODE.TERMINAL)

  assert.equal(shell.unregisterAnchor('a2'), true)
  assert.equal(shell.getActiveAnchor(), null)
  assert.equal(shell.getMode(), INPUT_DOCK_MODE.CHAT)
  assert.equal(shell.unregisterAnchor('a2'), false)
})

test('activateAnchor only switches between registered anchors', () => {
  const shell = createInputDockShell()
  shell.registerAnchor({ anchorId: 'a1' })
  shell.registerAnchor({ anchorId: 'a2' })
  assert.equal(shell.activateAnchor('nope'), false)
  assert.equal(shell.getActiveAnchor()?.anchorId, 'a1')
  assert.equal(shell.activateAnchor('a2'), true)
  assert.equal(shell.getActiveAnchor()?.anchorId, 'a2')
})

test('snapshots are monotonic, copied, and fan out to subscribers', () => {
  const shell = createInputDockShell()
  const seen = []
  const dispose = shell.subscribe(snapshot => seen.push(snapshot))
  shell.registerAnchor({ anchorId: 'a1', agentType: 'claude' })
  shell.setMode(INPUT_DOCK_MODE.TERMINAL)
  assert.equal(seen.length, 2)
  assert.ok(seen[1].revision > seen[0].revision)

  // 快照是拷贝：调用方改不动内部状态
  seen[0].anchors.push({ anchorId: 'hacked' })
  seen[0].mode = 'hacked'
  assert.equal(shell.getSnapshot().anchors.length, 1)
  assert.equal(shell.getMode(), INPUT_DOCK_MODE.TERMINAL)

  dispose()
  shell.setMode(INPUT_DOCK_MODE.CHAT)
  assert.equal(seen.length, 2)
  assert.throws(() => shell.subscribe(null), /listener must be a function/)
})

test('registerAnchor disposer unregisters its own anchor', () => {
  const shell = createInputDockShell()
  const { unregister } = shell.registerAnchor({ anchorId: 'a1' })
  assert.equal(shell.getSnapshot().anchors.length, 1)
  unregister()
  assert.equal(shell.getSnapshot().anchors.length, 0)
})

test('red line: the shell carries no DOM, terminal, or src/workbench coupling', () => {
  const source = fs.readFileSync(
    path.join(root, 'packages/agent/src/workbench/inputDockShell.mjs'),
    'utf8',
  )
  assert.ok(!source.includes('src/workbench'), 'packages/agent must not import the host workbench')
  assert.ok(!/import\s/.test(source), 'the pure contract module must not import anything')
  assert.ok(!source.includes('document.'), 'no DOM access in the contract module')
})
