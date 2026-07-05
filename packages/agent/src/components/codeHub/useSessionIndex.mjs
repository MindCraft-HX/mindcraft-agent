/**
 * useSessionIndex — CodeHub SessionIndex merge layer (T184 Phase 2)
 *
 * Decouples unified tab existence from provider panel readiness.
 * The persisted index provides the initial tab list; provider panels
 * patch runtime fields (running/pending/notification) once they mount.
 *
 * Merge priority:
 *   explicit delete > runtime project present > persisted index
 */

import { ref, computed, shallowRef } from 'vue'
import { orderCodeHubTabs, reconcileCodeHubTabOrder } from './tabOrder.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTabId(agentType, projectId) {
  return `${agentType}:${projectId}`
}

function cloneTab(tab) {
  return { ...tab }
}

/**
 * Patch a persisted tab with runtime fields from a provider panel.
 * Only updates fields that the runtime explicitly provides.
 * Never removes the tab.
 */
function applyRuntimePatch(persisted, runtime) {
  const patched = { ...persisted }
  const fields = [
    'name', 'cwd', 'cwdLocked',
    'runningCount', 'hasPendingTool', 'hasDoneNotification',
    'updatedAt',
  ]
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(runtime, key) && runtime[key] != null) {
      patched[key] = runtime[key]
    }
  }
  if (runtime.updatedAt && runtime.updatedAt > (persisted.updatedAt || 0)) {
    patched.updatedAt = runtime.updatedAt
  }
  patched.source = 'runtime'
  return patched
}

/**
 * Build a runtime tab entry from a provider panel's projectTabData item
 * and merge it with any persisted index entry.
 */
