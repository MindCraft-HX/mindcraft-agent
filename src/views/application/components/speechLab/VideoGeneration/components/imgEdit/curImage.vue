<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="24" class="attr-name">
        当前图片
    </el-col>
    <el-col :span="24">
      <div class="upload_pictures">
        <div class="image-containers" v-if="value" @mouseover="showDeleteButton = true"
          @mouseleave="showDeleteButton = false">
          <el-image :src="'file://'+value" alt="Uploaded Image" class="uploaded-image" />
        </div>
      </div>
    </el-col>
  </el-row>
</template>       

<script setup>

const props = defineProps({
  value: {
    type: String,
    default: ''
  }
})

</script>

<style lang="scss" scoped>
.attr-content {
  width: 90%;
  margin: 0 auto;
  margin-bottom: 28px;

  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    margin-bottom: 12px;
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