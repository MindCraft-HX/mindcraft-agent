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
          <span v-else style="display:inline-block; width:0;"></span>
        </template>
        <template #default>
          <div>
            {{ paramsItem.description }}
          </div>
        </template>
      </el-popover>
      </el-col>
    <el-col :span="paramsItem.title.length>4?24:16" >
      <el-select
       class="select"
        v-model="moduleValue"
        :placeholder="paramsItem.description"
        v-if="paramsItem.dataRange?.length"
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
  <paramsCom :paramsItem="params" v-model="dupData" />
</template>

<script setup>
import { computed, ref, watch } from "vue";
import paramsCom from "./params.vue";
const props = defineProps(["paramsItem","value","data"]);
const emit = defineEmits(["update:value","update:data"]);
// 单选项不用传给后端
const moduleValue  = computed({
  get() {
    return props.value
  },
  set(val) {
    emit('update:value', val)
  }
})
const dupData = computed( {
  get() {
    return props.data
  },
  set(val) {
    emit('update:data', val);
  }
}); 
const params = ref([])

watch(()=>moduleValue.value,(val)=>{
  //  切换选中项所对应的表单
  const item = props.paramsItem.dataRange.find(item=>item.value === val)
  params.value = item
},{deep:true,immediate:true})

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