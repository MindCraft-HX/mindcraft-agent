function countIndent(text = '') {
  const match = String(text || '').match(/^[\t ]*/)
  if (!match) return 0
  return match[0].replace(/\t/g, '  ').length
}

function isClosingBoundary(text = '') {
  const trimmed = String(text || '').trim()
  return /^[\]\)\}]+[;,]?$/.test(trimmed)
}

function splitHtmlTokens(html = '') {
  const tokens = []
  const source = String(html || '')
  let index = 0
  while (index < source.length) {
    if (source[index] === '<') {
      const closeIndex = source.indexOf('>', index)
      if (closeIndex < 0) {
        tokens.push({ type: 'text', value: source.slice(index) })
        break
      }
      tokens.push({ type: 'tag', value: source.slice(index, closeIndex + 1) })
      index = closeIndex + 1
      continue
    }

    const nextTagIndex = source.indexOf('<', index)
    const endIndex = nextTagIndex < 0 ? source.length : nextTagIndex
    tokens.push({ type: 'text', value: source.slice(index, endIndex) })
    index = endIndex
  }
  return tokens
}

export function buildIndentFoldRanges(lines = []) {
  const ranges = []
  if (!Array.isArray(lines) || lines.length < 2) return ranges

  for (let index = 0; index < lines.length - 1; index++) {
    const current = lines[index]
    const next = lines[index + 1]
    if (!current || !next) continue

    const currentIndent = countIndent(current.text)
    const nextIndent = countIndent(next.text)
    if (nextIndent <= currentIndent) continue

    let endIndex = lines.length - 1
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const candidateIndent = countIndent(lines[cursor].text)
      if (cursor > index + 1 && candidateIndent <= currentIndent) {
        endIndex = isClosingBoundary(lines[cursor].text) ? cursor : cursor - 1
        break
      }
    }

    if (endIndex > index) {
      ranges.push({
        startLineNumber: Number(current.number || index + 1),
        endLineNumber: Number(lines[endIndex].number || endIndex + 1),
      })
    }
  }

  return ranges
}

export function findEnclosingFoldStarts(ranges = [], lineNumber = 0) {
  const target = Number(lineNumber || 0)
  return ranges
    .filter(range => target > range.startLineNumber && target <= range.endLineNumber)
    .map(range => range.startLineNumber)
    .sort((a, b) => a - b)
}

export function applyCollapsedRanges(lines = [], ranges = [], collapsedStarts = new Set()) {
  if (!Array.isArray(lines) || !lines.length) return []

  const rangeMap = new Map(ranges.map(range => [range.startLineNumber, range]))
  const display = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const range = rangeMap.get(line.number)
    if (range && collapsedStarts.has(line.number)) {
      display.push({
        kind: 'fold',
        line,
        hiddenCount: Math.max(0, range.endLineNumber - range.startLineNumber),
        endLineNumber: range.endLineNumber,
        range,
      })
      while (index + 1 < lines.length && Number(lines[index + 1].number) <= range.endLineNumber) {
        index += 1
      }
      continue
    }

    display.push({
      kind: 'line',
      line,
      range,
    })
  }

  return display
}

export function highlightHtmlMatches(html = '', ranges = []) {
  if (!html || !Array.isArray(ranges) || !ranges.length) return String(html || '')

  const normalizedRanges = [...ranges]
    .map(range => ({
      start: Number(range.start),
      end: Number(range.end),
    }))
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((a, b) => a.start - b.start)

  if (!normalizedRanges.length) return String(html || '')

  const tokens = splitHtmlTokens(html)
  let visibleIndex = 0
  let rangeIndex = 0
  let active = false
  let result = ''

  for (const token of tokens) {
    if (token.type === 'tag') {
      result += token.value
      continue
    }

    const text = token.value
    let cursor = 0
    while (cursor < text.length) {
      while (rangeIndex < normalizedRanges.length && visibleIndex >= normalizedRanges[rangeIndex].end) {
        if (active) {
          result += '</mark>'
          active = false
        }
        rangeIndex += 1
      }

      const currentRange = normalizedRanges[rangeIndex]
      const inRange = currentRange && visibleIndex >= currentRange.start && visibleIndex < currentRange.end
      if (inRange && !active) {
        result += '<mark class="code-search-hit">'
        active = true
      }
      if (!inRange && active) {
        result += '</mark>'
        active = false
      }

      if (text[cursor] === '&') {
        const semicolonIndex = text.indexOf(';', cursor)
        if (semicolonIndex > cursor) {
          result += text.slice(cursor, semicolonIndex + 1)
          cursor = semicolonIndex + 1
          visibleIndex += 1
          continue
        }
      }

      result += text[cursor]
      cursor += 1
      visibleIndex += 1
    }
  }

  if (active) {
    result += '</mark>'
  }

  return result
}
