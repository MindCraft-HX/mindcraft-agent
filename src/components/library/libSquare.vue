<template>
  <div class="lib-square">
    <div class="lib-title">知识库广场</div>
    <el-scrollbar height="100%" max-height="70vh">
        <div class="lib-list" v-infinite-scroll="getList" :infinite-scroll-disabled="disabled" :infinite-scroll-immediate="true" infinite-scroll-distance="0">
      <libItem :class="{ 'select-lib': selectLib?.id == item?.id}" :info="item" v-for="item, index in libList" :key="index" @click="chooseItem(item)" @change="getList(1)"/>
      <el-text class="loading-tips" v-if="loading">加载中...</el-text>
      <el-text class="loading-tips" v-else-if="finish">没有更多角色了</el-text>
      <el-text class="loading-tips" style="cursor: pointer;" v-else @click="getList">点击加载更多</el-text>
      </div>
      </el-scrollbar>
    <div style="margin-top: 20px;" class="btn-content">
      <el-button plain type="primary" @click="chooseLib" :disabled="!selectLib?.id">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-queren"></div>确认</el-button>
      <el-button plain type="primary" @click="menuType = -1">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-back"></div>取消</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from "vue";
import libItem from "./libItem.vue";
import { getLibraryList, getUserProfile } from '@/api/mainActivity/Library';
const menuType = inject('menuType')
const chooseInfo = inject('chooseInfo')
const libList = ref([])
const size = ref(10)
const page = ref(1)
const loading = ref(false)
const maxPages = ref(1)
const disabled = computed(() => loading.value || finish.value)
const finish = computed(() => maxPages.value <= page.value);
const selectLib = ref({})
const getList = (init = 0) => {
  if (loading.value) return;
  if (page.value > maxPages.value) return;
  loading.value = true
  if(init == 1) {
    libList.value = []
    maxPages.value = 1
    page.value = 1
    selectLib.value = {}
  } else {
    page.value += 1
  }
  getLibraryList(size.value, page.value, '', '').then(async res => {
    libList.value = [...libList.value, ...(res?.data?.results || [])]
    maxPages.value = Math.ceil((res?.data?.count || 1) / 10)
    const attention_List = await getUserProfile();
    const followedLibraries = attention_List.data.userfollowedstatus.followed_libraries || [];
    libList.value.forEach(item => {
      item.attention = followedLibraries.includes(item.id)
      if(item.id == chooseInfo.value?.id) {
        selectLib.value = item
      }
    })
  }).finally(() => {
    loading.value = false
  })
}
getList(1)

const chooseItem = (item) => {
  selectLib.value = item?.id == selectLib.value?.id ? {} : item
}

const chooseLib = () => {
  chooseInfo.value = selectLib.value
  menuType.value = -1
}
</script>

<style lang="scss" scoped>
@import url("./lib.scss");
.lib-square{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.loading-tips{
  width: 100%;
  text-align: center;
}
.select-lib{
  outline: 5px solid #409EFF;
}
</style>