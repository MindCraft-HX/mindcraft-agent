<template>
  <el-row class="attr-content" align="top">
    <el-col :span="24" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem?.isRequired===1">*</span>{{paramsItem.title}}</el-col>
    <el-col :span="24" align="end">
      <textarea
        class="debugging-bench-textarea"
        :placeholder="paramsItem.description"
        v-model="moduleValue"
      ></textarea>
    </el-col>
  </el-row>
</template>

<script setup>
import { ref, computed } from 'vue'
const props = defineProps(['paramsItem', 'model', 'value', 'type', 'uploadedFile'])
const emit = defineEmits(['update:value'])

const moduleValue = computed({
  get() {
    return props.value
  },
  set(val) {
    emit('update:value', val)
  }
})


</script>

<style lang="scss" scoped>
.attr-content{
  width: 90%;
  margin: 0 auto;
  margin-bottom: 28px;
  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    margin-bottom: 12px;
  }
  .debugging-bench-textarea {
    width: 98%;
    height: 26vh;
    font-size: 16px;
    resize: none;
    border: 2px solid #1e52c5;
    border-radius: 10px;
    padding: 4px;
    transition: all 0.3s, height 0s;
  
    max-width: 100%;
    min-height: 32px;
    line-height: 1.5714285714285714;
    vertical-align: bottom;
    margin-bottom: 8px;
  }
  .icon-ai{
    width: 17px;
    height: 17px;
    background-size: 100% 100%;
    background-image: url("@/assets/videoGeneration/ai.png");
  }
}
</style>