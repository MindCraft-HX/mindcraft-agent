<template>
  <div class="mediaInfo">
    <div class="item" :class="[item.key == '提示词' ? 'item-column' : '']" v-for="item in attrInfo" :key="item">
      <div class="item-key">{{ item.key }}</div>
      <div class="item-value">{{ item.value }}</div>
    </div>
  </div>
  
</template>

<script setup>
import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
const props = defineProps(["mediaPath", "sourceList"])

const sourceInfo = computed(() => {
  const fileName = window.electronAPI.pathBasename(props.mediaPath)
  const info = props.sourceList.find(item => item.fileName == fileName)
  return {
    ...info,
    fileName
  }
})
const attr = {
  fileName: "名称",
  category: "品牌",
  model: "模型",
  prompt: "提示词",
  size: "图片尺寸",
  duration: "视频时长",
  fps: "视频帧率",
  with_audio: "开启AI音效",
  style: "视频风格",
  emotion: "情感氛围",
  camera_movement: "运镜方式",
}
const attrInfo = computed(() => {
  const keys = Object.keys(sourceInfo.value)
  return keys.reduce((acc, cur) => {
    if(attr[cur]){
      acc[cur == "prompt" ? 'unshift' : 'push']({ key: attr[cur], value: sourceInfo.value[cur] })
    }
    return acc
  }, [])
})
</script>

<style lang="scss" scoped>
.mediaInfo{
  display: flex;
  flex-direction: column;
  border-top: 1px solid #666;
  padding-top: 18px;
  .item{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    word-break: break-all;
    margin-bottom: 10px;
    &.item-column{
      flex-direction: column;
      align-items: flex-start;
      .item-value{
        text-align: left;
        margin-bottom: 10px;
      }
    }
    .item-key{
      font-size: 16px;
      color: #000;
      white-space: nowrap;
      margin-right: 50px;
      margin-bottom: 10px;
    }
    .item-value{
      font-size: 16px;
      color: #666;
      text-align: right;
    }
  }
}
</style>