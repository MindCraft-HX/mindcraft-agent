<template>
  <div class="main-layout" :class="themeClass">
    <!-- 窗口控制按钮（无边框模式） -->
    <div class="win-controls">
      <button class="wc-btn" @click="minimize">
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <button class="wc-btn" @click="maximize">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <button class="wc-btn wc-close" @click="closeWin">
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
    </div>

    <el-container style="height: 100%">
      <!-- 左侧边栏 -->
      <el-aside class="sidebar" :class="{ collapsed: sidebarCollapsed }" :width="sidebarCollapsed ? '48px' : '64px'">
        <div class="sidebar-inner">
          <div class="sidebar-drag-handle"></div>
          <!-- Logo -->
          <div class="sidebar-logo" @click="$router.push('/main/home')">
            <div class="logo-icon"></div>
          </div>

          <!-- 导航菜单 -->
          <div class="sidebar-nav">
            <div
              class="sidebar-item"
              :class="{ active: activeIndex === '/main/codeHub', 'has-notification': codehubHasNotification && activeIndex !== '/main/codeHub' }"
              @click="$router.push('/main/codeHub')"
              :title="$t('nav.project')"
            >
              <div class="sidebar-icon-wrapper">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="7 5.5 3.5 10 7 14.5"/>
                  <polyline points="13 5.5 16.5 10 13 14.5"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.project') }}</span>
            </div>

            <div
              class="sidebar-item"
              :class="{ active: activeIndex === '/main/mdViewer' }"
              @click="openMdBrowser"
              :title="$t('nav.docs')"
            >
              <div class="sidebar-icon-wrapper">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 2.5H5.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V7L11 2.5z"/>
                  <polyline points="11 2.5 11 7 16 7"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.docsShort') }}</span>
            </div>

            <div
              class="sidebar-item"
              :class="{ active: activeIndex === '/main/chat' }"
              @click="$router.push('/main/chat')"
              :title="$t('nav.chat')"
            >
              <div class="sidebar-icon-wrapper">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 4h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7l-4 3V6a2 2 0 0 1 2-2z"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.chat') }}</span>
            </div>

            <!-- 分隔线（有已安装插件时显示） -->
            <div v-if="enabledPlugins.length > 0" class="sidebar-separator"></div>

            <!-- 动态插件导航项 -->
            <div
              v-for="plugin in enabledPlugins"
              :key="plugin.id"
              class="sidebar-item"
              :class="{ active: pluginActiveId === plugin.id }"
              @click="openPlugin(plugin.id)"
              :title="plugin.name"
            >
              <div class="sidebar-icon-wrapper">
                <!-- 插件自定义图标（如 manifest.icon 中的 SVG） -->
                <span v-if="plugin.icon" class="nav-icon-plugin" v-html="plugin.icon"></span>
                <!-- 默认网格图标 -->
                <svg v-else class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="14" height="14" rx="2"/>
                  <line x1="9" y1="3" x2="9" y2="17"/>
                  <line x1="3" y1="9" x2="17" y2="9"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ plugin.name }}</span>
            </div>

            <!-- "+" 按钮：进入插件市场 -->
            <div
              class="sidebar-item sidebar-item--add"
              :class="{ active: activeIndex === '/main/pluginMarket' }"
              @click="$router.push('/main/pluginMarket')"
              :title="$t('nav.addPlugin')"
            >
              <div class="sidebar-icon-wrapper">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
                  <line x1="10" y1="3" x2="10" y2="17"/>
                  <line x1="3" y1="10" x2="17" y2="10"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.addPlugin') }}</span>
            </div>
          </div>

          <!-- 底部：收缩按钮 + 设置 -->
          <div class="sidebar-bottom">
            <el-popover
              placement="right-start"
              :width="150"
              trigger="click"
              :teleported="false"
              :popper-options="{ strategy: 'fixed' }"
              popper-class="theme-picker-popover"
            >
              <template #reference>
                <div
                  class="sidebar-item"
                  :title="$t('nav.theme') + '：' + $t(claudeTheme.themeLabelKey(claudeTheme.theme))"
                >
                  <div class="sidebar-icon-wrapper">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 0 1 13 0 6.5 6.5 0 0 0-6.5-6.5v13A6.5 6.5 0 0 1 1.5 8z"/>
                    </svg>
                  </div>
                  <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.theme') }}</span>
                </div>
              </template>
              <div class="theme-picker">
                <div
                  v-for="t in claudeTheme.themes"
                  :key="t"
                  class="theme-option"
                  :class="{ active: claudeTheme.theme === t }"
                  @click="claudeTheme.setTheme(t)"
                >
                  <span class="theme-dot" :class="`theme-dot-${t}`"></span>
                  <span class="theme-name">{{ $t(claudeTheme.themeLabelKey(t)) }}</span>
                  <el-icon v-if="claudeTheme.theme === t" class="theme-check"><Check /></el-icon>
                </div>
              </div>
            </el-popover>

            <!-- Locale Switcher -->
            <el-popover
              placement="right-start"
              :width="150"
              trigger="click"
              :teleported="false"
              :popper-options="{ strategy: 'fixed' }"
              popper-class="locale-picker-popover"
            >
              <template #reference>
                <div class="sidebar-item" :title="$t('nav.language')">
                  <div class="sidebar-icon-wrapper">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  </div>
                  <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.language') }}</span>
                </div>
              </template>
              <LocaleSwitcher />
            </el-popover>

            <div
              class="sidebar-item"
              @click="openSettings"
              :title="$t('nav.settings')"
            >
              <div class="sidebar-icon-wrapper">
                <el-icon :size="20"><Setting /></el-icon>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ $t('nav.settings') }}</span>
            </div>
          </div>
        </div>
      </el-aside>

      <!-- 右侧内容区 -->
      <el-main class="content-layout">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['codeHub', 'mdViewer', 'chat']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- 设置弹窗（SharedSettings modal） -->
    <SharedSettings ref="sharedSettingsRef" />

  </div>
