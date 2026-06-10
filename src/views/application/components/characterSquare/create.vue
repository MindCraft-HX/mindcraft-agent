<template>
  <div class="create">
    <div class="title">
      <div class="title-item" :class="[`title-item-${selectTab == index ? 'active' : ''}`]" v-for="(item, index) in ['基础信息', '形象', '音色', '台词', '知识库']" :key="index" @click="selectTabChange(index)">{{ item }}</div>
    </div>
    <baseInfo v-show="selectTab == 0" :characterUpdate="characterUpdate" @changeSelectTab="selectTabChange" @saveCharacter="saveCharacter"></baseInfo>
    <identity ref="identityRef" v-show="selectTab == 1" :characterUpdate="characterUpdate" :selectTab="selectTab" @changeSelectTab="selectTabChange" @saveCharacter="saveCharacter"></identity>
    <timbre v-show="selectTab == 2" :characterUpdate="characterUpdate" @changeSelectTab="selectTabChange" @saveCharacter="saveCharacter"></timbre>
    <lines v-show="selectTab == 3" :characterUpdate="characterUpdate" @changeSelectTab="selectTabChange" @saveCharacter="saveCharacter"></lines>
    <library ref="libraryRef" v-show="selectTab == 4" :characterUpdate="characterUpdate" @changeSelectTab="selectTabChange" @saveCharacter="saveCharacter"></library>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, provide, ref, watch } from "vue";
import { ElLoading, ElMessage, ElMessageBox } from "element-plus";

const props = defineProps(['id'])

import { apiGetCharacterById } from "@/api/application/character"
const identityRef = ref(null)
const libraryRef = ref(null)
onMounted(() => {
  if(props.id) {
    apiGetCharacterById(props.id).then(async res => {
      const { data = null } = res
      if(data) {
        character.value = {
          character_id: data.character_id || null,
          name: data.character_name || "",
          character_description: data?.character_basicInfo?.description || "",
          personality: data?.character_basicInfo?.personality || [],
          character_tags: data?.character_tags || [],
          tone: data?.character_basicInfo?.tone || "",
          assets: data?.character_visualDesign?.animation_assets || {},
          voice_data: data?.voice_data || null,
          appearanceDescription: data?.character_visualDesign?.appearanceDescription || {},
          lines: initLines(data?.character_basicInfo?.lines),
          voiceUrlData: data?.voice_url_data || [],
          character_library_id: data?.character_library_id || null,
          ...character.value
        }
        orgianCharacter.value = JSON.stringify(character.value)
        console.log(character.value)
        nextTick(() => {
          identityRef.value?.getHistoryList()
          libraryRef.value?.getLibrary()
        })
        // if(data?.character_visualDesign?.animation_assets) {
        //   const assests = data?.character_visualDesign?.animation_assets || {}
        //   const loadingInstance = ElLoading.service({
        //     fullscreen: true,
        //     text: `正在读取资源，此过程大约1-2s,请稍后...`,
        //   })
        //   try {
        //     await Promise.all(
        //       Object.entries(assests)
        //         .map(async ([key, assestLink]) => {
        //           await window.electronAPI.addCharacterMediaByDownLoadLink({
        //             fileUrl: assestLink,
        //             type: key,
        //             time: new Date().getTime(),
        //           });
        //         })
        //     );
        //   } finally {
        //     setTimeout(() => {
        //       loadingInstance.close()
        //     }, 300);
        //   }
        // }
      } 
    })
  } else {
    character.value.lines = initLines()
    orgianCharacter.value = JSON.stringify(character.value)
  }
})

const initLines = (lines) => {
  if(lines?.length) {
    if(lines.length < 3) {
      return lines.concat(new Array(3 - lines.length))
    } else {
      return lines.slice(0, 3)
    }
  } else {
    return new Array(3)
  }
}

import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
const selectTab = ref(0)
const selectTabChange = async (index) => {
  if(index > 0) {
    if(!character.value.character_id) {
      ElMessage.error("请先保存角色")
      return
    }
    if(!character.value.name || !character.value.character_description) {
      ElMessage.error("请先创建角色基础信息")
      return
    }
    if(index == 3) {
      console.log(character.value)
      if(!character.value?.voice_data?.voice_id) {
        ElMessageBox.confirm('请先选择音色', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          selectTabChange(2)
        })
        return
      }
      if(character.value?.lines?.every(item => !item)){
        ElMessageBox.confirm('您还没有添加任何台词，是否前往基础信息添加？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          selectTabChange(0)
        }).catch(() => {
          selectTab.value = index
        })
        mitt.emit("initLinesList")
        return
      }
      mitt.emit("initLinesList")
    }
  }
  // await saveCharacter()
  if(character.value.character_id) {
    selectTab.value = index
  }
}

import baseInfo from "./components/create/baseInfo.vue";
import identity from "./components/create/identity.vue";
import timbre from "./components/create/timbre.vue";
import lines from "./components/create/lines.vue";
import library from "./components/create/library.vue";

import { apiCreateCharacter, apiSaveCharacter } from "@/api/application/character.js"
const orgianCharacter = ref({})
// 简单判断下，因为新字段的增加导致的变化先不考虑
const characterUpdate = computed(() => {
  return JSON.stringify(character.value) !== orgianCharacter.value
})
defineExpose({characterUpdate})
const character = ref({})
provide("character", character)
const saveCharacter = async (auto = 1) => {
  if(!character.value.name) {
    !auto && ElMessage.error("请输入角色昵称")
    return
  }
  if(!character.value.character_description) {
    !auto && ElMessage.error("请输入角色介绍")
    return
  }
  const params = {
    character_name: character.value.name,
    character_tags: character.value.character_tags,
    character_basicInfo: {
      description: character.value.character_description,
      personality: character.value.personality,
      tone: character.value.tone,
      lines: character.value.lines,
    },
    character_voice_id: character.value.character_voice_id,
    character_library_id: character.value.character_library_id,
  }
  const API = character.value.character_id ? apiSaveCharacter : apiCreateCharacter
  await API(params, character.value.character_id).then(res => {
    if(res?.data?.character_id) {
      character.value.character_id = res?.data?.character_id
    } else {
      ElMessage({
        message: '创建成功',
        type: 'success',
      })
    }
    orgianCharacter.value = JSON.stringify(character.value)
  }).catch(error => {
    console.log(error)
    ElMessage.error(error?.response?.data?.message || "操作失败")
  })
}
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.create {
  width: 100%;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
  .title {
    color: #107EFE;
    font-size: 16px;
    border-bottom: 3px solid #107EFE;
    padding: 0 26px;
    display: flex;
    align-items: center;
    .title-item {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 16px;
      color: #000000;
      min-width: 132px;
      text-align: center;
      transition: all 0.3s;
      &:hover:not(.title-item-active) {
        background: #f3f3f3;
        border-radius: 10px 10px 0px 0px;
        color: #000000;
      }
      &-active {
        background: #ECF5FF;
        border-radius: 10px 10px 0px 0px;
        color: #107EFE;
      }
    }
  }
}
</style>