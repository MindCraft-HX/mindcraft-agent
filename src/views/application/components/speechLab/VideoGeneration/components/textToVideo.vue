<template>
  <attrList ref="attrListRef" v-model:modelList="vincentDiagramData" v-model:data="gatherVincentDiagram" type="textToVideo"/>
  <div style="flex: 1"></div>
  <div
    style="text-align: center; margin-bottom: 22px"
    v-if="gatherVincentDiagram"
  >
    <div class="btn-wrap">
    <el-button
      type="primary"
      style="width: 250px; height: 40px; font-size: 18px"
      @click="postGeneratePicture"
      :loading="!!loading"
    >
      <template v-if="!!loading">
        <span>生成中...</span>
      </template>
      <template v-else>
        <div class="start-icon"></div>
        <span>生成视频</span>
      </template>
      <el-text class="btn-price" v-if="!isNaN(activeModel.model_price / 0.8)"><div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ userType ? activeModel.model_price : (activeModel.model_price / 0.8)}} 积分</el-text>
      <el-text class="btn-price" v-else-if="activeModel.model == 'Seedweed'"><div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ seedweedPrice[userType ? 'vipPrcie' : 'price'] }} 积分</el-text>
      <el-text class="btn-price" v-else>{{ activeModel.model_price }} 积分</el-text>
    </el-button>
    <el-button
      v-if="!!loading"
      type="danger"
      plain
      style="width: 250px;height: 40px; font-size: 18px;margin:10px 0"
      :loading="isCancelling"
      :disabled="isCancelling"
      @click="handleCancelGenerate"
    >
      取消生成
    </el-button>
    </div>
      <el-text class="tips-price" v-if="!isNaN(activeModel.model_price / 0.8)"><div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ !userType ? activeModel.model_price : (activeModel.model_price / 0.8)}} 积分</el-text>
      <el-text class="tips-price" v-else-if="activeModel.model == 'Seedweed'"><div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ seedweedPrice[!userType ? 'vipPrcie' : 'price'] }} 积分</el-text>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, onUnmounted } from "vue";
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
import { getTtvList } from "@/api/application/VoiceDebuggingConsole";
const getVincentDiagramList = async () => {
  try {
    const res = await getTtvList();
    vincentDiagramData.value = res.data.data.filter((item) =>
      item.category.includes("ttv")
    );
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

const seedweedPrice = computed(() => {
  let price = "--"
  let vipPrcie = "--"
  if(activeModel.value.model != "Seedweed") return {price, vipPrcie}

  const width = +(gatherVincentDiagram.value?.size?.split("x")?.[0] || 0)
  const height = +(gatherVincentDiagram.value?.size?.split("x")?.[1] || 0)
  const token_points = 0.03
  const fps = 24
  const duration = gatherVincentDiagram.value['duration']
  const to_token = Math.ceil((width * height * fps * duration) / 1024)
  vipPrcie = Math.ceil(to_token * token_points)
  price = Math.ceil(vipPrcie / 0.8)

  return {
    price,
    vipPrcie
  }
})

import { postTtv, cancelTtvTask } from "@/api/application/VoiceDebuggingConsole";
import api from "@/utils/request";
import { useMitt } from "@/utils/mitt";
const mitt = useMitt();
import { isString, isNumber } from "@/utils/common"
const currentTaskId = ref("");
const isCancelling = ref(false);
const stopPolling = ref(false);

const clearTaskState = () => {
  clearTimeout(videoTimer.value);
  stopPolling.value = true;
  currentTaskId.value = "";
  window.localStorage.removeItem("text_to_video_task");
};

const handleCancelGenerate = async () => {
  if (!currentTaskId.value || isCancelling.value) return;
  try {
    isCancelling.value = true;
    await cancelTtvTask(currentTaskId.value);
    ElMessage.success("已取消生成");
  } catch (error) {
    ElMessage.warning(error?.response?.data?.message || "取消失败");
  } finally {
    clearTaskState();
    emit("update:loading", false);
    isCancelling.value = false;
  }
};

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
    emit("update:loading", true);
    const res = await postTtv(gatherVincentDiagram.value);
    console.log(res, "res", gatherVincentDiagram);
    if (res.status === 200) {
      const task_id = res.data.data.task_id;
      currentTaskId.value = task_id;
      stopPolling.value = false;
      const params = Object.keys(gatherVincentDiagram.value).reduce((p,c) => {
        if(isNumber(gatherVincentDiagram.value[c]) || isString(gatherVincentDiagram.value[c])){
          p[c] = gatherVincentDiagram.value[c]
        }
        return p
      }, {})
      const task = {
        taskId: task_id,
        category: gatherVincentDiagram.value.category,
        model: gatherVincentDiagram.value.model,
        time: Date.now(),
        needTime: vincentDiagramData.value.find((item) => gatherVincentDiagram.value.category == item.category),
        gatherVincentDiagram: params,
      };
      window.localStorage.setItem("text_to_video_task", JSON.stringify(task));
      await pollVideoUrl(task);
    }
  } catch (error) {
    console.log(error, "error>>");
    ElMessage.error(error?.response?.data?.message || "文生视频 失败");
    emit("update:loading", false);
  }
};

