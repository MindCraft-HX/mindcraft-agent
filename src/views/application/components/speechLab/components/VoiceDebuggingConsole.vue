<template>
  <div style="display: flex;align-items: flex-start;padding: 12px;height: calc(100vh - 120px);min-height: 0;overflow: auto;">
    <!-- 左边 -->
    <div style="height: 100%;overflow: auto;">
      <el-scrollbar style="flex: 1;margin-right: 14px;padding-right: 24px;" max-height="100%">
        <div class="DebuggingBench-right">
          <el-form label-position="left" label-width="100px">
            <el-card shadow="hover" style="margin: 12px 0;">
              <div style="border-left: #409EFF 4px solid;padding-left: 12px;margin-bottom: 12px;">模型选择</div>
              <el-form-item label="品牌">
                <el-select v-model="categoryName" @change="changeCategory" style="width: 258px">
                  <el-option v-for="(category,index) in category_Name" :key="index" :label="category.name" :value="category.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="模型" v-if="getParam('model')">
                <el-select v-model="SpeechDebugger.model" placeholder="请选择模型" style="width: 258px">
                  <el-option v-for="item in getParam('model').dataRange" :key="item.value" :label="item.value"
                    :value="item.value" />
                </el-select>
              </el-form-item>
            </el-card>
  
            <el-card shadow="hover" style="margin: 12px 0;">
              <div style="border-left: #409EFF 4px solid;padding-left: 12px;margin-bottom: 12px;">音色选择</div>
              <el-form-item v-if="getParam('timber_weights')">
                <el-button @click="addVoiceId" v-if="SpeechDebugger?.timber_weights.length < 2">添加音色</el-button>
                <!-- <el-button @click="openAddVoice">添加音色</el-button>
                <el-dialog v-model="voiceDisable" title="添加音色" width="40%">
                  <div class="" style="height: 30vh;">
                    <el-scrollbar height="100%" style="width: 100%;">
                      <div class="" style="display: flex;flex-wrap: wrap;">
                      <el-card shadow="hover" style="margin: 12px;width: 200px;height: 120px;" v-for="item, index in getParam('voice_id')?.dataRange" :key="index">
                        {{ item.name }}
                      </el-card>
                    </div>
                    </el-scrollbar>
                  </div>
                  <template #footer>
                    <el-button @click="voiceDisable = false">取消</el-button>
                    <el-button type="primary" @click="addVoiceId">确定</el-button>
                  </template>
                </el-dialog> -->
              </el-form-item>
              <template v-for="item, index in SpeechDebugger.timber_weights" :key="index">
                <el-form-item label="音色">
                  <div style="display: flex;align-items: center">
                    <el-select v-model="SpeechDebugger.timber_weights[index].voice_id" style="width: 200px;" placeholder="请选择音色"
                      @change="changetimbre1">
                      <el-option v-for="item in getParam('voice_id')?.dataRange" :key="item.value" :label="item.name"
                        :value="item.value" />
                    </el-select>
                    <el-button @click="SpeechDebugger.timber_weights.splice(index, 1)" v-if="SpeechDebugger?.timber_weights.length > 1">删除</el-button>
                  </div>
                </el-form-item>

                <el-form-item label="占比" v-if="SpeechDebugger?.timber_weights?.length > 1">
                  <el-slider v-model="SpeechDebugger.timber_weights[index].weight" style="width: 190px; margin: 0px 12px" :min="0" :max="100" />
                  <el-input style="width: 50px" v-model.number="SpeechDebugger.timber_weights[index].weight" />
                </el-form-item>
                </template>


                <!-- 选择混音 -->
                <!-- <el-form-item label="是否混音" v-if="getParam('timber_weights')">
                  <el-switch v-model="switch_value1" class="mb-2" active-text="混音" inactive-text="非混音" />
                </el-form-item>

              <el-form-item label="音色1" v-if="getParam('voice_id')">
                <el-select v-model="SpeechDebugger.timbre1" style="width: 258px; margin-bottom: 5px" placeholder="请选择音色"
                  @change="changetimbre1">
                  <el-option v-for="item in getParam('voice_id').dataRange" :key="item.value" :label="item.name"
                    :value="item.value" />
                </el-select>
              </el-form-item>

              <el-form-item label="占比" v-if="switch_value1">
                <el-slider v-model="SpeechDebugger.proportion1" style="width: 190px; margin: 0px 12px" :min="0" :max="100" />
                <el-input style="width: 50px" v-model.number="SpeechDebugger.proportion1" />
              </el-form-item>

              <el-form-item label="音色2" v-if="switch_value1">
                <el-select v-model="SpeechDebugger.timbre2" style="width: 258px; margin-bottom: 5px" placeholder="请选择音色"
                  @change="changetimbre1">
                  <el-option v-for="item in getParam('voice_id').dataRange" :key="item.value" :label="item.name"
                    :value="item.value" />
                </el-select>
              </el-form-item>

              <el-form-item label="占比" v-if="switch_value1">
                <el-slider v-model="SpeechDebugger.proportion2" style="width: 190px; margin: 0px 12px" :min="0" :max="100" />
                <el-input style="width: 50px" v-model.number="SpeechDebugger.proportion2" />
              </el-form-item> -->
            </el-card>
            
            <el-card shadow="hover" style="margin: 12px 0;">
              <div style="border-left: #409EFF 4px solid;padding-left: 12px;margin-bottom: 12px;">参数</div>
                <el-form-item label="speed(语速)" v-if="getParam('speed')">
                  <el-slider v-model="SpeechDebugger.speed" style="width: 190px; margin: 0px 12px" :min="getParam('speed').dataMin" :max="getParam('speed').dataMax" :step="0.01" />
                  <el-input style="width: 50px" v-model.number="SpeechDebugger.speed" />
                </el-form-item>

                <el-form-item label="vol(音量)" v-if="getParam('volume')">
                  <el-slider v-model="SpeechDebugger.vol" style="width: 190px; margin: 0px 12px"
                    :min="getParam('volume').dataMin" :max="getParam('volume').dataMax" :step="0.01" />
                  <el-input style="width: 50px" v-model.number="SpeechDebugger.vol" />
                </el-form-item>

                <el-form-item label="pitch(语调)" v-if="getParam('pitch')">
                  <el-slider v-model="SpeechDebugger.pitch" style="width: 190px; margin: 0px 12px"
                    :min="getParam('pitch').dataMin" :max="getParam('pitch').dataMax" />
                  <el-input style="width: 50px" v-model.number="SpeechDebugger.pitch" />
                </el-form-item>

                <el-form-item label="采样率" v-if="getParam('audio_sample_rate')">
                  <el-select v-model="SpeechDebugger.samplingRate" style="width: 258px" placeholder="请选择采样率">
                    <el-option v-for="item in getParam('audio_sample_rate').dataRange" :key="item" :label="item"
                      :value="item" />
                  </el-select>
                </el-form-item>

                <el-form-item label="比特率" v-if="getParam('bitrate')">
                  <el-select v-model="SpeechDebugger.bitRate" style="width: 258px" placeholder="请选择比特率">
                    <el-option v-for="item in getParam('bitrate').dataRange" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>

                <el-form-item label="音频文件" v-if="getParam('output_format')">
                  <el-select v-model="SpeechDebugger.output_format" style="width: 258px; margin-bottom: 5px"  
                  
                    placeholder="请选择音频文件">
                    <el-option v-for="item in getParam('output_format').dataRange" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>

                <el-form-item label="声道" v-if="getParam('channel')">
                  <el-select v-model="SpeechDebugger.channel" style="width: 258px; margin-bottom: 5px" placeholder="请选择声道">
                    <el-option v-for="item in getParam('channel').dataRange" :key="item.value" :label="item.name"
                      :value="item.value" />
                  </el-select>
                </el-form-item>

                <el-form-item label="主语言" v-if="getParam('primary_language')">
                  <el-select v-model="SpeechDebugger.primary_language" style="width: 258px; margin-bottom: 5px"
                    placeholder="请选择主语言">
                    <el-option v-for="item in getParam('primary_language').dataRange" :key="item.value" :label="item.name"
                      :value="item.value" />
                  </el-select>
                </el-form-item>

                <el-form-item label="时间戳" v-if="getParam('enable_subtitle')">
                  <el-switch v-model="SpeechDebugger.enable_subtitle" class="mb-2" active-text="开启" inactive-text="不开启" />
                </el-form-item>

                <el-form-item label="断句敏感阈值" v-if="getParam('segment_rate')">
                  <el-select v-model="SpeechDebugger.segment_rate" style="width: 258px; margin-bottom: 5px"
                    placeholder="请选择断句敏感阈值">
                    <el-option v-for="item in getParam('segment_rate').dataRange" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>

                <el-form-item label="音频情感" v-if="getParam('emotion_category')">
                  <el-select v-model="SpeechDebugger.emotion_category" style="width: 258px; margin-bottom: 5px"
                    placeholder="控制合成音频的情感">
                    <el-option v-for="item in getParam('emotion_category').dataRange" :key="item.value" :label="item.name"
                      :value="item.value" />
                  </el-select>
                </el-form-item>

                <el-form-item label="情感程度" v-if="getParam('emothion_intensity')">
                  <el-slider v-model="SpeechDebugger.emothion_intensity" style="width: 190px; margin: 0px 12px"
                    :min="getParam('emothion_intensity').dataMin" :max="getParam('emothion_intensity').dataMax" :step="1" />
                    <el-input style="width: 50px" v-model.number="SpeechDebugger.emothion_intensity" />
                </el-form-item>

                <el-form-item label="旁白对白解析" v-if="getParam('over_dialogue')">
                  <el-tooltip content="旁白与对白文本解析，分别合成相应风格（仅适用于旁对白音色10510000 100510000）">
                    <el-icon><QuestionFilled /></el-icon>
                  </el-tooltip>
                  <el-switch v-model="SpeechDebugger.over_dialogue" class="mb-2" active-text="开启" inactive-text="不开启" />
                </el-form-item>
            </el-card>
          </el-form>
        </div>
      </el-scrollbar>
    </div>
    <!-- 右边 -->
    <div style="height: 100%;overflow: auto;flex: 1;">
      <el-scrollbar style="flex: 1;" max-height="100%" max-width="100%">
        <div class="DebuggingBench-left" style="display: flex;flex-direction: column;">
          <el-card shadow="hover" style="margin: 12px 0;">
            <div style="border-left: #409EFF 4px solid;padding-left: 12px;margin-bottom: 12px;">台词文本</div>
            <!-- :placeholder="placeholder_Text" -->
            <textarea class="DebuggingBench_textarea" v-model="SpeechDebugger.wordage"
              :placeholder="placeholder_Text"></textarea>
            <!-- 按钮 -->
            <div style="margin-top: 10px">
              <el-button style="margin: 5px;" type="primary" @click="voiceSubmit">提交</el-button>
              <el-button style="margin: 5px;" @click="voiceReset">重置</el-button>
              <el-button style="margin: 5px;" type="warning" @click="codeDialogVisible = true">代码预览</el-button>
            </div>
          </el-card>
          <el-card shadow="hover">
            <div style="border-left: #409EFF 4px solid;padding-left: 12px;margin-bottom: 12px;">生成示例</div>
            <!-- 播放器 -->
            <div>
              <div style="display: flex; align-items: center">
                <audio :src="audio_file" controls></audio>
                <!-- <el-button style="margin-left: 20px" type="primary" plain @click="downloadAudio" :icon="Download">
                  <svg class="icon" aria-hidden="true" style="font-size: 14px; margin-right: 10px">
                    <use xlink:href="#icon-xiazai"></use>
                  </svg>
                  下载</el-button> -->
                <!-- v-if="Generated_audio" -->
                <div v-if="Generated_audio" style="
                    margin-left: 30px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                  ">
                  正在生成音频中,请稍等
                  <div class="create_loadingImg"></div>
                </div>
              </div>
              <div style="padding: 10px 10px; font-size: 12px">
                音频链接有效期为一天，请及时下载保存
              </div>
            </div>
          </el-card>
        </div>
      </el-scrollbar>
    </div>
  </div>
  <el-dialog v-model="codeDialogVisible" title="代码预览" width="50%">
    <div style="max-height: 50vh;overflow: auto;" v-html="renderHtml(codeText)" />
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onUnmounted, computed } from "vue";
import {
  getVoiceConfig,
  getVoiceTts,
  getTTsList,
  postUpLoadingTTs,
} from "../../../../../api/application/VoiceDebuggingConsole.js";
import { saveAs } from "file-saver";
import { Download } from "@element-plus/icons-vue";
import { ElLoading } from "element-plus";
import { ElMessage } from "element-plus";
import api from "@/utils/request";

