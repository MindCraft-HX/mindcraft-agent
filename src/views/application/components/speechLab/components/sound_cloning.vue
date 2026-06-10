<template>
  <div class="sound-cloning">      
    <div class="form-item">
      <div class="form-item-label">
        <svg class="icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-yinsemingcheng1"></use>
        </svg>
        音色名称：</div>
        <el-input v-model="voice_name" class="item-input-list item-input" placeholder="请输入音色名称"></el-input>
    </div>

    <div class="form-item">
      <div class="form-item-label">
        <svg class="icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-yinsemiaoshu1"></use>
        </svg>
        音色描述：</div>
        <el-input v-model="voice_desc" type="textarea" class="item-input-list item-input" placeholder="请输入音色描述"></el-input>
    </div>

    <div class="form-item">
      <div class="form-item-label">
        上传复刻音频：</div>
        <div class="item-input-list">
          <el-button class="upload-btn" plain :type="copyAudioInfo?.type == 'upload' ? 'success' : ''" @click="uploadVocie('copyAudio')">
            <div class="upload-btn-content">
              <div style="display: flex;align-items: center;">
                <svg class="upload-btn-icon icon" aria-hidden="true">
                  <use xlink:href="#icon-mindcraft-shangchuanyinpin1"></use>
                </svg>
                上传音频
              </div>
              <span class="item-input-tips">（时长10秒到5分钟）</span>
            </div>
            <input
              type="file"
              ref="copyAudio"
              @change="handleAudioUpload('copyAudio', $event)"
              style="display: none;"
              accept="audio/*"
            />
          </el-button>
          <el-button class="upload-btn" plain :type="copyAudioInfo?.type == 'record' ? 'success' : ''" @click="recordUpload('copyAudio')" :disabled="recordIng == 'strongAudio'" v-if="recordIng != 'copyAudio'">
            <svg class="upload-btn-icon icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-zaixianluyin1"></use>
            </svg>在线录音</el-button>
          <el-button class="upload-btn" @click="stopRecord('copyAudio')" v-else><el-icon class="is-loading" style="margin-right: 6px;"><Loading /></el-icon>录音中...</el-button>
        </div>
    </div>

    <div class="form-item">
      <div class="form-item-label">
        上传强化音频：<br><span class="item-input-tips">（大幅提升复刻效果）</span></div>
        <div class="item-input-list">
          <el-button class="upload-btn" plain :type="strongAudioInfo?.type == 'upload' ? 'success' : ''" @click="uploadVocie('strongAudio')">
            <div class="upload-btn-content">
              <div style="display: flex;align-items: center;">
                <svg class="upload-btn-icon icon" aria-hidden="true">
                  <use xlink:href="#icon-mindcraft-shangchuanyinpin1"></use>
                </svg>
                上传音频
              </div>
              <span class="item-input-tips">（时长8秒以内）</span>
            </div>
            <input
              type="file"
              ref="strongAudio"
              @change="handleAudioUpload('strongAudio', $event)"
              style="display: none;"
              accept="audio/*"
            />
          </el-button>
          <el-button class="upload-btn" plain :type="strongAudioInfo?.type == 'record' ? 'success' : ''" @click="recordUpload('strongAudio')" :disabled="recordIng == 'copyAudio'" v-if="recordIng != 'strongAudio'">
            <svg class="upload-btn-icon icon" aria-hidden="true">
              <use xlink:href="#icon-mindcraft-zaixianluyin1"></use>
            </svg>在线录音</el-button>
            <el-button class="upload-btn" @click="stopRecord('strongAudio')" v-else><el-icon class="is-loading" style="margin-right: 6px;"><Loading /></el-icon>录音中...</el-button>
        </div>
    </div>

    <div class="form-item">
      <div class="form-item-label">
        强化音频字幕：</div>
        <div class="item-input-list">
          <el-input v-model="voice_text_strong" :rows="3" type="textarea" class="item-input" placeholder="请输入强化音频字幕"></el-input>
          <el-button class="right-btn" @click="autoRecognition">自动识别</el-button>
        </div>
    </div>

    <div class="form-item">
      <div class="form-item-label">
        <svg class="icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-ceshiwenben1"></use>
        </svg>
        测试文本：</div>
        <div class="item-input-list">
          <el-input v-model="voice_text" :rows="3" type="textarea" class="item-input" placeholder="请输入测试文本"></el-input>
          <el-button class="right-btn" type="primary" icon="check" @click="voiceClone">生成</el-button>
        </div>
    </div>

    <div class="form-item">
      <div class="form-item-label">
        <svg class="icon" aria-hidden="true">
          <use xlink:href="#icon-mindcraft-ceshiwenben1"></use>
        </svg>
        生成音色试听：<br><span class="item-input-tips">生成试听需保存后才正式生效</span></div>
        <div class="sound-list">
          <div
            class="sound-item"
            v-for="(item, index) in voiceCloneList"
            :key="index"
          >
            <div class="item-name">
              {{ `id:${item.clone_id}-${item.voice_name}` }}
            </div>
            <div class="item-btn-list">
              <el-button
                class="share-btn"
                text bg
                size="small"
                @click="shareVideo(item)"
                title="分享"
              ></el-button>
              <el-button
                text
                class="save-btn"
                @click="openSaveVoiceClone(item)"
                title="保存"
              ></el-button>
              <el-button
                class="play-btn"
                :class="{ 'stop-btn': playVideoUrl == item.demo_audio }"
                text
                size="small"
                @click="playVideo(item)"
                title="播放"
              ></el-button>
              <el-popconfirm title="确认删除？" @confirm="deleteVoiceClone(item)">
                <template #reference>
                  <!-- <el-button>Delete</el-button> -->
                  <el-button class="delete-btn" text size="small" title="删除"></el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
        </div>
    </div>
    
    <slot></slot>
  </div>
  
  <el-dialog
    v-model="expendDialogVisible"
    title="保存前请注意"
    width="443"
    center
    align-center
    class="dialog-content"
    style="border-radius: 20px;"
  >
    <div>1. 正式生成克隆音色，需要花费10000积分（人民币10元）</div>
    <div>2. 生成克隆音色后，可以在“语音合成”——“克隆音色”里找到对应音色</div>
    <div>3. 可以在“音乐生成”里“我的”音色列表中查看音色列表和对应音色ID</div>
    <template #footer>
      <el-button type="primary" @click="saveVoiceClone"><div style="margin-right: 6px;" class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>确认消耗并保存</el-button>
      <el-button @click="expendDialogVisible = false"><div style="margin-right: 6px;" class="mindcraft-flow-win-iconfont icon-mindcraft-back"></div>取消</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="saveSucDialogVisible"
    title="音色复刻成功！请在“我的音色”中选择新音色"
    width="471"
    center
    align-center
    class="dialog-content"
    style="border-radius: 20px;"
  >
    <div class="suc-content">
      <div>音色名称：{{ expendVoice?.voice_name }}</div>
      <div>音色ID：{{ expendVoice?.clone_id }}</div>
      <div>音色描述：{{ expendVoice?.desc }}</div>
    </div>
    <template #footer>
      <el-button type="primary" @click="closeClone"><div style="margin-right: 6px;" class="mindcraft-flow-win-iconfont icon-mindcraft-queren"></div>确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { nextTick, ref, onMounted } from "vue"
