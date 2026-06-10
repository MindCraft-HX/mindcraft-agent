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
            @select="handleSelectMenu"
          >
            <!-- <el-image
              class="logo"
              src="../src/assets/new_logo1.png"
              style="width: 128px; height: 42px"
            /> -->
            <el-menu-item index="/main/chat" title="智能对话">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-zhinengduihua"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-zhinengduihua"></use>
              </svg>
              <span class="nav-text">智能对话</span>
              <el-button title="刷新" @click="reresh" class="show-active" size="small" @click.stop="" circle style="margin-left: 6px;">
                <div style="color: #409eff;font-size: 14px;margin: 0 auto;" class="mindcraft-flow-win-iconfont icon-mindcraft-zhongxinshengcheng"></div>
              </el-button>
            </el-menu-item>
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
            <el-menu-item index="/main/voiceInteraction" title="智能语音">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-AIliaotian"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-AIliaotian"></use>
              </svg>
              <span class="nav-text">智能语音</span>
            </el-menu-item>
            <el-menu-item index="/application" title="应用">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-yingyong"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-yingyong"></use>
              </svg>
              <span class="nav-text">应用</span>
            </el-menu-item>
            <el-menu-item @click.native="openPaint" title="画布">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-huaban"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-huaban"></use>
              </svg>
              <span class="nav-text">画布</span>
            </el-menu-item>
            <el-menu-item @click.native="openAppletQRcode" title="微信小程序">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-xiaochengxu"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-xiaochengxu"></use>
              </svg>
              <span class="nav-text">微信小程序</span>
            </el-menu-item>
            <el-menu-item @click="DeveloperPlatform" title="开发者平台">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-kaifazhepingtai"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-kaifazhepingtai"></use>
              </svg>
              <span class="nav-text">开发者平台</span>
            </el-menu-item>
            <el-menu-item @click.native="openAppletQRcodeShare" title="分享有礼">
              <div class="mindcraft-flow-win-iconfont mindcraft-flow-win-iconfont-ordinary icon-mindcraft-fenxiang"></div>
              <svg class="icon mindcraft-flow-win-iconfont-icon" aria-hidden="true">
                <use xlink:href="#icon-mindcraft-fenxiang"></use>
              </svg>
              <span class="nav-text">分享有礼</span>
            </el-menu-item>
            <!-- <el-menu-item index="/main/groupchat">多人机对话</el-menu-item> -->
            <!-- <el-menu-item index="3" disabled>内容生成器</el-menu-item> -->
            <!-- <el-menu-item index="4" disabled>项目开发工厂</el-menu-item> -->
            <!-- <el-menu-item index="5" disabled>模型训练</el-menu-item> -->
          </el-menu>
          <div style="flex: 1;"></div>
          <el-dropdown
            class="user"
            split-button
            type="primary"
            size="large"
            @click="openUserInfo"
          >
            {{ username }}
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item divided @click="showUserprofile"
                  >用户中心</el-dropdown-item
                >
                <!-- <el-dropdown-item divided @click="showEnterprise"
                  >企业中心</el-dropdown-item
                > -->
                <!-- <el-dropdown-item divided @click="showSettings"
                  >设置</el-dropdown-item
                > -->
                <el-dropdown-item divided @click="showUserFeedback"
                  >用户反馈</el-dropdown-item
                >
                <el-dropdown-item divided @click="logout"
                  >退出登录</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <!-- vip点击 -->
          <!-- <el-button class="dropdown-Button" type="primary" @click="openPointCard" >VIP</el-button> -->
          <div class="dropdown-Button"><pointCard /></div>
          <div class="InboundMail-Button">
            <InboundMail />
          </div>
        </div>
        <Settings />
      </el-header>
      <el-container class="content-layout">
        <!-- <el-main><Chat /></el-main> -->
        <router-view v-slot="{ Component }">
          <keep-alive :include="['codeHub']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-container>
    </el-container>
    <!-- 小程序弹窗 -->
    <el-dialog v-model="centerDialogVisible" width="320" center>
    <!-- <span>
      It should be noted that the content will not be aligned in center by
      default
    </span> -->
    <div style="display: flex;align-items: center;justify-content: center;flex-direction: column;">
      <img src="./assets/qrcode(2).jpg" alt="" style="width: 200px; height: 200px">
      <el-divider />
      <div style="font-size: 18px;">微信扫一扫，进入小程序</div>
    </div>
  </el-dialog>
  </div>
