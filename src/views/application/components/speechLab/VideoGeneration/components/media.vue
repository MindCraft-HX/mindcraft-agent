<template>
  <div class="media">
    <template v-if="!mediaPath || loading">
      <div class="empty" :class="[`empty-${menuType}`]" ></div>
      <el-progress style="width: 162px" :stroke-width="6" :percentage="50" :indeterminate="true" :text-inside="true" v-if="loading"/>
      <div style="color: #fff; font-size: 12px; text-align: center; margin-top: 10px; font-weight: 600">{{loadingTips}}</div>
    </template>
    <template v-else>
      <div class="source-info">
        <div class="source-name">名称：{{sourceInfo.fileName}}</div>
        <div class="source-model">模型：{{ sourceInfo.model || "未知" }}</div>
      </div>
      <el-image style="width: 100%;height:100%;" :src="`file://${mediaPath}`" :preview-src-list="srcList" :initial-index="initialIndex" v-if="isImage(mediaPath)" fit="contain"/>
      <video style="width: 100%;height:100%;background-color: rgba(0, 0, 0, .5);border-radius: 5px;" :src="`file://${mediaPath}`" controls v-else-if="isVideo(mediaPath)"></video>
      <div class="empty" :class="[`empty-${menuType}`]" v-else></div>

    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
const props = defineProps(["mediaPath", "menuType", "loading", "sourceList"])
import { useFileType } from '../hook/useFileType'
const { isImage, isVideo } = useFileType()

// 预览图列表
const srcList = computed(() => {
  return props.sourceList.map(item => item.file).filter(item => isImage(item))
})

// 预览图初始下标
const initialIndex = computed(() => {
  return Math.max(srcList.value.findIndex(item => item == props.mediaPath), 0)
})


// 刷新loading提示
const loadingTips = ref("")
let timer = null
const refreshTips = () => {
  // console.log("loading2", props.loading)
  const modelSpeed = [0, 1].includes(+props.menuType) ? 'text_speed' : 'image_speed'
  const localInfoName = modelSpeed == 'text_speed' ? "text_to_video_task" : "img_to_video_task"
  let task = {}
  try {
      task = JSON.parse(window.localStorage.getItem(localInfoName) || "{}");
  } catch (error) {
    window.localStorage.removeItem(localInfoName);
    console.log(error, "error>>");
    loadingTips.value = ""
  }
  if(!task.taskId) {
    loadingTips.value = props.menuType == 0 ? "文生图中，请勿退出软件" : "视频生成中，请勿退出软件"
  } else {
    // console.log("localInfoName1",task, localInfoName, loadingTips.value)
  
    let needTime = task?.needTime?.extra_data?.model_list?.[task.model]?.[modelSpeed] || ""
    let time = ((Date.now() - +task.time) / 1000) || ""
  
    if(!needTime || !time) {
      loadingTips.value = "视频生成中，请勿退出软件"
    } else {
      loadingTips.value = `模型预计耗时${needTime}s，实际已耗时${time}s`
    }
  }
  // console.log("localInfoName2",task, localInfoName, loadingTips.value)
  timer = setTimeout(() => {
    if(props.loading) {
      refreshTips()
    } else {
      clearTimeout(timer)
      loadingTips.value = ""
    }
  }, 1000);
}
watch(() => props.loading, (val) => {
  // console.log("loading3", val)
  if(!val) {
    loadingTips.value = ""
  }
  nextTick(() => {
    refreshTips()
  })
})
onUnmounted(() => {
  if (timer) {
    clearTimeout(timer);
  }
})

import { Conf } from 'electron-conf/renderer'
const sourceList = ref([])
watch(() => props.mediaPath, async (val) => {
  const conf = new Conf()
  sourceList.value = await conf.get('videoGenerationSourceList') || []
  // console.log("sourceList", sourceList.value)
})
const sourceInfo = computed(() => {
  const fileName = window.electronAPI.pathBasename(props.mediaPath)
  const info = sourceList.value.find(item => item.fileName == fileName)
  return {
    ...info,
    fileName
  }
})
</script>

<style lang="scss" scoped>
.media{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  padding-bottom: 0;
  box-sizing: border-box;
  .empty{
    width: 142px;
    height: 142px;
    &-0 {background-image: url("@/assets/videoGeneration/img.png");}
    &-1, &-2 {background-image: url("@/assets/videoGeneration/video.png");}
  }
  .source-info{
    width: 100%;
    color: #999999;
    font-size: 14px;  
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
    .source-model{
      white-space: nowrap;
    }
  }
}
:deep(.el-progress-bar__innerText) {
  color: transparent;
}
</style>