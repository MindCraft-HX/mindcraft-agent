<template>
  <div >
    <div class="timbre" v-show="!selectCom">
      <div style="display: flex;justify-content: space-between;">
        <div class="timbre-tab">
          <div class="tab-item" v-for="item, index in menuList" :key="index" @click="changeMenu(index)" :class="{active: menuType === index}">{{item.name}}</div>
        </div>
        <el-text type="danger" class="choose-voice" ><el-icon><Headset /></el-icon>当前已选择的音色：{{ character?.voice_data?.voice_name || "无" }}</el-text>
      </div>
      <component v-model:select="selectCom" :is="menuList[menuType]?.component" v-bind="menuList[menuType]?.props" :key="menuList[menuType]?.name">
        <div class="btn-content item-label">
          <el-button plain type="primary" @click="emit('changeSelectTab', 1)">
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-shangyibu"></div>上一步</el-button>
          <el-button plain type="primary" @click="emit('changeSelectTab', 3)">
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-xiayibu"></div>下一步</el-button>
          <el-button plain :type="characterUpdate ? 'danger' : 'primary'" @click="saveCharacter">
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>
            {{character.character_id ? '更新' : '保存'}}
          </el-button>
          <el-button plain type="primary" @click="mitt.emit('changeSidebar', {tab: 0})">
            <div class="mindcraft-flow-win-iconfont icon-mindcraft-fanhui1"></div>返回</el-button>
        </div>
      </component>
    </div>
    <timbreCreate v-if="selectCom == 1">
      <el-button style="width: fit-content;" plain type="primary" @click="selectCom = 0">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-back"></div>取消</el-button>
    </timbreCreate>
    <soundClone type="character" v-if="selectCom == 2">
      <el-button style="width: fit-content;" plain type="primary" @click="selectCom = 0">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-back"></div>取消</el-button>
    </soundClone>
  </div>

</template>

<script setup>
import { ref, inject, provide, nextTick, h, toRefs, watch } from "vue";
const character = inject("character")
import timbreList from "@/views/application/components/characterSquare/components/create/timbre/timbreList.vue";
import myTimbreList from "@/views/application/components/characterSquare/components/create/timbre/myTimbreList.vue";
const props = defineProps(["characterUpdate"])
const emit = defineEmits(["changeSelectTab", "saveCharacter"])

const menuType = ref(0)
const menuList = [
  { name: "通用音色", component: timbreList, props: { type: 'voice_default' }},
  { name: "音色广场", component: timbreList, props: { type: 'voice_share' }},
  { name: "我的音色", component: myTimbreList, props: { type: 'voice_user' }},
]
const changeMenu = (index) => {
  menuType.value = index
}

import soundClone from "@/views/application/components/speechLab/components/sound_cloning.vue";
import timbreCreate from "@/views/application/components/characterSquare/components/create/timbre/timbreCreate.vue";
const selectCom = ref(0)
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
mitt.off("selectTimbre");
mitt.on("selectTimbre", (index) => {
  selectCom.value = index
})

import { apiSaveCharacterVoice } from "@/api/application/character.js";
import { ElProgress, ElNotification, ElText, ElMessage, ElMessageBox } from "element-plus";
import api from "@/utils/request";
const saveCharacter = async () => {
  const progressPercent = ref(0)
  const notice = ElNotification({
    title: `更新角色${character.value?.name}音色为${character.value?.voice_data?.voice_name}`,
    duration: 0,
    message: () => 
      progressPercent.value >= 100 ? 
      h(ElText, {type: 'success'}, '更新角色音色成功') : 
      h(ElProgress, {
        percentage: progressPercent.value.toFixed(2),
        striped: true,
        stripedFlow: true,
      })
  })

  try {
    await api.post(`/v1/character/${character.value.character_id}/voice/save/`, {
      voice_id: character.value?.voice_data?.voice_id, 
      noLoading: 1
    }, {
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        const chunk = progressEvent.event.currentTarget.response
        const data = chunk.split(/\n\n/g).map(i => i.split("data:")[1]).filter(i => i)
        data.map(item => {
          let info = {}
          try {
            info = JSON.parse(item)
          } catch (error) {
            console.warn(error, item)
            return item
          }
          console.log(info)
          if(info?.progress_percent) {
            progressPercent.value = info.progress_percent * 100
          }
          return item
        })
      }
    });
    emit('saveCharacter', 0)
  } catch (error) {
    notice?.close()
    ElMessage.error(error?.response?.data?.message || "角色音色更新失败")
  }
}
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.timbre{
  display: flex;
  flex-direction: column;
  padding: 29px;
  width: 100%;
  .timbre-tab{
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
    .tab-item{
      padding: 9px 19px;
      border-radius: 8px;
      cursor: pointer;
      opacity: .8;
      white-space: nowrap;
      &:hover{
        opacity: 1;
      }
      &.active{
        background: #EDF2F5;
      }
    }
  }
  .choose-voice{
    border: 1px solid #F56C6C; 
    border-radius: 10px 10px 10px 10px;
    padding: 10px 15px;
    font-size: 16px;
    margin-left: 12px;
    .el-icon{
      margin-right: 12px;
    }
  }
  .btn-content{
    margin: 16px 0 16px 0;
  }
  .item-label {
    display: flex;
    align-items: center;
    font-size: 16px;
    color: #107EFE;
  }
}
</style>