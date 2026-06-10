import hljs from 'highlight.js/lib/common'

function getPathContext(target) {
  const container = target?.closest?.('[data-path-context-cwd]')
  return {
    cwd: container?.getAttribute?.('data-path-context-cwd') || '',
    workspaceRoot: container?.getAttribute?.('data-path-context-workspace-root') || '',
  }
}

function dispatchPathOpenToast(message, type = 'warning') {
  if (typeof window === 'undefined' || !message) return
  window.dispatchEvent(new CustomEvent('mindcraft-toast', {
    detail: { type, message },
  }))
}

function getDocumentOpenErrorMessage(result) {
  if (!result) return '文档打开失败'
  if (result.reason === 'multiple-matches') return '找到多个候选文件，请补全路径后再试'
  if (result.reason === 'not-found') return '未找到对应文件，请确认路径是否正确'
  if (result.reason === 'empty-candidate') return '未识别到可打开的路径'
  if (result.openMode === 'system-default' && result.shellResult) return result.shellResult
  return '文档打开失败'
}

async function openPathCandidateFromElement(target, source = 'agent-message') {
  const rawText = target?.getAttribute?.('data-path-candidate') || ''
  if (!rawText) return
  const context = getPathContext(target)
  const result = await window.electronAPI?.openDocumentCandidate?.({
    rawText,
    workspaceRoot: context.workspaceRoot,
    cwd: context.cwd,
    source,
  })
  if (!result?.ok) {
    dispatchPathOpenToast(getDocumentOpenErrorMessage(result))
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__mindcraftPathCandidateBound) {
  window.__mindcraftPathCandidateBound = true
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-path-candidate]')
    if (!target) return
    event.preventDefault()
    void openPathCandidateFromElement(target)
  })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlPreserveEntities(str) {
  return String(str)
    .replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;')
}

