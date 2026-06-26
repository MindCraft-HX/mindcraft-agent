export function isAbsoluteFilePath(value = '') {
  const candidate = String(value || '').trim()
  if (!candidate) return false
  if (/^file:\/\//i.test(candidate)) return true
  if (/^\/[a-zA-Z]:[\\/]/.test(candidate)) return true
  // Windows absolute path (D:\) / UNC (\\server) / Unix absolute path (/home/...)
  return /^[a-zA-Z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate) || /^\/(?!\/)./.test(candidate)
}

export function normalizeLocalPathHref(value = '') {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  if (/^file:\/\//i.test(candidate)) {
    return candidate.replace(/^file:\/\/\/?/i, '')
  }
  if (/^\/[a-zA-Z]:[\\/]/.test(candidate)) {
    return candidate.slice(1)
  }
  return candidate
}

export function isStrongLocalPathCandidate(text = '') {
  const value = String(text || '').trim()
  if (!value) return false
  if (isAbsoluteFilePath(value)) return true
  const normalized = value.replace(/\\/g, '/')
  if (/^\.{1,2}\//.test(normalized)) return true
  // Known project directory prefixes.
  if (/^(docs|src|electron|tests|build|packages|docs\/plan|lib|dist|config|scripts|app|public|assets)\//.test(normalized)) return true
  // Fallback: directory/file with common source/document extension.
  // The minimum directory length filters out prose like "he/she.go".
  return /^[a-zA-Z_][\w.-]{2,}\/[^\s]+\.(?:tsx?|jsx?|cjs|mjs|vue|py|rb|java|go|rs|c|cc|cpp|h|hpp|css|scss|less|html?|xml|ya?ml|json|toml|ini|conf|env|sh|ps1|bat|cmd|sql|md|txt|log|svg|png|jpe?g|gif|ico|pdf)$/i.test(normalized)
}

export function trimLocalPathCandidate(value = '') {
  return String(value || '')
    .trim()
    .replace(/^[`'"\u2018\u2019\u201c\u201d]+/g, '')
    .replace(/[`'"\u2018\u2019\u201c\u201d)>.,;:\u3002\uff0c\uff1b\uff1a\u3001\uff09\u3011\u300b]+$/g, '')
}

const LOCAL_PATH_CANDIDATE_RE = /(^|[\s(\[:：])((?:file:\/\/\/?[^\s<>"')\]]+)|(?:[a-zA-Z]:[\\/][^\s<>"')\]]+)|(?:\\\\[^\s<>"')\]]+)|(?:\/[^\s<>"')\]]+)|(?:(?:docs|src|electron|tests|build|packages|docs\/plan|lib|dist|config|scripts|app|public|assets)(?:[\\/][^\s<>"')\]]+)+)|(?:(?:[a-zA-Z_][\w.-]*)(?:[\\/][^\s<>"')\]]+)*[\\/][^\s<>"')\]]+\.[a-zA-Z]{1,6})|(?:\.{1,2}[\\/][^\s<>"')\]]+))/g

export function splitLocalPathText(input = '') {
  const source = String(input || '')
  const segments = []
  let lastIndex = 0

  for (const match of source.matchAll(LOCAL_PATH_CANDIDATE_RE)) {
    const fullMatch = match[0]
    const prefix = match[1] || ''
    const candidate = match[2] || ''
    const matchIndex = match.index || 0
    const cleanCandidate = trimLocalPathCandidate(candidate)
    if (!cleanCandidate || !isStrongLocalPathCandidate(cleanCandidate)) continue

    const candidateOffset = matchIndex + prefix.length
    if (candidateOffset > lastIndex) {
      segments.push({ type: 'text', content: source.slice(lastIndex, candidateOffset) })
    }

    segments.push({ type: 'path', content: cleanCandidate, candidate: cleanCandidate })

    const suffix = candidate.slice(cleanCandidate.length)
    if (suffix) {
      segments.push({ type: 'text', content: suffix })
    }
    lastIndex = matchIndex + fullMatch.length
  }

  if (lastIndex < source.length) {
    segments.push({ type: 'text', content: source.slice(lastIndex) })
  }

  return segments.length ? segments : [{ type: 'text', content: source }]
}
