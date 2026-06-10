export function shouldNotifyOnTaskDone({
  ownerProjectId,
  activeProjectId,
  isPanelActive = true,
} = {}) {
  if (!ownerProjectId) return false
  if (ownerProjectId !== activeProjectId) return true
  return isPanelActive === false
}
