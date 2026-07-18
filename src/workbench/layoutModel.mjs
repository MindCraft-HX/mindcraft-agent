export const WORKBENCH_LAYOUT_VERSION = 1
export const PRIMARY_GROUP_ID = 'group-primary'
export const SECONDARY_GROUP_ID = 'group-secondary'
export const MAX_WORKBENCH_ITEMS = 20
export const MAX_DOCUMENT_ITEMS = 16

const ITEM_TYPES = new Set(['agent', 'document', 'chat', 'document-home'])
const SINGLETON_ITEM_IDS = new Set(['agent:codehub', 'chat:simple', 'document:home'])
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function uniqueStrings(values, limit = MAX_WORKBENCH_ITEMS) {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string' || !value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function clampSize(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(0.8, Math.max(0.2, numeric))
}

function isSafeItemId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !UNSAFE_OBJECT_KEYS.has(value)
}

function normalizeItem(itemId, raw) {
  if (!isSafeItemId(itemId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!ITEM_TYPES.has(raw.type)) return null

  const item = { type: raw.type }
  if (raw.singleton === true) item.singleton = true
  if (typeof raw.resourceId === 'string' && raw.resourceId.length <= 1024) item.resourceId = raw.resourceId
  if (typeof raw.workspaceKey === 'string' && raw.workspaceKey.length <= 1024) item.workspaceKey = raw.workspaceKey
  return item
}

function defaultGroup(id, size, itemIds = []) {
  return {
    id,
    size,
    activeItemId: itemIds[0] || null,
    itemIds,
  }
}

export function createDefaultLayout() {
  return {
    version: WORKBENCH_LAYOUT_VERSION,
    revision: 0,
    orientation: 'horizontal',
    activeGroupId: PRIMARY_GROUP_ID,
    groups: [defaultGroup(PRIMARY_GROUP_ID, 1, ['agent:codehub'])],
    items: {
      'agent:codehub': { type: 'agent', singleton: true },
    },
    inputDock: { expandedSizePx: 420 },
  }
}

export function normalizeLayout(raw) {
  const fallback = createDefaultLayout()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== WORKBENCH_LAYOUT_VERSION) return fallback

  // Dangerous keys are rejected before assignment, so a JSON-shaped object is safe here.
  const items = {}
  const rawItems = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {}
  for (const [itemId, item] of Object.entries(rawItems)) {
    const normalized = normalizeItem(itemId, item)
    if (!normalized) continue
    items[itemId] = normalized
    if (Object.keys(items).length >= MAX_WORKBENCH_ITEMS) break
  }

  if (!items['agent:codehub']) items['agent:codehub'] = { type: 'agent', singleton: true }

  const documents = Object.entries(items).filter(([, item]) => item.type === 'document')
  for (const [itemId] of documents.slice(MAX_DOCUMENT_ITEMS)) delete items[itemId]

  const validIds = new Set(Object.keys(items))
  const rawGroups = Array.isArray(raw.groups) ? raw.groups : []
  const byId = new Map(rawGroups.filter(group => group && typeof group === 'object').map(group => [group.id, group]))
  const primaryRaw = byId.get(PRIMARY_GROUP_ID)
  const secondaryRaw = byId.get(SECONDARY_GROUP_ID)
  const claimed = new Set()

  function normalizeGroup(id, size, source) {
    const itemIds = uniqueStrings(source?.itemIds).filter(itemId => validIds.has(itemId) && !claimed.has(itemId))
    itemIds.forEach(itemId => claimed.add(itemId))
    const activeItemId = itemIds.includes(source?.activeItemId) ? source.activeItemId : itemIds[0] || null
    return { id, size: clampSize(source?.size, size), activeItemId, itemIds }
  }

  const primary = normalizeGroup(PRIMARY_GROUP_ID, 1, primaryRaw)
  if (!primary.itemIds.includes('agent:codehub')) {
    primary.itemIds.unshift('agent:codehub')
    claimed.add('agent:codehub')
    if (!primary.activeItemId) primary.activeItemId = 'agent:codehub'
  }
  const secondary = normalizeGroup(SECONDARY_GROUP_ID, 0.38, secondaryRaw)
  const groups = [primary]
  if (secondary.itemIds.length) {
    primary.size = clampSize(primaryRaw?.size, 0.62)
    groups.push(secondary)
  } else {
    primary.size = 1
  }

  const activeGroupId = groups.some(group => group.id === raw.activeGroupId)
    ? raw.activeGroupId
    : PRIMARY_GROUP_ID
  const expandedSizePx = Math.min(900, Math.max(240, Number(raw.inputDock?.expandedSizePx) || 420))

  return {
    version: WORKBENCH_LAYOUT_VERSION,
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    orientation: 'horizontal',
    activeGroupId,
    groups,
    items,
    inputDock: { expandedSizePx },
  }
}

// Main process uses this through a narrow IPC adapter before persisting a
// renderer descriptor. Normalization also drops unsafe or oversized entries.
export function validatePersistedLayout(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== WORKBENCH_LAYOUT_VERSION) {
    return null
  }
  return normalizeLayout(raw)
}

