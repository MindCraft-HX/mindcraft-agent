function shallowEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Public host port for the one CodeHub surface. It intentionally projects
 * project tabs instead of exposing provider panels, chats, or Vue refs.
 */
export function createAgentWorkbenchAdapter({
  getTabs,
  getActiveProject,
  activateProject,
  closeProject,
  reorderProjects,
  createProject,
  focus,
  requestClose,
} = {}) {
  if (typeof getTabs !== 'function' || typeof activateProject !== 'function') {
    throw new Error('agent workbench adapter requires tab and activation ports')
  }
  const listeners = new Set()
  let lastSnapshot = null

  function getSnapshot() {
    const tabs = (getTabs() || []).slice(0, 20).map(tab => ({
      id: String(tab.id || ''),
      projectId: String(tab.projectId || ''),
      agentType: String(tab.agentType || ''),
      title: String(tab.name || ''),
      running: Number(tab.runningCount || 0) > 0,
      pending: Boolean(tab.hasPendingTool),
      notification: Boolean(tab.hasDoneNotification),
      iconClass: String(tab.iconClass || ''),
      iconStyle: tab.iconStyle && typeof tab.iconStyle === 'object' ? { ...tab.iconStyle } : {},
    })).filter(tab => tab.id)
    return {
      itemId: 'agent:codehub',
      kind: 'agent',
      activeProjectId: String(getActiveProject?.() || ''),
      tabs,
    }
  }

  function publish() {
    const next = getSnapshot()
    if (lastSnapshot && shallowEqual(next, lastSnapshot)) return
    lastSnapshot = next
    for (const listener of listeners) listener(next)
  }

  return {
    getSnapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    activate(context = {}) {
      const projectId = context.projectId || context.agentTarget?.projectId
      if (projectId) activateProject(projectId, context.agentTarget || null)
      focus?.()
      publish()
    },
    deactivate() {},
    requestClose(reason) {
      return typeof requestClose === 'function' ? requestClose(reason) : Promise.resolve({ status: 'ready' })
    },
    closeProject(projectId) {
      return typeof closeProject === 'function' ? closeProject(projectId) : false
    },
    reorderProjects(fromIndex, toIndex) {
      return typeof reorderProjects === 'function' ? reorderProjects(fromIndex, toIndex) : false
    },
    createProject(agentType) {
      return typeof createProject === 'function' ? createProject(agentType) : false
    },
    publish,
    dispose() {
      listeners.clear()
      lastSnapshot = null
    },
    getWorkspaceContext() {
      const active = (getTabs() || []).find(tab => String(tab.id) === String(getActiveProject?.()))
      return active?.cwd ? { workspaceKey: String(active.cwd), cwd: String(active.cwd) } : null
    },
  }
}
