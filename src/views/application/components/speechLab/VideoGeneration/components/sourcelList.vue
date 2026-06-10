<template>
  <div class="list-content">
    <div class="list-menu">
      缩略图
      <el-select
        v-model="sourceType"
        v-if="!typeSelectDisabled"
        placeholder="文件类型"
        @change="changeSourceType"
        style="width: 124px; margin-left: 12px"
      >
        <el-option
          v-for="item in sourceListType"
          :key="item.value"
          :label="item.name"
          :value="item.value"
        />
      </el-select>
      <div style="flex: 1"></div>
      <!-- 预览 -->
      <el-button
       style="width: 36px; height: 36px; font-size: 20px"
        color="#409EFF"
        plain
        icon="View"
        title='预览'
        @click="preViewImg"
         v-if="!!mediaPath&&type=='img'"
         ></el-button>
      <!-- 删除 -->
      <el-button
        style="width: 36px; height: 36px; font-size: 20px"
        color="#409EFF"
        plain
        icon="DeleteFilled"
        title='删除'
        @click="deleteImg"
        v-if="!!mediaPath"
      ></el-button>
      <!-- 下载 -->
      <el-button
        style="width: 36px; height: 36px; font-size: 20px"
        color="#409EFF"
        plain
        icon="Download"
        title='下载'
        @click="download"
        v-if="!!mediaPath"
      ></el-button>
      <!-- 打开文件所在地 -->
      <el-button
        style="width: 36px; height: 36px; font-size: 20px"
        color="#409EFF"
        plain
        icon="Folder"
        title='打开文件夹'
        @click="openFolder"
        v-if="!!mediaPath"
      ></el-button>
      <!-- 复制 -->
      <el-button
        style="width: 36px; height: 36px; font-size: 20px"
        color="#409EFF"
        plain 
        icon="Share"
        title='复制图片链接'
        @click="copyLinkIMg"
        v-if="!!mediaPath"
      ></el-button>
      <!-- 信息 -->
      <el-button
       style="width: 36px; height: 36px; font-size: 20px" color="#409EFF" plain 
       icon="MoreFilled" 
       title='图片信息'
       @click="openImgInfo" 
       v-if="!!mediaPath"
      ></el-button>
    </div>
    <el-scrollbar ref="scrollbarRef" width="100%" @wheel="handleWheel">
      <div class="source-list">
        <div
          class="source-item"
          :class="{ 'choose-file': mediaPath == item.file ,'new-file':isNewFile(item.runTime) }"
          v-for="item in sourceList"
          :key="item"
          @click="changeMedia(item)"
        >
          <template v-if="isImage(item.file)">
            <el-image
              style="min-height: 100%; min-width: 100%; display: flex; justify-content: center; align-items: center"
              :src="`file://${item.file}`"
              @dragstart="handleDragStart(item,$event)"
            />
            <div class="source-tips">图片</div>
          </template>
          <template v-if="isVideo(item.file)">
            <video
              style="min-height: 100%; min-width: 100%"
              :src="`file://${item.file}`"
              @dragstart="handleDragStartVideo(item,$event)"
              :draggable="true"
            ></video>
            <div class="source-tips">视频</div>
          </template>
          <el-button class="delete-btn" size="small" circle type="danger" icon="Delete" @click.stop="deleteFile(item)"></el-button>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer v-if="showPreview" :url-list="previewUrlList" show-progress :initial-index="currentIndex"
      @close="showPreview = false" style="position: fixed; z-index: 9999;" />
  </div>
</template>

<script setup>
import { computed, ref,onMounted} from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useImgEditStore } from '@/stores/imgEdit.js'
const imgEditStore = useImgEditStore()
const props = defineProps(["sourceList", "showSorce", "mediaPath",'typeSelectDisabled','type']);
const emit = defineEmits(["update:sourceList", "update:mediaPath", "update:mediaInfoDrawer"]);

const sourceListType = [
  { name: "全部", value: "all" },
  { name: "图片", value: "img" },
  { name: "视频", value: "video" },
];
const sourceType = ref("all");
onMounted(()=>{
  if(imgEditStore.newAddTimes){
    imgEditStore.newAddTimes = []
  }
 if(props.type){
  sourceType.value = props.type
  getSoureList()
 }
})
const changeSourceType = () => {
  getSoureList();
};

const showPreview = ref(false);
const currentIndex = ref(-1)
// 预览图片
const preViewImg = () => {
  currentIndex.value = sourceList.value.findIndex(
    item => item.file === props.mediaPath
  )
  if (currentIndex.value >= 0) {
    showPreview.value = true
  }
}
const previewUrlList = computed(() => {
  return sourceList.value
    .filter(item => isImage(item.file))
    .map(item => `file://${item.file}`)  // 确保转换为 file:// 格式
})