const categoryName = ref(""); //选择模型
const placeholder_Text = ref("");

// 收集全部数据
const SpeechDebugger = ref({
  timbre1: "", //音色1
  proportion1: 1, //占比1
  timbre2: "", //音色2
  proportion2: 1, //占比2
  timber_weights: [{
    voice_id: "",
    weight: 1
  }],  // 音色列表
  model: "", //模型
  speed: 1, //speed
  vol: 1, //vol
  pitch: 0, //pitch
  samplingRate: "", //采样率
  bitRate: "", //比特率
  wordage: "", //文字
  output_format: "",
  channel: null, //声道
  primary_language: "",
  enable_subtitle: false,
  segment_rate: "",
  emotion_category: "",
  emothion_intensity: 100,
  over_dialogue: false,
});
// const Voice = ref([]);
// const model_list = ref(null);
// const options = ref([]);

const category_Name = ref([]);
const switch_value1 = ref(false);

const audio_file = ref("");

const Generated_audio = ref(false);

let audioTimer = null;

onMounted(async () => {
  // await VoiceConfig();
  await getVoiceList();
});

//请求拿到渲染数据
// const VoiceConfig = async () => {
//   try {
//     const res = await getVoiceConfig();
//     Voice.value = res.data;
//     // console.log(Voice.value, 'Voice.value>>>>>>>>>>>>>>>.');
//     // console.log(Voice.value, 'Voice.value');
//     model_list.value = res.data[0].model_list; //拿到多个 模型
//     // 将 model_voice_id 对象转换为数组
//     options.value = Object.values(Voice.value[0].model_voice_id).map(
//       (voice) => ({
//         value: voice.voice_id,
//         label: voice.voice_name,
//       })
//     );
//   } catch (error) {
//     console.log(error, "error");
//   }
// };
/*新的************************************************************************************************************************** */

