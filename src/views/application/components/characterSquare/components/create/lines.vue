<template>
  <div class="lines">
    <el-text type="danger" class="choose-voice" ><el-icon><Headset /></el-icon>当前已选择的音色：{{ character?.voice_data?.voice_name || "无" }}</el-text>
    <div class="lines-cards" v-for="item, index in linesList" :key="index">
      <div class="item-label">
        <svg class="icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-taici"></use>
        </svg>
        <div class="item-label-text">台词{{ index + 1 }}：</div>
        <div style="flex: 1;"></div>
        <svg class="icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-bianji1"></use>
        </svg>
      </div>
      <el-input type="textarea" class="item-input" draggable clearable v-model="linesList[index].title" :placeholder="`请输入台词${index + 1}`" @change="changeLines(item, index)"/>
      <div class="item-buttom">
        <audio :src="item.url[item.nowUrl]" controls v-if="item.url.length"></audio>
        <div class="pre-btn" :class="{'gray': item.nowUrl <= 0}" @click.stop="preAssest(item, index)" v-if="item.url.length">
          <svg class="pre-btn-icon" aria-hidden="true">
            <use xlink:href="#icon-mindcraft-chexiao"></use>
          </svg>
        </div>
        <div class="next-btn" :class="{'gray': item.nowUrl >= item.url.length - 1}" @click.stop="nextAssest(item, index)" v-if="item.url.length">
          <svg class="pre-btn-icon" aria-hidden="true">
            <use xlink:href="#icon-mindcraft-huifu"></use>
          </svg>
        </div>
        <el-text style="user-select: none;white-space: nowrap;" v-if="item.url.length > 1">{{ item.nowUrl + 1 }} / {{ item.url.length }}</el-text>
        <div style="flex: 1;"></div>
        <el-button plain color="#0C727A" :disabled="!item.title" @click="generateAudio(item, index)"><div class="mindcraft-flow-win-iconfont icon-mindcraft-shengcheng"></div>生成</el-button>
        <el-button plain color="#F56C6C" :disabled="!item.url?.length" @click="saveAudio(item, index)"><div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun1"></div>保存</el-button>
      </div>
    </div>
    <div class="btn-content">
      <el-button plain type="primary" @click="emit('changeSelectTab', 2)">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-shangyibu"></div>上一步</el-button>
      <el-button plain type="primary" @click="emit('changeSelectTab', 4)">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-xiayibu"></div>下一步</el-button>
      <el-button plain :type="characterUpdate ? 'danger' : 'primary'" @click="saveAudioAll()">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>
        {{character.character_id ? '更新' : '保存'}}
      </el-button>
      <el-button plain type="primary" @click="mitt.emit('changeSidebar', {tab: 0})">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-fanhui1"></div>返回</el-button>
      <br>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, provide, nextTick, h, computed, watch, onMounted } from "vue";
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
const character = inject("character")
const props = defineProps(["menuType", "selectTab", "characterUpdate"])
const emit = defineEmits(["changeSelectTab", "saveCharacter"])
const preAssest = (item) => {
  item.nowUrl = Math.max(0, item.nowUrl - 1)
}
const nextAssest = (item) => {
  item.nowUrl = Math.max(0, Math.min(item.url.length - 1, item.nowUrl + 1))
}
const linesList = ref([
  { url: [], nowUrl: 0, title: "" },
  { url: [], nowUrl: 0, title: "" },
  { url: [], nowUrl: 0, title: "" },
])
// 初始化台词信息列表
const initLinesList = () => {
  if(character.value?.voiceUrlData?.length){
    linesList.value = linesList.value.map((item, index) => {
      return {
        title: character.value?.lines?.[index] || "",
        url: item.url.length ? item.url : character.value.voiceUrlData?.[index]?.url ? [character.value.voiceUrlData?.[index]?.url] : [],
        nowUrl: item.nowUrl || 0
      }
    })
  } else {
    linesList.value = linesList.value.map((item, index) => {
      return {
        title: character.value?.lines?.[index],
        url: item.url || [],
        nowUrl: item.nowUrl || 0
      }
    })
  }
}
mitt.off("initLinesList")
mitt.on("initLinesList", () => {
  initLinesList()
})
onMounted(() => {
  initLinesList()
})
// 同步台词
const changeLines = (item, index) => {
  character.value.lines[index] = item.title
}
// 生成试听链接
import { apiCharacterVoiceTest } from "@/api/application/character"
const generateAudio = (item, index) => {
  const params = {
    voice_texts: [item.title],
    voice_id: character.value?.voice_data?.voice_id
  }
  apiCharacterVoiceTest(params, character.value.character_id)
  .then(res => {
    console.log(res)
    if(res?.data?.data?.voice_url_data?.length) {
      linesList.value[index].url.push(res?.data?.data?.voice_url_data[0]?.url)
      linesList.value[index].nowUrl = linesList.value[index].url.length - 1
      console.log(linesList.value[index])
    }
  })
}