const download = async () => {
  // 实际为移动到指定文件夹
  window.electronAPI.copySourceFromPathToPath(props.mediaPath);
};
const openFolder = () => {
  const folderPath = window.electronAPI.pathDirname(props.mediaPath)
  // 打开指定文件夹
  window.electronAPI.openFolder(folderPath);
}
const copyLinkIMg = () => {
  if(!nowSourceInfo.value.shareLink) {
    ElMessage.error("暂无分享链接或已过期，请下载后分享");
  } else {
    navigator.clipboard
      .writeText(nowSourceInfo.value.shareLink)
      .then(() => {
        ElMessage.success("分享链接已复制到剪贴板");
      })
      .catch((err) => {
        ElMessage.error("分享链接复制失败");
      });
  }
  
}
const nowSourceInfo = computed(() => {
  return  props.sourceList.find(list => list.file === props.mediaPath) || {}
})

const openImgInfo = () => {
  emit("update:mediaInfoDrawer", true)
}

const sourceList = ref([]);
const getSoureList = async () => {
  const list = await window.electronAPI.getSourceListByFilePath();
  sourceList.value = list.filter((item) => {
    if (sourceType.value === "all") {
      return true;
    } else if (sourceType.value === "img") {
      return isImage(item.file);
    } else if (sourceType.value === "video") {
      return isVideo(item.file);
    }
  });
  emit("update:sourceList", sourceList.value);
};
getSoureList();
import { useMitt } from "@/utils/mitt";
const mitt = useMitt();
mitt.off("updateSoureList", getSoureList);
mitt.on("updateSoureList", getSoureList);

const changeMedia = (item) => {
  emit("update:mediaPath", item.file);
  //点击后，清除最新图片列表
  if(imgEditStore.newAddTimes){
    imgEditStore.newAddTimes = []
  }
};

const scrollbarRef = ref(null);
const handleWheel = (event) => {
  const scrollContainer = scrollbarRef.value?.$el?.querySelector(
    ".el-scrollbar__wrap"
  );
  const scrollAmount = event.deltaY * 2;
  scrollContainer?.scrollTo({
    left: scrollContainer.scrollLeft + scrollAmount,
    behavior: "smooth",
  });
  event.preventDefault();
};

import { useFileType } from "../hook/useFileType";
const { isImage, isVideo } = useFileType();

const deleteImg = ()=>{
   const item = sourceList.value.find(list => list.file === props.mediaPath)
   deleteFile(item)
}
const deleteFile = async (item) => {
  ElMessageBox.confirm("确定要删除该资源吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
  .then(async () => {
    await window.electronAPI.deleteSourceByFilePath(item.file);
    sourceList.value = sourceList.value.filter((list) => list.file !== item.file);
    if (item.file === props.mediaPath) {
      emit("update:mediaPath", "");
    }
  })
}

const  handleDragStart=(item, event) =>{
    // 添加自定义数据类型
    event.dataTransfer.setData('application/x-internal-image', JSON.stringify({
      type: 'internal',
      item:item,
      path: item.file  // 直接传递原始路径
    }));
    // 可选：设置拖动图标
    event.dataTransfer.effectAllowed = 'move';
}
const handleDragStartVideo = (item, event)=>{
     // 添加视频数据
     event.dataTransfer.setData('application/x-internal-video', JSON.stringify({
      type: 'internal',
      item:item,
      path: item.file
    }));
    // 可选：设置拖动图标
    event.dataTransfer.effectAllowed = 'move';
}
const isNewFile = (runTime)=>{
   // 判断是否是新资源
   if(!runTime)return false
  return imgEditStore.newAddTimes.includes(runTime)
}

</script>

<style lang="scss" scoped>
:deep(.el-input__wrapper) {
  background: #ffffff;
  border-radius: 8px 8px 8px 8px;
  border: 1px solid #409eff;
}
.list-content {
  flex-shrink: 0;
  width: 100%;
  padding: 38px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  .list-menu {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
    font-size: 16px;
    color: #ffffff;
  }
  .source-list {
    width: 100%;
    margin: 24px 0;
    display: grid;
    display: flex;
    grid-template-columns: repeat(auto-fill, 108px);
    align-items: center;
    // justify-content: space-between;
    flex-wrap: nowrap;
    box-sizing: border-box;
    .source-item {
      flex-shrink: 0;
      width: 108px;
      height: 108px;
      border-radius: 10px 10px 10px 10px;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      margin: 8px;
      display: flex;
      justify-content: center;
      align-items: center;
      box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
      background: rgba(0, 0, 0, .8);
      &:hover {
        top: -2px;
      }
      &.new-file{
        border: 2px solid #09DC66;
      }
      &.choose-file {
        border: 2px solid #409eff;
      }
      .source-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .source-video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .source-tips {
        position: absolute;
        left: 5px;
        bottom: 5px;
        background: rgba(13, 13, 13, 0.73);
        border-radius: 5px 5px 5px 5px;
        font-size: 12px;
        color: #ffffff;
        padding: 3px 6px;
      }
      &:hover .delete-btn {
        display: flex;
      }
      .delete-btn{
        position: absolute;
        right: 5px;
        top: 5px;
        width: 20px;
        height: 20px;
        display: none;
      }
    }
    &::after {
      content: "";
      width: 10px;
      height: 108px;
      margin: 8px;
      flex-shrink: 0;
    }
  }
}
</style>