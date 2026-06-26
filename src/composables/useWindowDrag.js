import { computed } from 'vue'
import { useWindowPerformanceState } from './useWindowPerformanceState'

export function useWindowDrag() {
  const { isWindowDragging, cleanup } = useWindowPerformanceState()
  return {
    isDragging: computed(() => isWindowDragging.value),
    cleanup,
  }
}
