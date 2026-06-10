<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="24" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem.isRequired===1">*</span>
      {{ paramsItem.title }}
      <el-button type="primary" size="small" v-if="paramsItem?.paramName == 'subject_reference'" @click="jumpToExample">查看示例</el-button>
      <el-popover placement="bottom" :width="220" trigger="hover">
        <template #reference>
          <div
            style="
              width: 16px;
              height: 16px;
              color: #a9b5c0;
              display: inline-flex;
              margin: 0px 5px;
            "
            v-if="paramsItem.description"
          >
            <InfoFilled />
          </div>
        </template>
        <template #default>
          <div>
            {{ paramsItem.description }}
          </div>
        </template>
      </el-popover>
    </el-col>
    <el-col :span="24">
      <div
        class="upload_pictures"
        @click="!uploadedFile && triggerFileInput()"
        @dragover.prevent
        @drop="handleDrop"
      >
 
        <div
          class="audio-containers"
          v-if="uploadedFile"
        >
          <div class="audio-header">
            <div class="audio-file-meta">
              <div class="audio-file-name">{{ uploadedFile.name || "已上传音频" }}</div>
              <div class="audio-file-size">{{ formatFileSize(uploadedFile.size || 0) }}</div>
            </div>
            <div class="audio-actions">
              <el-button size="small" type="primary" text @click.stop="triggerFileInput">重新上传</el-button>
              <el-button size="small" text @click.stop="deleteAudio">删除</el-button>
            </div>
          </div>
          <audio
            :src="audioUrl"
            class="uploaded-audio"
            controls
            preload="metadata"
            ref="audioPlayer"
          ></audio>
        </div>

        <div
          class="upload-empty"
          v-else
        >
          <div class="upload_audio"></div>
          <div class="upload-title">拖拽文件或点击此处上传音频</div>
          <p class="upload-tip">
     {{ paramsItem.description }}
          </p>
        </div>
      </div>
      <input
        type="file"
        ref="fileInput"
        @change="handleFileChange"
        accept="audio/mpeg,audio/wav,audio/aac"
        style="display: none"
      />
    </el-col>
  </el-row>
</template>

<script setup>
import { ref, watch,computed } from "vue";
import { ElMessage } from "element-plus";
import { compressImg } from '@/utils/base64'
const props = defineProps(["paramsItem", "value"]);
const emit = defineEmits(["update:value"]);
const audioPlayer = ref(null)
const uploadedFile = ref(null);
const uploadedFilePath = ref(null); // 新增：单独存储文件路径
watch(()=>props.value,(val)=>{
  if(!val){
    uploadedFile.value = null;
    uploadedFilePath.value = null;
  }else{
    uploadedFile.value = val;
  }
})

const audioUrl = computed(() => {
  if (!uploadedFile.value) return '';
  
  // 在Electron环境中使用文件路径
  if (uploadedFile.value.path) {
    return `file://${uploadedFile.value.path}`;
  }
  
  // 在Web环境中创建Object URL
  return URL.createObjectURL(uploadedFile.value);
});

const jumpToExample = () => {
  window.location.href = 'https://b6j6u5f4zf.feishu.cn/docx/JM1qdwbojoygBExy6qXcbwsOnZf';
}

const fileInput = ref(null);
const triggerFileInput = () => {
  fileInput.value.click();
};
const uploadType = ref('click') // click ||drop
const handleFileChange = async (event) => {
   uploadType.value = 'click'
  const files = event.target.files;
  if (files.length) {
    await validateAndUploadFiles(files);
  }
};
const dropTranferData= ref(null)
const handleDrop = async (event) => {
  event.preventDefault();
  uploadType.value = 'drop';
  const files = event.dataTransfer.files;
  // 音频拖拽
  const internalData = event.dataTransfer.getData('application/x-internal-audio');
  if (internalData) {
    try {
      dropTranferData.value = JSON.parse(internalData);
      const { item } = dropTranferData.value;
      if (item?.file) {
        const response = await fetch(`file://${item.file}`);
        const blob = await response.blob();
        const file = new File([blob], item.fileName, { type: 'audio/mpeg' });
        await validateAndUploadFiles([file]);
      }
    } catch (e) {
      console.error('处理拖拽文件失败', e);
    }
  }
  //  系统文件拖拽
  if (files.length) {
    await validateAndUploadFiles(files);
  }
};
const validateAndUploadFiles = async (files) => {
  let file = files[0];
  const validTypes = ["audio/mpeg", "audio/wav", "audio/aac"];
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (!validTypes.includes(file.type)) {
    ElMessage.warning("只支持MP3、WAV、AAC格式的音频");
    return;
  }

  if (file.size > maxSize) {
    ElMessage.warning("音频大小不能超过50MB");
  } else{
    uploadFiles(file);
  }
};

const uploadFiles = (files) => {
  ElMessage.success("上传音频成功");
  uploadedFile.value = files;
  uploadedFilePath.value = files.path || dropTranferData.value?.path || '' 
  changeValue();
};

const formatFileSize = (size) => {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};
// 删除时清理
const deleteAudio = () => {
  if (uploadedFile.value) {
    // 只在Web环境（使用Object URL时）清理资源
    if (!uploadedFile.value.path && audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
    }
    // 重置状态
    uploadedFile.value = null;
    uploadedFilePath.value = null;
    fileInput.value.value = "";
    emit("update:value", null);
    
    ElMessage.error("已删除音频");
  }
};
//  更新媒体路径
const changeValue = () => {
  // 可以实现响应式更新file内容
  emit("update:value", uploadedFile.value);
};
</script>

<style lang="scss" scoped>
.attr-content {
  width: 90%;
  margin: 0 auto;
  margin-bottom: 12px;
  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    margin-bottom: 12px;
  }
  .description{
    font-size: 14px;
    color: #666;
    margin: 6px 0 12px;
  }
  .upload_pictures {
    width: 98%;
    height: 183px;
    border: 2px solid #1e52c5;
    border-radius: 10px;
    padding: 8px;
    background-color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    overflow: hidden;
  }


  .audio-containers {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    background-color: #f7f9fc;
    border-radius: 8px;
    border: 1px solid #e4e7ed;
    padding: 10px 12px;
    box-sizing: border-box;

    .audio-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .audio-file-meta {
      min-width: 0;
    }

    .audio-file-name {
      font-size: 14px;
      color: #000000;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 360px;
    }

    .audio-file-size {
      margin-top: 4px;
      font-size: 12px;
      color: #999999;
    }

    .audio-actions {
      display: flex;
      gap: 2px;
    }
  }

  .uploaded-audio {
    width: 100%;
  }

  .upload_audio {
    background-image: url("@/assets/uploading_audio.png");
    background-size: 100% 100%;
    width: 48px;
    height: 40px;
  }

  .upload-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .upload-title {
    padding: 8px 0 4px;
    font-size: 14px;
    color: #303133;
  }

  .upload-tip {
    font-size: 12px;
    margin: 0 20px;
    color: #abaaaa;
    text-align: center;
  }

  :deep(.describe_input .el-textarea__inner) {
    min-height: 156px !important;
    resize: none !important;
    border-radius: 10px !important;
    border: 2px solid #1e52c5 !important;
  }
}
</style>