const originalData = ref([]);
const params = ref([]);

const getVoiceList = async () => {
  const res = await getTTsList();
  originalData.value = res.data.data;
  category_Name.value = res.data.data.map((item) => ({
    name: item.title,
    value: item.category,
  }));
  categoryName.value = category_Name.value[0].value;
  triggerWatch();
};

const changeCategory = (val) => {
  // const selectedCategory = originalData.value.find(item => item.category === val);
  // console.log(selectedCategory, 'selectedCategory>>>>>>>>>>>>>');
  // voiceReset();
  switch_value1.value = false;
};

const triggerWatch = () => {
  const newVal = categoryName.value;
  if (originalData.value.length > 0) {
    const selectedCategory = originalData.value.find(
      (item) => item.category === newVal
    );
    params.value = selectedCategory?.params_list;
  }
  if(!params.value?.length) {
    return
  }
  // console.log(params.value, 'params.value');
  if (getParam("voice_id")) {
    const voice_id = getParam("voice_id").dataRange[0];
    SpeechDebugger.value.timbre1 = voice_id.value;
    SpeechDebugger.value.timbre2 = voice_id.value;
    SpeechDebugger.value.timber_weights = [{
        voice_id: voice_id.value,
        weight: 1
    }]
  }
  if (getParam("model")) {
    const model = getParam("model").dataRange[0];
    SpeechDebugger.value.model = model.value;
  }
  if (getParam("output_format")) {
    const output_format = getParam("output_format").dataRange[1];
    SpeechDebugger.value.output_format = output_format;
  }
  if (getParam("text")) {
    const text = getParam("text").description;
    // console.log(text, 'text');
    placeholder_Text.value = text;
  }

  // 缓存拿回来赋值
  const cachedData = localStorage.getItem("SpeechDebugger");
  if (cachedData) {
    // console.log(JSON.parse(cachedData),'JSON.parse(cachedData)');
    SpeechDebugger.value = JSON.parse(cachedData);
  }
  audio_file.value = localStorage.getItem("audio_file");

  const storedAudioFile = localStorage.getItem("categoryName");
  if (!storedAudioFile || storedAudioFile.trim() === "") {
    categoryName.value = category_Name.value[0]?.value;
  } else {
    categoryName.value = storedAudioFile;
  }
};

