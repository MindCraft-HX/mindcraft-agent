<template>
  <div v-if="visible" class="mp-overlay" @click.self="close">
    <div class="mp-panel">
      <!-- 标题栏 -->
      <div class="mp-header">
        <span class="mp-title">{{ $t('agent.plugins') }}</span>
        <button class="mp-close" @click="close">×</button>
      </div>

      <!-- Tabs -->
      <div class="mp-tabs">
        <button
          v-for="tab in tabs" :key="tab.key"
          class="mp-tab" :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </div>

      <!-- Tab: Plugins -->
      <div v-if="activeTab === 'plugins'" class="mp-body">
        <div class="mp-search-row">
          <input
            v-model="searchQuery"
            class="mp-search"
            :placeholder="$t('agent.searchPlugins')"
            autofocus
          />
        </div>

        <div v-if="loading" class="mp-empty">{{ $t('chat.loading') }}</div>
        <template v-else>
          <!-- INSTALLED 分组 -->
          <div v-if="installedPlugins.length" class="mp-group">
            <div class="mp-group-label">{{ $t('agent.installedN', { n: installedPlugins.length }) }}</div>
            <div class="mp-list">
              <template v-for="plugin in installedPlugins" :key="plugin.id">
                <div class="mp-item installed">
                  <div class="mp-item-icon">
                    <span class="mp-item-icon-default">⬡</span>
                  </div>
                  <div class="mp-item-info">
                    <div class="mp-item-name">{{ plugin.name }}</div>
                    <div class="mp-item-desc">{{ plugin.description }}</div>
                    <div class="mp-item-meta">
                      <span class="mp-item-author">{{ plugin.author }}</span>
                      <span v-if="plugin.installs" class="mp-item-installs">↓ {{ formatInstalls(plugin.installs) }}</span>
                      <span class="mp-item-tag">{{ plugin.market }}</span>
                    </div>
                  </div>
                  <div class="mp-item-actions">
                    <button
                      class="mp-btn-link"
                      @click="togglePluginDetail(plugin)"
                      :title="expandedPlugin === plugin.id ? $t('agent.collapseDetail') : $t('agent.expandDetail')"
                    >{{ expandedPlugin === plugin.id ? $t('agent.collapse') : $t('agent.detail') }}</button>
                    <div
                      class="mp-toggle" :class="{ on: plugin.enabled !== false }"
                      @click="togglePlugin(plugin)"
                      :title="plugin.enabled !== false ? $t('agent.enabledClickDisable') : $t('agent.disabledClickEnable')"
                    >
                      <div class="mp-toggle-knob"></div>
                    </div>
                    <button
                      class="mp-btn mp-btn-uninstall"
                      :disabled="plugin._busy"
                      @click="uninstallPlugin(plugin)"
                      :title="$t('agent.uninstall')"
                    >{{ plugin._busy ? '…' : $t('agent.uninstall') }}</button>
                  </div>
                </div>
                <!-- 内嵌详情面板 -->
                <div v-if="expandedPlugin === plugin.id" class="mp-detail-panel">
                  <div class="mp-detail-content">
                    <div class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.description') }}</div>
                      <div class="mp-detail-text">{{ plugin.description || $t('agent.noDescription') }}</div>
                    </div>
                    <div class="mp-detail-row">
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.author') }}</div>
                        <div class="mp-detail-text">{{ plugin.author }}</div>
                      </div>
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.status') }}</div>
                        <div class="mp-detail-text">{{ plugin.enabled !== false ? $t('agent.enabled') : $t('agent.disabled') }}</div>
                      </div>
                    </div>
                    <div class="mp-detail-row">
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.marketSource') }}</div>
                        <div class="mp-detail-text">{{ plugin.market || $t('agent.unknown') }}</div>
                      </div>
                      <div v-if="plugin.installs" class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.installs') }}</div>
                        <div class="mp-detail-text">↓ {{ formatInstalls(plugin.installs) }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- AVAILABLE 分组 -->
          <div v-if="availablePlugins.length" class="mp-group">
            <div class="mp-group-label">{{ $t('agent.marketplaceN', { n: availablePlugins.length }) }}</div>
            <div class="mp-list">
              <template v-for="plugin in availablePlugins" :key="plugin.id">
                <div class="mp-item">
                  <div class="mp-item-icon">
                    <span class="mp-item-icon-default">⬡</span>
                  </div>
                  <div class="mp-item-info">
                    <div class="mp-item-name">{{ plugin.name }}</div>
                    <div class="mp-item-desc">{{ plugin.description }}</div>
                    <div class="mp-item-meta">
                      <span class="mp-item-author">{{ plugin.author }}</span>
                      <span v-if="plugin.installs" class="mp-item-installs">↓ {{ formatInstalls(plugin.installs) }}</span>
                      <span class="mp-item-tag">{{ plugin.market }}</span>
                    </div>
                  </div>
                  <div class="mp-item-actions">
                    <button
                      class="mp-btn-link"
                      @click="togglePluginDetail(plugin)"
                      :title="expandedPlugin === plugin.id ? $t('agent.collapseDetail') : $t('agent.expandDetail')"
                    >{{ expandedPlugin === plugin.id ? $t('agent.collapse') : $t('agent.detail') }}</button>
                    <button
                      class="mp-btn mp-btn-install"
                      :disabled="plugin._busy"
                      @click="installPlugin(plugin)"
                    >{{ plugin._busy ? '…' : $t('agent.install') }}</button>
                  </div>
                </div>
                <!-- 内嵌详情面板 -->
                <div v-if="expandedPlugin === plugin.id" class="mp-detail-panel">
                  <div class="mp-detail-content">
                    <div class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.description') }}</div>
                      <div class="mp-detail-text">{{ plugin.description || $t('agent.noDescription') }}</div>
                    </div>
                    <div class="mp-detail-row">
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.author') }}</div>
                        <div class="mp-detail-text">{{ plugin.author }}</div>
                      </div>
                      <div class="mp-detail-section">
                        <div class="mp-detail-label">{{ $t('agent.marketSource') }}</div>
                        <div class="mp-detail-text">{{ plugin.market || $t('agent.unknown') }}</div>
                      </div>
                    </div>
                    <div v-if="plugin.installs" class="mp-detail-section">
                      <div class="mp-detail-label">{{ $t('agent.installs') }}</div>
                      <div class="mp-detail-text">↓ {{ formatInstalls(plugin.installs) }}</div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <div v-if="!installedPlugins.length && !availablePlugins.length" class="mp-empty">{{ $t('agent.noMatchPlugins') }}</div>
        </template>
      </div>

      <!-- Tab: Marketplaces -->
      <div v-if="activeTab === 'marketplaces'" class="mp-body">
        <div class="mp-section-label">{{ $t('agent.marketplaceSources') }}</div>
        <div class="mp-list">
          <div v-if="!marketplaces.length" class="mp-empty">
            <div>{{ $t('agent.noMarketplace') }}</div>
            <div class="mp-empty-hint">{{ $t('agent.marketplaceSetupHint') }}</div>
          </div>
          <div
            v-for="(m, idx) in marketplaces" :key="idx"
            class="mp-market-item"
          >
            <div class="mp-market-icon">⊕</div>
            <div class="mp-market-info">
              <div class="mp-item-name">{{ m.id }}</div>
              <div class="mp-item-desc">{{ m.url }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const { t } = useI18n()

const props = defineProps({
  apiPrefix: { type: String, default: 'plugins' }, // 'plugins' for ClaudeCode, 'codexPlugins' for CodeX
})
const emit = defineEmits(['plugin-toggled'])

const api = (name) => window.electronAPI?.[props.apiPrefix + name]

const visible = ref(false)
const activeTab = ref('plugins')
const searchQuery = ref('')
const loading = ref(false)

const tabs = [
  { key: 'plugins', label: t('agent.plugins') },
  { key: 'marketplaces', label: t('agent.marketSource') },
]

const expandedPlugin = ref(null)  // 当前展开详情的 plugin id
const allPlugins = ref([])
const marketplaces = ref([])

async function loadState() {
  loading.value = true
  try {
    const state = await api('GetState')?.()
    const plugins = Array.isArray(state?.plugins) ? state.plugins : []
    // enabled 状态由 CLI 返回，不再强制默认 true
    allPlugins.value = plugins
    marketplaces.value = Array.isArray(state?.marketplaces) ? state.marketplaces : []
  } catch (_) {
    // 加载失败时保留已有数据，避免 CLI 偶发超时导致"全部未安装"
    // 仅在首次加载（无历史数据）时才显示为空
    if (!allPlugins.value.length) {
      allPlugins.value = []
      marketplaces.value = []
    }
  } finally {
    loading.value = false
  }
}

function filterByQuery(list) {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    (p.market || '').toLowerCase().includes(q)
  )
}

const installedPlugins = computed(() => filterByQuery(allPlugins.value.filter(p => p.installed)))
const availablePlugins = computed(() => filterByQuery(allPlugins.value.filter(p => !p.installed)))

async function installPlugin(plugin) {
  plugin._busy = true
  try {
    const res = await api('Install')?.(plugin.id)
    if (res?.ok === false) {
      ElMessage.error(t('agent.installError', { message: res.error || t('agent.unknownError') }))
    } else {
      plugin.installed = true
      plugin.enabled = true
      ElMessage.success(t('agent.installedPlugin', { name: plugin.name }))
      emit('plugin-toggled')
    }
  } catch (e) {
    ElMessage.error(t('agent.installError', { message: e?.message || e }))
  } finally {
    plugin._busy = false
  }
}

async function uninstallPlugin(plugin) {
  plugin._busy = true
  try {
    const res = await api('Uninstall')?.(plugin.id)
    if (res?.ok === false) {
      ElMessage.error(t('agent.uninstallError', { message: res.error || t('agent.unknownError') }))
    } else {
      plugin.installed = false
      plugin.enabled = true
      ElMessage.success(t('agent.uninstalledPlugin', { name: plugin.name }))
    }
  } catch (e) {
    ElMessage.error(t('agent.uninstallError', { message: e?.message || e }))
  } finally {
    plugin._busy = false
  }
}

async function togglePlugin(plugin) {
  const next = plugin.enabled === false
  plugin.enabled = next
  try {
    if (next) {
      await api('Enable')?.(plugin.id)
    } else {
      await api('Disable')?.(plugin.id)
    }
    emit('plugin-toggled')
  } catch (_) {}
}

function togglePluginDetail(plugin) {
  expandedPlugin.value = expandedPlugin.value === plugin.id ? null : plugin.id
}

function formatInstalls(n) {
  if (!n) return ''
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

function open() {
  searchQuery.value = ''
  activeTab.value = 'plugins'
  visible.value = true
  loadState()
}

function close() {
  visible.value = false
}

defineExpose({ open, close })
</script>

<style scoped>
.mp-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--cc-bg-overlay);
  display: flex; align-items: center; justify-content: center;
}
.mp-panel {
  background: var(--cc-bg-secondary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 10px;
  width: 640px; max-width: 92vw;
  max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px var(--cc-shadow);
  overflow: hidden;
}
.mp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--cc-border);
}
.mp-title {
  font-size: 14px; font-weight: 600;
  color: var(--cc-text);
}
.mp-close {
  background: none; border: none; cursor: pointer;
  color: var(--cc-text-dim); font-size: 18px; line-height: 1;
  padding: 0 2px;
}
.mp-close:hover { color: var(--cc-text); }

