import { inferDocumentExtension, resolveDocumentViewerType } from './viewerRegistry.mjs'

export function getDisplayName(payload = {}, fallback = '预览') {
  if (payload.name) return String(payload.name)
  if (payload.filePath) {
    const normalized = String(payload.filePath)
    const parts = normalized.split(/[\\/]/)
    return parts[parts.length - 1] || normalized
  }
  return fallback
}

export function decodeBinaryPayload(raw) {
  if (!raw) return null
  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (Array.isArray(raw)) return new Uint8Array(raw)
  if (typeof raw === 'object' && Array.isArray(raw.data)) return new Uint8Array(raw.data)
  return null
}

export function decodeTextPayload(raw) {
  if (typeof raw === 'string') return raw
  const bytes = decodeBinaryPayload(raw)
  if (!bytes) return ''
  return new TextDecoder('utf-8').decode(bytes)
}

export function createDocumentTab(payload = {}) {
  const filePath = String(payload.filePath || payload.path || '')
  const name = getDisplayName(payload)
  const ext = inferDocumentExtension(filePath || name)
  const viewerType = resolveDocumentViewerType({ filePath: filePath || name })
  const binary = decodeBinaryPayload(payload.data)
  const text = typeof payload.content === 'string'
    ? payload.content
    : (viewerType === 'pdf' ? '' : decodeTextPayload(payload.data))

  return {
    id: payload.id || `${filePath || name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    filePath,
    ext,
    viewerType,
    openMode: String(payload.openMode || ''),
    source: String(payload.source || ''),
    mimeType: String(payload.type || ''),
    text,
    binary,
    size: Number(payload.size || binary?.byteLength || 0),
    isLoading: false,
    isLoadError: false,
    sourcePayload: payload,
  }
}
