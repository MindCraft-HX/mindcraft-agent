import { EDIT_MODE, isEditableFile } from './editState.mjs'

export function usesDocumentBodyScroll(tab, editMode = EDIT_MODE.PREVIEW_ONLY) {
  if (!tab) return false
  if (tab.viewerType === 'markdown') return editMode === EDIT_MODE.PREVIEW_ONLY
  return !isEditableFile(tab)
}
