<template>
  <el-row class="attr-content" align="middle" >
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
<!-- 对于没有默认值并且不是必选项的选择框,控制开关清除选中值 -->
      <el-switch v-model="open"  style="position: absolute;right: 0px;" v-if="paramsItem.dataDefault==null&&paramsItem.isRequired!=1" />
      </el-col>
    <el-col :span="paramsItem.title.length>4?24:16" v-if="paramsItem.dataDefault!=null||paramsItem.isRequired==1||open">
      <!-- extraInSelect 可自定义输入 -->
      <el-select
       class="select"
        v-model="moduleValue"
        :placeholder="paramsItem.description"
        v-if="paramsItem.dataRange?.length"
        v-bind="paramsItem.extraInSelect?{'filterable':true,'allow-create':true,'default-first-option':true,'reserve-keyword':false}:''"
      >
        <el-option
          v-for="item in paramsItem.dataRange"
          :key="item.value"
          :label="item.name"
          :value="item.value"
        />
      </el-select>
    </el-col>
  </el-row>
</template>

<script setup>
import { computed, ref, watch } from "vue";
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
const open = ref(false)
watch(()=>open.value,()=>{
  if(!open.value){
    moduleValue.value = '';
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
  :deep(.select .el-select__wrapper) {
    // width: 222px;
    height: 35px;
    background: #ffffff;
    border-radius: 8px 8px 8px 8px;
    box-shadow: none;
    border: 1px solid #409eff;
  }
}
</style>