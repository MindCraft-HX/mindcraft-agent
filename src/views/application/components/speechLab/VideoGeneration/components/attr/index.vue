<template>
  <div
    style="width: 100%"
    v-for="(paramsItem, index) in vincentDiagramParamList"
    :key="index"
  >
    <paramsCom :paramsItem="paramsItem" :modelList="modelList" v-model="gatherVincentDiagram" @chang-model="changeModel" @change-upload="changeUpload"/>
  </div>
</template>

<script setup>
import { computed} from "vue";
import paramsCom from "./params.vue";

const props = defineProps(['modelList', 'data', 'type'])
const emit = defineEmits(['update:data','change-upload'])
const gatherVincentDiagram = computed({
  get() {
    return props.data;
  },
  set(val) {
    emit('update:data', val)
  }
});
const vincentDiagramParamList = computed(() => {
  const vincentDiagram = props.modelList.find((item) => {
      const modelParam  =   item.params_list.find(p=>p.paramName==='model')
     return  modelParam.dataRange.some(d=>d.value=== gatherVincentDiagram.value?.model)
  })
  return vincentDiagram?.params_list || [];
})
const changeModel = (val) => {
  if(!val)return 
  const newModelConfig = props.modelList.find(item => {
    const modelParam = item.params_list.find(p => p.paramName === 'model')
    return modelParam && modelParam.dataRange.some(d => d.value === val)
  })
  if (!newModelConfig) {
    console.error(`No config found for model: ${val}`)
    return
  }
   // 2. 创建新的表单数据，只保留新模型需要的属性
   const params = {
    model: val,
    category: newModelConfig.category
  }
    const res  =  newModelConfig.params_list.reduce((pre,cur)=>{
      if(cur.paramName === 'model'){
        return pre
      }
      if (cur.hasOwnProperty("dataDefault")) {
      pre[cur.paramName] = cur.dataDefault ;
    } else {
      if(cur.dataType == 'str') {
        pre[cur.paramName] =  ''
      } else if(cur.dataType == 'bool') {
        pre[cur.paramName] = false
      } else if(cur.dataType == 'int') {
        pre[cur.paramName] =  0
      } else {
        pre[cur.paramName] =   null
      }
    }
    return pre
    },params)
    emit('update:data',res)
}
const changeUpload = (paramName)=>{
  emit('change-upload',paramName)
}

defineExpose({changeModel})
</script>

<style lang="scss" scoped>

</style>