function nextLayout(layout) {
  const next = clone(normalizeLayout(layout))
  next.revision += 1
  return next
}

function getGroup(layout, groupId) {
  return layout.groups.find(group => group.id === groupId) || null
}

function itemGroup(layout, itemId) {
  return layout.groups.find(group => group.itemIds.includes(itemId)) || null
}

function ensureSecondary(layout) {
  let group = getGroup(layout, SECONDARY_GROUP_ID)
  if (group) return group
  const primary = getGroup(layout, PRIMARY_GROUP_ID)
  primary.size = 0.62
  group = defaultGroup(SECONDARY_GROUP_ID, 0.38)
  layout.groups.push(group)
  return group
}

function mergeSecondary(layout) {
  const secondary = getGroup(layout, SECONDARY_GROUP_ID)
  if (!secondary || secondary.itemIds.length) return
  layout.groups = layout.groups.filter(group => group.id !== SECONDARY_GROUP_ID)
  const primary = getGroup(layout, PRIMARY_GROUP_ID)
  primary.size = 1
  layout.activeGroupId = PRIMARY_GROUP_ID
}

export function openItem(layout, itemId, item, { target = 'active' } = {}) {
  if (!isSafeItemId(itemId)) return normalizeLayout(layout)
  const next = nextLayout(layout)
  const normalizedItem = normalizeItem(itemId, item)
  if (!normalizedItem) return normalizeLayout(layout)
  const existingItem = next.items[itemId]
  if (existingItem && existingItem.type !== normalizedItem.type) return normalizeLayout(layout)
  if (!existingItem && Object.keys(next.items).length >= MAX_WORKBENCH_ITEMS) return normalizeLayout(layout)
  if (!existingItem && normalizedItem.type === 'document') {
    const count = Object.values(next.items).filter(value => value.type === 'document').length
    if (count >= MAX_DOCUMENT_ITEMS) return normalizeLayout(layout)
  }
  next.items[itemId] = existingItem || normalizedItem

  const existingGroup = itemGroup(next, itemId)
  if (existingGroup) {
    next.activeGroupId = existingGroup.id
    existingGroup.activeItemId = itemId
    return next
  }

  const group = target === 'beside'
    ? ensureSecondary(next)
    : (getGroup(next, next.activeGroupId) || getGroup(next, PRIMARY_GROUP_ID))
  group.itemIds.push(itemId)
  group.activeItemId = itemId
  next.activeGroupId = group.id
  return next
}

export function moveItem(layout, itemId, targetGroupId) {
  const next = nextLayout(layout)
  if (targetGroupId !== PRIMARY_GROUP_ID && targetGroupId !== SECONDARY_GROUP_ID) return normalizeLayout(layout)
  const source = itemGroup(next, itemId)
  if (!source || source.id === targetGroupId) return next
  const target = targetGroupId === SECONDARY_GROUP_ID ? ensureSecondary(next) : getGroup(next, PRIMARY_GROUP_ID)
  if (source.itemIds.length === 1 && source.id === PRIMARY_GROUP_ID) return next

  source.itemIds = source.itemIds.filter(id => id !== itemId)
  source.activeItemId = source.itemIds.includes(source.activeItemId) ? source.activeItemId : source.itemIds[0] || null
  target.itemIds.push(itemId)
  target.activeItemId = itemId
  next.activeGroupId = target.id
  mergeSecondary(next)
  return next
}

export function closeItem(layout, itemId) {
  const next = nextLayout(layout)
  if (SINGLETON_ITEM_IDS.has(itemId)) return normalizeLayout(layout)
  const group = itemGroup(next, itemId)
  if (!group) return next

  group.itemIds = group.itemIds.filter(id => id !== itemId)
  group.activeItemId = group.itemIds.includes(group.activeItemId) ? group.activeItemId : group.itemIds[0] || null
  delete next.items[itemId]
  if (group.id === PRIMARY_GROUP_ID && !group.itemIds.length) {
    group.itemIds.push('agent:codehub')
    group.activeItemId = 'agent:codehub'
  }
  mergeSecondary(next)
  return next
}

export function mergeSecondaryGroup(layout) {
  const next = nextLayout(layout)
  const primary = getGroup(next, PRIMARY_GROUP_ID)
  const secondary = getGroup(next, SECONDARY_GROUP_ID)
  if (!secondary) return next
  primary.itemIds.push(...secondary.itemIds.filter(itemId => !primary.itemIds.includes(itemId)))
  primary.activeItemId = secondary.activeItemId || primary.activeItemId
  next.groups = [primary]
  primary.size = 1
  next.activeGroupId = PRIMARY_GROUP_ID
  return next
}

export function resolveSurfaceStates(layout, { isParked = false } = {}) {
  const normalized = normalizeLayout(layout)
  const states = {}
  for (const group of normalized.groups) {
    for (const itemId of group.itemIds) {
      states[itemId] = {
        visible: !isParked || group.id === PRIMARY_GROUP_ID,
        active: !isParked && normalized.activeGroupId === group.id && group.activeItemId === itemId,
        groupId: group.id,
      }
    }
  }
  return states
}
