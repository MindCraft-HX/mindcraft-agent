<template>
  <attrList ref="attrListRef" v-model:modelList="vincentDiagramData" v-model:data="gatherVincentDiagram" type="textToImage"/>
  <div style="flex: 1"></div>
  <div
    style="text-align: center; margin-bottom: 22px"
    v-if="gatherVincentDiagram"
  >
    <el-button
      type="primary"
      style="width: 250px; height: 40px; font-size: 18px"
      @click="postGeneratePicture"
      :loading="loading"
    >
      <template v-if="!!loading">
        <span>生成中...</span>
      </template>
      <template v-else>
        <div class="start-icon"></div>
        <span>生成图片</span>
      </template>
      <el-text class="btn-price" v-if="!isNaN(activeModel.model_price / 0.8)"><div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ userType ? activeModel.model_price : (activeModel.model_price / 0.8)}} 积分</el-text>
      <el-text class="btn-price" v-else>{{ activeModel.model_price }} 积分</el-text>
    </el-button>
      <el-text class="tips-price" v-if="!isNaN(activeModel.model_price / 0.8)"><div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ !userType ? activeModel.model_price : (activeModel.model_price / 0.8)}} 积分</el-text>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";
import { ElMessage } from "element-plus";

import { userVipTypeStore } from '@/stores/vipType';
const VipTypeStore = userVipTypeStore();
const userType = computed(() => {
  const res = VipTypeStore.vip_level > 0
  return res
})

const props = defineProps(["loading", "mediaPath"]);
const emit = defineEmits(["update:loading", "update:mediaPath"]);

import attrList from "./attr/index.vue";
const attrListRef = ref(null)

const gatherVincentDiagram = ref(null);
const vincentDiagramData = ref([]);
import { getTtiList } from "@/api/application/VoiceDebuggingConsole";
const getVincentDiagramList = async () => {
  try {
    const res = await getTtiList();
    vincentDiagramData.value = res.data.data;
    if (!gatherVincentDiagram.value) {
      initVincentDiagram();
    }
  } catch (error) {
    console.log(error, "error");
  }
};
getVincentDiagramList();

const initVincentDiagram = (category) => {
  if (vincentDiagramData.value.length) {
    const firstCategory = vincentDiagramData.value[0];
    gatherVincentDiagram.value = {
      category: category || firstCategory.category,
      model: "",
      prompt: "",
    };
    nextTick(() => {
      attrListRef.value?.changeModel()
    }) 
  }
};

const activeModel = computed(() => {
  let model = {}
  if(!gatherVincentDiagram.value.model || !vincentDiagramData.value.length) return model
  vincentDiagramData.value.map((item) => {
    if(item?.extra_data?.model_list?.[gatherVincentDiagram.value.model]) {
      model = item?.extra_data?.model_list?.[gatherVincentDiagram.value.model]
      model.model = gatherVincentDiagram.value.model
    }
  })
  return model
})

import { postTti } from "@/api/application/VoiceDebuggingConsole";
import { useMitt } from "@/utils/mitt";
const mitt = useMitt();
import { Conf } from 'electron-conf/renderer'
const postGeneratePicture = async () => {
  if (!gatherVincentDiagram.value.model) {
    ElMessage.warning("请选择模型");
    return;
  }
  if (gatherVincentDiagram.value.prompt === "") {
    ElMessage.warning("请输入描述");
    return;
  }
  try {
    const sourceInfo = {
      category: gatherVincentDiagram.value.category,
      model: gatherVincentDiagram.value.model,
      runTime: new Date().getTime(),
      ...gatherVincentDiagram.value
    }
    emit("update:loading", true);
    const response = await postTti(gatherVincentDiagram.value);
    console.log(response, "response");
    if (response.status === 200) {
      const res = await window.electronAPI.addSourceByDownLoadLink(
        {
          fileUrl: response.data.data[0].file_url,
          model: sourceInfo.model,
        }
      );
      sourceInfo.fileName = res.fileName
      sourceInfo.shareLink = response.data.data[0].file_url;

      const conf = new Conf()
      let list = ((await conf.get("videoGenerationSourceList")) || []).filter(item => item);
      list.push(sourceInfo)
      list = list.map(item => {
        if((Date.now() - item.runTime) > (7  * 24 * 60 * 60 * 1000)) {
          item.shareLink = ""
        }
        return item
      })
      await conf.set('videoGenerationSourceList', list)
      console.log(list, "list");
      
      emit("update:loading", false);
      console.log(res, "res");
      emit("update:mediaPath", res.savePath);
      mitt.emit("updateSoureList");
      ElMessage.success("生成图片 成功");
    }
  } catch (error) {
    console.log(error, "error>>");
    ElMessage.error(error?.response?.data?.message || "生成图片 失败");
    emit("update:loading", false);
  }
};
</script>

<style lang="scss" scoped>
.start-icon {
  width: 22px;
  height: 22px;
  background-size: 100% 100%;
  background-image: url("@/assets/videoGeneration/start.png");
  margin-right: 5px;
}
.vip-icon{
  background-image: url("@/assets/VIP1.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: auto 100%;
  width: 26px;
  height: 10px;
}
.vip-icon-active{
  background-image: url("@/assets/VIP2.png");
}
.btn-price{
  display: flex;
  align-items: center;
  color: #fff;
  margin-left: 6px;
}
.tips-price {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  text-align: right;
  padding-right: 52px;
}
</style>