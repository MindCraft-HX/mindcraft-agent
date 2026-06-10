<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="paramsItem.title.length>4?24:8" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem.isRequired===1">*</span>
      {{ paramsItem.title }}
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
      </el-popover>
    </el-col>
    <el-col :span="paramsItem.title.length>4?24:16" align="end">
      <el-select
        v-model="moduleValue"
        :placeholder="paramsItem.description"
      >
        <el-option
          v-for="item in [{label: '是', value: true}, {label: '否', value: false}]"
          :key="item.label"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
    </el-col>
  </el-row>
</template>

<script setup>
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
const props = defineProps(["paramsItem", "value"]);
const emit = defineEmits(["update:value"]);

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
.attr-content {
  width: 90%;
  margin: 0 auto;
  margin-bottom: 14px;
  .attr-name {
    font-weight: bold;
    font-size: 16px;
    color: #000000;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    word-break: keep-all;
  }
  .attr-name.el-col-24{
    margin-bottom:12px;
  }
  :deep(.el-select__wrapper) {
    // width: 222px;
    height: 35px;
    background: #ffffff;
    border-radius: 8px 8px 8px 8px;
    box-shadow: none;
    border: 1px solid #409eff;
  } 
   :deep(.el-select__wrapper.is-focused){
    box-shadow: none;
  }
}
</style>