<template>
  <el-row class="attr-content" align="top">
    <el-col :span="24" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem.isRequired===1">*</span>{{paramsItem.title}}
    </el-col>
    <el-col :span="24" align="end">
      <textarea
        class="debugging-bench-textarea"
        :placeholder="paramsItem.description"
        v-model="moduleValue"
      ></textarea>
      <!-- <el-button style="height: fit-content;padding: 4px 7px;border-radius: 9px" color="#1F5FBE" @click="aiThink"><div class="icon-ai"></div>AI帮我想</el-button> -->
    </el-col>
  </el-row>

  <div class="prompt-popup" v-show="promptPopup" @click="promptPopup = false">
    <div class="prompt-item" v-for="item, index in promptList" :key="index" @click.stop="changeModuleValue(item)">
      <div class="prompt-index">{{ index + 1 }}</div>
      <el-scrollbar max-height="100%">
        <div class="prompt-content">{{ item.prompt }}</div>
      </el-scrollbar>
      <el-button color="#A4A4A4" icon="Check">选择</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from "element-plus";
const props = defineProps(['paramsItem', 'model', 'value', 'type', 'uploadedFile'])
const emit = defineEmits(['update:value'])

const moduleValue = computed({
  get() {
    return props.value
  },
  set(val) {
    emit('update:value', val)
  }
})
const changeModuleValue = (value) => {
  moduleValue.value = value.prompt
  promptPopup.value = false
}

import { postPromptGenerator } from "@/api/application/VoiceDebuggingConsole";
const promptList = ref([]);
const promptPopup = ref(false);
const aiThink = async () => {
  const formData = new FormData();
  formData.append('category', props.type);
  formData.append('model', props.model);
  formData.append('content', moduleValue.value);
  formData.append('quantity ', 3);
  if(!!props.uploadedFile) {
    formData.append('image', props.uploadedFile, 'default.png');
  }
  try {
    const res = await postPromptGenerator(formData);
    promptList.value = res.data.data;
    promptPopup.value = true
    ElMessage.success("生成灵感描述成功")
  } catch (error) {
    console.log(error);
    ElMessage.error(error?.response?.data?.message || "生成灵感描述失败")
  }
}

</script>

<style lang="scss" scoped>
.attr-content{
  width: 90%;
  margin: 0 auto;
  margin-bottom: 12px;
  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    margin-bottom: 12px;
  }
  .attr-name.el-col-24{
    margin-bottom:12px;
  }
  .debugging-bench-textarea {
    width: 98%;
    height: 26vh;
    font-size: 16px;
    resize: none;
    border: 2px solid #1e52c5;
    border-radius: 10px;
    padding: 4px;
    transition: all 0.3s, height 0s;
  
    max-width: 100%;
    min-height: 32px;
    line-height: 1.5714285714285714;
    vertical-align: bottom;
    margin-bottom: 8px;
  }
  .icon-ai{
    width: 17px;
    height: 17px;
    background-size: 100% 100%;
    background-image: url("@/assets/videoGeneration/ai.png");
  }
}
.prompt-popup{
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-top: 23px;
  .prompt-item{
    width: 504px;
    height: fit-content;
    max-height: 28vh;
    box-sizing: border-box;
    background: #FFFFFF;
    border-radius: 11px;
    border: 2px solid #A4A4A4;
    padding: 26px 26px;
    margin-bottom: 33px;
    position: relative;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    .prompt-index{
      width: 57px;
      height: 57px;
      background: #A4A4A4;
      border-radius: 50%;
      position: absolute;
      top: -23px;
      left: 0;
      line-height: 57px;
      font-size: 32px;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .prompt-content{
      font-size: 16px;
      color: #000000;
      line-height: 24px;
      margin-top: 16px;
    }
    .prompt-btn{
      width: 100%;
      height: 40px;
      background: #1E52C5;
    }
    .el-button {
      color: #FFFFFF;
      margin-top: 12px;
    }
    &:hover {
      .prompt-index {
        background: #1F5FBE;
      }
      .el-button {
        background: #1F5FBE;
      }
    }
  }
}
</style>