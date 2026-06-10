<template>
  <div class="my-timbre-list">
    <div class="timbre-top">
      <div class="btn-list">
        <div class="btn-item" v-for="item, index in btnList" :key="index" @click="item.fn">
          <div class="btn-icon mindcraft-flow-win-iconfont" :class="item.icon"></div>
          {{ item.name }}
        </div>
      </div>
      <div class="timbre-text-input">
        <div class="timbre-title">
          <svg class="icon timbre-title-icon" aria-hidden="true">
            <use xlink:href="#icon-mindcraft-yinsemiaoshu1"></use>
          </svg>
          音色描述
        </div>
        <div class="timbre-input">
          <div class="text-content">{{ selectVocie.voice_description }}</div>
        </div>
      </div>
    </div>
    <div class="timbre-text-input">
      <div class="timbre-title">
        <svg class="icon timbre-title-icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-ceshiwenben1"></use>
        </svg>
        测试文本
      </div>
      <div class="timbre-input">
        <el-input v-model="testText" type="textarea" placeholder="请输入测试文本" rows="6" />
        <el-button type="primary" icon="check" class="test-btn" @click="voiceSynthesis">生成</el-button>
      </div>
    </div>
    <div class="timbre-choose">
      <div class="timbre-title">
        <svg class="icon timbre-title-icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-shengchengshili1"></use>
        </svg>
        生成示例
      </div>
      <audio class="test-audio" :src="testVideo" controls></audio>
    </div>
    <slot></slot>
  </div>
  <timbreListDialog ref="timbreListDialogRef" v-model:select="selectVocie" v-model:show="dialogVisible" :type="props.type"></timbreListDialog>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { ElMessage, ElLoading } from "element-plus";
import timbreListDialog from "./timbreListDialog.vue";
const props = defineProps(["type"])
const emit = defineEmits(["update:select"])

const timbreListDialogRef = ref(null)
nextTick(() => {
  timbreListDialogRef.value?.getVoiceList()
})
const selectVocie = ref({})
const dialogVisible = ref(false)

const btnList = [
  {
    name: "音色列表",
    icon: "icon-mindcraft-yinseliebiao1",
    fn: () => {
      console.log("音色列表")
      dialogVisible.value = true
    }
  },
  {
    name: "音色生成",
    icon: "icon-mindcraft-shengchengshili1",
    fn: () => {
      console.log("音色生成")
      emit("update:select", 1)
    }
  },
  {
    name: "音色克隆",
    icon: "icon-mindcraft-yinsekelong1",
    fn: () => {
      console.log("音色克隆")
      emit("update:select", 2)
    }
  }
]

import { postUpLoadingTTs } from "@/api/application/VoiceDebuggingConsole.js"
const testText = ref("")
const testVideo = ref("")
const voiceSynthesis = () => {
  if (!selectVocie.value.voice_id) {
    ElMessage.warning("请选择音色")
    return
  }
  if (!testText.value) {
    ElMessage.warning("请输入测试文本")
    return
  }
  const loadingInstance = ElLoading.service({ fullScreen: true })
  postUpLoadingTTs({
    model: "MM_TTSL_realtime_speech-01-turbo",
    voice_id: selectVocie.value.voice_id,
    text: testText.value
  }).then(res => {
    testVideo.value = res?.data?.data?.audio_file
    ElMessage.success("生成成功")
  }).catch(err => {
    ElMessage.error(err?.response?.data?.message || "生成失败")
  }).finally(() => {
    loadingInstance.close()
  })
}
</script>

<style lang="scss" scoped>
.my-timbre-list{
  width: 100%;
  display: flex;
  flex-direction: column;
  .timbre-top{
    display: flex;
    .btn-list{
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      margin-top: 23px;
      margin-right: 20px;
      .btn-item{
        margin-top: 23px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        color: #000000;
        width: 242px;
        height: 87px;
        background: #FFFFFF;
        border-radius: 10px 10px 10px 10px;
        border: 1px solid #CCCCCC;
        cursor: pointer;
        user-select: none;
        &:active {
          background: #F0F0F0;
        }
        .btn-icon{
          font-size: 30px;
          margin-right: 20px;
          color: #746AFF;
        }
      }
    }
  }
  .timbre-text-input,.timbre-choose{
    display: flex;
    flex-direction: column;
    margin-top: 23px;
    flex: 1;
    .timbre-title{
      color: #107EFE;
    }
    
    .timbre-input{
      --el-input-border-color: transparent;
      --el-input-border: none;
      --el-border-color: none;
      --el-input-border-radius: 10px;
      --el-border-radius-base: 10px;
      --el-input-bg-color: #ECF5FF;
      --el-fill-color-blank: #ECF5FF;
      --el-tag-font-size: 16px;
      font-size: var(--el-tag-font-size);
      color: #000000;
      position: relative;
      height: 100%;
      flex: 1;
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      :deep(.el-textarea__inner), :deep(.el-input__inner){
        resize: none;
        padding: 12px;
      }
      .test-btn {
        position: absolute;
        right: 12px;
        bottom: 12px;
      }
      .text-content {
        background-color: var(--el-input-bg-color);
        border-radius: var(--el-border-radius-base);
        padding: 12px;
        min-height: 0;
        flex: 1;
      }
    }

    .test-audio{
      width: 100%;
      margin-top: 12px;
    }
  }
}
</style>