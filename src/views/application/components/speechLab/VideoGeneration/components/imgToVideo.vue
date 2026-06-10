<template>
  <attrList ref="attrListRef" v-model:modelList="vincentDiagramData" v-model:data="gatherVincentDiagram" type="imageToVideo"/>
  <div style="flex: 1"></div>
  <div
    style="text-align: center; margin-bottom: 22px"
    v-if="gatherVincentDiagram"
  >
    <div class="btn-wrap">
    <el-button
      type="primary"
      style="width: 250px; height: 40px; font-size: 18px;"
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
      <el-text class="btn-price" v-else-if="doubaoModel.includes(activeModel.model)"><div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ seedweedPrice[userType ? 'vipPrcie' : 'price'] }} 积分</el-text>
      <el-text class="btn-price" v-else-if="activeModel.model=='MiniMax-Hailuo-02'"><div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>{{ MiniMaxHailuoPrice[userType ? 'vipPrcie' : 'price'] }} 积分</el-text>
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
      <el-text class="tips-price" v-else-if="doubaoModel.includes(activeModel.model)"><div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ seedweedPrice[!userType ? 'vipPrcie' : 'price'] }} 积分</el-text>
      <el-text class="tips-price" v-else-if="activeModel.model=='MiniMax-Hailuo-02'"><div class="vip-icon" :class="{ 'vip-icon-active': !userType }"></div>{{ MiniMaxHailuoPrice[!userType ? 'vipPrcie' : 'price'] }} 积分</el-text>
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
    vincentDiagramData.value = spacialHandle(res.data.data)
    if (!gatherVincentDiagram.value) {
      initVincentDiagram();
    }
  } catch (error) {
    console.log(error, "error");
  }
};
getVincentDiagramList();
const functionTabIcon = {
  "image_reference": "duotucankao",
  "video_repainting": 'shipinzhonghui',
  "video_edit": 'jububianji1',
  "video_extension": 'shipinyanzhan',
  "video_outpainting": 'shipinhuamiankuozhan'
}

const spacialHandle = (data) => {
  //  特殊处理数据
  if (!data) return
  // 找到通义万象的索引
  const tywxIndex = data.findIndex(e => e.category === 'tongyi_va_itv')
  if (tywxIndex === -1) return data
  //  找到 执行功能的索引
  const functionIndex = data[tywxIndex].params_list.findIndex(e => e.paramName === 'function')
  if (functionIndex === -1) return data
  // 1.执行功能的tab选项加图标
  data[tywxIndex].params_list[functionIndex].dataRange = data[tywxIndex].params_list[functionIndex].dataRange.map(e => {
    e.icon = functionTabIcon[e.value]
    return e
  })
  // 2.执行功能的视频延展的去掉[首帧图像|尾帧图像|尾段视频|输入视频]这四个选项,并且把首段视频作为必选项
  // 找到视频延展的索引
  const videoExtensionIndex = data[tywxIndex].params_list[functionIndex].dataRange.findIndex(e => e.value === 'video_extension')
  if (videoExtensionIndex === -1) return data
  // 删除 首帧图像|尾帧图像|尾段视频
  data[tywxIndex].params_list[functionIndex].dataRange[videoExtensionIndex].params_list =
  data[tywxIndex].params_list[functionIndex].dataRange[videoExtensionIndex].params_list.filter(item => item.paramName !== 'first_frame' && item.paramName !== 'last_frame' && item.paramName !== 'last_clip'&&item.paramName!=='video')
  //  获取first_clip的索引
  const firstClipIndex = data[tywxIndex].params_list[functionIndex].dataRange[videoExtensionIndex].params_list.findIndex(e => e.paramName === 'first_clip')
  if (firstClipIndex === -1) return data
  // 把first_clip改成必选
  data[tywxIndex].params_list[functionIndex].dataRange[videoExtensionIndex].params_list[firstClipIndex].isRequired = 1
  return data
}

