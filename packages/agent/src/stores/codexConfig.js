import { defineStore } from 'pinia'
import { ref } from 'vue'

/** CodeX SDK 原生 sandboxMode 值 */
const VALID_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

/** 旧值 → 新值迁移映射 */
const MIGRATE_MAP = {
  read_only: 'read-only',
  ask: 'workspace-write',
  allow_all: 'danger-full-access',
}

/**
 * Codex SDK 配置 Store
 * 管理文件权限（sandbox）、网络访问、网页搜索等 Codex 专属设置
 */
export const useCodexConfigStore = defineStore('codexConfig', () => {
  /** 默认 sandbox 模式：SDK 默认 read-only，我们主动设为 workspace-write */
  const sandboxMode = ref('workspace-write')

  /** sandbox 级别可选值 */
  const sandboxLevels = [
    { value: 'read-only', label: '只读', desc: '仅读取文件，不执行任何修改' },
    { value: 'workspace-write', label: '工作区可写（推荐）', desc: '可修改当前项目文件，无法访问工作区外' },
    { value: 'danger-full-access', label: '完全访问', desc: '可读取和修改任意路径文件' },
  ]

  /** 旧值迁移：兼容 localStorage 中 ClaudeCode 式命名 */
  function migrateValue(raw) {
    if (!raw) return null
    if (VALID_SANDBOX_MODES.includes(raw)) return raw
    if (MIGRATE_MAP[raw]) return MIGRATE_MAP[raw]
    return null
  }

  /** 默认网络访问：新会话是否允许联网 */
  const defaultNetworkAccess = ref(true)

  /** 默认网页搜索模式 */
  const defaultWebSearch = ref('cached')

  /** 网页搜索模式可选值 */
  const webSearchOptions = [
    { value: 'disabled', label: '禁用搜索' },
    { value: 'cached', label: '缓存搜索' },
    { value: 'live', label: '实时搜索' },
  ]

  /**
   * 设置默认 sandbox 模式并同步到主进程
   */
  async function setSandboxMode(mode) {
    if (!VALID_SANDBOX_MODES.includes(mode)) return
    sandboxMode.value = mode
    try {
      await window.electronAPI?.codexSetSandboxMode?.(mode)
    } catch (_) {}
  }

  /**
   * 从主进程 electron-conf 加载默认 sandbox 模式（含旧值迁移）
   */
  async function loadSandboxMode() {
    try {
      const raw = await window.electronAPI?.codexGetSandboxMode?.()
      const valid = migrateValue(raw)
      if (valid) {
        sandboxMode.value = valid
        // 旧值已迁移 → 写回主进程
        if (raw !== valid) {
          await setSandboxMode(valid)
        }
      }
    } catch (_) {}
  }

  /** 设置默认网络访问 */
  async function setDefaultNetworkAccess(val) {
    defaultNetworkAccess.value = !!val
    try {
      await window.electronAPI?.codexSetDefaultNetworkAccess?.(!!val)
    } catch (_) {}
  }

  /** 加载默认网络访问 */
  async function loadDefaultNetworkAccess() {
    try {
      const val = await window.electronAPI?.codexGetDefaultNetworkAccess?.()
      if (typeof val === 'boolean') defaultNetworkAccess.value = val
    } catch (_) {}
  }

  /** 设置默认网页搜索 */
  async function setDefaultWebSearch(mode) {
    if (!webSearchOptions.some(o => o.value === mode)) return
    defaultWebSearch.value = mode
    try {
      await window.electronAPI?.codexSetDefaultWebSearch?.(mode)
    } catch (_) {}
  }

  /** 加载默认网页搜索 */
  async function loadDefaultWebSearch() {
    try {
      const mode = await window.electronAPI?.codexGetDefaultWebSearch?.()
      if (mode && webSearchOptions.some(o => o.value === mode)) {
        defaultWebSearch.value = mode
      }
    } catch (_) {}
  }

  return {
    sandboxMode,
    sandboxLevels,
    defaultNetworkAccess,
    defaultWebSearch,
    webSearchOptions,
    setSandboxMode,
    loadSandboxMode,
    setDefaultNetworkAccess,
    loadDefaultNetworkAccess,
    setDefaultWebSearch,
    loadDefaultWebSearch,
  }
}, {
  persist: {
    key: 'codexConfig',
    storage: localStorage,
    // sandboxMode: 新 key；permissionPolicy: 旧 key（pinia persist 会自动从 localStorage 读回旧值，我们在 loadSandboxMode 中做迁移）
    paths: ['sandboxMode', 'defaultNetworkAccess', 'defaultWebSearch'],
  },
})
