<template>
  <div class="timbre-create">
    <div class="timbre-text-input">
      <div class="timbre-title">
        <svg class="icon timbre-title-icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-ceshiwenben1"></use>
        </svg>
        测试文本
      </div>
      <div class="timbre-input">
        <el-input v-model="testText" type="textarea" placeholder="请输入测试文本" :rows="8" />
        <el-button type="primary" class="test-btn" @click="voiceSynthesisAuto">点击根据角色设定自动生成</el-button>
      </div>
    </div>
    <div class="timbre-choose">
      <div class="timbre-title">
        <svg class="icon timbre-title-icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-shengchengshili1"></use>
        </svg>
        生成示例
        <el-text style="margin-left: 12px;">(生成后请返回音色列表选择)</el-text>
      </div>
      <audio class="test-audio" :src="testVideo" controls></audio>
    </div>
    <slot></slot>
  </div>
</template>

<script setup>
import { ElMessage, ElLoading } from "element-plus";
import { inject, nextTick, onMounted, ref, watch } from "vue";
const character = inject("character")

import { apiCreateCharacterVoice } from "@/api/application/character.js"
const testText = ref("")
const testVideo = ref("")
const voiceSynthesisAuto = () => {
  if (!testText.value) {
    ElMessage.warning("请输入测试文本")
    return
  }
  apiCreateCharacterVoice({
    voice_text: testText.value,
  }, character.value.character_id).then(res => {
    console.log(res)
    testVideo.value = res?.data?.data?.voice_audio
    ElMessage.success("生成成功")
  })
}
</script>

<style lang="scss" scoped>
.timbre-create{
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 28px 0;
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
      width: 100%;
      display: flex;
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
        padding: 40px 0;
        min-height: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      }
    }

    .test-audio{
      width: 100%;
    }
  }
}
</style>