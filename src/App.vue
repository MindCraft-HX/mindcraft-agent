<template>
  <el-config-provider :locale="elLocale">
    <div class="common-layout">
      <router-view :router="router" />
    </div>
  </el-config-provider>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { useWindowPerformanceState } from '@/composables/useWindowPerformanceState'

const router = useRouter();
const { locale } = useI18n()
const elLocale = computed(() => locale.value === 'zh' ? zhCn : en)

useWindowPerformanceState()
</script>

<style lang="scss">
@import url("@/styles/toolPanel.scss");
body{
  margin: 0;
  padding: 0;
}
.common-layout {
  color: #333;
  height: 100vh;
}
.el-header,
.el-footer {
  text-align: center;
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.26);
  background-color: #409eff;
}

.el-main {
  background-color: #f6fbff;
}
.icon {
   width: 1em; height: 1em;
   vertical-align: -0.15em;
   fill: currentColor;
   overflow: hidden;
}
.lib-dialog{
  padding: 38px;
  border-radius: 16px 16px 16px 16px;
  .el-dialog__header{
    border-bottom: 1px solid #ABAAAA;
    margin-bottom: 20px;
  }
  .el-dialog__body{
    max-height: 60vh;
    overflow: auto;
  }
}
.mermaid{
  overflow: auto;
  svg{
    width: fit-content;
  }
}

/* 窗口拖拽期间只关闭已知重效果，避免全局 * 选择器给整棵 DOM 带来样式匹配开销 */
html.is-window-dragging .theme-picker-popover,
html.is-window-dragging .locale-picker-popover,
html.is-window-dragging .selection-copy-btn,
html.is-window-dragging .cc-img-lightbox-close,
html.is-window-dragging .codehub-init-overlay {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

html.is-window-dragging .codehub-init-card,
html.is-window-dragging .selection-copy-btn,
html.is-window-dragging .scroll-bottom-btn,
html.is-window-dragging .scroll-prev-btn,
html.is-window-dragging .sb-tooltip,
html.is-window-dragging .cc-img-lightbox-img {
  box-shadow: none !important;
}

html.is-window-dragging .sidebar-item,
html.is-window-dragging .wc-btn,
html.is-window-dragging .codehub-tab,
html.is-window-dragging .codehub-tab-close,
html.is-window-dragging .scroll-bottom-btn,
html.is-window-dragging .scroll-prev-btn,
html.is-window-dragging .selection-copy-btn,
html.is-window-dragging .sb-ring-fg,
html.is-window-dragging .cc-img-lightbox-close,
html.is-window-dragging .scroll-bottom-fade-enter-active,
html.is-window-dragging .scroll-bottom-fade-leave-active,
html.is-window-dragging .scroll-prev-fade-enter-active,
html.is-window-dragging .scroll-prev-fade-leave-active,
html.is-window-dragging .copy-btn-fade-enter-active,
html.is-window-dragging .copy-btn-fade-leave-active {
  transition: none !important;
}

html.is-window-dragging .sidebar-item.has-notification,
html.is-window-dragging .codehub-init-spinner,
html.is-window-dragging .codehub-tab.task-done,
html.is-window-dragging .codehub-tab-name .running-dot,
html.is-window-dragging .codehub-tab-name .pending-dot,
html.is-window-dragging .sb-thinking .sb-dot,
html.is-window-dragging .sb-ring-spin,
html.is-window-dragging .thinking-dots span,
html.is-window-dragging .loading-spinner span,
html.is-window-dragging .loading-dots span,
html.is-window-dragging .thinking-label.first-awaiting,
html.is-window-dragging .cc-empty {
  animation: none !important;
}
</style>