// 找到对应的名字的
const getParam = (paramName) => {
  const param = params.value?.find((param) => param.paramName === paramName);
  if (param && param.paramName === "model") {
    // 处理模型数据
    if (
      Array.isArray(param.dataRange) &&
      typeof param.dataRange[0] === "string"
    ) {
      // 第一种数据结构
      param.dataRange = param.dataRange.map((item) => ({
        name: item,
        value: item,
      }));
    }
  }
  return param;
};

watch(
  () => categoryName.value,
  (newVal) => {
    if (originalData.value.length > 0) {
      const selectedCategory = originalData.value.find(
        (item) => item.category === newVal
      );
      console.log(selectedCategory, newVal, "selectedCategory>>>>>>>>");
      params.value = selectedCategory?.params_list;
      if(!params.value?.length) {
        return
      }
      if (getParam("voice_id")) {
        const voice_id = getParam("voice_id").dataRange[0];
        SpeechDebugger.value.timbre1 = voice_id.value;
        SpeechDebugger.value.timbre2 = voice_id.value;
        SpeechDebugger.value.timber_weights = [{
            voice_id: voice_id.value,
            weight: 1
        }]
      }
      if (getParam("model")) {
        const model = getParam("model").dataRange[0];
        SpeechDebugger.value.model = model.value;
      }
      if (getParam("output_format")) {
        const output_format = getParam("output_format").dataRange[1];
        SpeechDebugger.value.output_format = output_format;
      }
      if (getParam("audio_sample_rate")) {
        const audio_sample_rate = getParam("audio_sample_rate").dataRange[0];
        SpeechDebugger.value.samplingRate = audio_sample_rate;
      }
      if (getParam("bitrate")) {
        const bitrate = getParam("bitrate").dataRange[0];
        SpeechDebugger.value.bitRate = bitrate;
      }
      if (getParam("primary_language")) {
        const primary_language = getParam("primary_language").dataRange[0];
        SpeechDebugger.value.primary_language = primary_language.value;
      }
      if (getParam("segment_rate")) {
        const segment_rate = getParam("segment_rate").dataRange[0];
        SpeechDebugger.value.segment_rate = segment_rate;
      }
      if (getParam("emotion_category")) {
        const emotion_category = getParam("emotion_category").dataRange[0];
        // console.log(emotion_category, 'emotion_category');
        SpeechDebugger.value.emotion_category = emotion_category.value;
      }
      if (getParam("emothion_intensity")) {
        const emothion_intensity = getParam("emothion_intensity").dataDefault;
        SpeechDebugger.value.emothion_intensity = emothion_intensity;
      }
      if (getParam("text")) {
        const text = getParam("text").description;
        // console.log(text, 'text');
        placeholder_Text.value = text;
      }
    }
  },
  { immediate: true }
);