.mp-tabs {
  display: flex; gap: 0;
  padding: 0 18px;
  border-bottom: 1px solid var(--cc-border);
}
.mp-tab {
  background: none; border: none; cursor: pointer;
  padding: 8px 14px; font-size: 12px; font-weight: 500;
  color: var(--cc-text-dim);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.mp-tab.active {
  color: var(--cc-primary);
  border-bottom-color: var(--cc-primary);
}
.mp-tab:hover:not(.active) { color: var(--cc-text); }

.mp-body {
  flex: 1; overflow-y: auto; padding: 12px 18px 16px;
  display: flex; flex-direction: column; gap: 6px;
}
.mp-search-row { display: flex; gap: 8px; margin-bottom: 4px; }
.mp-search {
  flex: 1; background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border-strong);
  border-radius: 5px; padding: 6px 10px;
  color: var(--cc-text); font-size: 12px; outline: none;
}
.mp-search:focus { border-color: var(--cc-primary); }
.mp-search::placeholder { color: var(--cc-text-placeholder); }

/* 分组 */
.mp-group { display: flex; flex-direction: column; gap: 2px; }
.mp-group + .mp-group { margin-top: 10px; }
.mp-group-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.5px;
  color: var(--cc-text-dim); padding: 4px 2px 6px;
  user-select: none;
}

