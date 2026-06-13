/**
 * MindCraft 插件市场 Store
 * 管理已安装插件列表、市场清单、安装/卸载/启停操作
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePluginStore = defineStore('pluginMarketplace', () => {
  // ─── 状态 ─────────────────────────────────────────
  const installedPlugins = ref([])       // 来自主进程的已安装列表
  const marketplaceListing = ref(null)   // 市场清单缓存
  const isLoading = ref(false)
  const loadingError = ref('')

  // 监听器清理
  let _disposeRegistryListener = null

  // ─── 计算属性 ──────────────────────────────────────
  const enabledPlugins = computed(() =>
    installedPlugins.value.filter(p => p.enabled)
  )

  // ─── 加载已安装插件 ─────────────────────────────────
  async function loadInstalledPlugins() {
    try {
      const list = await window.electronAPI?.pluginGetInstalled?.()
      if (list) installedPlugins.value = list
    } catch (_) {
      installedPlugins.value = []
    }
  }

  // ─── 获取市场清单 ───────────────────────────────────
  async function fetchMarketplaceListing() {
    isLoading.value = true
    loadingError.value = ''
    try {
      const data = await window.electronAPI?.pluginMarketListing?.()
      marketplaceListing.value = data
      return data
    } catch (err) {
      loadingError.value = err.message || '获取插件市场失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // ─── 安装 ──────────────────────────────────────────
  async function installPlugin(pluginMeta) {
    const result = await window.electronAPI?.pluginMarketInstall?.(pluginMeta)
    if (result?.success) {
      await loadInstalledPlugins()
    }
    return result
  }

  // ─── 卸载 ──────────────────────────────────────────
  async function uninstallPlugin(pluginId) {
    const result = await window.electronAPI?.pluginMarketUninstall?.(pluginId)
    if (result?.success) {
      await loadInstalledPlugins()
    }
    return result
  }

  // ─── 启用/禁用 ─────────────────────────────────────
  async function togglePlugin(pluginId, enabled) {
    const fn = enabled
      ? window.electronAPI?.pluginMarketEnable
      : window.electronAPI?.pluginMarketDisable
    const result = await fn?.(pluginId)
    if (result?.success) {
      await loadInstalledPlugins()
    }
    return result
  }

  // ─── 是否已安装 ────────────────────────────────────
  function isInstalled(pluginId) {
    return installedPlugins.value.some(p => p.id === pluginId)
  }

  // ─── 插件数据存取 ──────────────────────────────────
  async function getPluginData(pluginId, key) {
    return window.electronAPI?.pluginGetData?.(pluginId, key)
  }

  async function setPluginData(pluginId, key, value) {
    return window.electronAPI?.pluginSetData?.(pluginId, key, value)
  }

  // ─── 主进程变更监听 ─────────────────────────────────
  function listenForRegistryChanges() {
    if (_disposeRegistryListener) _disposeRegistryListener()
    _disposeRegistryListener = window.electronAPI?.onPluginRegistryChanged?.((plugins) => {
      installedPlugins.value = plugins || []
    })
  }

  function cleanup() {
    if (typeof _disposeRegistryListener === 'function') {
      _disposeRegistryListener()
    }
  }

  return {
    // state
    installedPlugins,
    marketplaceListing,
    isLoading,
    loadingError,
    // computed
    enabledPlugins,
    // actions
    loadInstalledPlugins,
    fetchMarketplaceListing,
    installPlugin,
    uninstallPlugin,
    togglePlugin,
    isInstalled,
    getPluginData,
    setPluginData,
    listenForRegistryChanges,
    cleanup
  }
})
