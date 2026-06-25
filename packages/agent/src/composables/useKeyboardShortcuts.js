/**
 * 快捷键 Composable — 薄封装，透传给 Store
 *
 * 用法:
 *   const { register } = useKeyboardShortcuts()
 *   onMounted(() => {
 *     unreg.push(register('codehub.nextTab', () => { activateTab(...) }))
 *   })
 *   onUnmounted(() => unreg.forEach(fn => fn()))
 */

import { useShortcutStore } from '../stores/useShortcutStore.js'

export function useKeyboardShortcuts() {
  const store = useShortcutStore()

  /** @returns {Function} unregister */
  function register(actionId, handler, opts) {
    return store.register(actionId, handler, opts)
  }

  return { register }
}
