'use strict'

const VERSION = 1
const PRIMARY_GROUP_ID = 'group-primary'
const SECONDARY_GROUP_ID = 'group-secondary'
const ITEM_TYPES = new Set(['agent', 'document', 'chat', 'document-home'])
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function safeString(value, limit = 1024) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && !UNSAFE_KEYS.has(value)
}

function validateItem(itemId, raw) {
  if (!safeString(itemId) || !raw || typeof raw !== 'object' || Array.isArray(raw) || !ITEM_TYPES.has(raw.type)) return null
  const item = { type: raw.type }
  if (raw.singleton === true) item.singleton = true
  if (safeString(raw.resourceId)) item.resourceId = raw.resourceId
  if (safeString(raw.workspaceKey)) item.workspaceKey = raw.workspaceKey
  return item
}

function validateGroup(raw, expectedId, itemIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.id !== expectedId) return null
  const maxSize = expectedId === PRIMARY_GROUP_ID ? 1 : 0.8
  if (!Number.isFinite(raw.size) || raw.size < 0.2 || raw.size > maxSize || !Array.isArray(raw.itemIds)) return null
  const ids = []
  for (const itemId of raw.itemIds) {
    if (!safeString(itemId) || !itemIds.has(itemId) || ids.includes(itemId)) return null
    ids.push(itemId)
  }
  if (ids.length > 20 || (raw.activeItemId !== null && !ids.includes(raw.activeItemId))) return null
  return { id: expectedId, size: raw.size, activeItemId: raw.activeItemId, itemIds: ids }
}

/** Strict main-process schema for persisted renderer descriptors. */
function validateWorkbenchLayout(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== VERSION || raw.orientation !== 'horizontal') return null
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0 || !raw.items || typeof raw.items !== 'object' || Array.isArray(raw.items)) return null
  if (!Array.isArray(raw.groups) || raw.groups.length < 1 || raw.groups.length > 2) return null
  if (!raw.inputDock || !Number.isFinite(raw.inputDock.expandedSizePx) || raw.inputDock.expandedSizePx < 240 || raw.inputDock.expandedSizePx > 900) return null

  const items = {}
  for (const [itemId, item] of Object.entries(raw.items)) {
    const normalized = validateItem(itemId, item)
    if (!normalized || Object.keys(items).length >= 20) return null
    items[itemId] = normalized
  }
  if (!items['agent:codehub'] || items['agent:codehub'].type !== 'agent') return null
  const documentCount = Object.values(items).filter(item => item.type === 'document').length
  if (documentCount > 16) return null

  const itemIds = new Set(Object.keys(items))
  const primary = validateGroup(raw.groups[0], PRIMARY_GROUP_ID, itemIds)
  const secondary = raw.groups.length === 2 ? validateGroup(raw.groups[1], SECONDARY_GROUP_ID, itemIds) : null
  if (!primary || (raw.groups.length === 2 && (!secondary || secondary.itemIds.length === 0))) return null
  if (!primary.itemIds.includes('agent:codehub')) return null
  const claimed = new Set(primary.itemIds)
  if (secondary && secondary.itemIds.some(itemId => claimed.has(itemId))) return null
  if (claimed.size + (secondary ? secondary.itemIds.length : 0) !== itemIds.size) return null
  if (raw.activeGroupId !== PRIMARY_GROUP_ID && (!secondary || raw.activeGroupId !== SECONDARY_GROUP_ID)) return null

  return {
    version: VERSION,
    revision: raw.revision,
    orientation: 'horizontal',
    activeGroupId: raw.activeGroupId,
    groups: secondary ? [primary, secondary] : [primary],
    items,
    inputDock: { expandedSizePx: raw.inputDock.expandedSizePx },
  }
}

module.exports = { validateWorkbenchLayout }