import { Conf } from "electron-conf/renderer";
let videoTimer = ref(null);
const pollVideoUrl = async (task) => {
  if (stopPolling.value) return;
  const taskInfo = task;
  const sourceInfo = {
    category: taskInfo.category,
    model: taskInfo.model,
    runTime: taskInfo.time,
    ...taskInfo.gatherVincentDiagram,
  };
  console.log(taskInfo, "taskInfo");
  try {
    emit("update:loading", true);
    const response = await api.get(`/v1/ttv/task/${taskInfo.taskId}`);
    const taskStatus = response?.data?.data?.task_status;
    console.log(response, "response");
    if (response.data.status !== 200) {
      emit("update:loading", false);
      clearTaskState();
      return;
    }
    if (taskStatus === "cancelled") {
      clearTaskState();
      emit("update:loading", false);
      ElMessage.warning("任务已取消");
      return;
    }
    if (taskStatus === "failed") {
      clearTaskState();
      emit("update:loading", false);
      ElMessage.warning(response?.data?.message || "生成失败");
      return;
    }
    if (!!response.data.data.video_result) {
      console.log(
        response.data.data.video_result,
        "response.data.data.video_result"
      );
      const res = await window.electronAPI.addSourceByDownLoadLink(
        {
          fileUrl: response.data.data.video_result[0].video_url,
          model: sourceInfo.model,
        }
      );
      console.log(res, "res");
      sourceInfo.fileName = res.fileName;
      sourceInfo.shareLink = response.data.data.video_result[0].video_url;

      const conf = new Conf();
      let list = ((await conf.get("videoGenerationSourceList")) || []).filter(item => item);
      list.push(sourceInfo);
      list = list.map(item => {
        if((Date.now() - item.runTime) > (7  * 24 * 60 * 60 * 1000)) {
          item.shareLink = ""
        }
        return item
      })
      await conf.set("videoGenerationSourceList", list);
      console.log(list, "list");

      emit("update:mediaPath", res.savePath);
      clearTaskState();
      mitt.emit("updateSoureList");
      emit("update:loading", false);
      ElMessage.success("生成视频 完成");
    } else {
      // 如果音频文件还未生成,继续轮询
      videoTimer.value = setTimeout(() => {
        if (stopPolling.value) return;
        console.log("轮询中");
        pollVideoUrl(taskInfo);
      }, 40000);
    }
  } catch (error) {
    console.log(error, "error>>");
    ElMessage.warning(error?.response?.data?.message || "异常");
    emit("update:loading", false);
    clearTaskState();
    // 服务端说400表示是后面不会再生成结果了，所以清除任务
    if(error?.response?.status == 400) {
      clearTaskState();
    }
  }
};

const regainTextToVideoTask = () => {
  nextTick(() => {
    let task = {};
    try {
      task = JSON.parse(
        window.localStorage.getItem("text_to_video_task") || "{}"
      );
    } catch (error) {
      window.localStorage.removeItem("text_to_video_task");
      console.log(error, "error>>");
      return;
    }
    if (task.taskId) {
      pollVideoUrl(task);
    }
  });
};
regainTextToVideoTask();

onUnmounted(() => {
  clearTimeout(videoTimer.value);
  stopPolling.value = true;
});
</script>

<style lang="scss" scoped>
:deep(.el-form-item__label) {
  font-weight: bold;
  font-size: 16px;
  color: #000000;
}
.attr-name {
  font-weight: bold;
  font-size: 16px;
  color: #000000;
}
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