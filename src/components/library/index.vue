<template>
  <el-scrollbar height="100%" v-if="menuType === -1">
    <div class="library">
        <div class="library-content">
          <div class="menu-list">
            <div class="menu-item" v-for="(item, index) in menuList" :key="index" @click="menuType = index">
              <div class="mindcraft-flow-win-iconfont" :class="item.icon"></div>
              <div>{{ item.name }}</div>
            </div>
          </div>
          <div class="now-lib">
            <el-text type="primary" class="now-lib-title">
              <span class="mindcraft-flow-win-iconfont icon-mindcraft-dangqianzhishiku"></span>
              当前知识库：
            </el-text>
            <libInfoCom :libInfo="libInfo" />
          </div>
        </div>
      </div>
  </el-scrollbar>
  <template v-else>
    <component :is="menuList[menuType]?.component" v-model:menuType="menuType" :key="menuList[menuType]?.name">
    </component>
  </template>
</template>

<script setup>
import { ref, inject, provide, nextTick, h, computed, watch, onMounted } from "vue";
const props = defineProps(["libInfo"])
const emit = defineEmits(["update:libInfo"])

import libInfoCom from "./libInfo.vue";
import libSquare from "./libSquare.vue";
import mineLib from "./mineLib.vue";
import create from "./create.vue";
const menuType = ref(-1)
provide("menuType", menuType)
const chooseInfo = computed({
  get: () => props.libInfo,
  set: (val) => {
    emit("update:libInfo", val)
  }
})
provide("chooseInfo", chooseInfo)
const menuList = [
  { name: "知识库广场", component: libSquare, icon: "icon-mindcraft-zhishikuguangchang"},
  { name: "我的知识库", component: mineLib, icon: "icon-mindcraft-wodezhishiku"},
  { name: "创建知识库", component: create, icon: "icon-mindcraft-chuangjianzhishiku"},
]

defineExpose({
  menuType
})

</script>

<style lang="scss" scoped>
@import url("./lib.scss");
.library{
  width: 98%;
  height: 100%;
  display: flex;
  flex-direction: column;
  // padding-bottom: 20px;
  // align-items: center;
  .library-content {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    .menu-list{
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-right: 20px;
      .menu-item{
        width: 242px;
        height: 158px;
        background: #FFFFFF;
        border-radius: 10px 10px 10px 10px;
        border: 1px solid #CCCCCC;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
        font-size: 16px;
        color: #000000;
        cursor: pointer;
        .mindcraft-flow-win-iconfont{
          font-size: 40px;
          color: #746AFF;
          margin-bottom: 22px;
        }
      }
    }
    .now-lib{
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 621px;
      font-size: 16px;
      .now-lib-title{
        width: 100%;
        margin-left: 20px;
        margin-bottom: 13px;
        display: flex;
        align-items: center;
        font-size: 16px;
        .mindcraft-flow-win-iconfont{
          font-size: 16px;
        }
      }
    }
  }
}
</style>