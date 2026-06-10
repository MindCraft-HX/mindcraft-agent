<template>
  <div class="setting">
    <el-menu ref="setMenu" default-active="0" class="float-setting-el-menu-content" mode="horizontal" menu-trigger="hover" :unique-opened="true" :close-on-click-outside="true" :ellipsis="false" size="small"  @select="openMenu"
        @open="openMenu" @close="closeMenu">
        <el-sub-menu index="1">
          <template #title>
            <div :class="[pageType == 1 ? 'in-message-content' : '']" class="setting-btn mindcraft-flow-win-iconfont icon-mindcraft-shezhi"></div>
          </template>
          <el-sub-menu index="1-1" style="max-height: 200px;">
            <template #title><div style="color: #409EFF;margin-right: 12px;margin-left: 6px;font-size: 22px;" class="mindcraft-flow-win-iconfont icon-mindcraft-moxingxuanze"></div>模型</template>
            <el-scrollbar max-height="80vh" max-width="40vw">
              <el-sub-menu popper-class="model-list" :index="`1-2-${index}`" v-for="model, index in modelList" :key="index" :teleported="true">
                <template #title><el-image style="width: 22px; height: 22px; display: flex;margin-right: 12px;" fit="contain" :src="model.image_url"></el-image>{{ model.model_brand }}</template>
                <el-scrollbar max-height="80vh" max-width="40vw">
                  <el-menu-item :style="{
                    'background-color': realModel == list.model_name ? '#f0f1f5' : '',
                    'wordBreak': 'break-all',
                    'height': 'fit-content',
                  }" :index="`1-2-${index}-${idx}`" v-for="list, idx in model.model_list" :key="idx" @click="changeModel(model, list)">
                      <div style="display: flex;align-items: center;">
                        <!-- <el-image style="width: 42px; height: 22px; display: flex;margin-right: 12px;" fit="contain" :src="img" v-for="img, in list.model_tag_images" :key="img"></el-image> -->
                        <el-image style="width: 42px; height: 22px; display: flex;margin-right: 12px;" fit="contain" :src="item" v-for="item, index in list.model_tag_images" :key="index"></el-image>
                        {{ list.model_name }}
                        <!-- <el-tooltip :content="list.model_name">{{ list.model_name }}</el-tooltip> -->
                      </div>
                  </el-menu-item>
                </el-scrollbar>
              </el-sub-menu>
            </el-scrollbar>
          </el-sub-menu>
          <el-sub-menu index="1-2" v-if="pageType != 1">
            <template #title><div style="margin-right: 12px;margin-left: 6px;font-size: 22px;" class="mindcraft-flow-win-iconfont icon-mindcraft-jinyong"></div>禁用</template>
            <el-menu-item index="1-2-1" @click="disableInAll"><el-icon><CircleClose /></el-icon>全局禁用</el-menu-item>
          </el-sub-menu>
        </el-sub-menu>
      </el-menu>
  </div>
</template>

<script setup>
import { Setting } from '@element-plus/icons-vue'
import { computed, ref, watch } from 'vue';
const props = defineProps(['pageType', 'llmModel', 'picLlmModel', 'modelInfo', 'fromClient'])
const emit = defineEmits(['refreshWinSize', 'update:llmModel', 'update:picLlmModel', 'update:modelInfo'])
const refreshWinSize = (width, height) => {
  emit('refreshWinSize', width, height)
}
const setMenu = ref(null)
const openMenu = (index) => {
  if(index == 1) {
    getModelList()
    refreshWinSize(465, 300)
  }
}

const closeMenu = (index) => {
  if(index == 1) {
    refreshWinSize(465, 300)
  }
}
import { getModel_list_new } from "@/api/mainActivity/chat";
const modelList = ref([])
const realModel = computed(() => props.pageType == 2 ? props.picLlmModel : props.llmModel)
const getModelList = async () => {
  const res = await getModel_list_new()
  modelList.value = res.data.map(item => {
    if(props.pageType == 0 || props.pageType == 1) {
      item.model_list = item.model_list.filter(model => !model?.model_config?.model_features?.image_generation)
    } else if(props.pageType == 2) {
      item.model_list = item.model_list.filter(model => model?.model_config?.model_features?.image_recognition)
    }
    return item
  }).filter(item => item.model_list.length > 0)
  // console.log(realModel.value, modelList.value.every(item => item.model_list.every(model => model.model_name != realModel.value)))
  if(!realModel.value || modelList.value.every(item => item.model_list.every(model => model.model_name != realModel.value))) {
    const conf = new Conf()
    const modelName = await conf.get(props.pageType == 2 ? "picDeafultModel" : "publicDefaultModel") || ""
    const modelInfo = modelList.value.find(item => item.model_list.some(model => model.model_name == modelName))
    if(modelInfo) {
      emit(props.pageType == 2 ? 'update:picLlmModel' : 'update:llmModel', modelName)
      emit('update:modelInfo', modelInfo)
    } else {
      emit(props.pageType == 2 ? 'update:picLlmModel' : 'update:llmModel', modelList.value[0]?.model_list[0]?.model_name)
      emit('update:modelInfo', modelList.value[0])
    }
  }
}
defineExpose({getModelList})
const changeModel = (model, list) => {
  emit(props.pageType == 2 ? 'update:picLlmModel' : 'update:llmModel', list.model_name)
  emit('update:modelInfo', model)
  refreshWinSize(465, 300)
}
import { Conf } from 'electron-conf/renderer'
const disableInAll = async () => {
  window.electronAPI.setFloatInfo({canOpenFloatWin: false})
  // 将应用内配置写入全局配置
  const conf = new Conf()
  await conf.set('canOpenFloatWin', false)  
}
</script>

<style scoped>
.el-menu {
  width: 24px;
  height: 24px;
  border: none;
  --el-menu-base-level-padding: 0px;
  --el-menu-bg-color: transparent;
  margin-left: 12px;
}
.setting-btn{
  width: 22px;
  height: 22px;
  color: #fff;
  font-size: 22px;
  line-height: 22px;
}
.in-message-content{
  color: #409EFF;
  font-size: 24px;
  line-height: 24px;
}
.el-sub-menu{
  width: 100%;
}
:deep(.choose-model){
  box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
}
:deep(.float-setting-el-menu-content .el-sub-menu__icon-arrow){
  display: none;
}
:deep(.float-setting-el-menu-content .el-sub-menu__title){
  border: none;
  border-bottom: none !important;;
}
:deep(.float-setting-more-btn .el-icon){
  font-size: 14px;
  margin: 0;
}
:deep(.el-popper .el-menu--horizontal.el-menu--popup-container) {
  max-height: 80vh;
  /* overflow-y: auto; */
  overflow-x: visible;
  border-radius: 9px 9px 9px 9px;
  box-shadow: 0px 3px 6px 1px rgba(0, 0, 0, 0.16);
}
</style>
<style >
.el-popper.model-list, .el-popper.model-list .el-menu--popup {
  max-width: 45vw;
  min-width: 0;
  /* overflow: auto; */
}

</style>