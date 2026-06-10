<template>
  <div class="main-layout">
    <el-container style="height: 100%">
      <el-header>
        <div class="nav">
          <div class="logo" style="width: 128px; height: 42px"></div>
          <el-menu
           :default-active="activeIndex"
            :router="true"
            class="navheader"
            mode="horizontal"
            :ellipsis="false"
            background-color="transparent"
            text-color="#fff"
            active-text-color="#ffd04b"
          >
            <el-menu-item index="/main/codeHub" title="编程智能体">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-claude1"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-claude1"></use>
              </svg>
              <span class="nav-text">编程智能体</span>
            </el-menu-item>
            <el-menu-item @click="openMdBrowser" title="文档浏览">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-markdown"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-wendang"></use>
              </svg>
              <span class="nav-text">文档浏览</span>
            </el-menu-item>
          </el-menu>
          <div style="flex: 1;"></div>
        </div>
        <Settings />
      </el-header>
      <el-container class="content-layout">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['codeHub']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { provide, ref, computed } from "vue";
import { useRoute } from "vue-router";
import Settings from "./components/Settings.vue";

const settingsDrawer = ref(false);
const activeSetting = ref(null);
provide("settingsDrawer", settingsDrawer);
provide("activeSetting", activeSetting);
const route = useRoute();

const activeIndex = computed(() => {
  return route.meta.parent || "/main/codeHub"
})

// 设置入口（通过 Settings 组件内部触发）
window.electronAPI?.openTabByName?.((progress) => {
  settingsDrawer.value = true
  activeSetting.value = progress.type
})

const openMdBrowser = () => window.electronAPI?.openMdWin?.()
</script>

<style lang="scss" scoped>
.main-layout{
  height: 100%;
}
.content-layout {
  margin: 5px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.content-layout :deep(> router-view) {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
}
.navheader {
  display: flex;
}
.logo {
  margin-right: 18px;
  background-image: url(./assets/new_logo2.png);
  background-size: contain;
  background-repeat: no-repeat;
  flex-shrink: 0;
}
:deep(.navheader>.el-menu-item) {
  border: none;
  --el-menu-active-color: #fff;
  color: var(--el-menu-active-color);
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    transform: translate(-100%, -50%);
    width: 1px;
    height: 40%;
    background-color: var(--el-menu-active-color);
  }
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    right: 0;
    transform: translate(100%, -50%);
    width: 1px;
    height: 40%;
    background-color: var(--el-menu-active-color);
  }
  &:first-child::before, &:last-child::after {
    width: 2px;
  }
  .nav-text {
    margin-left: 12px;
  }
  .mindcraft-flow-win-iconfont-ordinary, .mindcraft-flow-win-iconfont-icon{
    font-size: 20px;
  }
  .mindcraft-flow-win-iconfont-ordinary{
    display: block;
  }
  .mindcraft-flow-win-iconfont-icon, .show-active{
    display: none;
  }
  .nav-text {
    display: none;
  }
  &:hover {
    .nav-text {
      display: block;
    }
  }
}
:deep(.navheader>.el-menu-item.is-active){
  --el-menu-active-color: #409eff;
  background-color: #ECF5FF;
  .mindcraft-flow-win-iconfont-icon{
    display: block;
  }
  .show-active{
    display: inherit;
  }
  .mindcraft-flow-win-iconfont-ordinary{
    display: none;
  }
  .nav-text {
    display: block;
  }
  &:after, &::before {
    display: none;
  }
}
</style>