import { ElMessage, ElLoading, ElMessageBox } from "element-plus"
const props = defineProps(["type"])
const voice_name = ref("")
const voice_desc = ref("")
const voice_text_strong = ref("")
const voice_text = ref(
`哇！这真是太棒了！我简直不敢相信自己的眼睛！
唉……今天真是糟糕透了。一切都变得那么沉重，仿佛整个世界都在与我作对。
这简直太荒谬了！我再也无法忍受这种不公平的待遇！`)

const copyAudio = ref(null)
const strongAudio = ref(null)
const uploadVocie = (type) => {
  if(type == 'copyAudio') {
    copyAudio.value.click()
  } else if(type == 'strongAudio') {
    strongAudio.value.click()
  }
}
import { postVoiceFile } from "@/api/application/VoiceDebuggingConsole";
const copyAudioInfo = ref({})
const strongAudioInfo = ref({})
const duration = ref(0)
const handleAudioUpload = async (type, event) => {
  const AUDIO = type == 'copyAudio' ? copyAudioInfo : strongAudioInfo
  const file = event.target.files[0];
  if (file) {
    AUDIO.value.file = file
    AUDIO.value.src = URL.createObjectURL(file);
    AUDIO.value.type = 'upload'
    if(type == 'strongAudio') {
      const audioElement = new Audio(URL.createObjectURL(file));
      audioElement.addEventListener('loadedmetadata', () => {
        duration.value = audioElement.duration;
        console.log('音频时长:', duration.value);
      });
    }
    // 重置文件输入元素的值
    event.target.value = null;
    try {
      const response = await fetch(AUDIO.value.src);
      const blob = await response.blob();
      AUDIO.value.blob = blob
      const formData = new FormData();
      formData.append("file", blob, AUDIO.value?.file?.name || "recording.amr");
      console.log(type)
      if(type == 'copyAudio') {
        formData.append("purpose", "voice_clone");
      } else {
        formData.append("purpose", "prompt_audio");
      }
      const res = await postVoiceFile(formData);
      AUDIO.value.fileId = res.data.data.file_id;
      console.log(copyAudioInfo.value, strongAudioInfo.value)
    } catch (error) {
      console.error("Error:", error);
      ElMessage.error(error?.response?.data?.message || "异常");
      AUDIO.value = {}
    }
  }
}