const changetimbre1 = (val) => {
  console.log(val, "val");
};

const voiceDisable = ref(false);
const openAddVoice = () => {
  voiceDisable.value = true;
}
const addVoiceId = () => {
  SpeechDebugger.value.timber_weights.push({
    voice_id: "",
    weight: 1
  })
}

/*********************************************************************************************************************************** */
// 重置
const voiceReset = () => {
  // SpeechDebugger.value = {
  //   timbre1: "", //音色1
  //   proportion1: 1, //占比1
  //   timbre2: "", //音色2
  //   proportion2: 0, //占比2
  //   model: "", //模型
  //   speed: 1, //speed
  //   vol: 1, //vol
  //   pitch: 0, //pitch
  //   samplingRate: "", //采样率
  //   bitRate: "", //比特率
  //   wordage: "", //文字
  //   output_format: "",
  // };
  triggerWatch();
  localStorage.removeItem("SpeechDebugger");
  localStorage.removeItem("audio_file");
  localStorage.removeItem("categoryName");
  audio_file.value = "";
};

// 提交
const voiceSubmit = async () => {
  // console.log(SpeechDebugger.value,'SpeechDebugger>>>>>>>>>>>>.');
  let formData = {
    category: categoryName.value,
    model: SpeechDebugger.value.model,
    voice_id: SpeechDebugger.value?.timber_weights?.[0]?.voice_id,
    text: SpeechDebugger.value.wordage,
    speed: SpeechDebugger.value.speed,
    volume: SpeechDebugger.value.vol,
    pitch: SpeechDebugger.value.pitch,
    output_format: SpeechDebugger.value.output_format,
    audio_sample_rate: SpeechDebugger.value.samplingRate,
    bitrate: SpeechDebugger.value.bitRate,
    channel: SpeechDebugger.value.channel,
    primary_language: SpeechDebugger.value.primary_language,
  };

  if(SpeechDebugger.value?.timber_weights?.length > 1){
    formData.timber_weights = SpeechDebugger.value?.timber_weights
  }
  // if (switch_value1.value) {
  //   // 判断是否混音
  //   formData.timber_weights = [
  //     {
  //       voice_id: SpeechDebugger.value.timbre1,
  //       weight: SpeechDebugger.value.proportion1,
  //     },
  //     {
  //       voice_id: SpeechDebugger.value.timbre2,
  //       weight: SpeechDebugger.value.proportion2,
  //     },
  //   ];
  // }

  try {
    // 开启全局 Loading
    // const loadingInstance = ElLoading.service({
    //   lock: true,
    //   text: "生成音频中...",
    // });
    // const res = await getVoiceTts(formData);
    Generated_audio.value = true;
    const res = await postUpLoadingTTs(formData);
    // ElMessage.warning("生成音频中 请等待");
    // console.log(res, "res");
    if (res.status === 200) {
      audio_file.value = res.data.data.audio_file;
      // console.log(res.data.data.audio_file, "res.data.data.audio_file");
      // loadingInstance.close();
      Generated_audio.value = false;
      ElMessage.success("音频生成成功");
      localStorage.setItem(
        "SpeechDebugger",
        JSON.stringify(SpeechDebugger.value)
      );
      localStorage.setItem("audio_file", audio_file.value);
      localStorage.setItem("categoryName", categoryName.value);
    }
    if (res.status === 201) {
      Generated_audio.value = true;
      const task_id = res.data.data.task_id;
      const voice_id = res.data.data.voice_id;

      const body = {
        category: categoryName.value,
        voice_id: voice_id,
        task_id: task_id,
      };

      // await api.get(`/v1/tts/task/${task_id}/`, body);
      const pollAudioFile = async () => {
        const response = await api.get(`/v1/tts/task/${task_id}/`, body);
        if (response.status === 200 && response.data.data.audio_file) {
          // console.log('有进来嘛？');
          audio_file.value = response.data.data.audio_file;
          Generated_audio.value = false;
          // loadingInstance.close();
          ElMessage.success("音频生成完成");
          localStorage.setItem(
            "SpeechDebugger",
            JSON.stringify(SpeechDebugger.value)
          );
          localStorage.setItem("audio_file", audio_file.value);
          localStorage.setItem("categoryName", categoryName.value);
        } else {
          // 如果音频文件还未生成,继续轮询
          audioTimer = setTimeout(pollAudioFile, 10000);
          ElMessage.warning("生成音频中 请等待");
        }
      };
      // 开始轮询
      pollAudioFile();
    }
  } catch (error) {
    Generated_audio.value = false;
    console.log(error.response.data.message, "error");
    ElMessage.warning(error.response.data.message);
    // console.log(error.response.data.message, "error.response.data.message");
    if (error.response.data.message === "invalid params") {
      ElMessage.warning("参数有误，请调整输入后重试");
    }
    // if (error.response.data.message ==="call rpc failed, amadeus tts resp invalid") {
    //   ElMessage.warning("请至少选择一个音色 占比");
    // }
    // loadingInstance.close();
  }
};

