import { createDocumentTab } from './documentPayload.mjs'
import { inferDocumentExtension, resolveDocumentViewerType } from './viewerRegistry.mjs'

function getPendingName(payload = {}) {
  if (payload.name) return String(payload.name)
  if (payload.filePath) {
    const normalized = String(payload.filePath)
    const parts = normalized.split(/[\\/]/)
    return parts[parts.length - 1] || normalized
  }
  return 'Untitled'
}

export function createPendingDocumentTab(payload = {}) {
  const filePath = String(payload.filePath || payload.path || '')
  const name = getPendingName(payload)
  const ext = inferDocumentExtension(filePath || name)
  const viewerType = resolveDocumentViewerType({ filePath: filePath || name })

  return {
    id: payload.id || `${filePath || name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    filePath,
    ext,
    viewerType,
    mimeType: String(payload.type || ''),
    text: '',
    binary: null,
    size: 0,
    isLoading: true,
    sourcePayload: payload,
  }
}

export function finalizeDocumentTab(tab, payload = {}) {
  const completed = createDocumentTab({
    ...tab?.sourcePayload,
    ...payload,
    id: tab?.id,
  })

  return {
    ...completed,
    isLoading: false,
    openMode: completed.openMode || tab?.openMode || '',
    source: completed.source || tab?.source || '',
  }
}
