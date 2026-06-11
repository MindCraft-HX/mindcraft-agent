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
                <i class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-claude1"></i>
                <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                  <use xlink:href="#icon-mindcraft-claude1"></use>
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
                <i class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-markdown"></i>
                <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                  <use xlink:href="#icon-mindcraft-markdown"></use>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">文档</span>
            </div>
          </div>

          <!-- 底部：收缩按钮 + 设置 -->
          <div class="sidebar-bottom">
            <div
              class="sidebar-item"
              @click="claudeTheme.nextTheme()"
              :title="'主题：' + claudeTheme.theme"
            >
              <div class="sidebar-icon-wrapper">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 0 1 13 0 6.5 6.5 0 0 0-6.5-6.5v13A6.5 6.5 0 0 1 1.5 8z"/>
                </svg>
              </div>
              <span v-show="!sidebarCollapsed" class="sidebar-label">{{ claudeTheme.theme }}</span>
            </div>
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
import { Setting } from '@element-plus/icons-vue';
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

    .mindcraft-flow-win-iconfont-ordinary {
      display: none;
    }

    .mindcraft-flow-win-iconfont-icon {
      display: block;
    }
  }

  .sidebar-icon-wrapper {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;

    .mindcraft-flow-win-iconfont-ordinary {
      font-size: 20px;
    }

    .mindcraft-flow-win-iconfont-icon {
      display: none;
      width: 20px;
      height: 20px;
    }
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