import Recorder from 'js-audio-recorder';
let recorder = new Recorder({
    sampleBits: 16,                 // 采样位数，支持 8 或 16，默认是16
    sampleRate: 16000,              // 采样率，支持 11025、16000、22050、24000、44100、48000，根据浏览器默认值，我的chrome是48000
    numChannels: 1,                 // 声道，支持 1 或 2， 默认是1
    // compiling: false,(0.x版本中生效,1.x增加中)  // 是否边录边转换，默认是false
});
const recordIng = ref("")
let audioChunks = []
const recordUpload = (type) => {
  recordIng.value = type
  const AUDIO = type == 'copyAudio' ? copyAudioInfo : strongAudioInfo
  AUDIO.value = {}
  AUDIO.value.type = 'record'
  recorder.start().then(() => {
    // 开始录音
    console.log('开始录音了=========')
  }, (error) => {
      recorder.stop()
      // 出错了
      console.log(error)
      AUDIO.value = {}
      recordIng.value = ""
      ElMessage.error(error || "异常");
  })
  return 
}
const stopRecord = async (type) => {
  const AUDIO = type == 'copyAudio' ? copyAudioInfo : strongAudioInfo
  const data = recorder.getWAVBlob();
  // recorder.downloadWAV('test');
  try {
    if(type == 'strongAudio') {
      const audioElement = new Audio(URL.createObjectURL(data));
      audioElement.addEventListener('loadedmetadata', () => {
        duration.value = audioElement.duration;
        console.log('音频时长:', duration.value);
      });
    }
    const formData = new FormData();
    AUDIO.value.blob = data
    formData.append("file", data, "recording.wav");
    if(type == 'copyAudio') {
      formData.append("purpose", "voice_clone");
    } else {
      formData.append("purpose", "prompt_audio");
    }
    const res = await postVoiceFile(formData);
    AUDIO.value.fileId = res.data.data.file_id;
    recordIng.value = ""
    audioChunks = []; // 清空chunks以便下次录音
  } catch (error) {
    console.log(error, "error");
    ElMessage.error(error?.response?.data?.message || "异常");
    recordIng.value = ""
    audioChunks = [];
  }
}