function isAbsoluteFilePath(value = '') {
  const candidate = String(value || '').trim()
  if (!candidate) return false
  if (/^file:\/\//i.test(candidate)) return true
  if (/^\/[a-zA-Z]:[\\/]/.test(candidate)) return true
  return /^[a-zA-Z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate)
}

function normalizeLocalPathHref(value = '') {
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

function isStrongLocalPathCandidate(text = '') {
  const value = String(text || '').trim()
  if (!value) return false
  if (isAbsoluteFilePath(value)) return true
  const normalized = value.replace(/\\/g, '/')
  if (/^\.{1,2}\//.test(normalized)) return true
  return /^(docs|src|electron|tests|build|packages|docs\/plan)\//.test(normalized)
}

function createPathCandidateAnchor(label, candidate) {
  const escapedCandidate = escapeAttr(candidate)
  return `<a class="md-link md-file-link" href="#" title="打开 ${escapedCandidate}" data-path-candidate="${escapedCandidate}">${label}</a>`
}

function linkifyStrongLocalPaths(input = '') {
  const candidatePattern = /(^|[\s(])((?:[a-zA-Z]:[\\/][^\s<>"')\]]+)|(?:\\\\[^\s<>"')\]]+)|(?:(?:docs|src|electron|tests|build|packages)(?:[\\/][^\s<>"')\]]+)+)|(?:\.{1,2}[\\/][^\s<>"')\]]+))/g
  return String(input || '').replace(candidatePattern, (match, prefix, candidate) => {
    if (!isStrongLocalPathCandidate(candidate)) return match
    return `${prefix}${createPathCandidateAnchor(candidate, candidate)}`
  })
}

function linkifyHtmlTextNodes(html = '') {
  return String(html || '')
    .split(/(<[^>]+>)/g)
    .map((part) => part.startsWith('<') ? part : linkifyStrongLocalPaths(part))
    .join('')
}

function quickHighlight(code) {
  if (code.length < 30) return escapeHtml(code)
  let result = escapeHtml(code)
  const tokens = []
  const stash = (regex, wrap) => {
    result = result.replace(regex, (m) => {
      tokens.push(wrap(m))
      return `\x00HLJS_${tokens.length - 1}\x00`
    })
  }
  stash(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, (m) => `<span class="hljs-string">${m}</span>`)
  stash(/(\/\/.*$)/gm, (m) => `<span class="hljs-comment">${m}</span>`)
  stash(/(\/\*[\s\S]*?\*\/)/g, (m) => `<span class="hljs-comment">${m}</span>`)
  result = result.replace(
    /\b(const|let|var|function|async|await|return|if|else|for|while|class|import|export|from|new|this|try|catch|throw|switch|case|break|default|typeof|instanceof|extends|implements|interface|type|enum|void|null|undefined|true|false)\b/g,
    '<span class="hljs-keyword">$1</span>'
  )
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="hljs-number">$1</span>')
  result = result.replace(/\b([a-zA-Z_$][\w$]*)\s*\(/g, '<span class="hljs-title">$1</span>(')
  result = result.replace(/\x00HLJS_(\d+)\x00/g, (_, idx) => tokens[Number(idx)] || '')
  return result
}

function highlightCode(code, lang) {
  const trimmed = code.replace(/\n$/, '')
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(trimmed, { language: lang }).value
    }
  } catch (_) {}
  return quickHighlight(trimmed)
}

function renderInline(text) {
  if (!text) return ''
  let s = escapeHtmlPreserveEntities(text)

  s = s.replace(/\\([*_~`#\[\]()!\\])/g, (_, ch) => ch)
  s = s.replace(/`([^`\n]+)`/g, (_, code) => `<code class="inline-code">${code}</code>`)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>')
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>')
  s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (_, alt, src) =>
    `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="md-img" loading="lazy">`
  )
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const normalizedHref = String(href || '').trim()
    if (/^https?:\/\//i.test(normalizedHref)) {
      return `<a class="md-link" href="${escapeAttr(normalizedHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    }
    const localHref = normalizeLocalPathHref(normalizedHref)
    if (isAbsoluteFilePath(normalizedHref) || isStrongLocalPathCandidate(localHref)) {
      return createPathCandidateAnchor(label, localHref || normalizedHref)
    }
    if (isStrongLocalPathCandidate(normalizedHref)) {
      return createPathCandidateAnchor(label, normalizedHref)
    }
    return `<a class="md-link" href="${escapeAttr(normalizedHref)}">${label}</a>`
  })
  s = s.replace(/(?<![="'>])(https?:\/\/[^\s<>"')\]]+)/gi, (url) =>
    `<a class="md-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`
  )
  s = linkifyHtmlTextNodes(s)

  return s
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let current = ''
  let escaped = false
  for (const ch of trimmed) {
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      current += ch
      continue
    }
    if (ch === '|') {
      cells.push(current.trim().replace(/\\\|/g, '|'))
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim().replace(/\\\|/g, '|'))
  return cells
}

function parseTableAlignments(line) {
  const parts = splitTableRow(line)
  if (!parts.length) return null
  const aligns = []
  for (const part of parts) {
    if (!/^:?-{3,}:?$/.test(part.replace(/\s+/g, ''))) return null
    const compact = part.replace(/\s+/g, '')
    let align = ''
    if (compact.startsWith(':') && compact.endsWith(':')) align = 'center'
    else if (compact.endsWith(':')) align = 'right'
    else if (compact.startsWith(':')) align = 'left'
    aligns.push(align)
  }
  return aligns
}

function renderTable(headers, aligns, rows) {
  const thead = `<thead><tr>${headers.map((h, idx) => {
    const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''
    return `<th${align}>${renderInline(h)}</th>`
  }).join('')}</tr></thead>`
  const tbody = `<tbody>${rows.map((row) => `<tr>${headers.map((_, idx) => {
    const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''
    return `<td${align}>${renderInline(row[idx] || '')}</td>`
  }).join('')}</tr>`).join('')}</tbody>`
  return `<div class="md-table-scroll"><div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div></div>`
}

function renderList(items, ordered) {
  const tag = ordered ? 'ol' : 'ul'
  const cls = ordered ? 'md-ol' : 'md-list'
  const start = ordered && Number.isInteger(items[0]?.order) && items[0].order > 1
    ? ` start="${items[0].order}"`
    : ''
  const body = items.map((item) => {
    let inner = renderInline(item.text)
    if (item.paragraphs?.length) {
      inner += item.paragraphs.map((paragraph) => `<p class="md-p">${renderInline(paragraph)}</p>`).join('')
    }
    if (item.subHtml) inner += item.subHtml
    if (item.task) {
      return `<li class="md-task-item"><input class="md-task-checkbox" type="checkbox" disabled${item.checked ? ' checked' : ''}><span>${inner}</span></li>`
    }
    return `<li>${inner}</li>`
  }).join('')
  const finalClass = items.some((item) => item.task) ? `${cls} md-task-list` : cls
  return `<${tag} class="${finalClass}"${start}>${body}</${tag}>`
}

function findNextNonEmptyLine(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim()) return i
  }
  return -1
}

function isOrderedListLine(line) {
  return /^\s*\d+\.\s+/.test(line)
}

function isTaskListLine(line) {
  return /^\s*[-*]\s+\[([ xX])\]\s+/.test(line)
}

function isBulletListLine(line) {
  return /^\s*[-*]\s+/.test(line)
}

function isSameListType(line, ordered) {
  if (ordered) return isOrderedListLine(line)
  return isTaskListLine(line) || isBulletListLine(line)
}

function getOrderedListNumber(line) {
  const match = line.match(/^\s*(\d+)\.\s+/)
  return match ? Number(match[1]) : null
}

function findNextBaseIndentListLine(lines, startIdx, baseIndent, ordered) {
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    const indent = lines[i].match(/^(\s*)/)[1].length
    if (indent < baseIndent) return null
    if (indent === baseIndent && isSameListType(lines[i], ordered)) {
      return { index: i, line: lines[i] }
    }
  }
  return null
}

function shouldTreatAsLooseOrderedListParagraph(lines, startIdx, baseIndent, lastOrder) {
  const nextList = findNextBaseIndentListLine(lines, startIdx, baseIndent, true)
  if (!nextList) return false
  const nextOrder = getOrderedListNumber(nextList.line)
  if (!Number.isInteger(nextOrder)) return false
  return lastOrder === 1 && nextOrder === 1
}

function renderNestedList(lines, startIdx) {
  const firstLine = lines[startIdx]
  const baseIndent = firstLine.match(/^(\s*)/)[1].length
  const ordered = isOrderedListLine(firstLine)
  const items = []
  let i = startIdx

  while (i < lines.length) {
    const line = lines[i]
    const indent = line.match(/^(\s*)/)[1].length
    const trimmed = line.trim()
    if (!trimmed) {
      const nextNonEmptyIdx = findNextNonEmptyLine(lines, i + 1)
      if (nextNonEmptyIdx === -1) break
      const nextLine = lines[nextNonEmptyIdx]
      const nextIndent = nextLine.match(/^(\s*)/)[1].length
      if (nextIndent < baseIndent) break
      if (nextIndent === baseIndent && isSameListType(nextLine, ordered)) {
        i = nextNonEmptyIdx
        continue
      }
      if (
        ordered &&
        items.length > 0 &&
        nextIndent === baseIndent &&
        shouldTreatAsLooseOrderedListParagraph(lines, nextNonEmptyIdx, baseIndent, items[items.length - 1].order || 1)
      ) {
        items[items.length - 1].paragraphs.push(lines[nextNonEmptyIdx].trim())
        i = nextNonEmptyIdx + 1
        continue
      }
      break
    }
    if (indent < baseIndent) break

    if (indent > baseIndent && items.length > 0) {
      const sub = renderNestedList(lines, i)
      if (sub.nextIdx > i) {
        items[items.length - 1].subHtml = (items[items.length - 1].subHtml || '') + sub.html
        i = sub.nextIdx
        continue
      }
      break
    }

    const orderedItem = line.match(/^\s*(\d+)\.\s+(.+)$/)
    const taskItem = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/)
    const bulletItem = line.match(/^\s*[-*]\s+(.+)$/)

    if (orderedItem) {
      items.push({ text: orderedItem[2], task: false, checked: false, paragraphs: [], order: Number(orderedItem[1]) })
    } else if (taskItem) {
      items.push({ text: taskItem[2], task: true, checked: taskItem[1].toLowerCase() === 'x', paragraphs: [] })
    } else if (bulletItem) {
      items.push({ text: bulletItem[1], task: false, checked: false, paragraphs: [] })
    } else {
      break
    }
    i++

    while (i < lines.length && items.length > 0) {
      const continuationLine = lines[i]
      const continuationTrimmed = continuationLine.trim()

      if (!continuationTrimmed) {
        const nextNonEmptyIdx = findNextNonEmptyLine(lines, i + 1)
        if (nextNonEmptyIdx === -1) {
          i = lines.length
          break
        }
        const nextIndent = lines[nextNonEmptyIdx].match(/^(\s*)/)[1].length
        if (nextIndent < baseIndent) break
        if (nextIndent === baseIndent && isSameListType(lines[nextNonEmptyIdx], ordered)) break
        if (
          !(ordered &&
            shouldTreatAsLooseOrderedListParagraph(lines, nextNonEmptyIdx, baseIndent, items[items.length - 1].order || 1))
        ) {
          break
        }
        i += 1
        continue
      }

      const continuationIndent = continuationLine.match(/^(\s*)/)[1].length
      if (continuationIndent < baseIndent) break
      if (continuationIndent === baseIndent && isSameListType(continuationLine, ordered)) break
      if (
        continuationIndent === baseIndent &&
        !(ordered &&
          shouldTreatAsLooseOrderedListParagraph(lines, i, baseIndent, items[items.length - 1].order || 1))
      ) {
        break
      }

      if (isOrderedListLine(continuationLine) || isTaskListLine(continuationLine) || isBulletListLine(continuationLine)) {
        const nested = renderNestedList(lines, i)
        if (nested.nextIdx > i) {
          items[items.length - 1].subHtml = (items[items.length - 1].subHtml || '') + nested.html
          i = nested.nextIdx
          continue
        }
      }

      const normalizedParagraph = continuationIndent > baseIndent
        ? continuationLine.slice(Math.min(continuationIndent, baseIndent + 2)).trim()
        : continuationTrimmed
      if (normalizedParagraph) {
        items[items.length - 1].paragraphs.push(normalizedParagraph)
      }
      i += 1
    }
  }

  return { html: renderList(items, ordered), nextIdx: i }
}

export function renderContent(text) {
  if (!text) return ''
  const source = String(text).replace(/\r\n/g, '\n')
  const lines = source.split('\n')
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue

    const fence = trimmed.match(/^```([\w-]+)?\s*$/)
    if (fence) {
      const lang = (fence[1] || '').trim()
      const codeLines = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      const code = codeLines.join('\n')
      const highlighted = linkifyHtmlTextNodes(highlightCode(code, lang))
      const langLabel = lang || 'text'
      out.push(
        `<div class="code-block"><div class="code-header"><span class="code-lang">${escapeHtml(langLabel)}</span></div><pre><code class="hljs">${highlighted}</code></pre></div>`
      )
      continue
    }

    const next = lines[i + 1] || ''
    if (/^\|.*\|$/.test(trimmed) && /^\|?.*\|?$/.test(next.trim())) {
      const aligns = parseTableAlignments(next)
      if (aligns) {
        const headers = splitTableRow(trimmed)
        let j = i + 2
        const rows = []
        while (j < lines.length && /^\|.*\|$/.test(lines[j].trim())) {
          rows.push(splitTableRow(lines[j].trim()))
          j += 1
        }
        out.push(renderTable(headers, aligns, rows))
        i = j - 1
        continue
      }
    }

    if (isOrderedListLine(line) || isTaskListLine(line) || isBulletListLine(line)) {
      const { html, nextIdx } = renderNestedList(lines, i)
      out.push(html)
      i = nextIdx - 1
      continue
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      out.push('<hr class="md-hr">')
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 6)
      out.push(`<h${level} class="md-h${level}">${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (/^\*\*(.+?)\*\*$/.test(trimmed)) {
      out.push(`<div class="md-strong-line">${renderInline(trimmed.slice(2, -2))}</div>`)
      continue
    }

    if (trimmed.startsWith('>')) {
      const quoteLines = []
      let j = i
      while (j < lines.length && lines[j].trim().startsWith('>')) {
        quoteLines.push(lines[j].trim().replace(/^>\s?/, ''))
        j += 1
      }
      out.push(`<blockquote class="md-blockquote">${quoteLines.map(renderInline).join('<br>')}</blockquote>`)
      i = j - 1
      continue
    }

    const paragraphLines = [line]
    let j = i + 1
    while (j < lines.length) {
      const lookahead = lines[j]
      const lookTrimmed = lookahead.trim()
      if (!lookTrimmed) break
      if (
        /^```/.test(lookTrimmed) ||
        /^\|.*\|$/.test(lookTrimmed) ||
        /^(#{1,4})\s+/.test(lookTrimmed) ||
        isBulletListLine(lookahead) ||
        isOrderedListLine(lookahead) ||
        lookTrimmed.startsWith('>') ||
        /^---+$/.test(lookTrimmed) ||
        /^\*\*\*+$/.test(lookTrimmed)
      ) break
      paragraphLines.push(lookahead)
      j += 1
    }
    out.push(`<p class="md-p">${paragraphLines.map(renderInline).join('<br>')}</p>`)
    i = j - 1
  }

  return `<div class="agent-markdown">${out.join('')}</div>`
}

export { escapeHtml }
export { getDocumentOpenErrorMessage, openPathCandidateFromElement, isStrongLocalPathCandidate }

const hljsCache = new Map()
const HLJS_CACHE_LIMIT = 2000

function cachedHighlight(code, lang) {
  const cacheKey = lang ? `${lang}:${code}` : `auto:${code}`
  if (hljsCache.has(cacheKey)) return hljsCache.get(cacheKey)
  let result
  try {
    const r = lang
      ? hljs.highlight(code, { language: lang })
      : quickHighlight(code)
    result = r.value || r
  } catch (_) {
    result = escapeHtml(code)
  }
  if (hljsCache.size >= HLJS_CACHE_LIMIT) {
    hljsCache.delete(hljsCache.keys().next().value)
  }
  hljsCache.set(cacheKey, result)
  return result
}

export function highlight(code, filePath) {
  if (!code) return ''
  const ext = (filePath || '').split('.').pop().toLowerCase()
  const langMap = {
    py: 'python', js: 'javascript', ts: 'typescript', vue: 'xml',
    html: 'html', css: 'css', json: 'json', sh: 'bash', bash: 'bash',
    md: 'markdown', yaml: 'yaml', yml: 'yaml', rs: 'rust', go: 'go',
    java: 'java', cpp: 'cpp', c: 'c', cs: 'csharp', rb: 'ruby',
  }
  return cachedHighlight(code, langMap[ext])
}
