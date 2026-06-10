<template>
  <el-row class="attr-content" align="middle">
    <el-col :span="24" class="attr-name">
      <span style="color:#f56c6c;" v-if="paramsItem.isRequired === 1">*</span>
      {{ paramsItem.title }}
      <el-popover placement="bottom" :width="220" trigger="hover">
        <template #reference>
          <div style="
              width: 16px;
              height: 16px;
              color: #a9b5c0;
              display: inline-flex;
              margin: 0px 5px;
            " v-if="paramsItem.description">
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
      <el-button type="primary" style="margin-left: auto;" @click="onAdd">
        <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-tianjia1" style="margin:0 4px"></span>
        添加
      </el-button>
    </el-col>
    <el-col :span="24">
      <div v-for="(dataItem, index) in ArrayData" :key="index" class="array-group">
        <div class="array-params-group">
          <div v-for="(paramsList1, index1) in childParamsList" :key="index1">
            <paramsCom :paramsItem="paramsList1" v-model="ArrayData[index]" />
          </div>
        </div>
        <el-button type="danger" plain class="delete-button" @click="onDelete(index)">
          <span class="icon mindcraft-flow-win-iconfont icon-mindcraft-shanchu1"></span>
        </el-button>
      </div>
    </el-col>
  </el-row>
</template>

<script setup>
import { computed, ref, watch, onMounted } from "vue";
import paramsCom from "./params.vue";
import { ElMessage } from "element-plus";
const props = defineProps(["paramsItem", 'data']);
const emit = defineEmits(["update:value", "update:data"]);

const childParamsList = computed(() => {
  return props.paramsItem.iter_list
})
let MinLen = computed(() => props.paramsItem.dataMin || 0)
let MaxLen = computed(() => props.paramsItem.dataMax || 0)
const ArrayData = ref([])
// 初始化每个属性的值
const getDefaultItem = () => {
  let res = {};
  childParamsList.value.forEach(item => {
    res[item.paramName] = item.dataDefault ? item.dataDefault : '';
  });
  return JSON.parse(JSON.stringify(res)); // 深度拷贝
};
watch(() => MinLen.value, () => {
  // props.paramsItem已改变，清除ArrayData.value
  ArrayData.value = []
  //  初始化最小数量的数组项
  for (let i = 0; i < MinLen.value; i++) {
    ArrayData.value.push(getDefaultItem())
  }
}, { deep: true, immediate: true })
const onAdd = () => {
  if (ArrayData.value.length < MaxLen.value) {
    ArrayData.value.push(getDefaultItem())
  } else {
    ElMessage.warning(`最多添加${MaxLen.value}组！`);
  }
}
const onDelete = (index) => {
  if (ArrayData.value.length > MinLen.value) {
    ArrayData.value.splice(index, 1)
  } else {
    ElMessage.warning(`至少需要${MinLen.value}组！`);
  }
}
const cloneData = (obj) => {
  if (obj instanceof File || obj instanceof Blob) return obj;
  if (Array.isArray(obj)) return obj.map(cloneData);
  if (obj && typeof obj === 'object') {
    const res = {};
    for (const key in obj) {
      res[key] = cloneData(obj[key]);
    }
    return res;
  }
  return obj;
};

watch(() => ArrayData.value, () => {
  const mergedData = cloneData(props.data);
  const objectKey = Object.keys(getDefaultItem());
  for (let i = 0; i < objectKey.length; i++) {
    let key = objectKey[i];
    let value = ArrayData.value.map(e => e[key]);
    mergedData[key] = value;
  }
  emit('update:data', mergedData);
}, { deep: true, immediate: true })




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

  .attr-name.el-col-24 {
    margin-bottom: 12px;
  }

  .array-group {
    width: calc(100% + 20px);
    position: relative;
    left: -10px;
    background-color: #EFF3FC;
    border-radius: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 6px;
    padding: 12px 0;
    position: relative;

    .array-params-group {
      flex: 1;
    }

    .delete-button {
      position: absolute;
      right: 6px;
      top: 6px;
      padding: 0px 8px;
      --el-button-text-color: #d81e06;
      --el-button-bg-color: #ffded9;
      --el-button-border-color: transparent;

      .icon-mindcraft-shanchu1 {
        font-size: 14px;
      }
    }

  }
}
</style>