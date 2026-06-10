export function clampLineNumber(lineNumber, lineCount) {
  const normalizedCount = Math.max(0, Number(lineCount) || 0)
  if (normalizedCount <= 0) return 1
  const numericLine = Math.floor(Number(lineNumber) || 1)
  return Math.min(Math.max(1, numericLine), normalizedCount)
}

export function findCodeMatches(lines = [], query = '') {
  const normalizedQuery = String(query || '').toLowerCase().trim()
  if (!normalizedQuery) return []

  const matches = []
  for (const line of lines) {
    const text = String(line?.text || '')
    const lower = text.toLowerCase()
    let fromIndex = 0
    while (fromIndex < lower.length) {
      const matchIndex = lower.indexOf(normalizedQuery, fromIndex)
      if (matchIndex < 0) break
      matches.push({
        lineNumber: Number(line?.number || 0),
        start: matchIndex,
        end: matchIndex + normalizedQuery.length,
      })
      fromIndex = matchIndex + normalizedQuery.length
    }
  }
  return matches
}

export function getInitialViewport({
  lineCount = 0,
  rowHeight = 22,
  viewportHeight = 440,
} = {}) {
  const safeRowHeight = Math.max(1, Number(rowHeight) || 22)
  const safeViewportHeight = Math.max(safeRowHeight, Number(viewportHeight) || 440)
  const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / safeRowHeight))
  return {
    lineCount: Math.max(0, Number(lineCount) || 0),
    rowHeight: safeRowHeight,
    viewportHeight: safeViewportHeight,
    visibleCount,
    overscan: Math.max(4, Math.min(24, Math.ceil(visibleCount * 0.4))),
  }
}

export function getVisibleWindow({
  lines = [],
  scrollTop = 0,
  rowHeight = 22,
  viewportHeight = 440,
  overscan = 8,
} = {}) {
  const total = Array.isArray(lines) ? lines.length : 0
  const safeRowHeight = Math.max(1, Number(rowHeight) || 22)
  const safeViewportHeight = Math.max(safeRowHeight, Number(viewportHeight) || 440)
  const safeOverscan = Math.max(0, Number(overscan) || 0)
  const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / safeRowHeight))
  const firstVisibleIndex = Math.max(0, Math.floor((Number(scrollTop) || 0) / safeRowHeight))
  const startIndex = Math.max(0, firstVisibleIndex - safeOverscan)
  const endIndex = Math.min(total - 1, firstVisibleIndex + visibleCount + safeOverscan)

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * safeRowHeight,
    offsetBottom: Math.max(0, (total - endIndex - 1) * safeRowHeight),
    items: total > 0 ? lines.slice(startIndex, endIndex + 1) : [],
  }
}
