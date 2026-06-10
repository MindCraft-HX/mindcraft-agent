const MARKDOWN_EXTS = new Set(['md', 'markdown'])
const CODE_TEXT_EXTS = new Set([
  'txt', 'js', 'ts', 'jsx', 'tsx', 'vue', 'json',
  'css', 'scss', 'less', 'xml', 'yml', 'yaml', 'log',
])
const HTML_EXTS = new Set(['html', 'htm'])
const PDF_EXTS = new Set(['pdf'])

export function inferDocumentExtension(filePath = '') {
  const value = String(filePath || '').trim()
  if (!value) return ''
  const normalized = value.replace(/[?#].*$/, '')
  const name = normalized.split(/[\\/]/).pop() || normalized
  const idx = name.lastIndexOf('.')
  if (idx < 0 || idx === name.length - 1) return ''
  return name.slice(idx + 1).toLowerCase()
}

export function resolveDocumentViewerType({ filePath = '' } = {}) {
  const ext = inferDocumentExtension(filePath)
  if (MARKDOWN_EXTS.has(ext)) return 'markdown'
  if (CODE_TEXT_EXTS.has(ext)) return 'code'
  if (HTML_EXTS.has(ext)) return 'html'
  if (PDF_EXTS.has(ext)) return 'pdf'
  return 'unsupported'
}

export function isPreviewableDocument(payload = {}) {
  return resolveDocumentViewerType(payload) !== 'unsupported'
}

export function getDocumentAcceptExtensions() {
  return [
    ...MARKDOWN_EXTS,
    ...CODE_TEXT_EXTS,
    ...HTML_EXTS,
    ...PDF_EXTS,
  ]
}
