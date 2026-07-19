/**
 * B6 契约测试：renderer CloseCoordinator 桥接。
 * main 发 CLOSE_COORDINATOR_REQUEST → registry 按序跑 participant →
 * 聚合结果经 respondCloseCoordinator 回传。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createAppCloseCoordinator } from '../src/lifecycle/appCloseCoordinator.mjs'

function createFakeApi() {
  const listeners = new Set()
  const responses = []
  return {
    responses,
    onCloseCoordinatorRequest(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    async respondCloseCoordinator(payload) {
      responses.push(payload)
      return { accepted: true }
    },
    emit(request) {
      for (const listener of [...listeners]) listener(request)
    },
    get listenerCount() { return listeners.size },
  }
}

test('request 触发 participant 并回传 ready 聚合', async () => {
  const api = createFakeApi()
  const coordinator = createAppCloseCoordinator({ api })
  const calls = []
  coordinator.registry.register('document-dirty', async ({ requestId, reason }) => {
    calls.push({ requestId, reason })
    return { status: 'ready' }
  })

  api.emit({ requestId: 'close-1', reason: 'quit' })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(calls, [{ requestId: 'close-1', reason: 'quit' }])
  assert.equal(api.responses.length, 1)
  assert.equal(api.responses[0].requestId, 'close-1')
  assert.equal(api.responses[0].status, 'ready')
})

test('participant cancel 原样回传', async () => {
  const api = createFakeApi()
  const coordinator = createAppCloseCoordinator({ api })
  coordinator.registry.register('document-dirty', () => ({ status: 'cancel' }))

  api.emit({ requestId: 'close-2', reason: 'quit' })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(api.responses[0].status, 'cancel')
  assert.equal(api.responses[0].participantId, 'document-dirty')
})

test('同一 requestId 重复 request 幂等（registry 去重）', async () => {
  const api = createFakeApi()
  const coordinator = createAppCloseCoordinator({ api })
  let runs = 0
  coordinator.registry.register('document-dirty', () => { runs += 1; return { status: 'ready' } })

  api.emit({ requestId: 'close-3', reason: 'quit' })
  api.emit({ requestId: 'close-3', reason: 'quit' })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(runs, 1)
  assert.equal(api.responses.length, 2)
  assert.equal(api.responses[0].requestId, 'close-3')
  assert.equal(api.responses[1].requestId, 'close-3')
})

test('无 preload api 时桥接静默不接线，registry 仍可用', async () => {
  const coordinator = createAppCloseCoordinator({ api: null })
  coordinator.registry.register('document-dirty', () => ({ status: 'ready' }))
  const result = await coordinator.registry.beforeCloseAll({ requestId: 'r1', reason: 'quit' })
  assert.equal(result.status, 'ready')
  coordinator.dispose()
})

test('dispose 摘除 request 监听', async () => {
  const api = createFakeApi()
  const coordinator = createAppCloseCoordinator({ api })
  assert.equal(api.listenerCount, 1)
  coordinator.dispose()
  assert.equal(api.listenerCount, 0)
})
