<template>
  <div class="create-record">
    <div class="title">
      <div class="title-item" :class="[`title-item-${selectTab == index ? 'active' : ''}`]" v-for="(item, index) in ['基础信息', '形象']" :key="index" @click="selectTabChange(index)">{{ item }}</div>
    </div>
    <baseInfo v-show="selectTab == 0"></baseInfo>
    <identity v-show="selectTab == 1"></identity>
    <div class="btn-content item-label">
        <slot name="btn"></slot>
        <el-button plain :type="characterUpdate ? 'danger' : 'primary'" @click="saveCharacter(0)">
          <div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>
          {{character.profile_id ? '更新' : '保存'}}
        </el-button>
      </div>
  </div>
</template>

<script setup>
import { onMounted, provide, ref, computed } from "vue";
import baseInfo from "@/views/application/components/characterSquare/components/createRecord/baseInfo.vue";
import identity from "@/views/application/components/characterSquare/components/createRecord/identity.vue";
import { ElMessage } from "element-plus";

const orgianCharacter = ref({})
// 简单判断下，因为新字段的增加导致的变化先不考虑
const characterUpdate = computed(() => {
  return JSON.stringify(character.value) !== orgianCharacter.value
})
const character = ref({})
provide("character", character)

import { apiGetUserCharacterById } from "@/api/application/character"
const props = defineProps(['id'])
onMounted(() => {
  if(props.id) {
    apiGetUserCharacterById(props.id)
    .then(res => {
      const data = res?.data || {}
      character.value = {
        user_name: data.user_name,
        description: data.user_basicInfo?.description || "",
        personality: data.user_basicInfo?.personality || [],
        user_tags: data.user_tags,
        assests: data.user_visualDesign?.animation_assets || {},
        profile_id: data.profile_id || "",
        appearanceDescription: data?.character_visualDesign?.appearanceDescription || {},
      }
      orgianCharacter.value = JSON.stringify(character.value)
    })
  }
})

const selectTab = ref(0)
const selectTabChange = (index) => {
  if(!character.value.profile_id && index == 1) {
    ElMessage.error('请先确认并保存基础信息')
    return 
  }
  selectTab.value = index
}

import { apiSaveUserCharacter, apiCreateUserCharacter } from "@/api/application/character.js"
const saveCharacter = (auto = 0) => {
  if(!character.value.user_name) {
    !auto && ElMessage.error("请输入角色昵称")
    return
  }
  if(!character.value.description) {
    !auto && ElMessage.error("请输入角色介绍")
    return
  }
  const params = {
    user_name: character.value.user_name,
    user_tags: character.value.user_tags,
    user_basicInfo: {
      description: character.value.description,
      personality: character.value.personality,
    }
  }
  const API = character.value.profile_id ? apiSaveUserCharacter : apiCreateUserCharacter
  API(params, character.value.profile_id).then(res => {
    if(res?.data?.profile_id) {
      character.value.profile_id = res?.data?.profile_id
    }
    ElMessage({
      message: '操作成功',
      type: 'success',
    })
    orgianCharacter.value = JSON.stringify(character.value)
  })
}
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.create-record {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  height: calc(100vh - 240px);
  padding: 12px;
  .title {
    padding: 5px;
    width: fit-content;
    display: flex;
    align-items: center;
    background: #FFFFFF;
    border-radius: 10px 10px 10px 10px;
    border: 1px solid #DCDFE6;
    font-weight: 400;
    font-size: 16px;
    color: #6D6E70;
    .title-item {
      padding: 9px 19px;
      border-radius: 8px;
      margin: 0 6px;
      cursor: pointer;
      opacity: .8;
      &:hover{
        opacity: 1;
      }
      &-active{
        background: #EDF2F5;
      }
    }
  }
}
</style>