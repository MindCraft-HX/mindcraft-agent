<!--
  PluginMarket — 插件市场（全页面）
  路由：/main/pluginMarket
  两个 Tab：Browse（浏览市场）+ Installed（已安装管理）
-->
<template>
  <div class="plugin-market-page">
    <!-- 头部 -->
    <div class="market-header">
      <h2 class="market-title">{{ $t('pluginMarket.title') }}</h2>
    </div>

    <!-- Tab 切换 -->
    <el-tabs v-model="activeTab" class="market-tabs" @tab-change="onTabChange">
      <!-- ═══ 浏览 Tab ═══ -->
      <el-tab-pane :label="$t('pluginMarket.browse')" name="browse">
        <div class="market-content">
          <!-- 搜索 -->
          <div class="market-toolbar">
            <el-input
              v-model="searchQuery"
              :placeholder="$t('pluginMarket.searchPlaceholder')"
              clearable
              :prefix-icon="Search"
              class="market-search"
            />
            <span class="market-count" v-if="!loading && !errorMsg">
              {{ filteredPlugins.length }} 个插件
            </span>
          </div>

          <!-- 加载中 -->
          <div v-if="loading" class="market-status">
            <el-icon class="is-loading" :size="20"><Loading /></el-icon>
            {{ $t('common.loading') }}
          </div>

          <!-- 加载失败（CDN 不可用，但 fallback 不会失败了，保底展示） -->
          <div v-else-if="errorMsg" class="market-status market-error">
            <p>{{ errorMsg }}</p>
            <el-button size="small" @click="loadMarketplace">{{ $t('common.retry') }}</el-button>
          </div>

          <!-- 插件列表 -->
          <div v-else class="plugin-grid">
            <div v-for="plugin in filteredPlugins" :key="plugin.id" class="plugin-card">
              <div class="plugin-card-body">
                <div class="plugin-card-icon">
                  <svg width="36" height="36" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="20" height="20" rx="4"/>
                    <line x1="14" y1="4" x2="14" y2="24"/>
                    <line x1="4" y1="14" x2="24" y2="14"/>
                  </svg>
                </div>
                <div class="plugin-card-info">
                  <div class="plugin-card-header">
                    <span class="plugin-card-name">
                      {{ plugin.name }}
                      <el-tag v-if="plugin._dev" size="small" type="warning" effect="plain" class="dev-tag">DEV</el-tag>
                    </span>
                    <span class="plugin-card-version">v{{ plugin.version }}</span>
                  </div>
                  <div class="plugin-card-author" v-if="plugin.author">{{ plugin.author }}</div>
                  <div class="plugin-card-desc" v-if="plugin.description">{{ plugin.description }}</div>
                  <div class="plugin-card-meta">
                    <span v-if="!plugin._dev && plugin.installs !== undefined" class="plugin-card-stats">
                      {{ $t('pluginMarket.installs', { n: formatInstalls(plugin.installs) }) }}
                    </span>
                    <span v-if="plugin.size" class="plugin-card-size">{{ formatSize(plugin.size) }}</span>
                    <span v-if="plugin._dev" class="plugin-card-stats" style="color: var(--cc-warning)">本地开发</span>
                  </div>
                </div>
              </div>
              <div class="plugin-card-actions">
                <template v-if="plugin._dev">
                  <el-tag size="small" type="warning" effect="dark">开发中</el-tag>
                </template>
                <template v-else-if="!isInstalled(plugin.id)">
                  <el-button
                    type="primary"
                    :loading="installingId === plugin.id"
                    @click="handleInstall(plugin)"
                  >
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

            <!-- 空结果 -->
            <div v-if="filteredPlugins.length === 0 && !loading" class="market-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <line x1="12" y1="3" x2="12" y2="21"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
              </svg>
              <p>{{ $t('pluginMarket.noResults') }}</p>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ═══ 已安装 Tab ═══ -->
      <el-tab-pane :label="installedLabel" name="installed">
        <div class="market-content">
          <div class="plugin-grid">
            <div v-for="plugin in pluginStore.installedPlugins" :key="plugin.id" class="plugin-card">
              <div class="plugin-card-body">
                <div class="plugin-card-icon">
                  <svg width="36" height="36" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="20" height="20" rx="4"/>
                    <line x1="14" y1="4" x2="14" y2="24"/>
                    <line x1="4" y1="14" x2="24" y2="14"/>
                  </svg>
                </div>
                <div class="plugin-card-info">
                  <div class="plugin-card-header">
                    <span class="plugin-card-name">
                      {{ plugin.name }}
                      <el-tag v-if="plugin.devMode" size="small" type="warning" effect="plain" class="dev-tag">DEV</el-tag>
                    </span>
                    <span class="plugin-card-version">v{{ plugin.version }}</span>
                  </div>
                  <div class="plugin-card-meta">
                    <span class="plugin-card-path">路径：{{ plugin.installPath }}</span>
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
                <el-button type="danger" size="small" plain @click="handleUninstall(plugin.id)">
                  {{ $t('pluginMarket.uninstall') }}
                </el-button>
              </div>
            </div>

            <div v-if="pluginStore.installedPlugins.length === 0" class="market-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <line x1="12" y1="3" x2="12" y2="21"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
              </svg>
              <p>{{ $t('pluginMarket.noInstalled') }}</p>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Search, Loading } from '@element-plus/icons-vue'