const initVincentDiagram = (category) => {
  if (vincentDiagramData.value.length) {
    const firstModel = vincentDiagramData.value[0].params_list[0].dataRange[0].value;
    const category = vincentDiagramData.value[0].category
    gatherVincentDiagram.value = {
      category: category,
      model: firstModel,
      prompt: "",
    };
    nextTick(() => {
      attrListRef.value?.changeModel(gatherVincentDiagram.value.model)
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

const doubaoModel = ['Seedweed','doubao-seedance-1-0-lite-t2v-250428','doubao-seedance-1-0-pro-250528','doubao-seedance-1-0-lite-i2v-250428']
const doubaoTokenPointPrice = {
  "Seedweed":0.03,
  "doubao-seedance-1-0-lite-t2v-250428":0.01,
  "doubao-seedance-1-0-lite-i2v-250428":0.01,
  "doubao-seedance-1-0-pro-fast-251015":0.01,
  "doubao-seedance-1-0-pro-250528":0.015,
}
const seedweedPrice = computed(() => {
  let price = "--"
  let vipPrcie = "--"
  if(!doubaoModel.includes(activeModel.value.model)) return {price, vipPrcie}

  const width = +(gatherVincentDiagram.value?.size?.split("x")?.[0] || 0)
  const height = +(gatherVincentDiagram.value?.size?.split("x")?.[1] || 0)
  const token_points = doubaoTokenPointPrice[activeModel.value.model]
  const fps = 24
  const duration = gatherVincentDiagram.value['duration']
  const to_token = Math.ceil((width * height * fps * duration) / 1024) + 1000
  vipPrcie = Math.ceil(to_token * token_points)
  price = Math.ceil(vipPrcie / 0.8)

  return {
    price,
    vipPrcie
  }
})

const MiniMaxHailuoPrice = computed(()=>{
  let price = "--"
  let vipPrcie = "--"
  if(activeModel.value.model!=='MiniMax-Hailuo-02') return {price, vipPrcie}
  // 6 秒：3500   10秒： 4000
  vipPrcie = gatherVincentDiagram.value.duration===6?3500:4000
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
  window.localStorage.removeItem("img_to_video_task");
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

// 校验必填项
const handleValidate = (form, data) => {
  let hasError = false;

  const validateItem = (item) => {
    // 1. 检查当前项是否为必填项
    if (item.isRequired === 1) {
      const value = data[item.paramName];
      if(item.dataType!=='array'){  
          if (value === null || value === undefined || value === '') {
          ElMessage.warning(`${item.title}为必填项！`);
          hasError = true;
        }
      }
    }

    // 2. 处理数组类型的参数（如 reference_images）
    if (item.htmlType === 'array' && item.iter_list) {
      let len =  data[item.iter_list[0].paramName]?.length || 0
      item.iter_list.forEach(iterItem => {
        const arrayData = data[iterItem.paramName] || [];
        // 检查数组长度
        if (item.dataMin && arrayData.length < item.dataMin) {
          ElMessage.warning(`${item.title}至少需要${item.dataMin}组！`);
          hasError = true;
        }
        if (item.dataMax && arrayData.length > item.dataMax) {
          ElMessage.warning(`${item.title}最多只能${item.dataMax}项组！`);
          hasError = true;
        }
        //  判断数组的每一项的长度是否一致
        // 例如ref_images:[]的长度必须和obj_or_bg:[]的长度一致
        if(arrayData.length!==len){
          ElMessage.warning(`${iterItem.title}为必填项！`);
          hasError = true;
        }
        //  判断数组的每一项是否为空
        arrayData.forEach(arrItem=>{
          if(arrItem === null || arrItem === undefined || arrItem === ''){
            ElMessage.warning(`${iterItem.title}为必填项！`);
            hasError = true;
          }
        })
      })
    }
    // 3.处理单选项 如果单选项为必填,那么验证选中项
    if(item.htmlType === 'radio-group'&&item.isRequired === 1) {
      const radioValue = data[item.paramName];
      const selectedItem = item.dataRange.find(e => e.value === radioValue);
      const selectedValue = data[selectedItem.paramName]
      if (!selectedValue) {
        ElMessage.warning(`请选择${selectedItem.title}！`);
        hasError = true;
      }
    }

    // 4. 递归处理 dataRange 中的嵌套结构
    if (item.dataRange) {
      const selectedValue = data[item.paramName];
      const selectedItem = item.dataRange.find(e => e.value === selectedValue);
      if (selectedItem) {
        validateNestedStructure(selectedItem);
      }
    }
  };

  const validateNestedStructure = (struct) => {
    if (struct.params_list) {
      struct.params_list.forEach(validateItem);
    }
  };

  // 开始验证
  if (form.params_list) {
    form.params_list.forEach(validateItem);
  }

  return hasError;
};
const postGeneratePicture = async () => {
  //  校验
  const categoryList = vincentDiagramData.value.find(e => e.name === gatherVincentDiagram.value.category)
  if (categoryList == null) return
  if (handleValidate(categoryList,gatherVincentDiagram.value)) return
  const formData = new FormData();
  Object.keys(gatherVincentDiagram.value).forEach((key) => {
    if (key !== 'category') {
      //处理数组
     if (Array.isArray(gatherVincentDiagram.value[key])) {
      gatherVincentDiagram.value[key].forEach((item, index) => {
          formData.append(`${key}`, item);
      });
      }else {
        // 非文件数组或普通字段正常添加
        formData.append(key, gatherVincentDiagram.value[key]);
      }
    }
  });
  try {
    emit("update:loading", true);
    const res = await postTtv(formData);
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
      window.localStorage.setItem("img_to_video_task", JSON.stringify(task));
      await pollVideoUrl(task);
    }
  } catch (error) {
    console.log(error, "error>>");
    ElMessage.error(error?.response?.data?.message || "图生视频 失败");
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
      console.log(list, "list");
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
      ElMessage.success("生成视频完成");
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
        window.localStorage.getItem("img_to_video_task") || "{}"
      );
    } catch (error) {
      window.localStorage.removeItem("img_to_video_task");
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