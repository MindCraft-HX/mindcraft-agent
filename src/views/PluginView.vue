<!--
  PluginView — 动态插件加载器
  根据路由参数 pluginId，从主进程读取插件入口代码，动态 import 并渲染
-->
<template>
  <div class="plugin-view">
    <!-- 加载中 -->
    <div v-if="loading" class="plugin-status">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <p>{{ $t('pluginMarket.loading') }}</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="plugin-status plugin-error">
      <p>{{ error }}</p>
      <el-button size="small" @click="loadPlugin">{{ $t('common.retry') }}</el-button>
    </div>

    <!-- 插件未安装 -->
    <div v-else-if="!pluginInstalled" class="plugin-status">
      <p>{{ $t('pluginMarket.notInstalled', { id: pluginId }) }}</p>
      <el-button size="small" @click="goMarket">{{ $t('pluginMarket.goMarket') }}</el-button>
    </div>

    <!-- 插件已禁用 -->
    <div v-else-if="pluginDisabled" class="plugin-status">
      <p>{{ $t('pluginMarket.pluginDisabled', { name: pluginName }) }}</p>
    </div>

    <!-- 渲染插件组件 -->
    <component
      v-else-if="pluginComponent"
      :is="pluginComponent"
      :pluginId="pluginId"
      :pluginApi="pluginApi"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePluginStore } from '@/stores/pluginStore'
import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const pluginStore = usePluginStore()

const pluginId = computed(() => route.params.pluginId)
const loading = ref(true)
const error = ref(null)
const pluginComponent = ref(null)

// 插件信息
const pluginInstalled = ref(true)
const pluginDisabled = ref(false)
const pluginName = ref('')

// 传递给插件的 API
const pluginApi = computed(() => ({
  getData: (key) => pluginStore.getPluginData(pluginId.value, key),
  setData: (key, value) => pluginStore.setPluginData(pluginId.value, key, value),
  // 后续可扩展更多 API
}))

function goMarket() {
  router.push('/main/home')  // 回到首页，用户可从导航栏进市场
}

async function loadPlugin() {
  loading.value = true
  error.value = null
  pluginComponent.value = null

  try {
    // 检查插件是否已安装且启用
    await pluginStore.loadInstalledPlugins()
    const plugin = pluginStore.installedPlugins.find(p => p.id === pluginId.value)

    if (!plugin) {
      pluginInstalled.value = false
      return
    }
    pluginInstalled.value = true

    if (!plugin.enabled) {
      pluginDisabled.value = true
      pluginName.value = plugin.name || pluginId.value
      return
    }
    pluginDisabled.value = false

    // 从主进程读取插件入口代码
    const entryCode = await window.electronAPI?.pluginReadEntry?.(pluginId.value)
    if (!entryCode) {
      throw new Error(t('pluginMarket.entryEmpty'))
    }

    // 注入 Vue h 函数到全局作用域，供插件渲染函数使用
    window.__vue_h__ = h

    // 通过 Blob URL 动态加载 ES module
    const blob = new Blob([entryCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)

    try {
      const module = await import(/* @vite-ignore */ url)
      pluginComponent.value = module.default || module
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    error.value = e.message || t('pluginMarket.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(loadPlugin)
watch(pluginId, () => {
  if (pluginId.value) loadPlugin()
})

onUnmounted(() => {
  pluginComponent.value = null
})
</script>

<style scoped>
.plugin-view {
  height: 100%;
  overflow: auto;
}

.plugin-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--cc-text-dim, #8b949e);
}

.plugin-error {
  color: var(--cc-danger, #f56c6c);
}
</style>
