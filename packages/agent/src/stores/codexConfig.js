import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Codex SDK 配置 Store
 * 管理权限策略、网络访问、网页搜索等 Codex 专属设置
 */
export const useCodexConfigStore = defineStore('codexConfig', () => {
  /** 权限策略：read_only | ask | allow_all */
  const permissionPolicy = ref('ask')

  /** 权限策略可选值 */
  const policies = [
    { value: 'read_only', label: '只读', desc: '仅读取，不写文件不执行命令' },
    { value: 'ask', label: '安全模式（沙箱保护）', desc: '工作区可写，.git 和系统路径受保护' },
    { value: 'allow_all', label: '完全访问', desc: '无沙箱限制，完全自由访问' },
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
   * 设置权限策略并同步到主进程
   * @param {'read_only' | 'ask' | 'allow_all'} policy
   */
  async function setPermissionPolicy(policy) {
    if (!policies.some(p => p.value === policy)) return
    permissionPolicy.value = policy
    try {
      await window.electronAPI?.codexSetPermissionPolicy?.(policy)
    } catch (_) {}
  }

  /**
   * 从主进程 electron-conf 加载权限策略
   */
  async function loadPermissionPolicy() {
    try {
      const stored = await window.electronAPI?.codexGetPermissionPolicy?.()
      if (stored && policies.some(p => p.value === stored)) {
        permissionPolicy.value = stored
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
    permissionPolicy,
    policies,
    defaultNetworkAccess,
    defaultWebSearch,
    webSearchOptions,
    setPermissionPolicy,
    loadPermissionPolicy,
    setDefaultNetworkAccess,
    loadDefaultNetworkAccess,
    setDefaultWebSearch,
    loadDefaultWebSearch,
  }
}, {
  persist: {
    key: 'codexConfig',
    storage: localStorage,
    paths: ['permissionPolicy', 'defaultNetworkAccess', 'defaultWebSearch'],
  },
})
