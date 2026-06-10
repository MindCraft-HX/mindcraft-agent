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
        @click="handleFileInput"
        @dragover.prevent
        @drop="handleDrop"
      >
        <div
          class="image-containers"
          v-if="samplePicture"
          @mouseover="showDeleteButton = true"
          @mouseleave="showDeleteButton = false"
        >
          <el-image
            :src="samplePicture"
            alt="Uploaded Image"
            class="uploaded-image"
          />
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
          <div class="upload_img"></div>
          <div style="padding: 5px 0px">拖拽文件或点击此处上传图片</div>
          <p style="font-size: 12px;margin:0 20px; text-indent: 2; color: #abaaaa">
            支持JPG/PNG格式，大于5M的图片将进行压缩
          </p>
        </div>
      </div>
    </el-col>
  </el-row>
</template>

<script setup>
import { ref, watch,computed } from "vue";
import { ElMessage } from "element-plus";
import { compressImg } from '@/utils/base64'
const props = defineProps(["paramsItem", "value"]);
const emit = defineEmits(["update:value"]);
const samplePicture = computed(()=>{
  if(props.value instanceof File || props.value instanceof Blob){
   return  URL.createObjectURL(props.value);
  }
  return ''
})
const jumpToExample = () => {
  window.location.href = 'https://b6j6u5f4zf.feishu.cn/docx/JM1qdwbojoygBExy6qXcbwsOnZf';
}

const handleFileInput = async() => {
    uploadType.value = 'click'
    let res = await window.electronAPI.selectAndReadFile({
      type: 'file',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }
      ]
    })
    // 处理 electronAPI 返回的数据
    if (res && res.length > 0) {
    const fileData = res[0];
    // 创建 File 对象
    const file = new File([fileData.data], fileData.name, {
      type: fileData.type,
      lastModified: fileData.lastModified
    });
    
    // 添加 path 属性（如果需要）
    file.path = fileData.path;
    
    // 调用验证和上传方法
    await validateAndUploadFiles([file]);
  }
};
const uploadType = ref('click') // click ||drop
const dropTranferData = ref(null)

const handleDrop = async (event) => {
  event.preventDefault();
  uploadType.value = 'drop'
  const files = event.dataTransfer.files;
  // 拖拽缩略图获取path信息
  const internalData = event.dataTransfer.getData('application/x-internal-image');
  if(internalData){
    dropTranferData.value = JSON.parse(internalData)
    const { item } = dropTranferData.value;
    if (item?.file) {
      const response = await fetch(`file://${item.file}`);
      const blob = await response.blob();
      const type = item.fileName.split('.').pop();
      const file = new File([blob], item.fileName,{ type: `image/${type}` });
      await validateAndUploadFiles([file]);
    }
  } else if (files && files.length > 0) {
    await validateAndUploadFiles(Array.from(files));
  }
};

const compressedFile= ref(null)
const isCompress =ref(false)
const validateAndUploadFiles = async (files) => {
  let file = files[0];
  const validTypes = ["image/jpg","image/jpeg", "image/png"];
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (!validTypes.includes(file.type)) {
    ElMessage.warning("只支持JPG/PNG格式的图片");
    return;
  }

  if (file.size > maxSize) {
    //  判断是否超过5M,超过5M进行压缩
    compressedFile.value = await compressImg(file);
    ElMessage.success("图片大于5M，已自动压缩至" + compressedFile.value.afterMB + 'MB');
    isCompress.value = true
    uploadFiles(compressedFile.value.file);
  } else{
    isCompress.value = false
    uploadFiles(file);
  }
};

const uploadedFile = ref(null);
const uploadPath = ref('')
const uploadFiles = (files) => {
  ElMessage.success("上传图片成功");
  uploadedFile.value = files;
  // 拖拽需要手动传递路径参数
  uploadPath.value = files.path || dropTranferData.value?.path || ''
  changeValue()
};

const showDeleteButton = ref(false);
const deleteImage = () => {
  samplePicture.value = "";
  uploadedFile.value = null;
  changeValue()
  ElMessage.error("已删除图片");
};
//  更新媒体路径
const changeValue = () => {
  // 可以实现响应式更新file内容
  emit("update:value", uploadedFile.value);
  //但如需对图片资料进行处理，需手动操作，已抛出图片资源、路径、上传方式、是否压缩图片
  const params = {
    file: uploadedFile.value,
    path: uploadPath.value,
    type: uploadType.value,
    isCompress: isCompress.value,
    compressedFile: compressedFile.value,
  }
  emit('change', params)
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
  }

  .upload_img {
    background-image: url("@/assets/uploading_img.png");
    background-size: 100% 100%;
    width: 48px;
    height: 40px;
  }

  .image-containers {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    justify-content: center;
  }

  .uploaded-image {
    /* width: 100%; */
    height: 100%;
    /* border-radius: 10px; */
    object-fit: contain;
    overflow: hidden;
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