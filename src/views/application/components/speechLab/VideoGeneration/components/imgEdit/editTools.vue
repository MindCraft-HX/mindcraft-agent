<!-- 图片编辑工具栏 -->
<template>
  <div class="editor-tools-box" :class="loading ? 'disabled' : ''">
    <div class="editor-tools-item" v-for="(item, index) in toolsList" :key="item.value" @click="handleclick(item)"
      :class="imgEditStore.curEditorTool == item.value ? 'active' : ''">
      <el-tooltip
        :content="`点击取消`"
        placement="bottom"
        :disabled="imgEditStore.curEditorTool !== item.value"
      >
      <div>
        <span :class="`icon mindcraft-flow-win-iconfont icon-mindcraft-${item.icon}`"></span>
        <span>{{ item.name }}</span>
      </div>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import { useImgEditStore } from '@/stores/imgEdit.js'
const imgEditStore = useImgEditStore()
const emit = defineEmits(['update:tool'])
const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})
const toolsList = [
  {
    name: '消除',
    icon: 'xiaochu',
    value: 'erase'
  },
  {
    name: '抠图',
    icon: 'koutu',
    value: 'cut'
  },
  {
    name: '局部编辑',
    icon: 'jububianji',
    value: 'paint'
  },
  {
    name: '高清',
    icon: 'gaoqing',
    value: 'hd'
  }
]
const handleclick = (item) => {
  if (item.value === imgEditStore.curEditorTool) {
    imgEditStore.curEditorTool = ''
    
  } else {
    imgEditStore.curEditorTool = item.value
  }

  // 点击之后切换成笔画工具栏
  if (imgEditStore.curEditorTool == 'erase' || imgEditStore.curEditorTool == 'cut' || imgEditStore.curEditorTool == 'paint') {
    imgEditStore.showEditorTool = false
    imgEditStore.showDrawTool = true
    imgEditStore.curDrawTool = 'brush'
  }
}
</script>

<style lang="scss" scoped>
.editor-tools-box {
  width: 392px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: #171A21;
  border-radius: 8px 8px 8px 8px;
  color: #EBF8FF;
  margin: 4px 0;
  font-size: 14px;

  &.disabled {
    pointer-events: none;
  }

  .editor-tools-item {
    padding: 4px 16px;
    border-radius: 8px;
    cursor: pointer;

    &.active {
      background: #2A2F3B;
    }
  }


  .icon {
    font-size: 20px;
  }
}
</style>
