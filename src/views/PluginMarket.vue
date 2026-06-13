<!--
  PluginMarket — 插件市场弹窗
  浏览/Browse + 已安装/Installed 两个 Tab，支持搜索、安装、卸载、启停
-->
<template>
  <el-dialog
    v-model="visibleProxy"
    :title="$t('pluginMarket.title')"
    width="680px"
    top="6vh"
    :close-on-click-modal="false"
    destroy-on-close
    class="plugin-market-dialog"
  >
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- 浏览 Tab -->
      <el-tab-pane :label="$t('pluginMarket.browse')" name="browse">
        <div class="market-browse">
          <el-input
            v-model="searchQuery"
            :placeholder="$t('pluginMarket.searchPlaceholder')"
            clearable
            :prefix-icon="Search"
            class="market-search"
          />

          <!-- 加载中 -->
          <div v-if="loading" class="market-status">
            <el-icon class="is-loading" :size="20"><Loading /></el-icon>
            {{ $t('common.loading') }}
          </div>

          <!-- 加载失败 -->
          <div v-else-if="errorMsg" class="market-status market-error">
            <p>{{ errorMsg }}</p>
            <el-button size="small" @click="loadMarketplace">{{ $t('common.retry') }}</el-button>
          </div>

          <!-- 插件列表 -->
          <div v-else class="plugin-list">
            <div v-for="plugin in filteredPlugins" :key="plugin.id" class="plugin-card">
              <div class="plugin-card-body">
                <div class="plugin-card-icon">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="20" height="20" rx="4"/>
                    <line x1="14" y1="4" x2="14" y2="24"/>
                    <line x1="4" y1="14" x2="24" y2="14"/>
                  </svg>
                </div>
                <div class="plugin-card-info">
                  <div class="plugin-card-header">
                    <span class="plugin-card-name">{{ plugin.name }}</span>
                    <span class="plugin-card-version">v{{ plugin.version }}</span>
                  </div>
                  <div class="plugin-card-author">{{ plugin.author }}</div>
                  <div class="plugin-card-desc">{{ plugin.description }}</div>
                  <div class="plugin-card-meta">
                    <span v-if="plugin.installs" class="plugin-card-stats">
                      {{ $t('pluginMarket.installs', { n: formatInstalls(plugin.installs) }) }}
                    </span>
                    <span v-if="plugin.size" class="plugin-card-size">{{ formatSize(plugin.size) }}</span>
                  </div>
                </div>
              </div>
              <div class="plugin-card-actions">
                <el-button
                  v-if="!isInstalled(plugin.id)"
                  type="primary"
                  size="small"
                  :loading="installingId === plugin.id"
                  @click="handleInstall(plugin)"
                >
                  {{ $t('pluginMarket.install') }}
                </el-button>
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
              {{ $t('pluginMarket.noResults') }}
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 已安装 Tab -->
      <el-tab-pane :label="installedLabel" name="installed">
        <div class="plugin-list">
          <div v-for="plugin in pluginStore.installedPlugins" :key="plugin.id" class="plugin-card">
            <div class="plugin-card-body">
              <div class="plugin-card-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
                  <span>{{ $t('pluginMarket.installPath') }}: {{ plugin.installPath }}</span>
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
            {{ $t('pluginMarket.noInstalled') }}
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Search, Loading } from '@element-plus/icons-vue'
import { usePluginStore } from '@/stores/pluginStore'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const pluginStore = usePluginStore()

const activeTab = ref('browse')
const searchQuery = ref('')
const loading = ref(false)
const errorMsg = ref('')
const installingId = ref(null)

const visibleProxy = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

const installedLabel = computed(() => {
  const n = pluginStore.installedPlugins.length
  return `${t('pluginMarket.installed')}${n ? ` (${n})` : ''}`
})

const isInstalled = (id) => pluginStore.isInstalled(id)

const filteredPlugins = computed(() => {
  const list = pluginStore.marketplaceListing?.plugins || []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(p =>
    p.name?.toLowerCase().includes(q) ||
    p.description?.toLowerCase().includes(q) ||
    p.author?.toLowerCase().includes(q) ||
    p.tags?.some?.(t => t.toLowerCase().includes(q))
  )
})

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
    return  // 用户取消
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
  if (tab === 'installed') {
    pluginStore.loadInstalledPlugins()
  }
}

// 弹窗打开时自动加载
watch(visibleProxy, (v) => {
  if (v) {
    pluginStore.loadInstalledPlugins()
    if (!pluginStore.marketplaceListing && !loading.value) {
      loadMarketplace()
    }
  }
})

// ─── 格式化工具 ─────────────────────────────────────
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
.plugin-market-dialog :deep(.el-dialog__body) {
  padding: 8px 20px 20px;
}

.market-search {
  margin-bottom: 12px;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 52vh;
  overflow-y: auto;
  padding-right: 4px;
}

.plugin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--cc-border-light, #3a3a3a);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--cc-bg-card, rgba(255, 255, 255, 0.03));
  gap: 12px;
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
  width: 28px;
  height: 28px;
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
  margin-top: 4px;
  font-size: 13px;
  color: var(--cc-text-dim, #6e7681);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.plugin-card-meta {
  margin-top: 6px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--cc-text-muted, #8b949e);
}

.plugin-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.market-status {
  padding: 48px;
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
  padding: 48px;
  text-align: center;
  color: var(--cc-text-dim, #8b949e);
  font-size: 14px;
}

/* 滚动条样式 */
.plugin-list::-webkit-scrollbar {
  width: 4px;
}

.plugin-list::-webkit-scrollbar-thumb {
  background: var(--cc-border-light, #3a3a3a);
  border-radius: 2px;
}
</style>