// 保存试听链接
import { apiCharacterUpdateVoiceTest } from "@/api/application/character"
import { ElMessage } from "element-plus";
const saveAudio = (item, index) => {
  const params = {
    voice_id: character.value?.voice_data?.voice_id,
    voice_text_urls: [
      {
        text: item.title,
        url: item.url[item.nowUrl],
        id: index + 1,
      }
    ],
  }
  apiCharacterUpdateVoiceTest(params, character.value.character_id)
  .then(res => {
    ElMessage.success(res?.data?.message || "保存成功")
    linesList.value[index].url = linesList.value[index].url.filter(item => item == params.voice_text_urls[0].url)
    linesList.value[index].nowUrl = linesList.value[index].url.length - 1
  })
}

// 保存全部
const saveAudioAll = () => {
  const params = {
    voice_id: character.value?.voice_data?.voice_id,
    voice_text_urls: []
  }
  linesList.value.map((item, index) => {
    params.voice_text_urls.push({
      text: item.title,
      url: item?.url?.[item?.nowUrl] || "",
      id: index + 1,
    })
  })
  apiCharacterUpdateVoiceTest(params, character.value.character_id)
  .then(res => {
    ElMessage.success(res?.data?.message || "保存成功")
    linesList.value.map((item, index) => {
      item.url = item.url.filter(item => item == params.voice_text_urls[index].url)
      item.nowUrl = item.url.length - 1
    })
  })
  .finally(() => {
    emit('saveCharacter', 0)
  })
}
</script>

<style lang="scss" scoped>
*{
  box-sizing: border-box;
}
.lines{
  display: flex;
  flex-direction: column;
  padding: 23px 0;
  .choose-voice{
    border: 1px solid #F56C6C; 
    border-radius: 10px 10px 10px 10px;
    padding: 10px 15px;
    font-size: 16px;
    margin: 0 auto;
    margin-right: 0;
    .el-icon{
      margin-right: 12px;
    }
  }
  .lines-cards{
    background: #FFFFFF;
    border-radius: 15px 15px 15px 15px;
    border: 1px solid #CCCCCC;
    padding: 18px;
    margin: 16px 0;
    .item-label{
      display: flex;
      align-items: center;
      .item-label-text{
        color: #107EFE;
        margin-left: 6px;
        user-select: none;
      }
    }
    .item-input{
      --el-input-border-color: transparent;
      --el-input-border: none;
      --el-border-color: none;
      --el-input-border-radius: 10px;
      --el-border-radius-base: 10px;
      --el-input-bg-color: #ECF5FF;
      --el-fill-color-blank: #ECF5FF;
      --el-tag-font-size: 16px;
      margin: 14px 0;
      font-size: var(--el-tag-font-size);
      color: #000000;
      :deep(.el-textarea__inner), :deep(.el-input__inner){
        resize: none;
        padding: 12px;
      }
      :deep(.el-select__wrapper) {
        padding: 6px 18px;
        width: 100%;
        font-size: var(--el-tag-font-size);
      }
      :deep(.el-select__tags-text) {
        --el-tag-font-size: 16px;
        font-size: var(--el-tag-font-size);
        padding: 6px;
        color: #FFFFFF;
      }
      :deep(.el-tag__close) {
        color: #FFFFFF;
      }
      :deep(.el-tag--info) {
        background-color: var(--tagColor);
        border-color: var(--tagColor);
      }
    }
    .item-buttom{
      display: flex;
      align-items: center;
      audio {
        width: 573px;
        background: #F1F3F4;
        border-radius: 25px 25px 25px 25px;
        height: 34px;
        margin-right: 6px;
      }
      .pre-btn,.next-btn{
        width: 28px;
        height: 28px;
        margin: 0 3px;
        opacity: 0.8;
        cursor: pointer;
        flex-shrink: 0;
        &:hover{
          opacity: 1;
        }
        .pre-btn-icon {
          width: 100%;
          height: 100%;
        }
      }
      .gray {
        filter: grayscale(100%);
      }
      .el-button{
        margin: 0 3px;
      }
    }
  }
}
</style>