<template>
  <div class="video-generation">
    <sidebar title='图片视频实验室'>
      <div class="sidebar-list">
        <el-button :type="menuType == index ? 'primary' : ''" class="sidebar-item" v-for="item, index in menuList" :key="index" @click="changeSidebar(index)">
          <div class="mode-img mindcraft-flow-win-iconfont" :class="[`mode-img-${index}`, item.img]"></div>
          {{item.name}}
        </el-button>
      </div>
    </sidebar>
    <template v-if="menuType == '0'">
      <ImgEditor class="img-edit-box" v-model:mediaPath="mediaPath" v-model:loading="loading" :sourceList="sourceList"
        v-model:mediaInfoDrawer="mediaInfoDrawer" />
    </template>
    <template v-else>
      <div class="left-content">
      <div class="value-content">
        <media :mediaPath="mediaPath" :menuType="menuType" :loading="loading" :sourceList="sourceList"/>
      </div>
      <sourcelList v-model:mediaPath="mediaPath"  v-model:sourceList="sourceList" v-model:mediaInfoDrawer="mediaInfoDrawer"    />
    </div>
    <div class="menu-content">
      <div class="attr-content">
        <el-scrollbar ref="scrollbarRef" width="100%" max-height="100%" height="100%" >
          <component :is="menuList[menuType].component" v-model:loading="loading" v-model:mediaPath="mediaPath"></component>
        </el-scrollbar>
      </div>
    </div>
  </template>

    <el-drawer
      v-model="mediaInfoDrawer"
      title="详情"
      size="356"
      style="background-color: #E1E8F8;"
    >
      <mediaInfo :mediaPath="mediaPath" :sourceList="sourceList"></mediaInfo>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import sidebar from "@/views/application/components/sidebar.vue";

import media from "./components/media.vue";
import ImgEditor from './components/imgEdit/index.vue'
const mediaPath = ref("")
const loading = ref(false)

import sourcelList from "./components/sourcelList.vue";
const sourceList = ref([])
const mediaInfoDrawer = ref(false)

import textToImg from "./components/textToImg.vue";
import textToVideo from "./components/textToVideo.vue";
import imgToVideo from "./components/imgToVideo.vue";
const menuList = [
  { name: "图片生成", img: 'icon-mindcraft-yiwenshengtu' },
  { name: "视频生成", component: imgToVideo, img: 'icon-mindcraft-tushengshipin' }
]
const menuType = ref("0")
const changeSelectVideo = () => {
  loading.value = false
}
const changeSidebar = (index) => {
  menuType.value = index
  changeSelectVideo()
}
import mediaInfo from "./components/mediaInfo.vue";
</script>

<style lang="scss" scoped>

// :deep(.el-scrollbar__view), :deep(.el-scrollbar__wrap) {
//   display: flex;
//   flex-direction: column;
//   min-height: 100%;
// }
.mode-img{
  margin-right: 6px
}
.video-generation{
  width: 100%;
  height: calc(100vh - 70px);
  display: flex;
  justify-content: space-between;
  .img-edit-box{
    flex: 1;
    display: flex;
  }
  // align-items: center;
  .left-content{
    flex: 1;
    height: 100%;
    background-image: url("@/assets/videoGeneration/bg.png");
    background-size: 100% 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 0;
    .value-content{
      width: 100%;
      height: 100%;
      min-height: 0;
      box-sizing: border-box;
      flex: 1 1 0; 
    }
  }
  .menu-content{
    flex-shrink: 0;
    width: 336px;
    height: 100%;
    background: #E1E8F8;
    display: flex;
    flex-direction: column;
    align-items: center;
    .select-video{
      // width: 290px;
      background: #ffffff;
      height: 30px;
      text-align: center;
      line-height: 30px;
      padding: 6px;
      margin: 20px;
      border-radius: 8px;
      border: none;
      display: flex;
      justify-content: center;
      --el-border: none;
      :deep(.el-radio-button__inner){
        flex-shrink: 0;
        flex: .3;
        height: 30px;
        display: flex;
        align-items: center;
      }
      :deep(.el-radio-button__original-radio:checked+.el-radio-button__inner){
        background: linear-gradient( 180deg, #409EFF 0%, #1A65B4 100%);
      }
      .radio-button{
        display: flex;
        align-items: center;
        .radio-button-img{
          width: 22px;
          height: 22px;
          flex-shrink: 0;
          background-size: 100% 100%;
          &-0{background-image: url("@/assets/videoGeneration/t2i.png");}
          &-1{background-image: url("@/assets/videoGeneration/i2v.png");}
        }
      }
    }
    .attr-content{
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      padding-top: 12px;
      :deep(.el-scrollbar) {
        width: 100%;
      }
    }
  }
}
:deep(.el-drawer__header) {
  margin-bottom: 0;
}
</style>