<template>
  <el-row class="attr-content" align="middle" >
    <el-col :span="24" class="attr-name">
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
    <el-col :span="24">
      <el-radio-group v-model="moduleValue" size="large" class="radio-group" >
        <el-radio-button           
            v-for="item in paramsItem.dataRange"
            :key="item.value"
            :label="item.name"
            :value="item.value"
            >
             <div v-if="item.icon" style="margin-bottom: 4px;"><span :class="`icon mindcraft-flow-win-iconfont icon-mindcraft-${item.icon}`"></span></div>
             <div>{{ item.name }}</div>
          </el-radio-button>
      </el-radio-group>
    </el-col>
  </el-row>
  <!--切换不同的tab 显示不同的参数项 -->
  <div
    style="width: 100%"
    v-for="(paramsList1, index) in childParamsList"
    :key="index"
  >
    <paramsCom :paramsItem="paramsList1"  v-model="dupData" />
  </div>
  
</template>

<script setup>
import { computed, ref, watch,onMounted } from "vue";
import paramsCom from "./params.vue";
//  value是tabs组件的值，data是整个表单数据
const props = defineProps(["paramsItem", "value",'data']);
const emit = defineEmits(["update:value",'update:data','change']);
const moduleValue = computed({
  get() {
    return props.value
  },
  set(val) {
    emit('update:value', val)
  }
});

const dupData = computed( {
  get() {
    return props.data
  },
  set(val) {
    emit('update:data', val);
  }
}); 

const childParamsList =ref([])
const initData = (val)=>{
  const newData = { ...dupData.value } // 创建新对象
  childParamsList.value.forEach(e=>{
    newData[e.paramName] = e.dataDefault
  })
  dupData.value = newData // 直接赋值触发setter
}

watch(()=>moduleValue.value,(val)=>{
  if(!val)return 
 // 清除旧的子项数据
 childParamsList.value.forEach(e=>{
  delete dupData.value[e.paramName]
  if(e.dataRange){
    e.dataRange.forEach(e1=>{
      if(e1.paramName){
        delete dupData.value[e1.paramName]
      }
    })
  }
 })
 // 获取tab下的paramsList
  childParamsList.value = props.paramsItem.dataRange.find(e=>e.value === val)?.params_list
// 初始化绑定值
  initData(val)
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
  :deep(.el-radio-group){
      justify-content: stretch;
      display: flex;
      gap: 2px;
      font-size: 12px;
  }
  :deep(.el-radio-button){
    flex: 1;
  }
  :deep(.el-radio-group .el-radio-button .el-radio-button__inner){
    width: 100%;
    border-radius: 6px;
    text-align: center;
  }
}

</style>
