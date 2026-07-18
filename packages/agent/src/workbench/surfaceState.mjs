export const DEFAULT_SURFACE_STATE = Object.freeze({
  visible: true,
  active: true,
  groupId: 'route',
})

export function normalizeSurfaceState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_SURFACE_STATE }
  const visible = value.visible !== false
  return {
    visible,
    active: visible && value.active !== false,
    groupId: typeof value.groupId === 'string' && value.groupId ? value.groupId : DEFAULT_SURFACE_STATE.groupId,
  }
}
