<template>
  <div class="main-layout" :class="themeClass">
    <el-container style="height: 100%">
      <!-- 左侧边栏 -->
      <el-aside class="sidebar" :class="{ collapsed: sidebarCollapsed }" :width="sidebarCollapsed ? '48px' : '64px'">
        <div class="sidebar-inner">
          <!-- Logo -->
          <div class="sidebar-logo" @click="$router.push('/main/codeHub')" title="MindCraft-Agent">
            <div class="logo-icon"></div>
          </div>

          <!-- 导航菜单 -->
          <div class="sidebar-nav">
            <div
              class="sidebar-item"
              :class="{ active: activeIndex === '/main/codeHub' }"
              @click="$router.push('/main/codeHub')"
              title="编程智能体"
            >
              <div class="sidebar-icon-wrapper">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="7 5.5 3.5 10 7 14.5"/>
                  <polyline points="13 5.5 16.5 10 13 14.5"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">编程</span>
            </div>

            <div
              class="sidebar-item"
              :class="{ active: activeIndex === '/main/mdViewer' }"
              @click="openMdBrowser"
              title="文档浏览"
            >
              <div class="sidebar-icon-wrapper">
                <svg class="nav-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 2.5H5.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V7L11 2.5z"/>
                  <polyline points="11 2.5 11 7 16 7"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">文档</span>
            </div>
          </div>

          <!-- 底部：收缩按钮 + 设置 -->
          <div class="sidebar-bottom">
            <el-popover
              placement="right-start"
              :width="150"
              trigger="click"
              :teleported="false"
              popper-class="theme-picker-popover"
            >
              <template #reference>
                <div
                  class="sidebar-item"
                  :title="'主题：' + claudeTheme.themeLabel(claudeTheme.theme)"
                >
                  <div class="sidebar-icon-wrapper">
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 0 1 13 0 6.5 6.5 0 0 0-6.5-6.5v13A6.5 6.5 0 0 1 1.5 8z"/>
                    </svg>
                  </div>
                  <span v-show="!sidebarCollapsed" class="sidebar-label">主题</span>
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
                  <span class="theme-name">{{ claudeTheme.themeLabel(t) }}</span>
                  <el-icon v-if="claudeTheme.theme === t" class="theme-check"><Check /></el-icon>
                </div>
              </div>
            </el-popover>
            <div
              class="sidebar-item"
              @click="settingsDrawer = true"
              title="设置"
            >
              <div class="sidebar-icon-wrapper">
                <el-icon :size="20"><Setting /></el-icon>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">设置</span>
            </div>
          </div>
        </div>
      </el-aside>

      <!-- 右侧内容区 -->
      <el-main class="content-layout">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['codeHub', 'mdViewer']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- 设置抽屉 -->
    <Settings />
  </div>
</template>

<script setup>
import { provide, ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Setting, Check } from '@element-plus/icons-vue';
import Settings from "./components/Settings.vue";
import { useClaudeThemeStore } from '@mindcraft/agent';

const settingsDrawer = ref(false);
const activeSetting = ref(null);
const sidebarCollapsed = ref(false);
const claudeTheme = useClaudeThemeStore();
const themeClass = computed(() => `cc-theme-${claudeTheme.theme}`);
provide("settingsDrawer", settingsDrawer);
provide("activeSetting", activeSetting);
const route = useRoute();
const router = useRouter();

const activeIndex = computed(() => {
  return route.meta.parent || "/main/codeHub"
})

// 文档浏览：直接路由到主窗口内嵌视图（不再弹独立窗口）
const openMdBrowser = () => router.push('/main/mdViewer')

// 监听主进程 push 的文档打开请求（agent 消息点文档链接时触发）
let disposeOpenMdViewer = null
onMounted(() => {
  disposeOpenMdViewer = window.electronAPI?.onOpenMdViewer?.(() => {
    router.push('/main/mdViewer')
  })
})
onUnmounted(() => {
  if (typeof disposeOpenMdViewer === 'function') disposeOpenMdViewer()
})

// 设置入口（通过 Settings 组件内部触发）
window.electronAPI?.openTabByName?.((progress) => {
  settingsDrawer.value = true
  activeSetting.value = progress.type
})
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100%;
}

/* === 侧边栏 === */
.sidebar {
  background: var(--cc-bg-deepest, #0d1117);
  border-right: 1px solid var(--cc-border-light, #21262d);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;

  &.collapsed {
    .sidebar-logo {
      width: 32px;
      height: 32px;
      margin: 8px 8px 16px;
      .logo-icon {
        width: 24px;
        height: 24px;
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

/* Logo */
.sidebar-logo {
  width: 48px;
  height: 48px;
  margin: 12px 8px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 12px;
  transition: background 0.2s;
  flex-shrink: 0;

  &:hover {
    background: var(--cc-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .logo-icon {
    width: 36px;
    height: 36px;
    background-image: url(./assets/mindcraft_logo_svg.svg);
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

  .sidebar-label {
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
  }
}

/* 底部 */
.sidebar-bottom {
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
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
  background: #c6613f;
}

.theme-dot-light {
  background: #b85c3a;
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

  :deep(> router-view) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
}
</style>
