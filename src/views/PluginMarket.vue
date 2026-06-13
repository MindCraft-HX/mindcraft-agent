<!--
  PluginMarket — 插件市场（全页面路由 /main/pluginMarket）
  两个 Tab：浏览市场 + 已安装管理
-->
<template>
  <div class="plugin-market-page">
    <div class="market-header">
      <h2 class="market-title">{{ $t('pluginMarket.title') }}</h2>
    </div>

    <el-tabs v-model="activeTab" class="market-tabs" @tab-change="onTabChange">
      <!-- ═══ 浏览 ═══ -->
      <el-tab-pane :label="$t('pluginMarket.browse')" name="browse">
        <div class="market-toolbar">
          <el-input
            v-model="searchQuery"
            :placeholder="$t('pluginMarket.searchPlaceholder')"
            clearable
            :prefix-icon="Search"
            class="market-search"
          />
          <span class="market-count" v-if="!loading && !errorMsg">
            {{ filteredPlugins.length }} 个
          </span>
        </div>

        <div v-if="loading" class="market-status">
          <el-icon class="is-loading" :size="20"><Loading /></el-icon>
          {{ $t('common.loading') }}
        </div>

        <div v-else-if="errorMsg" class="market-status market-error">
          <p>{{ errorMsg }}</p>
          <el-button size="small" @click="loadMarketplace">{{ $t('common.retry') }}</el-button>
        </div>

        <div v-else class="plugin-list">
          <div v-for="plugin in filteredPlugins" :key="plugin.id" class="plugin-card">
            <div class="plugin-card-body">
              <div class="plugin-card-icon">
                <svg width="32" height="32" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="4" width="20" height="20" rx="4"/>
                  <line x1="14" y1="4" x2="14" y2="24"/>
                  <line x1="4" y1="14" x2="24" y2="14"/>
                </svg>
              </div>
              <div class="plugin-card-info">
                <div class="plugin-card-header">
                  <span class="plugin-card-name">
                    {{ plugin.name }}
                    <el-tag v-if="plugin._dev" size="small" type="warning" effect="plain">DEV</el-tag>
                  </span>
                  <span class="plugin-card-version">v{{ plugin.version }}</span>
                </div>
                <div class="plugin-card-author" v-if="plugin.author">{{ plugin.author }}</div>
                <div class="plugin-card-desc" v-if="plugin.description">{{ plugin.description }}</div>
              </div>
            </div>
            <div class="plugin-card-actions">
              <template v-if="plugin._dev">
                <el-tag size="small" type="warning" effect="dark">开发中</el-tag>
              </template>
              <template v-else-if="!pluginStore.isInstalled(plugin.id)">
                <el-button type="primary" :loading="installingId === plugin.id" @click="handleInstall(plugin)">
                  {{ $t('pluginMarket.install') }}
                </el-button>
              </template>
              <template v-else>
                <el-tag size="small" type="success" effect="plain">{{ $t('pluginMarket.installedTag') }}</el-tag>
                <el-button type="danger" size="small" plain @click="handleUninstall(plugin.id)">
                  {{ $t('pluginMarket.uninstall') }}
                </el-button>
              </template>
            </div>
          </div>

          <div v-if="filteredPlugins.length === 0 && !loading" class="market-empty">
            <p>{{ $t('pluginMarket.noResults') }}</p>
          </div>
        </div>
      </el-tab-pane>

      <!-- ═══ 已安装 ═══ -->
      <el-tab-pane name="installed">
        <template #label>
          {{ $t('pluginMarket.installed') }}
          <span v-if="pluginStore.installedPlugins.length"> ({{ pluginStore.installedPlugins.length }})</span>
        </template>

        <div class="plugin-list">
          <div v-for="plugin in pluginStore.installedPlugins" :key="plugin.id" class="plugin-card">
            <div class="plugin-card-body">
              <div class="plugin-card-icon">
                <svg width="32" height="32" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="4" width="20" height="20" rx="4"/>
                  <line x1="14" y1="4" x2="14" y2="24"/>
                  <line x1="4" y1="14" x2="24" y2="14"/>
                </svg>
              </div>
              <div class="plugin-card-info">
                <div class="plugin-card-header">
                  <span class="plugin-card-name">
                    {{ plugin.name }}
                    <el-tag v-if="plugin.devMode" size="small" type="warning" effect="plain">DEV</el-tag>
                  </span>
                  <span class="plugin-card-version">v{{ plugin.version }}</span>
                </div>
                <div class="plugin-card-meta">
                  <span style="font-size:12px;color:var(--cc-text-muted)">{{ plugin.installPath }}</span>
                </div>
              </div>
            </div>
            <div class="plugin-card-actions">
              <el-switch
                :model-value="plugin.enabled"
                :active-text="$t('pluginMarket.enabled')"
                :inactive-text="$t('pluginMarket.disabled')"
                inline-prompt
                size="small"
                @change="(val) => handleToggle(plugin.id, val)"
              />
              <el-button type="danger" size="small" plain @click="handleRemove(plugin)">
                {{ $t('pluginMarket.remove') }}
              </el-button>
            </div>
          </div>

          <div v-if="pluginStore.installedPlugins.length === 0" class="market-empty">
            <p>{{ $t('pluginMarket.noInstalled') }}</p>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Search, Loading } from '@element-plus/icons-vue'
import { usePluginStore } from '@/stores/pluginStore'
import { ElMessage, ElMessageBox } from 'element-plus'

const pluginStore = usePluginStore()

const activeTab = ref('browse')
const searchQuery = ref('')
const loading = ref(false)
const errorMsg = ref('')
const installingId = ref(null)

