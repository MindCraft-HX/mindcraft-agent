/**
 * Public projection for the Workbench. Document text remains in the document
 * controller and is deliberately never included in a Workbench snapshot.
 */
export function createDocumentWorkbenchAdapter({ controller, decideDirty, activate, deactivate, onClosed } = {}) {
  if (!controller || typeof controller.getSnapshot !== 'function' || typeof controller.requestClose !== 'function') {
    throw new Error('document workbench adapter requires a document controller')
  }

  return {
    getSnapshot() {
      return controller.getSnapshot()
    },
    subscribe(listener) {
      return controller.subscribe(listener)
    },
    activate(context = {}) {
      activate?.(context)
    },
    deactivate(context = {}) {
      deactivate?.(context)
    },
    requestClose(itemId) {
      const snapshot = controller.getSnapshot().find(item => item.itemId === itemId)
      if (!snapshot) return Promise.resolve({ status: 'ready' })
      return controller.requestClose(snapshot.canonicalDocumentKey, { decideDirty }).then(result => {
        if (result.status === 'ready') onClosed?.(itemId)
        return result
      })
    },
  }
}