import { postAsr } from "@/api/application/VoiceDebuggingConsole";
const autoRecognition = async () => {
  if(strongAudioInfo.value.blob) {
    const formData = new FormData();
    formData.append("file", strongAudioInfo.value.blob, strongAudioInfo.value?.file?.name || "recording.amr");
    formData.append("model", "16k_zh");
    formData.append("category", "tx_asr_recogSentence");
    formData.append(
      "format",
      strongAudioInfo.value?.file?.name?.match(/\.([^.]+)$/)?.[1].toLowerCase() || "wav"
    );
    formData.append("sample_rate", "8000");

    const loadingInstance = ElLoading.service({
      fullscreen: true,
      text: "识别中...",
    });

    try {
      const res = await postAsr(formData);
      voice_text_strong.value = res.data.data.text;
      if (!voice_text_strong.value) {
        ElMessage.warning("识别失败");
      }
    } catch (error) {
      console.log("Error:", error);
      ElMessage.error(error?.response?.data?.message || "识别失败");
    } finally {
      loadingInstance.close();
    }
  }
}

import { postVoiceClone } from "@/api/application/VoiceDebuggingConsole";
const voiceCloneList = ref([])
onMounted(() => {
  let list = localStorage.getItem("voiceCloneList");
  try {
    if (list) {
      list = JSON.parse(list);
      voiceCloneList.value = list.filter((item) => {
        if (item.time && item.time > Date.now() - 1000 * 60 * 60 * 24 * 7) {
          return true;
        } else {
          return false;
        }
      });
      localStorage.setItem(
        "voiceCloneList",
        JSON.stringify(voiceCloneList.value)
      );
    }
  } catch (error) {
    localStorage.removeItem("voiceCloneList");
  }
});
const voiceClone = async() => {
  if (!copyAudioInfo.value?.fileId) {
    ElMessage.warning("主要克隆音频不能为空");
    return;
  }
  if (strongAudioInfo.value?.fileId && !voice_text_strong.value) {
    ElMessage.warning("请点击自动识别以提供强化音频片段的文案");
    return;
  }
  if (!voice_name.value) {
    ElMessage.warning("克隆音色命名不能为空");
    return;
  }
  if (!voice_text.value) {
    ElMessage.warning("克隆音频文字不能为空");
    return;
  }
  if(duration.value > 8) {
    ElMessage.warning("音频时长不能超过8秒");
    return;
  }
  try {
    const params = {
      voice_name: voice_name.value,
      voice_text: voice_text.value,
      voice_file_id: copyAudioInfo.value.fileId,
      // voice_file_content: textarea_word1.value,
      voice_pfile_id: strongAudioInfo.value.fileId,
      voice_pfile_content: voice_text_strong.value,
      voice_description: voice_desc.value
    };
    const res = await postVoiceClone(params);
    voiceCloneList.value.push({
      ...res.data.data,
      desc: voice_desc.value,
      time: Date.now(),
    });
    localStorage.setItem(
      "voiceCloneList",
      JSON.stringify(voiceCloneList.value)
    );
    nextTick(() => {
      ElMessage.success(res?.data?.message || "生成完成");
    })
  } catch (error) {
    console.log("Error:", error);
    ElMessage.error(error?.response?.data?.message || "克隆失败");
  }
}


const shareVideo = async (item) => {
  navigator.clipboard
    .writeText(item.demo_audio)
    .then(() => {
      ElMessage.success("分享链接已复制到剪贴板");
    })
    .catch((err) => {
      ElMessage.error("分享链接复制失败");
    });
};

const expendDialogVisible = ref(false);
const expendVoice = ref(null)
const openSaveVoiceClone = async (item) => {
  expendVoice.value = item
  expendDialogVisible.value = true
};
import { postVoiceSave } from "@/api/application/VoiceDebuggingConsole";
const saveSucDialogVisible = ref(false);
const saveVoiceClone = async () => {
  try {
    const params = {
      clone_id: expendVoice.value.clone_id,
    };
    const res = await postVoiceSave(params);
    saveSucDialogVisible.value = true
  } catch (error) {
    console.log("Error:", error);
    ElMessage.error(error?.response?.data?.message || "保存失败");
  } finally {
    expendDialogVisible.value = false;
  }
}

