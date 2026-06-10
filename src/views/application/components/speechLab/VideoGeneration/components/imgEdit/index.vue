<template>
  <div class="img-edit-box" :class="loading ? 'loading-layer' : ''">

    <div class="left-content">
        <CanvasContainer  class="value-content" v-model:loading="loading" :sourceList="sourceList" />
      <!-- <div class="editor">
        <EditorTools v-show="imgEditStore.showEditorTool" :loading="loading" />
        <DrawTools v-show="imgEditStore.showDrawTool" :loading="loading" />
      </div> -->
      <SourcelList class="source-content" v-model:mediaPath="mediaPath" v-model:sourceList="sourceList"
        :typeSelectDisabled="true" type="img" v-model:mediaInfoDrawer="mediaInfoDrawer" />
    </div>
    <div class="menu-content">
      <div class="attr-content">
        <el-scrollbar ref="scrollbarRef" width="100%" max-height="100%" height="100%">
          <editForm v-model:loading="loading" />
        </el-scrollbar>
      </div>
    </div>
    <el-drawer v-model="mediaInfoDrawer" title="详情" size="356" style="background-color: #E1E8F8;">
      <MediaInfo :mediaPath="mediaPath" :sourceList="sourceList"></MediaInfo>
    </el-drawer>
  </div>

</template>

<script setup>
import { ref, watch } from 'vue'
import EditForm from './editForm.vue'
import SourcelList from '@/views/application/components/speechLab/VideoGeneration/components/sourcelList.vue'
import MediaInfo from '@/views/application/components/speechLab/VideoGeneration/components/mediaInfo.vue'
import CanvasContainer from './canvasContainer.vue'
import DrawTools from './drawTools.vue'
import EditorTools from './editTools.vue';
import { useImgEditStore } from '@/stores/imgEdit.js'
import { storeToRefs } from 'pinia';
const imgEditStore = useImgEditStore()
const { mediaPath, loadingTip } = storeToRefs(imgEditStore)
const sourceList = ref([])
const mediaInfoDrawer = ref(false)
const loading = ref(false)
</script>

<style lang="scss" scoped>
.img-edit-box {
  // width: 100%;
  // height: calc(100vh - 70px);
  // display: flex;
  // justify-content: space-between;
  position: relative;
  left: 0;
  overflow: hidden;

  &.loading-layer {
    pointer-events: none;
  }

  &.loading-layer::after {
    content: '';
    display: block;
    background-color: rgba(0, 0, 0, 0.3);
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1000;
    width: 100%;
    height: 100%;
  }
  .left-content {
    flex: 1;
    height: 100%;
    background-image: url("@/assets/videoGeneration/bg.png");
    background-size: 100% 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 0;
    position: relative;

    .value-content {
      width: 100%;
      min-height: 0;
      box-sizing: border-box;
      flex: 1;
    }

    .editor {
      //  设置flex高度
      flex-basis: 44px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      position: relative;
      z-index: 100;
    }

    .source-content {
      padding: 10px;
    }
  }

  .menu-content {
    flex-shrink: 0;
    width: 336px;
    height: 100%;
    background: #E1E8F8;
    display: flex;
    flex-direction: column;
    align-items: center;

    .attr-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      padding-top: 12px;

      :deep(.el-scrollbar) {
        width: 100%;
      }
    }
  }
}
</style>