</template>

<script setup>
import { provide, ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Setting, Check } from '@element-plus/icons-vue';
import { SharedSettings, useClaudeThemeStore } from '@mindcraft/agent';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import { storeToRefs } from 'pinia';
import { usePluginStore } from '@/stores/pluginStore';

const settingsDrawer = ref(false);
const activeSetting = ref(null);
const sharedSettingsRef = ref(null);
const sidebarCollapsed = ref(false);
// 任务完成通知状态：由 codeHub 更新，用于侧边栏"项目"图标提醒
const codehubHasNotification = ref(false);
const pluginStore = usePluginStore();
const { enabledPlugins } = storeToRefs(pluginStore);
const claudeTheme = useClaudeThemeStore();
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`);
provide("settingsDrawer", settingsDrawer);
provide("activeSetting", activeSetting);
provide("codehubHasNotification", codehubHasNotification);

function openSettings() {
  sharedSettingsRef.value?.open()
}

// 窗口控制（无边框模式）
const minimize = () => window.electronAPI?.minimize()
const maximize = () => window.electronAPI?.maximize()
const closeWin = () => window.electronAPI?.close()

const route = useRoute();
const router = useRouter();

const activeIndex = computed(() => {
  return route.meta.parent || "/main/codeHub"
})

// 文档浏览：直接路由到主窗口内嵌视图（不再弹独立窗口）
const openMdBrowser = () => router.push('/main/mdViewer')

// 插件：当前激活的插件 ID（通过路由参数判断）
const pluginActiveId = computed(() => {
  if (route.path.startsWith('/main/plugin/')) {
    return route.params.pluginId
  }
  return null
})

function openPlugin(pluginId) {
  router.push(`/main/plugin/${pluginId}`)
}

// 监听主进程 push 的文档打开请求（agent 消息点文档链接时触发）
let disposeOpenMdViewer = null
onMounted(async () => {
  disposeOpenMdViewer = window.electronAPI?.onOpenMdViewer?.(() => {
    router.push('/main/mdViewer')
  })
  // 插件系统：加载已安装列表 + 监听主进程变更
  await pluginStore.loadInstalledPlugins()
  pluginStore.listenForRegistryChanges()
})
onUnmounted(() => {
  if (typeof disposeOpenMdViewer === 'function') disposeOpenMdViewer()
  pluginStore.cleanup()
})

// 设置入口（通过 SharedSettings 弹窗触发）
window.electronAPI?.openTabByName?.((progress) => {
  openSettings()
})
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100%;
  -webkit-app-region: no-drag;
}

/* === 内容区顶部拖拽区（::before 伪元素，无独立背景，渐变由 content-layout 统一控制） === */
.content-layout::before {
  content: '';
  display: block;
  height: 18px;
  margin-right: 90px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

/* === 窗口控制按钮（无边框模式） === */
.win-controls {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  -webkit-app-region: no-drag;
}
.wc-btn {
  width: 30px;
  height: 28px;
  border: none;
  background: transparent;
  -webkit-app-region: no-drag;
  color: var(--cc-text-dim, #8b949e);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
  &:hover {
    background: var(--cc-bg-hover, rgba(255,255,255,0.1));
    color: var(--cc-text, #e0e5e9);
  }
}
.wc-close:hover {
  background: #e81123;
  color: #fff;
}

/* === 侧边栏 === */
.sidebar {
  background: var(--cc-bg-deepest, #0d1117);
  border-right: 1px solid var(--cc-border-light, #21262d);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  -webkit-app-region: drag;

  &.collapsed {
    .sidebar-logo {
      width: 32px;
      height: 32px;
      margin: 4px 8px 16px;
      .logo-icon {
        width: 30px;
        height: 30px;
      }
    }
    .sidebar-item {
      height: 40px;
    }
  }
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  align-items: center;
}

.sidebar-drag-handle {
  width: 100%;
  height: 28px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

/* Logo */
.sidebar-logo {
  width: 48px;
  height: 48px;
  margin: 4px 8px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 12px;
  transition: background 0.2s;
  flex-shrink: 0;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--cc-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .logo-icon {
    width: 44px;
    height: 44px;
    background-image: url(./assets/logo-white.png);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
  }
}

/* 导航区 */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

/* 菜单项 */
.sidebar-item {
  width: 48px;
  height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  cursor: pointer;
  color: var(--cc-text-muted, #8b949e);
  transition: all 0.15s;
  -webkit-app-region: no-drag;
  gap: 2px;
  position: relative;

  &:hover {
    background: var(--cc-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cc-text, #e0e5e9);
  }

  &.active {
    background: var(--cc-primary-bg, rgba(64, 158, 255, 0.15));
    color: var(--cc-primary, #409eff);

    .sidebar-label {
      color: var(--cc-primary, #409eff);
    }
  }

  /* 任务完成通知：侧边栏图标脉冲 + 右上角小圆点 */
  &.has-notification {
    color: var(--cc-warning, #e6a23c);
    animation: sidebar-notify-pulse 1.6s ease-in-out infinite;

    .sidebar-label { color: var(--cc-warning, #e6a23c); }

    &::after {
      content: '';
      position: absolute;
      top: 6px;
      right: 6px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--cc-warning, #e6a23c);
    }
  }

  .sidebar-icon-wrapper {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-icon {
    display: block;
  }

  /* 插件自定义 SVG 图标：继承父元素颜色 */
  .nav-icon-plugin {
    display: block;
    width: 20px;
    height: 20px;
  }
  .nav-icon-plugin :deep(svg) {
    width: 20px;
    height: 20px;
    display: block;
  }

  .sidebar-label {
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 56px;
  }
}

/* 侧边栏通知脉冲动画 */
@keyframes sidebar-notify-pulse {
  0%, 100% { background: transparent; }
  50% { background: var(--cc-warning-bg, rgba(230, 162, 60, 0.12)); }
}

/* 底部 */
.sidebar-bottom {
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

/* 插件导航分隔线 */
.sidebar-separator {
  width: 32px;
  height: 1px;
  background: var(--cc-border-light, #3a3a3a);
  margin: 4px 0;
  flex-shrink: 0;
}

/* "+" 按钮：虚线边框，低透明度，悬停增强 */
.sidebar-item--add {
  opacity: 0.55;
  border: 1px dashed var(--cc-border-light, #3a3a3a);

  &:hover {
    opacity: 1;
    border-style: solid;
  }
}

/* === 主题选择器 === */
/* popover 面板主题适配 */
:deep(.el-popover) {
  background: var(--cc-menu-bg, #252525) !important;
  border: 1px solid var(--cc-menu-border, #3a3a3a) !important;
  box-shadow: 0 6px 16px var(--cc-shadow, rgba(0,0,0,0.6)) !important;
  padding: 4px 0 !important;
  border-radius: 8px !important;
}

.theme-picker {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--cc-menu-text, #ccc);
  transition: background 0.12s;

  &:hover {
    background: var(--cc-menu-hover, #3a3a3a);
  }

  &.active {
    background: var(--cc-primary-bg, rgba(64, 158, 255, 0.12));
    color: var(--cc-primary, #409eff);

    .theme-name {
      font-weight: 500;
    }
  }

  .theme-check {
    margin-left: auto;
    color: var(--cc-primary, #409eff);
    flex-shrink: 0;
  }
}

.theme-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.theme-dot-dark {
  background: linear-gradient(135deg, #111827 0%, #374151 100%);
  border-color: #6b7280;
}

.theme-dot-light {
  background: linear-gradient(135deg, #ffffff 0%, #f7f6f4 58%, #eceae6 100%);
  border-color: #cfc8be;
}

.theme-dot-blue {
  background: #5b9bd5;
}

.theme-dot-brown {
  background: #9b6b4a;
}

.theme-name {
  white-space: nowrap;
}

/* === 内容区 === */
.content-layout {
  padding: 0 !important;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--cc-bg-secondary, #f0f2f5);
  display: flex;
  flex-direction: column;

  :deep(> router-view) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
}

</style>