const normalAudioRef = ref(null);
const playVideoUrl = ref("");
const playVideo = (item) => {
  if (normalAudioRef.value) normalAudioRef.value.pause();
  if (item.demo_audio) {
    if (playVideoUrl.value == item.demo_audio) {
      playVideoUrl.value = "";
    } else {
      playVideoUrl.value = item.demo_audio;
      normalAudioRef.value = new Audio(playVideoUrl.value);
      normalAudioRef.value.onended = () => {
        playVideoUrl.value = "";
        normalAudioRef.value.pause();
      }
      nextTick(() => {
        normalAudioRef.value.play();
      })
    }
  }
};

const deleteVoiceClone = async (item) => {
  voiceCloneList.value = voiceCloneList.value.filter(
    (i) => i.clone_id !== item.clone_id
  );
  localStorage.setItem("voiceCloneList", JSON.stringify(voiceCloneList.value));
  ElMessage.success("删除成功");
};

import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
const closeClone = () => {
  expendDialogVisible.value = false;
  saveSucDialogVisible.value = false;
  if(props.type == "character"){
    mitt.emit("selectTimbre", 0);
  }
}
</script>

<style lang="scss" scoped>
.sound-cloning{
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  .form-item{
    display: flex;
    align-items: flex-start;
    margin: 14px 0;
    .form-item-label{
      width: 186px;
      flex-shrink: 0;
      font-weight: 400;
      font-size: 16px;
      color: #107EFE;
      text-align-last: justify;
      margin-right: 12px;
      .item-input-tips{
        font-size: 14px;
        color: #707070;
      }
    }
    .item-input-list{
      display: flex;
      width: 100%;
      margin-left: 12px;
      position: relative;
      .upload-btn{
        flex: 1;
        padding: 50px;
        font-size: 16px;
        color: #000000;
        line-height: 27px;
        .upload-btn-content{
          display: flex;
          align-items: center;
          flex-direction: column;
          .item-input-tips{
            font-size: 12px;
            color: #707070;
          }
        }
        .upload-btn-icon{
          width: 30px;
          height: 30px;
          flex-shrink: 0;
          margin-right: 6px;
        }
      }
      .right-btn{
        position: absolute;
        bottom: 12px;
        right: 12px;
      }
    }
    .item-input{
      --el-input-border-color: transparent;
      --el-input-border: none;
      --el-border-color: none;
      --el-input-border-radius: 10px;
      --el-border-radius-base: 10px;
      --el-input-bg-color: #ECF5FF;
      --el-fill-color-blank: #ECF5FF;
      --el-tag-font-size: 16px;
      font-size: var(--el-tag-font-size);
      color: #000000;
      :deep(.el-textarea__inner), :deep(.el-input__inner){
        resize: none;
        padding: 12px;
      }
    }
    
    .sound-list {
      display: flex;
      flex-direction: column;
      width: 100%;
      margin-left: 12px;
      .sound-item {
        border-radius: 11px 11px 11px 11px;
        border: 1px solid #dcdfe6;
        padding: 16px 12px;
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
        &:hover {
          border-color: #909399;
        }
        .item-name {
          font-size: 14px;
          color: #303133;
        }
        .item-btn-list {
          display: flex;
          align-items: center;
          .share-btn{
            width: 34px;
            height: 34px;
            background-image: url("@/assets/link.png");
            background-position: center center;
            background-repeat: no-repeat;
            background-size: 60% 60%;
            border-radius: 8px;
            border: 2px solid #f1f1f1;
          }
          .save-btn {
            width: 34px;
            height: 34px;
            background-image: url("@/assets/soundCloning/save.png");
          }
          .play-btn {
            width: 34px;
            height: 34px;
            background-image: url("@/assets/soundCloning/play.png");
            &.stop-btn {
              background-image: url("@/assets/soundCloning/stop.png");
            }
          }
          .delete-btn {
            width: 34px;
            height: 34px;
            background-image: url("@/assets/soundCloning/delete.png");
          }
        }
      }
    }
  }
}
.suc-content{
  max-width: 80%;
  margin: 0 auto;
  background: #FFFFFF;
  border-radius: 12px 12px 12px 12px;
  border: 1px solid #707070;
  padding: 8px 18px;
}
</style>