import hljs from 'highlight.js/lib/common'

const DEFER_HIGHLIGHT_CHAR_THRESHOLD = 12000
const DEFER_HIGHLIGHT_LINE_THRESHOLD = 400
const LARGE_FILE_CHAR_THRESHOLD = 150000
const LARGE_FILE_LINE_THRESHOLD = 5000

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeText(text = '') {
  return String(text || '').replace(/\r\n/g, '\n')
}

function splitDisplayLines(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) return []
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return ['']
  return trimmed.split('\n')
}

function inferLanguage(filePath = '') {
  const ext = String(filePath || '').split('.').pop().toLowerCase()
  const langMap = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    vue: 'xml',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    sh: 'bash',
    bash: 'bash',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    rb: 'ruby',
    xml: 'xml',
    log: 'plaintext',
    txt: 'plaintext',
  }
  return langMap[ext] || ''
}

function highlightSource(text = '', filePath = '') {
  const normalized = normalizeText(text)
  const lang = inferLanguage(filePath)
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(normalized, { language: lang }).value
    }
  } catch (_) {}
  return escapeHtml(normalized)
}

function normalizeLineHtml(lineHtml = '') {
  return lineHtml || '&nbsp;'
}

export function shouldDeferCodeHighlight(text = '') {
  const normalized = normalizeText(text)
  if (normalized.length >= DEFER_HIGHLIGHT_CHAR_THRESHOLD) return true
  return splitDisplayLines(normalized).length >= DEFER_HIGHLIGHT_LINE_THRESHOLD
}

export function buildCodeViewModel({
  text = '',
  filePath = '',
  ext = '',
  highlightedText = '',
} = {}) {
  const normalizedText = normalizeText(text)
  const linesText = splitDisplayLines(normalizedText)
  const lineCount = linesText.length
  const charCount = normalizedText.endsWith('\n') ? normalizedText.length - 1 : normalizedText.length
  const byteSize = new TextEncoder().encode(normalizedText).length
  const extLabel = String(ext || 'text').toUpperCase()
  const isLargeFile = charCount >= LARGE_FILE_CHAR_THRESHOLD || lineCount >= LARGE_FILE_LINE_THRESHOLD
  const deferHighlight = shouldDeferCodeHighlight(normalizedText)

  let lineHtmlList = []
  if (highlightedText) {
    lineHtmlList = String(highlightedText).split('\n')
  } else if (!deferHighlight) {
    lineHtmlList = highlightSource(normalizedText, filePath).split('\n')
  }

  const lines = linesText.map((lineText, index) => ({
    number: index + 1,
    numberText: String(index + 1),
    text: lineText,
    html: normalizeLineHtml(lineHtmlList[index] || escapeHtml(lineText)),
  }))

  return {
    extLabel,
    lineCount,
    charCount,
    byteSize,
    isLargeFile,
    shouldDeferHighlight: deferHighlight,
    lines,
  }
}
