import { shallowRef, onBeforeUnmount } from 'vue'
import { createWorkbenchStore } from './workbenchStore.mjs'

/** Vue-facing projection; the pure store remains independently testable. */
export function useWorkbenchStore(options = {}) {
  const store = createWorkbenchStore(options)
  const snapshot = shallowRef(store.getSnapshot())
  const unsubscribe = store.subscribe(next => { snapshot.value = next })
  onBeforeUnmount(unsubscribe)
  return { store, snapshot }
}

export { createWorkbenchStore }
