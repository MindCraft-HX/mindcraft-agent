<!-- 自由绘画工具 -->
<template>
  <div class="draw-utils-box" :class="imgEditStore.disabledDrawTool ? 'disabled' : ''">
    <!-- 笔画、快速选中、橡皮擦 -->
    <div v-for="util in utils" :key="util.value" class="draw-utils-item"
      :class="{ active: imgEditStore.curDrawTool == util.value }" @click="handclickUtil(util.value)">
      <el-tooltip :content="util.name" effect="light" placement="bottom" :show-arrow="false">
        <span :class="`icon mindcraft-flow-win-iconfont icon-mindcraft-${util.icon}`"></span>
      </el-tooltip>
    </div>
    <div class="line"></div>
    <!-- 笔画大小 -->
    <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-huabixi"></span>
    <div class="brush-slider">
      <el-slider :min="min" :max="max" v-model="imgEditStore.curDrawSize" />
      <div v-if="showTooltip" class="brush-slider__tooltip" :style="style">
        <div class="brush-visual" :style="visualBrush"></div>
      </div>
    </div>
    <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-huabicu"></span>
    <div class="line"></div>
    <!-- 关闭 -->
    <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-guanbi" @click="handleClose"></span>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { useImgEditStore } from '@/stores/imgEdit.js'
const imgEditStore = useImgEditStore()
const emit = defineEmits(['close', 'change', 'update:size', 'update:tool'])
const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})
const showTooltip = ref(false) // 显示笔画圈大小
const TooltipTimer = ref(null)
const utils = [
  {
    name: '画笔',
    icon: 'huabi1',
    value: "brush"
  },
  {
    name: '快速选中',
    icon: 'kuaisuxuanze',
    value: "select"
  },
  {
    name: '橡皮擦',
    icon: 'xiangpica',
    value: "eraser"
  },
]
const min = ref(6)
const max = ref(80)

//  随着slider移动时，计算出slider的位置
const style = computed(() => {
  const length = max.value - min.value,
    progress = imgEditStore.curDrawSize - min.value,
    left = (progress / length) * 100;
  return {
    marginLeft: `${left}%`,
  };
});
// 计算出画笔大小
const visualBrush = computed(() => {
  return {
    width: `${imgEditStore.curDrawSize}px`,
    height: `${imgEditStore.curDrawSize}px`,
  };
});
watch(() => imgEditStore.curDrawSize, (newValue, oldValue) => {
  showTooltip.value = true
  if (TooltipTimer.value !== null) {
    clearTimeout(TooltipTimer.value)
  }
  TooltipTimer.value = setTimeout(() => {
    showTooltip.value = false
  }, 1000)
})


const handclickUtil = (value) => {
  imgEditStore.curDrawTool = value
}
const handleClose = () => {
  imgEditStore.showDrawTool = false
  imgEditStore.showEditorTool = true
  imgEditStore.curDrawTool = ''
  imgEditStore.curEditorTool = ''
}
</script>
<style lang="scss" scoped>
.draw-utils-box {
  width: 392px;
  height: 36px;
  background: #171A21;
  border-radius: 8px 8px 8px 8px;
  display: flex;
  align-items: center;
  margin: 4px 0;

  &.disabled {
    cursor: not-allowed;

    *{
      pointer-events: none;
    }
  }

  .icon {
    color: #EBF8FF;
    font-size: 20px;
  }

  .draw-utils-item {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    margin: 0 6px;
    cursor: pointer;

    .icon {
      margin: 6px;
    }

    &.active {
      background: #2A2F3B;
    }
  }

  .line {
    width: 1px;
    height: 20px;
    background: #2A2F3B;
    margin: 0 10px;
  }

  .brush-slider {
    width: 118px;
    margin: 0px 8px;
    position: relative;
    left: 0;
  }

  .brush-slider__tooltip {
    position: absolute;
    height: 100px;
    width: 100px;
    background-color: #171A21;
    border-radius: 8px;
    transform: translateX(-50%);
    top: 50px;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;

    .brush-visual {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: radial-gradient(#22252E, #EBF8FF);
    }
  }


  :deep(.brush-slider .el-slider__bar) {

    background-color: #EBF8FF;
    height: 9px;
  }

  :deep(.brush-slider .el-slider__runway) {
    height: 9px;
    background-color: #22252E;
  }

  :deep(.brush-slider .el-slider__button-wrapper) {
    top: -13px;
  }

  :deep(.brush-slider .el-slider__button) {
    width: 3px;
    height: 11px;
    background: #EBF8FF;
    border-radius: 1px 1px 1px 1px;
    border: initial;
  }

  .icon-mindcraft-huabicu {
    margin-right: 10px;
  }

  .icon-mindcraft-guanbi {
    cursor: pointer;
  }
}
</style>