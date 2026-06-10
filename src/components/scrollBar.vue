<!-- 无限滚动加载 -->
<template>
  <div class="infinite-scroll">
    <el-scrollbar ref="scrollbarRef" @scroll="onScroll">
      <slot></slot>
    </el-scrollbar>
  </div>
</template>
 
<script lang="ts" setup>
import { reactive, ref, onMounted, onBeforeUnmount, watch, defineComponent, nextTick, defineEmits } from 'vue'
 
const emits = defineEmits(["loadData"])
const props = defineProps({
  loading: {
    type: Boolean
  },
  pageNum: { // 判断是否是第一页，如果是第一页则scroll重置到顶部
  }
})
 
const scrollbarRef = ref()
const state = reactive({
  loading: false,
  _scrollTop: 0, // 记录数据加载前滚动条的位置，用来手动定位scrollbar
})
 
 
watch(() => props.pageNum, () => {
  if (props.pageNum == 1) {
    state._scrollTop = 0
    scrollbarRef.value.setScrollTop(state._scrollTop)
  }
})
 
watch(() => props.loading, () => {
  scrollbarRef.value.setScrollTop(state._scrollTop)
  nextTick(() => {
    state.loading = props.loading
  })
})
 
const onScroll = (options: any) => {
  if (state.loading === true) {
    return
  }
  console.log(123, options, scrollbarRef.value.wrapRef.scrollHeight)
  let wrapRef = scrollbarRef.value.wrapRef
  scrollbarRef.value.moveY = wrapRef.scrollTop * 100 / wrapRef.clientHeight
  scrollbarRef.value.moveX = wrapRef.scrollLeft * 100 / wrapRef.clientWidth
  let poor = wrapRef.scrollHeight - wrapRef.clientHeight
  // 判断滚动到底部
  if (options.scrollTop + 2 >= poor) {
    state._scrollTop = options.scrollTop
    emits("loadData", true)
  }
}
 
</script>
 
<style lang="scss" scoped>
.infinite-scroll {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}
</style>