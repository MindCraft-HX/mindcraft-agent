<template>
  <div class="mine-lib">
    <div class="lib-title" style="display: flex;align-items: center;">
        我的知识库
      <el-radio-group v-model="type" style="margin-left: 20px;">
        <el-radio-button label="created">我的创建</el-radio-button>
        <el-radio-button label="followed">我的关注</el-radio-button>
      </el-radio-group>
    </div>
    <el-scrollbar height="100%" max-height="70vh">
      <div class="lib-list">
        <libItem :class="{ 'select-lib': selectLib?.id == item?.id}" :info="item" :modelList="modelList" v-for="item, index in libList" :key="index" @click="chooseItem(item)" @change="getList" />
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
import { myLibraryList, getUserProfile, getLibraryList } from '@/api/mainActivity/Library';
const menuType = inject('menuType')
const chooseInfo = inject('chooseInfo')
const userList = ref({})
const type = ref("created")
const libList = computed(() => {
  return userList.value?.[type.value] || []
})
const modelList = ref([])
const selectLib = ref({})
const getList = () => {
  myLibraryList().then(async res => {
    userList.value = res?.data || {}
    const attention_List = await getUserProfile();
    const followedLibraries = attention_List.data.userfollowedstatus.followed_libraries || [];
    Object.entries(userList.value).forEach(([key, value]) => {
      if(value?.length) {
        userList.value[key] = value.map(item => {
          item.attention = followedLibraries.includes(item.id)
          if(item.id == chooseInfo.value?.id) {
            selectLib.value = item
          }
          return item
        })
      }
    })
    // 我也不知道为什么要把模型列表丢到这个接口返回
    const libRes = await getLibraryList(1, 1, '', '');
    modelList.value = libRes?.data?.model_list || []
  })
}
getList()

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
.mine-lib{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.loading-tips{
  width: 100%;
  text-align: center;
}
.select-lib{
  outline: 5px solid #409EFF;
}
</style>