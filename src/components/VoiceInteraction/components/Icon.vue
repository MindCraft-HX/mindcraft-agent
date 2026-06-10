<!--  -->
<template>

  <el-tooltip :content="tip" placement="bottom" effect="light">
    <span class="mindcraft-flow-win-iconfont"
      :class="[`icon-mindcraft-${name}`, active ? 'active-icon' : 'inactive-icon']"
      :style="{ '--size': size, '--active-color': activeColor, '--inactive-color': inActiveColor, '--active-bg-color': activeBgColor }"
      @click.stop="handleClick"></span>
  </el-tooltip>

</template>

<script setup>
import { ref } from "vue"
const emits = defineEmits(["click"])
const props = defineProps({
  name: {
    //  icon名称
    type: String,
    required: true,
    default: 'delete'
  },
  size: {
    //  icon大小
    type: String,
    required: false,
    default: '23px'
  },
  activeColor: {
    //  选中icon颜色
    type: String,
    required: false,
    default: '#409eff'
  },
  inActiveColor: {
    //  不选中icon颜色
    type: String,
    required: false,
    default: '#fff'
  },
  activeBgColor: {
    //  不选中icon背景颜色
    type: String,
    required: false,
    default: '#fff'
  },
  active: {
    type: Boolean,
    required: false,
    default: false
  },
  tip: {
    type: String,
    default: '提示'
  }
});
const handleClick = () => {

  emits('click')
};
</script>

<style lang="scss" scoped>
.mindcraft-flow-win-iconfont {
  padding: 6px;
  font-size: var(--size);
  cursor: pointer;
  margin: 6px;
}

.active-icon {
  color: var(--active-color);
  background-color: var(--active-bg-color);
  border-radius: 8px;
}

.inactive-icon {
  color: var(--inactive-color);
  background-color: var(--inactive-bg-color);
}
</style>
