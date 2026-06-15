import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  VALID_SANDBOX_MODES,
  migrateSandboxValue,
} from '../components/agentCommon/utils/sandboxHelpers.js'

/**
 * Codex SDK 配置 Store
 * 管理文件权限（sandbox）、网络访问、网页搜索等 Codex 专属设置
 */
export const useCodexConfigStore = defineStore('codexConfig', () => {
  /** 默认 sandbox 模式：SDK 默认 read-only，我们主动设为 workspace-write */
  const sandboxMode = ref('workspace-write')

  /**
   * sandbox 级别可选值
   * labelKey / descKey 使用 i18n key，模板中通过 $t() 获取本地化文本
   */
  const sandboxLevels = [
    { value: 'read-only', labelKey: 'settings.sandbox.readOnlyShort', descKey: 'settings.sandbox.readOnlyDesc' },
    { value: 'workspace-write', labelKey: 'settings.sandbox.workspaceWriteShort', descKey: 'settings.sandbox.workspaceWriteDesc' },
    { value: 'danger-full-access', labelKey: 'settings.sandbox.fullAccessShort', descKey: 'settings.sandbox.fullAccessDesc' },
  ]

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
      const valid = migrateSandboxValue(raw)
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