function runtimeProjectToTab(runtimeProject, agentType, meta, persistedMap) {
  const projectId = runtimeProject.id ?? runtimeProject.projectId
  if (!projectId) return null
  const tabId = makeTabId(agentType, projectId)
  const tab = {
    id: tabId,
    projectId,
    agentType,
    name: runtimeProject.name,
    cwd: runtimeProject.cwd,
    cwdLocked: runtimeProject.cwdLocked,
    runningCount: runtimeProject.runningCount ?? 0,
    hasPendingTool: runtimeProject.hasPendingTool ?? false,
    hasDoneNotification: runtimeProject.hasDoneNotification ?? false,
    createdAt: runtimeProject.createdAt || 0,
    updatedAt: runtimeProject.updatedAt || runtimeProject.createdAt || 0,
    iconClass: meta.iconClass,
    iconStyle: meta.iconStyle,
    source: 'runtime',
  }

  // Merge with persisted data if available (preserve createdAt, supplement name/cwd)
  const persisted = persistedMap.get(tabId)
  if (persisted) {
    if (persisted.createdAt && (!tab.createdAt || persisted.createdAt < tab.createdAt)) {
      tab.createdAt = persisted.createdAt
    }
    if (!tab.name && persisted.name) tab.name = persisted.name
    if (!tab.cwd && persisted.cwd) tab.cwd = persisted.cwd
    if (persisted.cwdLocked != null && tab.cwdLocked == null) tab.cwdLocked = persisted.cwdLocked
    if (persisted.updatedAt > tab.updatedAt) tab.updatedAt = persisted.updatedAt
  }

  return tab
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {import('vue').Ref<string[]>} opts.agentKeys - e.g. ['claudeCode', 'codex']
 * @param {Function} opts.getAgentMeta - (key) => { iconClass, iconStyle }
 * @param {import('vue').Ref<string[]>} opts.tabOrder - persisted tab order from localStorage
 * @returns {Object} session index API
 */
export function useSessionIndex({ agentKeys, getAgentMeta, tabOrder }) {
  // ── State ──
  const indexReady = ref(false)
  const loadError = ref(null)
  const loadWarnings = ref([])

  // Persisted tabs keyed by tabId: `${agentType}:${projectId}`
  const persistedMap = shallowRef(new Map())
  // Runtime tabs keyed by tabId (from mounted provider panels)
  const runtimeMap = shallowRef(new Map())
  // Explicitly deleted tab IDs
  const deletedSet = shallowRef(new Set())

  // ── Derived: all active (non-deleted) tabs ──
  const tabs = computed(() => {
    const merged = new Map()

    // 1. Start with persisted index (exclude explicitly deleted)
    for (const [id, tab] of persistedMap.value) {
      if (deletedSet.value.has(id)) continue
      merged.set(id, cloneTab(tab))
    }

    // 2. Apply runtime patches (these can update fields but not create new deletes)
    for (const [id, rt] of runtimeMap.value) {
      if (deletedSet.value.has(id)) continue
      const existing = merged.get(id)
      if (existing) {
        merged.set(id, applyRuntimePatch(existing, rt))
      } else {
        merged.set(id, cloneTab(rt))
      }
    }

    return Array.from(merged.values())
  })

  // ── Derived: sorted tabs ──
  const orderedTabs = computed(() => {
    return orderCodeHubTabs(tabs.value, tabOrder?.value || [])
  })

  // ── Load persisted index from main process ──
  async function reloadIndex() {
    try {
      const api = window.electronAPI
      if (!api?.loadCodehubSessionIndex) {
        loadWarnings.value = ['electronAPI.loadCodehubSessionIndex not available']
        indexReady.value = true
        return
      }
      const result = await api.loadCodehubSessionIndex()
      if (!result?.ok) {
        loadError.value = result?.warnings?.[0] || 'Unknown error'
        loadWarnings.value = result?.warnings || []
        indexReady.value = true
        return
      }

      loadWarnings.value = result.warnings || []

      const map = new Map()
      if (Array.isArray(result.tabs)) {
        for (const tab of result.tabs) {
          if (tab?.id) {
            // Enrich with icon metadata
            const meta = getAgentMeta(tab.agentType)
            if (meta) {
              tab.iconClass = meta.iconClass
              tab.iconStyle = meta.iconStyle
            }
            map.set(tab.id, tab)
          }
        }
      }
      persistedMap.value = map
      loadError.value = null
    } catch (err) {
      loadError.value = err.message || String(err)
      loadWarnings.value = [err.message || String(err)]
    } finally {
      indexReady.value = true
    }
  }

  // ── Runtime patch from provider panels ──
  /**
   * Called by provider panels when their projectTabData changes.
   * Updates runtime fields without removing persisted tabs.
   *
   * @param {string} agentType - e.g. 'claudeCode', 'codex'
   * @param {Array} projects - provider's projectTabData
   */
  function patchRuntimeProjects(agentType, projects) {
    const meta = getAgentMeta(agentType)
    const next = new Map(runtimeMap.value) // shallow copy for reactivity

    // If empty/undefined, keep existing runtime entries — never clear
    if (!Array.isArray(projects) || projects.length === 0) {
      // Only trigger reactivity if the map is new
      if (runtimeMap.value.size > 0) {
        // Don't clear: keep old runtime data
        // We check if we need to remove entries that are no longer present but still valid
        // Per handoff: empty runtime patch only means provider hasn't published summary,
        // not that tabs should be deleted.
      }
      return
    }

    // Track which tab IDs this agent type provides, so we can remove stale ones
    const seenIds = new Set()

    for (const proj of projects) {
      const tab = runtimeProjectToTab(proj, agentType, meta, persistedMap.value)
      if (!tab) continue
      seenIds.add(tab.id)

      const existing = next.get(tab.id)
      if (existing) {
        next.set(tab.id, applyRuntimePatch(existing, tab))
      } else {
        next.set(tab.id, tab)
      }
    }

    // Remove runtime entries for this agentType that are no longer present
    for (const [id] of next) {
      if (id.startsWith(`${agentType}:`) && !seenIds.has(id)) {
        next.delete(id)
      }
    }

    runtimeMap.value = next
  }

  // ── Explicit tab deletion ──
  /**
   * Delete a tab. This is the ONLY way to remove a tab from the index.
   * Does NOT call provider panel's deleteProject — caller must do that separately.
   *
   * @param {string} agentType
   * @param {string} projectId
   */
  function deleteProjectTab(agentType, projectId) {
    const tabId = makeTabId(agentType, projectId)
    const next = new Set(deletedSet.value)
    next.add(tabId)
    deletedSet.value = next

    // Also remove from runtime map
    const rtNext = new Map(runtimeMap.value)
    rtNext.delete(tabId)
    runtimeMap.value = rtNext
  }

  // ── Clear a deletion (for recovery, e.g. if provider removes then re-adds) ──
  function clearDeletion(agentType, projectId) {
    const tabId = makeTabId(agentType, projectId)
    const next = new Set(deletedSet.value)
    next.delete(tabId)
    deletedSet.value = next
  }

  // ── Reconcile tab order ──
  function reconcileOrder(currentOrder) {
    return reconcileCodeHubTabOrder({
      currentOrder: currentOrder || [],
      visibleTabIds: orderedTabs.value.map(t => t.id),
      pruneMissing: true,
    })
  }

  return {
    // State
    indexReady,
    loadError,
    loadWarnings,
    // Derived
    tabs,
    orderedTabs,
    // Actions
    reloadIndex,
    patchRuntimeProjects,
    deleteProjectTab,
    clearDeletion,
    reconcileOrder,
  }
}
