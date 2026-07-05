/**
 * CodeHub SessionIndex — Phase 1: Read-only loader (T184)
 *
 * Reads panel-state and session-registry files WITHOUT triggering:
 * - provider full scan
 * - session registry mutations (repair/backfill/sync)
 * - JSONL parsing
 *
 * Returns a lightweight tab list for the CodeHub unified tab bar,
 * decoupling tab existence from provider panel readiness.
 */

const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { getCodexPanelStateReadCandidates } = require('./codexPanelStatePaths')
const { listSessionRecords } = require('./sessionRegistry')
const { CORE_CHANNELS } = require('../shared/ipcChannels')

// ---------------------------------------------------------------------------
// Agent type mapping
// ---------------------------------------------------------------------------

const AGENT_TYPE_MAP = Object.freeze({
  claude: 'claudeCode',
  claudecode: 'claudeCode',
  'claude-code': 'claudeCode',
  codex: 'codex',
  codexcode: 'codex',
  'code-x': 'codex',
})

function toCodeHubAgentType(raw) {
  if (!raw) return null
  return AGENT_TYPE_MAP[raw.toLowerCase()] || null
}

// ---------------------------------------------------------------------------
// Panel-state reading (read-only, no side effects)
// ---------------------------------------------------------------------------

function readPanelState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

function readClaudePanelState() {
  try {
    const userData = app.getPath('userData')
    return readPanelState(path.join(userData, 'claude-panel-state.json'))
  } catch (_) {
    return null
  }
}

function readCodexPanelState() {
  const candidates = getCodexPanelStateReadCandidates()
  for (const candidate of candidates) {
    const state = readPanelState(candidate)
    if (state) return state
  }
  return null
}

// ---------------------------------------------------------------------------
// Session registry: build per-project supplemental index (read-only)
// ---------------------------------------------------------------------------

/**
 * Reads all session records and returns a Map<projectKey, {maxUpdatedAt, sessionCount}>
 * where projectKey = `${agentType}:${projectId}`.
 *
 * This is read-only — it uses the exported listSessionRecords() which only
 * reads files from disk and never mutates the registry.
 */
function buildRegistryProjectIndex() {
  const index = new Map()
  let records
  try {
    records = listSessionRecords()
  } catch (_) {
    return index
  }
  if (!Array.isArray(records)) return index

  for (const record of records) {
    if (!record) continue
    const agentType = toCodeHubAgentType(record.agent)
    if (!agentType) continue
    const projectId = record.projectId
    if (!projectId) continue
    const key = `${agentType}:${projectId}`
    const existing = index.get(key)
    const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : 0
    if (!existing) {
      index.set(key, { maxUpdatedAt: updatedAt, sessionCount: 1 })
    } else {
      if (updatedAt > existing.maxUpdatedAt) existing.maxUpdatedAt = updatedAt
      existing.sessionCount++
    }
  }
  return index
}

// ---------------------------------------------------------------------------
// Tab extraction from panel-state
// ---------------------------------------------------------------------------

const TAB_WHITELIST = [
  'id',
  'projectId',
  'agentType',
  'name',
  'cwd',
  'cwdLocked',
  'runningCount',
  'hasPendingTool',
  'hasDoneNotification',
  'createdAt',
  'updatedAt',
  'source',
]

function toSafeTab(raw) {
  const tab = {}
  for (const key of TAB_WHITELIST) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      tab[key] = raw[key]
    }
  }
  return tab
}

const DEFAULT_PROJECT_NAMES = new Set(['未命名项目', '新项目', 'New Project'])

function deriveProjectName(project) {
  if (project.name && !DEFAULT_PROJECT_NAMES.has(project.name)) return project.name
  if (project.cwd) {
    const segs = project.cwd.replace(/\\/g, '/').split('/').filter(Boolean)
    return segs[segs.length - 1] || project.name || ''
  }
  return project.name || ''
}

function isEmptyPlaceholderProject(project) {
  const cwd = typeof project?.cwd === 'string' ? project.cwd.trim() : ''
  const cwdLocked = Boolean(project?.cwdLocked)
  const hasChats = Array.isArray(project?.chats) && project.chats.length > 0
  return !cwd && !cwdLocked && !hasChats
}