.mp-list { display: flex; flex-direction: column; gap: 2px; }
.mp-empty { color: var(--cc-text-dim); font-size: 12px; padding: 24px 0; text-align: center; }

.mp-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 8px; border-radius: 6px;
  border: 1px solid transparent;
  transition: background 0.1s, border-color 0.1s;
  cursor: default;
}
.mp-item:hover { background: var(--cc-bg-hover); }
.mp-item.installed { border-color: var(--cc-primary-border); }

.mp-item-icon {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--cc-bg-tertiary);
  border-radius: 7px; font-size: 18px;
  border: 1px solid var(--cc-border);
}
.mp-item-icon-default { font-size: 20px; color: var(--cc-text-dim); }

.mp-item-info { flex: 1; min-width: 0; }
.mp-item-name { font-size: 13px; font-weight: 500; color: var(--cc-text); margin-bottom: 2px; }
.mp-item-desc { font-size: 11px; color: var(--cc-text-dim); line-height: 1.5; margin-bottom: 4px; }
.mp-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mp-item-author { font-size: 10px; color: var(--cc-text-muted); }
.mp-item-installs { font-size: 10px; color: var(--cc-text-muted); }
.mp-item-tag {
  font-size: 10px; padding: 1px 5px;
  background: var(--cc-bg-elevated); border-radius: 3px;
  color: var(--cc-text-dim);
}

