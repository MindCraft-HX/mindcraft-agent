import { createDocumentTab, getDisplayName } from './documentPayload.mjs'
import { inferDocumentExtension, resolveDocumentViewerType } from './viewerRegistry.mjs'

export function createPendingDocumentTab(payload = {}) {
  const filePath = String(payload.filePath || payload.path || '')
  const name = getDisplayName(payload, 'Untitled')
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
    isLoadError: false,
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