// ─── 浏览列表（合并远程市场 + dev 插件）──────────
const browsePlugins = computed(() => {
  try {
    const remote = (pluginStore.marketplaceListing?.plugins || []).map(p => ({ ...p, _source: 'remote' }))
    const devPlugins = (pluginStore.installedPlugins || [])
      .filter(p => p.devMode && !remote.some(r => r.id === p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: '本地开发插件',
        _dev: true,
        _source: 'dev'
      }))
    return [...devPlugins, ...remote]
  } catch {
    return []
  }
})

const filteredPlugins = computed(() => {
  const list = browsePlugins.value || []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    (p.author || '').toLowerCase().includes(q)
  )
})

// ─── 加载市场 ────────────────────────────────────
async function loadMarketplace() {
  loading.value = true
  errorMsg.value = ''
  try {
    await pluginStore.fetchMarketplaceListing()
  } catch (e) {
    errorMsg.value = e.message || '获取失败'
  } finally {
    loading.value = false
  }
}

async function handleInstall(plugin) {
  installingId.value = plugin.id
  try {
    await pluginStore.installPlugin(plugin)
    ElMessage.success(`"${plugin.name}" 安装成功`)
  } catch (e) {
    ElMessage.error(`安装失败：${e.message || '未知错误'}`)
  } finally {
    installingId.value = null
  }
}

async function handleUninstall(pluginId) {
  try {
    await ElMessageBox.confirm('卸载后将删除插件及其数据，确定继续？', '确认卸载', {
      confirmButtonText: '卸载', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  try {
    await pluginStore.uninstallPlugin(pluginId)
    ElMessage.success('已卸载')
  } catch (e) {
    ElMessage.error(`卸载失败：${e.message || '未知错误'}`)
  }
}

// 删除/移除插件（包括 dev 插件）
async function handleRemove(plugin) {
  if (plugin.devMode) {
    // dev 插件：从注册表中移除（不删文件，让用户手动管理 dev-plugins/）
    try {
      await ElMessageBox.confirm(
        '将从注册表中移除此开发插件（不会删除 dev-plugins/ 中的文件）。确定继续？',
        '移除开发插件',
        { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' }
      )
    } catch { return }
  } else {
    try {
      await ElMessageBox.confirm('卸载后将删除插件及其数据，确定继续？', '确认卸载', {
        confirmButtonText: '卸载', cancelButtonText: '取消', type: 'warning'
      })
    } catch { return }
  }
  try {
    await pluginStore.uninstallPlugin(plugin.id)
    ElMessage.success(plugin.devMode ? '已移除（文件保留在 dev-plugins/）' : '已卸载')
  } catch (e) {
    ElMessage.error(`操作失败：${e.message || '未知错误'}`)
  }
}

async function handleToggle(pluginId, enabled) {
  try {
    await pluginStore.togglePlugin(pluginId, enabled)
  } catch (e) {
    ElMessage.error(`操作失败：${e.message || '未知错误'}`)
  }
}

function onTabChange(tab) {
  searchQuery.value = ''
  if (tab === 'browse' && !pluginStore.marketplaceListing && !loading.value) {
    loadMarketplace()
  }
  pluginStore.loadInstalledPlugins()
}

onMounted(async () => {
  await pluginStore.loadInstalledPlugins()
  loadMarketplace()
})
</script>

<style scoped>
.plugin-market-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  overflow: hidden;
}

.market-header {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.market-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--cc-text, #e0e5e9);
}

/* ─── Tabs ─────────────────────────────── */
.market-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.market-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.market-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.market-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── 工具栏 ─────────────────────────────── */
.market-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.market-search {
  max-width: 320px;
}

.market-count {
  font-size: 13px;
  color: var(--cc-text-muted, #8b949e);
  white-space: nowrap;
}

/* ─── 插件列表 ───────────────────────────── */
.plugin-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
  min-height: 0;
}

.plugin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--cc-border-light, #3a3a3a);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--cc-bg-card, rgba(255, 255, 255, 0.03));
  gap: 16px;
  transition: border-color 0.15s;
  flex-shrink: 0;
}

.plugin-card:hover {
  border-color: var(--cc-primary-border, rgba(64, 158, 255, 0.3));
}

.plugin-card-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.plugin-card-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  color: var(--cc-primary, #409eff);
  margin-top: 2px;
}

.plugin-card-info {
  flex: 1;
  min-width: 0;
}

.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-card-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--cc-text, #e0e5e9);
}

.plugin-card-version {
  font-size: 12px;
  color: var(--cc-text-muted, #8b949e);
  font-family: monospace;
}

.plugin-card-author {
  font-size: 12px;
  color: var(--cc-text-dim, #6e7681);
  margin-top: 2px;
}

.plugin-card-desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--cc-text-dim, #6e7681);
  line-height: 1.5;
}

.plugin-card-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--cc-text-muted, #8b949e);
}

.plugin-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ─── 状态提示 ───────────────────────────── */
.market-status {
  padding: 60px 0;
  text-align: center;
  color: var(--cc-text-dim, #8b949e);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.market-error {
  color: var(--cc-danger, #f56c6c);
}

.market-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--cc-text-dim, #8b949e);
  font-size: 14px;
}

/* ─── 滚动条 ──────────────────────────────── */
.plugin-list::-webkit-scrollbar {
  width: 4px;
}

.plugin-list::-webkit-scrollbar-thumb {
  background: var(--cc-border-light, #3a3a3a);
  border-radius: 2px;
}
</style>
