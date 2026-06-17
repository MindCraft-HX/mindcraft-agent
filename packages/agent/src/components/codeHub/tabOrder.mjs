export function reconcileCodeHubTabOrder({
  currentOrder = [],
  visibleTabIds = [],
  pruneMissing = false,
} = {}) {
  const visible = Array.isArray(visibleTabIds)
    ? visibleTabIds.filter(id => typeof id === 'string' && id)
    : []
  const visibleSet = new Set(visible)
  const next = []
  const seen = new Set()

  for (const id of Array.isArray(currentOrder) ? currentOrder : []) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    if (!pruneMissing || visibleSet.has(id)) {
      next.push(id)
      seen.add(id)
    }
  }

  for (const id of visible) {
    if (seen.has(id)) continue
    next.push(id)
    seen.add(id)
  }

  return next
}

export function orderCodeHubTabs(tabs = [], tabOrder = []) {
  const list = Array.isArray(tabs) ? tabs : []
  const orderMap = new Map((Array.isArray(tabOrder) ? tabOrder : []).map((id, i) => [id, i]))
  return [...list].sort((a, b) => {
    const ai = orderMap.get(a?.id)
    const bi = orderMap.get(b?.id)
    if (ai != null && bi != null) return ai - bi
    if (ai != null) return -1
    if (bi != null) return 1
    return (a?.createdAt || 0) - (b?.createdAt || 0)
  })
}
