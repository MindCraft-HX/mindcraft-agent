<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="paramsItem.title.length>4?24:8" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem.isRequired === 1">*</span>
      {{paramsItem.title }}
      <el-popover placement="bottom" :width="220" trigger="hover">
        <template #reference>
          <div
            style="
              width: 16px;
              height: 16px;
              color: #a9b5c0;
              display: inline-flex;
              margin: 0px 5px;
            "
            v-if="paramsItem.description"
          >
            <InfoFilled />
          </div>
        </template>
        <template #default>
          <div>
            {{ paramsItem.description }}
          </div>
        </template>
      </el-popover></el-col
    >
    <el-col :span="paramsItem.title.length>4?24:16" class="attr-value">
      <div class="slider-container">
        <el-slider v-model="moduleValue" :min="paramsItem.dataMin" :max="paramsItem.dataMax" :step="setStep"/>
      </div>
    </el-col>
  </el-row>
</template>

<script setup>
import { computed } from "vue";
const props = defineProps([
  "paramsItem",
  "model",
  "value",
  "type",
  "uploadedFile",
]);
const emit = defineEmits(["update:value"]);
const moduleValue = computed({
  get() {
    return props.value;
  },
  set(val) {
    emit("update:value", val);
  },
});

const setStep = computed(() => {
  if (props.paramsItem.dataType == 'float') {
    return 0.1;
  } else {
    return 1;
  }
});
</script>

<style lang="scss" scoped>
.attr-content {
  width: 90%;
  margin: 0 auto;
  margin-bottom: 12px;
  display: flex;
  gap: 2px;

  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    display: flex;
    align-items: center;
    word-break: keep-all;
    justify-content: flex-start;
  }
  .attr-name.el-col-24{
    margin-bottom:12px;
  }

  .slider-container {
    width: 100%;
    display: flex;
    gap: 10px;

    :deep(.el-slider .el-slider__runway) {
      background-color: #f5f7fa;
      height: 11px;
    }

    :deep(.el-slider .el-slider__bar) {
      height: 11px;
    }

    :deep(.el-slider__button-wrapper) {
      top: -12px;
    }

    :deep(.el-slider .el-slider__button) {
      border-radius: 2px;
      background-color: #409eff;
      width: 2px;
      height: 16px;
    }
  }
}
</style>