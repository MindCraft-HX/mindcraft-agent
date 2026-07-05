import hljs from 'highlight.js/lib/common'
import { rcProbeStart } from './utils/renderContentProbe.mjs'
import {
  isAbsoluteFilePath,
  isStrongLocalPathCandidate,
  normalizeLocalPathHref,
  splitLocalPathText,
  trimLocalPathCandidate,
} from './markdown/localPathTokenizer.js'
export { markdownItLocalPathPlugin } from './markdown/localPathPlugin.js'

const EXT_LANG_MAP = {
  py: 'python', js: 'javascript', ts: 'typescript', tsx: 'typescript',
  jsx: 'javascript', vue: 'xml', html: 'html', css: 'css', json: 'json',
  sh: 'bash', bash: 'bash', md: 'markdown', yaml: 'yaml', yml: 'yaml',
  rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c', cs: 'csharp',
  rb: 'ruby', sql: 'sql', xml: 'xml', svg: 'xml', toml: 'ini', ini: 'ini',
  php: 'php', swift: 'swift', kt: 'kotlin', scala: 'scala',
}

function getPathContext(target) {
  const container = target?.closest?.('[data-path-context-cwd]')
  return {
    cwd: container?.getAttribute?.('data-path-context-cwd') || '',
    workspaceRoot: container?.getAttribute?.('data-path-context-workspace-root') || '',
    source: container?.getAttribute?.('data-path-context-source') || '',
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
  if (result.reason === 'outside-workspace-absolute-path') return 'Absolute paths outside the workspace are blocked'
  if (result.openMode === 'system-default' && result.shellResult) return result.shellResult
  return '文档打开失败'
}

async function openPathCandidateFromElement(target, source = '') {
  const rawText = target?.getAttribute?.('data-path-candidate') || ''
  if (!rawText) return
  const context = getPathContext(target)
  const result = await window.electronAPI?.openDocumentCandidate?.({
    rawText,
    workspaceRoot: context.workspaceRoot,
    cwd: context.cwd,
    source: source || context.source || 'agent-message',
  })
  if (!result?.ok) {
    dispatchPathOpenToast(getDocumentOpenErrorMessage(result))
  }
}

function openExternalLinkFromElement(target) {
  const href = String(target?.getAttribute?.('href') || '').trim()
  if (!/^https?:\/\//i.test(href)) return false
  window.electronAPI?.openExternalWindow?.(href)
  return true
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

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__mindcraftExternalLinkBound) {
  window.__mindcraftExternalLinkBound = true
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('a.md-link[href]')
    if (!target || target.hasAttribute('data-path-candidate')) return
    if (!openExternalLinkFromElement(target)) return
    event.preventDefault()
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

function createPathCandidateAnchor(label, candidate) {
  const escapedCandidate = escapeAttr(candidate)
  return `<a class="md-link md-file-link" href="#" title="打开 ${escapedCandidate}" data-path-candidate="${escapedCandidate}">${label}</a>`
}

function createInlineCodePathCandidateAnchor(code) {
  const escapedCode = escapeHtmlPreserveEntities(code)
  const escapedCandidate = escapeAttr(code)
  return `<a class="md-link md-file-link inline-code" href="#" title="打开 ${escapedCandidate}" data-path-candidate="${escapedCandidate}">${escapedCode}</a>`
}

function linkifyStrongLocalPaths(input = '') {
  return splitLocalPathText(input).map((segment) => {
    if (segment.type !== 'path') return segment.content
    return createPathCandidateAnchor(escapeHtmlPreserveEntities(segment.content), segment.candidate)
  }).join('')
}

function linkifyHtmlTextNodes(html = '') {
  const source = String(html || '')
  const out = []
  const rawTextStack = []
  const skipTextStack = []
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g
  const rawTextTags = new Set(['script', 'style'])
  const skipTextTags = new Set(['a', 'code', 'pre', 'textarea', 'kbd', 'samp'])
  let lastIndex = 0

  for (const match of source.matchAll(tagRe)) {
    const text = source.slice(lastIndex, match.index)
    out.push(rawTextStack.length || skipTextStack.length ? text : linkifyStrongLocalPaths(text))

    const tag = match[0]
    out.push(tag)
    const tagName = String(match[1] || '').toLowerCase()
    if (tagName) {
      const isClosing = /^<\//.test(tag)
      const isSelfClosing = /\/>$/.test(tag)
      if (rawTextTags.has(tagName)) {
        if (isClosing) {
          const idx = rawTextStack.lastIndexOf(tagName)
          if (idx >= 0) rawTextStack.splice(idx, 1)
        } else if (!isSelfClosing) {
          rawTextStack.push(tagName)
        }
      } else if (skipTextTags.has(tagName)) {
        if (isClosing) {
          const idx = skipTextStack.lastIndexOf(tagName)
          if (idx >= 0) skipTextStack.splice(idx, 1)
        } else if (!isSelfClosing) {
          skipTextStack.push(tagName)
        }
      }
    }
    lastIndex = match.index + tag.length
  }

  const tail = source.slice(lastIndex)
  out.push(rawTextStack.length || skipTextStack.length ? tail : linkifyStrongLocalPaths(tail))
  return out.join('')
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
  result = result.replace(/\b([a-zA-Z_$][\w$]*)(\s*)\(/g, '<span class="hljs-title">$1</span>$2(')
  result = result.replace(/\x00HLJS_(\d+)\x00/g, (_, idx) => tokens[Number(idx)] || '')
  return result
}

function highlightCode(code, lang) {
  const trimmed = code.replace(/\n$/, '')
  try {
    if (lang && hljs.getLanguage(lang)) {
      return cachedHighlight(trimmed, lang)
    }
  } catch (_) {}
  return quickHighlight(trimmed)
}

function highlightDiffCode(code) {
  const lines = code.split('\n')
  // Detect target language from file path headers
  let detectedLang = null
  for (const line of lines) {
    const m = line.match(/^(\+\+\+|---)\s+[ab]\/(.+)$/)
    if (m) {
      const ext = (m[2] || '').split('.').pop().toLowerCase()
      if (EXT_LANG_MAP[ext]) { detectedLang = EXT_LANG_MAP[ext]; break }
    }
  }

  const out = []
  for (const line of lines) {
    if (line === '') { out.push(''); continue }
    const prefix = line[0]
    const content = line.slice(1)

    // Meta lines: @@ hunk headers
    if (/^@@\s/.test(line)) {
      out.push(`<span class="hljs-meta">${escapeHtml(line)}</span>`)
      continue
    }
    // Header lines: diff, index, ---, +++
    if (/^(diff\s|index\s|---\s|\+\+\+\s)/.test(line)) {
      out.push(`<span class="hljs-comment">${escapeHtml(line)}</span>`)
      continue
    }

    // Content lines with + / - / space prefix
    if (prefix === '+' || prefix === '-' || prefix === ' ') {
      let highlighted
      if (detectedLang && hljs.getLanguage(detectedLang)) {
        try {
          highlighted = hljs.highlight(content, { language: detectedLang }).value
        } catch (_) { highlighted = escapeHtml(content) }
      } else {
        highlighted = escapeHtml(content)
      }
      const cls = prefix === '+' ? 'addition' : prefix === '-' ? 'deletion' : ''
      const escapedPrefix = prefix === ' ' ? ' ' : escapeHtml(prefix)
      if (cls) {
        out.push(`<span class="hljs-${cls}">${escapedPrefix}${highlighted}</span>`)
      } else {
        out.push(`${escapedPrefix}${highlighted}`)
      }
    } else {
      out.push(escapeHtml(line))
    }
  }
  return out.join('\n')
}

function highlightCodePreservePathCandidates(code, lang) {
  const placeholders = []
  const protectedCode = splitLocalPathText(code).map((segment) => {
    if (segment.type !== 'path') return segment.content
    const token = `\x00MCPATH${placeholders.length}\x00`
    placeholders.push({ token, candidate: segment.candidate, label: segment.content })
    return token
  }).join('')

  let highlighted = highlightCode(protectedCode, lang)
  for (const item of placeholders) {
    const tokenHtml = escapeHtml(item.token)
    const anchor = createPathCandidateAnchor(escapeHtmlPreserveEntities(item.label), item.candidate)
    highlighted = highlighted.split(tokenHtml).join(anchor)
  }
  return highlighted
}

function renderInline(text) {
  if (!text) return ''
  let s = escapeHtmlPreserveEntities(text)
  const inlineCodeTokens = []

  s = s.replace(/\\([*_~`#\[\]()!\\])/g, (_, ch) => ch)
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `\x00MCINLINECODE${inlineCodeTokens.length}\x00`
    inlineCodeTokens.push(
      isStrongLocalPathCandidate(code)
        ? createInlineCodePathCandidateAnchor(code)
        : `<code class="inline-code">${code}</code>`
    )
    return token
  })
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  s = s.replace(/(^|[^\w\u4e00-\u9fa5])_([^_\n]+)_(?=($|[^\w\u4e00-\u9fa5]))/g, '$1<em>$2</em>')
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
  s = s.replace(/\x00MCINLINECODE(\d+)\x00/g, (_, idx) => inlineCodeTokens[Number(idx)] || '')

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
    if (!/^:?-{1,}:?$/.test(part.replace(/\s+/g, ''))) return null
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
    if (item.blocks?.length) {
      inner += item.blocks.join('')
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

function isTableLine(line) {
  const cells = splitTableRow(line.trim())
  return cells.length >= 2
}

function findNextNonEmptyLine(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim()) return i
  }
  return -1
}

function isOrderedListLine(line) {
  return /^\s*\d+\.\s+.+/.test(line)
}

function isTaskListLine(line) {
  return /^\s*[-*]\s+\[([ xX])\]\s+/.test(line)
}

function isBulletListLine(line) {
  return /^\s*[-*]\s+.+/.test(line)
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
      items.push({ text: orderedItem[2], task: false, checked: false, paragraphs: [], blocks: [], order: Number(orderedItem[1]) })
    } else if (taskItem) {
      items.push({ text: taskItem[2], task: true, checked: taskItem[1].toLowerCase() === 'x', paragraphs: [], blocks: [] })
    } else if (bulletItem) {
      items.push({ text: bulletItem[1], task: false, checked: false, paragraphs: [], blocks: [] })
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

      if (continuationIndent > baseIndent) {
        const normalizedContinuation = continuationLine.slice(Math.min(continuationIndent, baseIndent + 3))
        const fence = normalizedContinuation.trim().match(/^```([\w-]+)?\s*$/)
        if (fence) {
          const lang = (fence[1] || '').trim()
          const codeLines = []
          i += 1
          while (i < lines.length) {
            const codeLine = lines[i]
            const codeIndent = codeLine.match(/^(\s*)/)[1].length
            const normalizedCodeLine = codeIndent > baseIndent
              ? codeLine.slice(Math.min(codeIndent, baseIndent + 3))
              : codeLine
            if (normalizedCodeLine.trim().startsWith('```')) break
            codeLines.push(normalizedCodeLine)
            i += 1
          }
          const code = codeLines.join('\n')
          const highlighted = lang === 'diff'
            ? highlightDiffCode(code)
            : highlightCodePreservePathCandidates(code, lang)
          const langLabel = lang || 'text'
          items[items.length - 1].blocks.push(
            `<div class="code-block"><div class="code-header"><span class="code-lang">${escapeHtml(langLabel)}</span></div><pre><code class="hljs">${highlighted}</code></pre></div>`
          )
          i += 1
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

/**
 * 渲染 Markdown 文本为 HTML。
 * @param {string} text   - Markdown 原文
 * @param {string} [label] - 探针标签（可选），用于 T176 renderContent 性能分析
 */
export function renderContent(text, label) {
  if (!text) return ''

  // T179 Phase 3: 文本→HTML 缓存 — renderContent 是纯函数，同 text 总是同 HTML
  const cached = renderCache.get(text)
  if (cached) return cached

  const stopProbe = label ? rcProbeStart(label, text.length) : null
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
      const highlighted = lang === 'diff'
        ? highlightDiffCode(code)
        : highlightCodePreservePathCandidates(code, lang)
      const langLabel = lang || 'text'
      out.push(
        `<div class="code-block"><div class="code-header"><span class="code-lang">${escapeHtml(langLabel)}</span></div><pre><code class="hljs">${highlighted}</code></pre></div>`
      )
      continue
    }

    const headerCells = splitTableRow(trimmed)
    if (headerCells.length >= 2 && i + 1 < lines.length) {
      const nextTrimmed = (lines[i + 1] || '').trim()
      const aligns = parseTableAlignments(nextTrimmed)
      if (aligns && aligns.length === headerCells.length) {
        const headers = headerCells
        let j = i + 2
        const rows = []
        while (j < lines.length) {
          const rowCells = splitTableRow(lines[j].trim())
          if (rowCells.length !== headerCells.length) break
          rows.push(rowCells)
          j += 1
        }
        out.push(renderTable(headers, aligns, rows))
        i = j - 1
        continue
      }
    }

    if (isOrderedListLine(line) || isTaskListLine(line) || isBulletListLine(line)) {
      const { html, nextIdx } = renderNestedList(lines, i)
      // 防御：空列表项（如 "- " / "1. " 无内容）会导致 renderNestedList 不前进，
      // nextIdx === i 时回退 i 会造成死循环 → 整个应用卡死。
      if (nextIdx > i) {
        out.push(html)
        i = nextIdx - 1
        continue
      }
      // 退化为普通段落处理（不 continue，继续往下走）
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
        isTableLine(lookTrimmed) ||
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

  const result = `<div class="agent-markdown">${out.join('')}</div>`
  if (renderCache.size >= RENDER_CACHE_MAX) {
    renderCache.delete(renderCache.keys().next().value)
  }
  renderCache.set(text, result)
  if (stopProbe) stopProbe()
  return result
}

export { escapeHtml }
export {
  getDocumentOpenErrorMessage,
  openPathCandidateFromElement,
  isAbsoluteFilePath,
  isStrongLocalPathCandidate,
  normalizeLocalPathHref,
  trimLocalPathCandidate,
  splitLocalPathText,
  linkifyStrongLocalPaths,
  linkifyHtmlTextNodes,
  createPathCandidateAnchor,
}

const hljsCache = new Map()
const HLJS_CACHE_LIMIT = 2000

// T179 Phase 3: renderContent 文本→HTML 缓存（FIFO eviction via Map insertion order）
const renderCache = new Map()
const RENDER_CACHE_MAX = 800

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
  return cachedHighlight(code, EXT_LANG_MAP[ext])
}