import { usePluginStore } from '@/stores/pluginStore'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const pluginStore = usePluginStore()

const activeTab = ref('browse')
const searchQuery = ref('')
const loading = ref(false)
const errorMsg = ref('')
const installingId = ref(null)

// ─── 已安装数量标签 ──────────────────────────────
const installedLabel = computed(() => {
  const n = pluginStore.installedPlugins.length
  return `${t('pluginMarket.installed')}${n ? ` (${n})` : ''}`
})

const isInstalled = (id) => pluginStore.isInstalled(id)

// ─── 浏览列表（合并市场清单 + dev 插件）──────────
const browsePlugins = computed(() => {
  const remote = (pluginStore.marketplaceListing?.plugins || []).map(p => ({
    ...p,
    _source: 'remote'
  }))
  // 将 dev 插件也注入浏览列表
  const devPlugins = pluginStore.installedPlugins
    .filter(p => p.devMode)
    .filter(p => !remote.some(r => r.id === p.id))  // 不去重（如果远程已有同 id，dev 覆盖）
    .map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: '本地开发插件',
      author: 'dev',
      _dev: true,
      _source: 'dev'
    }))
  // dev 插件优先显示在最前面
  return [...devPlugins, ...remote]
})

const filteredPlugins = computed(() => {
  const list = browsePlugins.value
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(p =>
    p.name?.toLowerCase().includes(q) ||
    p.description?.toLowerCase().includes(q) ||
    p.author?.toLowerCase().includes(q) ||
    p.tags?.some?.(t => t.toLowerCase().includes(q))
  )
})

// ─── 加载市场 ────────────────────────────────────
async function loadMarketplace() {
  loading.value = true
  errorMsg.value = ''
  try {
    await pluginStore.fetchMarketplaceListing()
  } catch (e) {
    errorMsg.value = e.message || '获取插件市场失败'
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
    await ElMessageBox.confirm(
      '卸载后将删除插件及其数据，确定继续？',
      '确认卸载',
      { confirmButtonText: '卸载', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await pluginStore.uninstallPlugin(pluginId)
    ElMessage.success('已卸载')
  } catch (e) {
    ElMessage.error(`卸载失败：${e.message || '未知错误'}`)
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
  if (!pluginStore.marketplaceListing && !loading.value) {
    loadMarketplace()
  }
})

// ─── 格式化 ──────────────────────────────────────
function formatInstalls(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
</script>

<style scoped>
.plugin-market-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 0;
  overflow: hidden;
}

.market-header {
  flex-shrink: 0;
  margin-bottom: 4px;
}

.market-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--cc-text, #e0e5e9);
}

.market-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.market-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.market-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.market-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.market-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

/* ─── 插件卡片网格 ────────────────────────── */
.plugin-grid {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
  padding-bottom: 16px;
}

.plugin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--cc-border-light, #3a3a3a);
  border-radius: 10px;
  padding: 16px;
  background: var(--cc-bg-card, rgba(255, 255, 255, 0.03));
  gap: 16px;
  transition: border-color 0.15s;
}

.plugin-card:hover {
  border-color: var(--cc-primary-border, rgba(64, 158, 255, 0.3));
}

.plugin-card-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.plugin-card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
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
  font-size: 15px;
  color: var(--cc-text, #e0e5e9);
}

.dev-tag {
  margin-left: 4px;
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
  margin-top: 6px;
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--cc-text-muted, #8b949e);
}

.plugin-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.plugin-card-path {
  font-size: 11px;
  color: var(--cc-text-muted, #8b949e);
  word-break: break-all;
}

/* ─── 状态 ────────────────────────────────── */
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
  padding: 64px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--cc-text-dim, #8b949e);
  font-size: 14px;
}

/* ─── 滚动条 ──────────────────────────────── */
.plugin-grid::-webkit-scrollbar {
  width: 4px;
}

.plugin-grid::-webkit-scrollbar-thumb {
  background: var(--cc-border-light, #3a3a3a);
  border-radius: 2px;
}
</style>
