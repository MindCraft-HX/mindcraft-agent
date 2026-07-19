// 编辑状态工具函数：模式枚举、可编辑判断、大小上限

/** 编辑模式枚举 */
export const EDIT_MODE = Object.freeze({
  PREVIEW_ONLY: 'preview-only',
  EDIT_ONLY: 'edit-only',
  SPLIT: 'split',
})

/** 编辑模式循环顺序（仅 markdown 使用） */
export const EDIT_MODE_CYCLE = [
  EDIT_MODE.PREVIEW_ONLY,
  EDIT_MODE.EDIT_ONLY,
  EDIT_MODE.SPLIT,
]

/** 最大可编辑文件大小（字节）— 超过此值强制只读 */
export const MAX_EDIT_SIZE_BYTES = 1_000_000 // 1MB

/** 可编辑的 viewer 类型 */
export const EDITABLE_VIEWER_TYPES = new Set(['markdown', 'code', 'html'])

/**
 * 各 viewer 类型的默认编辑模式：HTML 打开即源码（设计 4.6），其余预览优先。
 * @param {string} viewerType
 * @returns {string}
 */
export function defaultEditMode(viewerType) {
  return viewerType === 'html' ? EDIT_MODE.EDIT_ONLY : EDIT_MODE.PREVIEW_ONLY
}

/**
 * 判断 tab 是否可编辑
 * @param {object} tab - tab 对象（含 filePath, viewerType, size）
 * @returns {boolean}
 */
export function isEditableFile(tab) {
  if (!tab?.filePath) return false
  if (!EDITABLE_VIEWER_TYPES.has(tab.viewerType)) return false
  if (tab.size > MAX_EDIT_SIZE_BYTES) return false
  return true
}

/**
 * 获取 MD 文件的下一个编辑模式（循环）
 * @param {string} current - 当前模式
 * @returns {string}
 */
export function nextEditMode(current) {
  const idx = EDIT_MODE_CYCLE.indexOf(current)
  if (idx < 0) return EDIT_MODE.PREVIEW_ONLY
  return EDIT_MODE_CYCLE[(idx + 1) % EDIT_MODE_CYCLE.length]
}

/**
 * 获取编辑模式的显示标签
 * @param {string} mode
 * @returns {string} 如 'edit', 'preview', 'split'
 */
export function editModeLabel(mode) {
  switch (mode) {
    case EDIT_MODE.PREVIEW_ONLY: return 'preview'
    case EDIT_MODE.EDIT_ONLY: return 'edit'
    case EDIT_MODE.SPLIT: return 'split'
    default: return 'preview'
  }
}
