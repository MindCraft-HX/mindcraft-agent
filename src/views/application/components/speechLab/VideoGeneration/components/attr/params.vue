<template>
  <div class="">
    <model
      :list="modelList"
      :paramsItem="paramsItem"
      v-model:category="data.category"
      v-model:value="data.model"
      @change="changeModel"
      v-if="paramsItem.paramName == 'model'"
    ></model>
    <prompt
      :key="`prompt-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      :model="data.model"
      v-model:value="data.prompt"
      :uploadedFile="data.file"
      :type="props.type"
      v-else-if="paramsItem.paramName == 'prompt'"
    ></prompt>
    <inputNumber 
      :key="`inputnumber-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      :min="paramsItem.dataMin"
      :max="paramsItem.dataMax"
      v-else-if="paramsItem.htmlType == 'input'&& paramsItem.dataType == 'int'"/>
    <inputCom
      :key="`input-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'input'"/>
    <selectCom
      :key="`select-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'select'"/>
    <switchCom
      :key="`switch-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'switch'"/>
    <uploadVideoCom
      :key="`video-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'upload'&&paramsItem.dataType=='video'"/>
    <uploadAudioCom
      :key="`audio-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'upload'&&paramsItem.dataType=='audio'"/>
    <uploadCom
      :key="`upload-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      @change="(payload)=>changeUpload({...payload,param:paramsItem.paramName})"
      v-else-if="paramsItem.htmlType == 'upload'"/>
    <sliderCom
      :key="`slider-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'slider'"/>
    <tabsCom
      :key="`tabs-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:value="data[paramsItem.paramName]"
      v-model:data="data"
      v-else-if="paramsItem.htmlType == 'tabs'"
      />
    <arrayCom
      :key="`array-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:data="data"
      v-else-if="paramsItem.htmlType == 'array'"
    />
    <radioGroupCom
      :key="`radio-group-${paramsItem.paramName}-${data.model||''}`"
      :paramsItem="paramsItem"
      v-model:data="data"
      v-model:value="data[paramsItem.paramName]"
      v-else-if="paramsItem.htmlType == 'radio-group'"
    />
  </div>
</template>

<script setup>
import {computed} from "vue"
import model from "./model.vue";
import prompt from "./prompt.vue";
import inputCom from "./input.vue";
import selectCom from "./select.vue";
import switchCom from "./switch.vue";
import uploadCom from "./upload.vue";
import uploadVideoCom from './uploadVideo.vue'
import uploadAudioCom from './uploadAudio.vue'
import sliderCom from "./slider.vue";
import inputNumber from "./inputNumber.vue"
import tabsCom from './tabs.vue'
import arrayCom from './array.vue'
import radioGroupCom from './radioGroup.vue'


const props = defineProps({
  paramsItem:{
    type:Object,
    default:()=>({})
  },
  modelValue:{
    type:Object,
    default:()=>({})
  },
  modelList:{
    type:Array,
    default:()=>[]
  }
})
const emit = defineEmits(['update:modelValue','chang-model', 'changeUpload','change-tabs'])
const data = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    return emit('update:modelValue',val)
  }
})
const changeModel = (val)=>{
  emit('chang-model',val)
}
const changeUpload = (val)=>{
  emit('change-upload',val)
}

</script>

<style lang="scss" scoped></style>
