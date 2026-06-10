<template>
  <div class="timbre-list">
    <div class="timbre-info">
      <div class="timbre-choose">
        <div class="timbre-title">
          <svg class="icon timbre-title-icon" aria-hidden="true">
            <use xlink:href="#icon-mindcraft-xuanzeyinse1"></use>
          </svg>
          选择音色
        </div>
        <div class="choose-btn" @click="openChooseDialog">
          <div class="choose-icon mindcraft-flow-win-iconfont icon-mindcraft-yinseqiehuan1"></div>
          <div class="choose-info" v-if="selectVocie.voice_id">
            <div class="choose-info-name">{{ selectVocie.voice_name }}</div>
            <div class="choose-info-tags">
              <el-tag type="primary" v-for="item, index in selectVocie.voice_tags" :key="index">{{ item }}</el-tag>
            </div>
          </div>
          <div class="choose-info" v-else>
            <div class="choose-info-name">请选择音色</div>
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
          <el-input v-model="testText" type="textarea" placeholder="请输入测试文本" :rows="8" />
          <el-button type="primary" icon="check" class="test-btn" @click="voiceSynthesis">生成</el-button>
        </div>
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
import { ElMessage, ElLoading } from "element-plus";
import { inject, nextTick, onMounted, ref, watch } from "vue";
import timbreListDialog from "./timbreListDialog.vue";
const character = inject("character")
const props = defineProps(["type"])

const timbreListDialogRef = ref(null)
nextTick(() => {
  timbreListDialogRef.value?.getVoiceList()
})
const selectVocie = ref({})
const dialogVisible = ref(false)
const openChooseDialog = () => {
  dialogVisible.value = true
}

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
*{
  box-sizing: border-box;
}
.timbre-list{
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 28px 0;
  .timbre-info{
    display: flex;
  }
  .timbre-choose,.timbre-text-input{
    display: flex;
    flex-direction: column;
    margin-right: 20px;
    margin-bottom: 27px;
    &.timbre-text-input{
      flex: 1;
    }
    .timbre-title{
      font-size: 16px;
      color: #107EFE;
      display: flex;
      align-items: center;
      margin-bottom: 11px;
      .timbre-title-icon{
        margin-right: 6px;
      }
    }
    .choose-btn{
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
      background: #F5F5F5;
      border-radius: 10px;
      border: 1px solid #DFDFDF;
      width: 170px;
      overflow: hidden;
      cursor: pointer;
      transition: all .3s;
      color: #746AFF;
      &:active{
        background: #ebebeb;
        .choose-icon{
          background: #107EFE;
          color: #FFFFFF;
        }
      }
      .choose-icon{
        width: 100%;
        text-align: center;
        padding: 32px;
        font-size: 44px;
        background: #FFFFFF;
        transition: all .3s;
      }
      .choose-info{
        width: 100%;
        display: flex;
        flex-direction: column;
        padding: 10px 14px;
      }
      .choose-info-name{
        width: 100%;
        text-align: left;
        font-weight: bold;
        font-size: 16px;
        color: #000000;
        margin-bottom: 12px;
      }
      .choose-info-tags{
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        .el-tag{
          margin: 2px;
        }
      }
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
      :deep(.el-textarea__inner), :deep(.el-input__inner){
        resize: none;
        padding: 12px;
      }
      .test-btn {
        position: absolute;
        right: 12px;
        bottom: 12px;
      }
    }

    .test-audio{
      width: 100%;
    }
  }
}

</style>