const downloadAudio = async () => {
  if (audio_file.value) {
    // console.log(audio_file.value, "audio_file.value");
    const link = document.createElement("a");
    link.href = audio_file.value;
    link.download = "audio.wav"; // 你可以根据需要更改文件名
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // const res = await api.get(audio_file.value, { responseType: 'blob' });
    // console.log(res, 'res');
    // const blob = new Blob([res.data], { type: 'audio/wav' });
    // const link = document.createElement('a');
    // link.href = URL.createObjectURL(blob);
    // link.download = 'audio.wav'; // 你可以根据需要更改文件名
    // document.body.appendChild(link);
    // link.click();
    // document.body.removeChild(link);
  } else {
    console.log("没有音频文件");
  }
};

onUnmounted(() => {
  if (audioTimer) {
    clearTimeout(audioTimer);
    console.log("清除定时器");
  }
});

import { renderHtml } from "@/utils/MarkdownIt";
const codeDialogVisible = ref(false);
const codeText = computed(() => {
  return '```Python\n' +
`from openai import OpenAI

base_url = 'https://api.mindcraft.com.cn/v1/'
api_key = 'xxx'
client = OpenAI(base_url=base_url, api_key=api_key)

# 正常参数
model = '${SpeechDebugger.value.model}'
input_text = '${SpeechDebugger.value.wordage}'
voice = ${getParam('voice_id') ? `'${SpeechDebugger.value?.timber_weights?.[0]?.voice_id}'` : `''`}
speed = ${getParam('speed') ? SpeechDebugger.value.speed : null}
response_format = ${getParam('output_format') ? `'${SpeechDebugger.value.output_format}'` : `''`}

# 额外参数
params = {
    "volume": ${getParam('volume') ? SpeechDebugger.value.vol : null},
    "pitch": ${getParam('pitch') ? SpeechDebugger.value.pitch : null},
    "voice_id": ${getParam('voice_id') ? `'${SpeechDebugger.value.timbre1}'` : `''`},
    "audio_sample_rate": ${getParam('audio_sample_rate') ? `'${SpeechDebugger.value.samplingRate}'` : `''`},
    "bitrate": ${getParam('bitrate') ? `'${SpeechDebugger.value.bitRate}'` : `''`},
    "channel": ${SpeechDebugger.value.channel || null},
    "primary_language": ${getParam('primary_language') ? `'${SpeechDebugger.value.primary_language}'` : `''`},
    "timber_weights": ${JSON.stringify(SpeechDebugger.value.timber_weights)}
}

response = client.audio.speech.create(
    model=model,
    input=input_text,
    voice=voice,
    speed=speed,
    response_format=response_format,
    extra_body=params
)

# 保存文件
with open("1.wav",'wb') as f:
f.write(response.content)
` +'\n```';
})
</script>

<style lang="scss" scoped>
textarea:focus {
  outline: none;
}

.DebuggingBench_textarea {
  width: 100%;
  height: 42vh;
  box-sizing: border-box;
  font-size: 16px;
  resize: none;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  padding: 14px;
  transition: all 0.3s, height 0s;

  max-width: 100%;
  min-height: 32px;
  line-height: 1.5714285714285714;
  vertical-align: bottom;
}

/* 获得焦点 */
.DebuggingBench_textarea:focus {
  border-color: #3677f0;
}

/* :deep(.el-input__inner) {
  text-align: right;
} */
.slider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
}

.create_loadingImg {
  width: 60px;
  height: 26px;
  background-image: url(../../../../../assets/audio_loading.gif);
  background-size: 100% 100%;
}
</style>
