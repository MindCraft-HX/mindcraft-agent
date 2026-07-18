import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SURFACE_STATE, normalizeSurfaceState } from '../packages/agent/src/workbench/surfaceState.mjs'

test('surface state defaults to the active routed page', () => {
  assert.deepEqual(normalizeSurfaceState(), DEFAULT_SURFACE_STATE)
})

test('hidden surfaces cannot remain active', () => {
  assert.deepEqual(normalizeSurfaceState({ visible: false, active: true, groupId: 'secondary' }), {
    visible: false,
    active: false,
    groupId: 'secondary',
  })
})

test('surface state rejects invalid group identity', () => {
  assert.deepEqual(normalizeSurfaceState({ visible: true, active: false, groupId: 42 }), {
    visible: true,
    active: false,
    groupId: 'route',
  })
})