function extractTabsFromPanelState(panelState, agentType, registryIndex, warnings) {
  const tabs = []
  const projects = panelState?.projects
  if (!Array.isArray(projects)) return tabs

  for (const project of projects) {
    try {
      if (!project || typeof project !== 'object') {
        warnings.push(`Skipping invalid project entry in ${agentType} panel-state`)
        continue
      }
      const projectId = project.id
      if (!projectId) {
        warnings.push(`Skipping project without id in ${agentType} panel-state`)
        continue
      }
      if (isEmptyPlaceholderProject(project)) {
        continue
      }

      const name = deriveProjectName(project)
      const cwd = typeof project.cwd === 'string' ? project.cwd : ''
      const cwdLocked = Boolean(project.cwdLocked)

      // Find the latest chat timestamp to use as updatedAt
      let derivedUpdatedAt = project.createdAt || 0
      if (Array.isArray(project.chats)) {
        for (const chat of project.chats) {
          if (!chat) continue
          const chatUpdated = chat.updatedAt || chat.createdAt || 0
          if (chatUpdated > derivedUpdatedAt) derivedUpdatedAt = chatUpdated
        }
      }

      // Supplement from session registry index
      const registryKey = `${agentType}:${projectId}`
      const registryInfo = registryIndex.get(registryKey)
      const registryUpdatedAt = registryInfo?.maxUpdatedAt || 0
      const updatedAt = Math.max(derivedUpdatedAt, registryUpdatedAt)

      const tab = toSafeTab({
        id: `${agentType}:${projectId}`,
        projectId,
        agentType,
        name,
        cwd,
        cwdLocked,
        runningCount: 0,
        hasPendingTool: false,
        hasDoneNotification: Boolean(project.hasDoneNotification),
        createdAt: project.createdAt || 0,
        updatedAt: updatedAt || project.createdAt || 0,
        source: 'panel-state',
      })

      tabs.push(tab)
    } catch (err) {
      warnings.push(`Error processing project in ${agentType} panel-state: ${err.message}`)
    }
  }

  return tabs
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Loads the CodeHub session index.
 *
 * @returns {{ ok: boolean, tabs: Array, warnings: string[] }}
 *   - tabs: lightweight tab items suitable for the unified tab bar
 *   - warnings: non-fatal issues encountered during loading
 */
function loadCodehubSessionIndex() {
  const warnings = []
  const tabs = []

  // Phase 1: Read registry index for supplemental data
  let registryIndex
  try {
    registryIndex = buildRegistryProjectIndex()
  } catch (err) {
    warnings.push(`Failed to read session registry: ${err.message}`)
    registryIndex = new Map()
  }

  // Phase 2: Read Claude panel-state
  try {
    const claudeState = readClaudePanelState()
    if (claudeState) {
      const claudeTabs = extractTabsFromPanelState(claudeState, 'claudeCode', registryIndex, warnings)
      tabs.push(...claudeTabs)
    }
  } catch (err) {
    warnings.push(`Failed to read Claude panel-state: ${err.message}`)
  }

  // Phase 3: Read Codex panel-state
  try {
    const codexState = readCodexPanelState()
    if (codexState) {
      const codexTabs = extractTabsFromPanelState(codexState, 'codex', registryIndex, warnings)
      tabs.push(...codexTabs)
    }
  } catch (err) {
    warnings.push(`Failed to read Codex panel-state: ${err.message}`)
  }

  return {
    ok: true,
    tabs,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

function registerCodehubSessionIndexIpc(ipcMain) {
  ipcMain.handle(CORE_CHANNELS.LOAD_CODEHUB_SESSION_INDEX, async () => {
    try {
      return loadCodehubSessionIndex()
    } catch (err) {
      console.error('[codehubSessionIndex] load failed:', err.message)
      return { ok: false, tabs: [], warnings: [err.message] }
    }
  })
}

module.exports = {
  loadCodehubSessionIndex,
  registerCodehubSessionIndexIpc,
  // Exported for testing
  __test__: {
    toCodeHubAgentType,
    deriveProjectName,
    extractTabsFromPanelState,
    buildRegistryProjectIndex,
    toSafeTab,
    TAB_WHITELIST,
  },
}