.mp-item-actions {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding-top: 2px;
}

/* Toggle 开关 */
.mp-toggle {
  width: 32px; height: 18px; border-radius: 9px;
  background: var(--cc-toggle-off); position: relative; cursor: pointer;
  transition: background 0.2s; flex-shrink: 0;
}
.mp-toggle.on { background: var(--cc-primary); }
.mp-toggle-knob {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--cc-toggle-knob); position: absolute; top: 2px; left: 2px;
  transition: transform 0.2s;
}
.mp-toggle.on .mp-toggle-knob { transform: translateX(14px); }

/* 按钮 */
.mp-btn {
  border: 1px solid var(--cc-border-strong);
  border-radius: 4px; padding: 4px 12px;
  font-size: 11px; cursor: pointer;
  background: none;
  transition: background 0.1s, color 0.1s;
}
.mp-btn:disabled { opacity: 0.5; cursor: default; }
.mp-btn-install {
  color: var(--cc-primary);
  border-color: var(--cc-primary);
}
.mp-btn-install:hover:not(:disabled) { background: var(--cc-primary); color: var(--cc-btn-primary-text); }
.mp-btn-uninstall { color: var(--cc-text-dim); }
.mp-btn-uninstall:hover:not(:disabled) { background: var(--cc-bg-hover); color: var(--cc-text); }

/* Marketplaces */
.mp-section-label {
  font-size: 11px; color: var(--cc-text-dim);
  font-weight: 500; padding-bottom: 4px;
}

.mp-market-item {
  display: flex; align-items: center; gap: 12px;
  padding: 8px; border-radius: 6px;
  border: 1px solid var(--cc-border);
}
.mp-market-item:hover { background: var(--cc-bg-hover); }
.mp-market-icon { font-size: 18px; flex-shrink: 0; width: 28px; text-align: center; color: var(--cc-text-dim); }
.mp-market-info { flex: 1; min-width: 0; }

/* 链接按钮 */
.mp-btn-link {
  font-size: 10px; color: var(--cc-text-dim);
  text-decoration: none; cursor: pointer; padding: 2px 0;
  background: none; border: none;
}
.mp-btn-link:hover { color: var(--cc-text); text-decoration: underline; }

/* ── 内嵌详情面板 ── */
.mp-detail-panel {
  margin: 0 8px 4px 56px;
  background: var(--cc-bg-tertiary);
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  overflow: hidden;
  animation: mp-detail-in 0.2s ease-out;
}
@keyframes mp-detail-in {
  from { opacity: 0; max-height: 0; }
  to { opacity: 1; max-height: 400px; }
}
.mp-detail-content {
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.mp-detail-section { min-width: 0; }
.mp-detail-label {
  font-size: 10px; font-weight: 600;
  color: var(--cc-text-muted); text-transform: uppercase;
  margin-bottom: 2px;
}
.mp-detail-text {
  font-size: 12px; color: var(--cc-text);
  line-height: 1.5; word-break: break-word;
}
.mp-detail-row {
  display: flex; gap: 24px; flex-wrap: wrap;
}
.mp-detail-row .mp-detail-section { flex: 1; min-width: 100px; }
.mp-detail-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.mp-detail-tag {
  font-size: 10px; padding: 2px 7px;
  background: var(--cc-bg-elevated);
  border: 1px solid var(--cc-border);
  border-radius: 4px; color: var(--cc-text-dim);
}
.mp-detail-link {
  font-size: 11px; color: var(--cc-primary);
  text-decoration: none; word-break: break-all;
}
.mp-detail-link:hover { text-decoration: underline; }

/* 空状态操作指引 */
.mp-empty-hint {
  margin-top: 8px; font-size: 11px;
  color: var(--cc-text-muted); line-height: 1.6;
}
.mp-empty-hint code {
  background: var(--cc-bg-tertiary);
  padding: 1px 5px; border-radius: 3px;
  font-size: 10px; color: var(--cc-text);
  border: 1px solid var(--cc-border);
}
</style>