</template>

<script setup>
import { provide, ref, onMounted, nextTick, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import Settings from "./components/Settings.vue";
import pointCard from "./components/pointCard/index.vue";
import InboundMail from './components/InboundMail/index.vue';
import { userInformation } from "@/stores/userInformation";
// import {useMitt} from '@utils/mitt.js';
import { useMitt } from "./utils/mitt.js";

const mitt = useMitt();
const userStore = userInformation();



//声明变量
const settingsDrawer = ref(false);
const activeSetting = ref(null);
provide("settingsDrawer", settingsDrawer);
provide("activeSetting", activeSetting);
const router = useRouter();
const route = useRoute();
const activeIndex = computed(() => {
  return route.meta.parent ||"/main/chat"
})
const username = localStorage.getItem("username");

//打开设置
const showSettings = () => {
  settingsDrawer.value = true;
  activeSetting.value = "settings";
};
const showEnterprise = () => {
  settingsDrawer.value = true;
  activeSetting.value = "enterprise";
};
const showUserprofile = () => {
  settingsDrawer.value = true;
  activeSetting.value = "userprofile";
};
const showUserFeedback = () => {
  settingsDrawer.value = true;
  activeSetting.value = "userfeedback";
};

window.electronAPI.openTabByName((progress) => {
  settingsDrawer.value = true
  activeSetting.value = progress.type
})

const handleSelectMenu = (index)=>{
  activeIndex.value = index;
}
onMounted(() => {
  mitt.on('changeMenuActive',(index)=>{
    activeIndex.value = index;
  })
})

const DeveloperPlatform = ()=>{
  window.location.href = 'https://www.mindcraft.com.cn/#/usage';
}

//登出事件
const logout = () => {
  userStore.logout()
  return
  // localStorage.clear();

  // 获取所有键名
  const keys = Object.keys(localStorage);
  // 除了"identifier"外全部清除
  // && key !== "baseURL"
  keys.forEach((key) => {
    if (key !== "identifier" && key !== "baseURL" && key !== "wsURL" ) {
      localStorage.removeItem(key);
    }
  });

  // 跳转到登录页面,使用router

  mitt.emit('clearIntervalMail');

  router.push("/login");
};

const openUserInfo = () => {
  showUserprofile();
};

const centerDialogVisible = ref(false)

const openPaint = () => {
  window.electronAPI.openDrawWin()
}

//打开小程序二维码
const openAppletQRcode = ()=>{
  centerDialogVisible.value = true;
}

const openAppletQRcodeShare = () => {
  mitt.emit("clickDrawer", "inviteList")
}

const loading = ref(false);
const openMdBrowser = () => window.electronAPI.openMdWin()

const reresh = async () => {
  await router.replace({ path: '/redirect' })
  router.replace("/main/chat");
}

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
#icon-mindcraft-yingyong{
  color: #409eff;
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
.user {
  margin-right: 10px;
}
.dropdown-Button {
  /* position: absolute;
  right: 36px;
  top: 16px; */
  display: flex;
  align-items: center;
  justify-content: center;
}
.InboundMail-Button{
  /* position: absolute;
  right: -12px;
  top: 12px; */
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 12px;
}

:deep(.el-button-group) {
  /* margin-left: -200px; */
  display: flex;
}
:deep(.el-button-group .el-button--large) {
  border: none;
}
:deep(.el-button-group .el-button--primary:first-child) {
  max-width: 266px;
  min-width: 0;
  display: inline;
}
:deep(.el-button.el-button--primary.el-button--large span) {
  display: flex;
  justify-content: flex-end;
}
:deep(.el-button.el-button--primary.el-button--large::before) {
  width: 2px;
  height: 60%;
  background-color: #fff;
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(-100%, -50%);
  opacity: 1;
}
</style>
