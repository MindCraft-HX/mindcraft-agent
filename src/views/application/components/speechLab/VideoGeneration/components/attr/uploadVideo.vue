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
        @click="triggerFileInput"
        @dragover.prevent
        @drop="handleDrop"
      >
 
        <div
          class="image-containers"
          v-if="uploadedFile"
          @mouseover="showDeleteButton = true"
          @mouseleave="showDeleteButton = false"
        >
          <video
            :src="videoUrl"
            class="uploaded-video"
            controls
            @click.stop="toggleVideoPlay"
            ref="videoPlayer"
          ></video>
          <button
            v-show="showDeleteButton"
            @click.stop="deleteImage"
            class="delete-button"
          >
            删除
          </button>
        </div>

        <div
          style="display: flex; flex-direction: column; align-items: center"
          v-else
        >
          <div class="upload_video"></div>
          <div style="padding: 5px 0px">拖拽文件或点击此处上传视频</div>
          <p style="font-size: 12px;margin:0 20px; text-indent: 2; color: #abaaaa">
            支持MP4格式,视频大小不能超过50MB
          </p>
        </div>
      </div>
      <input
        type="file"
        ref="fileInput"
        @change="handleFileChange"
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
const videoPlayer = ref(null)
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

const videoUrl = computed(() => {
  if (!uploadedFile.value) return '';
  
  // 在Electron环境中使用文件路径
  if (uploadedFile.value.path) {
    return `file://${uploadedFile.value.path}`;
  }
  
  // 在Web环境中创建Object URL
  return URL.createObjectURL(uploadedFile.value);
});
const toggleVideoPlay = () => {
  const video = videoPlayer.value;
  video.paused ? video.play() : video.pause();
};
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
  // 缩略图拖拽
  const internalData = event.dataTransfer.getData('application/x-internal-video');
  if (internalData) {
    try {
      dropTranferData.value = JSON.parse(internalData);
      const { item } = dropTranferData.value;
      if (item?.file) {
        const response = await fetch(`file://${item.file}`);
        const blob = await response.blob();
        const file = new File([blob], item.fileName, { type: 'video/mp4' });
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
  const validTypes = ["video/mp4"];
  const maxSize = 50 * 1024 * 1024; // 10MB

  if (!validTypes.includes(file.type)) {
    ElMessage.warning("只支持MP4格式的视频");
    return;
  }

  if (file.size > maxSize) {
    ElMessage.warning("视频大小不能超过50MB");
  } else{
    uploadFiles(file);
  }
};

const uploadFiles = (files) => {
  ElMessage.success("上传视频成功");
  uploadedFile.value = files;
  uploadedFilePath.value = files.path || dropTranferData.value?.path || '' 
  changeValue()
};

const showDeleteButton = ref(false);
// 删除时清理
const deleteImage = () => {
  if (uploadedFile.value) {
    // 只在Web环境（使用Object URL时）清理资源
    if (!uploadedFile.value.path && videoUrl.value) {
      URL.revokeObjectURL(videoUrl.value);
    }
    // 重置状态
    uploadedFile.value = null;
    uploadedFilePath.value = null;
    fileInput.value.value = "";
    emit("update:value", null);
    
    ElMessage.error("已删除视频");
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
    padding: 4px;
    background-color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    overflow: hidden;
  }


  .image-containers {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    justify-content: center;
  }
  .upload_video {
    background-image: url("@/assets/uploading_video.png");
    background-size: 100% 100%;
    width: 48px;
    height: 40px;
  }

  .delete-button {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: rgba(255, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 5px;
    padding: 5px 10px;
    cursor: pointer;
  }

  :deep(.describe_input .el-textarea__inner) {
    min-height: 156px !important;
    resize: none !important;
    border-radius: 10px !important;
    border: 2px solid #1e52c5 !important;
  }
}
</style>