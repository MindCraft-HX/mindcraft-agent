<template>
  <div style="height: 100%;overflow-x: auto;">
    <div style="padding: 0px 20px;font-size: 13px;font-weight: 600;">
      <div>说明：上传音乐文件，将拆分为音色和伴奏，获取音色编号（voice_id）和伴奏编号（instrument_id）。而</div>
      <div>后可以通过不同的音色，伴奏和歌词组合成新的音乐。</div>
    </div>
    <div style="padding: 0px 20px">
      <!-- 上传 -->
      <el-button :type="Music_audio ? 'success' : ''" plain class="Upload_music">
        <div style="cursor: pointer;display: flex;flex-direction: column;align-items: center;" @click="triggerFileInput" @drop.prevent="handleDrop" @dragover.prevent>
          <div class="upload_img"></div>
          <div style="padding: 5px 0px;">拖拽文件或点击此处{{Music_audio ? '修改' : '上传'}}音乐</div>
          <el-text type="info">音乐为mp3/wav格式,时长大于1分钟,小于10分钟</el-text>
          <input type="file" ref="fileInput" @change="handleFileChange" accept="audio/*" style="display: none" />
        </div>
      </el-button>
      <!-- 上传按钮 -->
      <!-- <div class="Upload_button">
      <el-button @click="clickUploadMusic">上传音乐</el-button>
    </div> -->
      <!-- 提示 -->
      <!-- <div style="margin: 5px 0px; font-size: 14px; font-weight: 600">
      <div>音乐为mp3/wav格式，时长不小</div>
      <div>于1分钟，不大于10分钟</div>
    </div> -->
      <div style="text-align: center;position: relative;display: flex;flex-direction:column">
        <el-button type="primary" round :icon="MagicStick" style="width: 185px;height: 44px;margin: 10px auto;"
          @click="clickUploadMusic">生成音色id/伴奏id</el-button>
        <div style="width: 100%;text-align: right;font-size: 14px;color: rgb(171, 170, 170);">生成时间约30秒，请耐心等待
        </div>
      </div>

      <!-- 分割线 -->
      <el-divider style="margin: 10px 0;" />

      <!-- 音色 -->
      <div style="position: relative;">
        <p style="font-weight: 600">音色</p>
        <div class="Input_list">
          <div style="margin-right: 10px">音色ID&nbsp&nbsp&nbsp</div>
          <el-input v-model="timbre.voice_id" style="width: 300px" placeholder="音色ID" />
        </div>
        <div class="Input_list">
          <div style="margin-right: 8px">音色名称</div>
          <el-input v-model="timbre.music_name" style="width: 300px; margin-right: 5px" placeholder="音色名称" />
          <el-button type="success" @click="SaveTimbre('timbre')">保存</el-button>
          <el-button type="primary" :disabled="!timbre_SharingSquare" @click="sharingSquare('timbre')">分享到广场</el-button>
        </div>
        <!-- 试听 v-if="!timbre.audioLink == ''" -->
        <div class="Input_list">
          <div style="margin-right: 8px">音频链接</div>
          <el-input v-model="timbre.audioLink" style="width: 300px" />
          <el-button size="small" style="margin-left: 5px;" :disabled="!showGenerative"
            @click="GenerativeAudition" type="success" plain>生成试听</el-button>
          <el-button type="primary" plain :icon="isTimbrePlaying ? VideoPause : VideoPlay" size="small"
            style="margin-left: 5px;" :disabled="timbre.audioLink == ''" @click="toggleTimbrePlayback">点击试听</el-button>
        </div>


        <!-- <div style="position: absolute;top: 72px;right: 176px;font-size: 14px;">
          <div style="color: red;">生成的音乐/伴奏自动保存</div>
          <div style="color: red;">音色名称自动命名格式为：</div>
          <div>mm_(voice_id)</div>
        </div> -->
      </div>
      <!-- 伴奏 -->
      <div>
        <p style="font-weight: 600">伴奏</p>
        <div class="Input_list">
          <div style="margin-right: 10px">伴奏ID&nbsp&nbsp&nbsp</div>
          <el-input v-model="accompany.instrumental_id" style="width: 300px" placeholder="伴奏ID" />
        </div>
        <div class="Input_list">
          <div style="margin-right: 8px">伴奏名称</div>
          <el-input v-model="accompany.music_name" style="width: 300px; margin-right: 5px" placeholder="伴奏名称" />
          <el-button type="success" @click="SaveTimbre('accompany')">保存</el-button>
          <el-button type="primary" :disabled="!accompany_SharingSquare"
            @click="sharingSquare('accompany')">分享到广场</el-button>
        </div>
        <!-- v-if="!accompany.audioLink == ''"  -->
        <div class="Input_list">
          <div style="margin-right: 8px">音频链接</div>
          <el-input v-model="accompany.audioLink" style="width: 300px" />
          <el-button size="small" style="margin-left: 5px;" :disabled="!showGenerative"
            @click="GenerativeAudition" type="success" plain>生成试听</el-button>
          <el-button type="primary" plain :icon="isAccompanyPlaying ? VideoPause : VideoPlay" size="small"
            style="margin-left: 5px;" :disabled="accompany.audioLink == ''"
            @click="toggleAccompanyPlayback">点击试听</el-button>
        </div>
      </div>
      <!-- <div style="margin-top: 10px">
      <el-button style="width: 210px; height: 44px" @click="generateAccompanimentOrMusic">生成伴奏/音乐</el-button>
    </div> -->
      <div>
        <div style="color: rgb(171, 170, 170);margin: 15px 0px;">说明：生成音色/伴奏试听约40~70秒。音色和伴奏试听一起生成</div>
      </div>
    </div>

  </div>

</template>

<script setup>
import { ref } from "vue";
import { Search, Plus, VideoPlay, VideoPause, MagicStick } from "@element-plus/icons-vue";
import {
  postMusicUpload,
  postVoiceInstrumental,
  putVoiceInstrumental,
  postGenerationMp3,
  postVoiceInstrumentalMusicUpload
} from "../../../../../../api/application/musicGeneration.js";
import { ElMessage, ElLoading } from "element-plus";

const input = ref("");
const fileInput = ref(null);
const Music_audio = ref(null);
const musicAudio_Name = ref("");

//音色
const timbre = ref({
  id: "",
  voice_id: "",
  music_name: "",
  audioLink: "",
});

//伴奏
const accompany = ref({
  id: "",
  instrumental_id: "",
  music_name: "",
  audioLink: "",
});

const triggerFileInput = () => {
  fileInput.value.click();
};

const handleFileChange = async (event) => {
  const file = event.target.files[0];
  if (file) {
    Music_audio.value = URL.createObjectURL(file);
    ElMessage.success("已上传音频");
    event.target.value = null;
    const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
    musicAudio_Name.value = fileNameWithoutExtension;
    // console.log(Music_audio.value, "Music_audio.value");
    // await clickUploadMusic();
  }
};

const handleDrop = async (event) => {
  const file = event.dataTransfer.files[0];
  if (file) {
    Music_audio.value = URL.createObjectURL(file);
    ElMessage.success("已上传音频");
    event.target.value = null;
    const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
    musicAudio_Name.value = fileNameWithoutExtension;
    // console.log(Music_audio.value, "Music_audio.value");
    // await clickUploadMusic();
  }
};

// 上传音乐
const clickUploadMusic = async () => {
  if (Music_audio.value === null) {
    ElMessage.warning("请先上传音频文件");
    return
  }

  timbre.value.music_name = "";
  accompany.value.music_name = "";

  try {
    const formData = new FormData();

    const response = await fetch(Music_audio.value);
    const blob = await response.blob();
    formData.append("music_file", blob, "music.mp3");
    formData.append("category", "minimax_music");
    // formData.append("music_name", musicAudio_Name.value);
    formData.append("purpose", "song");

    const res = await postVoiceInstrumentalMusicUpload(formData);
    console.log(res.data.data, "res");

    timbre.value.voice_id = res.data.data[0].voice_id;
    timbre.value.music_name = res.data.data[0].gen_name;
    timbre.value.id = res.data.data[0].gen_id;

    accompany.value.instrumental_id = res.data.data[1].instrumental_id;
    accompany.value.music_name = res.data.data[1].gen_name;
    accompany.value.id = res.data.data[1].gen_id;

    ElMessage.success("上传音乐成功");

    //重置保存
    // showSaveTimbre.value = true;
    // showSaveAccompany.value = true;
    timbre_SharingSquare.value = true;
    accompany_SharingSquare.value = true;
    timbre.value.audioLink = '';
    accompany.value.audioLink = '';
    showGenerative.value = true;


  } catch (error) {
    console.log(error, "error");
  }
};
/*点击保存 和 分享广场********************************************************** */

const timbre_SharingSquare = ref(false);
const timbre_ID = ref("");
// const showSaveTimbre = ref(true);


const accompany_SharingSquare = ref(false);
const accompany_ID = ref("");
// const showSaveAccompany = ref(true);


//保存
const SaveTimbre = async (type) => {

  //音色
  if (type === 'timbre') {

    if (timbre.value.music_name === '') {
      ElMessage.warning("请填写音色名称");
      return
    }
    try {
      const footdata = {
        gen_name: timbre.value.music_name,
        music_category: "minimax_music",
        gen_category: "voice",
        gen_share: false, //是否分享
      };
      const res = await postVoiceInstrumental(timbre.value.id, footdata);
      // timbre_ID.value = res.data.gen_id;
      ElMessage.success("保存成功");
      timbre_SharingSquare.value = true;
      // showSaveTimbre.value = false;
    } catch (error) {
      console.log(error);
      ElMessage.error("保存失败");
      timbre_SharingSquare.value = false;
    }

    //伴奏
  } else if (type === 'accompany') {

    if (accompany.value.music_name === '') {
      ElMessage.warning("请填写音色名称");
      return
    }
    try {
      const footdata = {
        gen_name: accompany.value.music_name,
        music_category: "minimax_music",
        gen_category: "instrumental",
        gen_share: false, //是否分享
        // instrumental_id: accompany.value.instrumental_id,
      };
      const res = await postVoiceInstrumental(accompany.value.id, footdata);
      // accompany_ID.value = res.data.gen_id;
      ElMessage.success("保存成功");
      accompany_SharingSquare.value = true;
      // showSaveAccompany.value = false;
    } catch (error) {
      console.log(error);
      ElMessage.error("保存失败");
      accompany_SharingSquare.value = false;
    }

  }


};

// 分享广场
const sharingSquare = async (type) => {

  if (type === 'timbre') {
    try {
      const footdata = {
        gen_share: true
      }
      const res = await putVoiceInstrumental(timbre.value.id, footdata);
      ElMessage.success("分享广场成功");
      timbre_SharingSquare.value = false;
    } catch (error) {
      console.log(error);
    }

  } else if (type === 'accompany') {
    try {
      const footdata = {
        gen_share: true
      }
      const res = await putVoiceInstrumental(accompany.value.id, footdata);
      ElMessage.success("分享广场成功");
      accompany_SharingSquare.value = false;
    } catch (error) {
      console.log(error);
    }

  }


};

//生成音乐或者伴奏
const generateAccompanimentOrMusic = async () => {
  if (timbre.value.voice_id === '' || accompany.value.instrumental_id === '') {
    ElMessage.warning("需要上传音频");
    return
  }
  try {
    const body = {
      category: "minimax_music",
      model: "music-01",
      refer_voice: timbre.value.voice_id,
      refer_instrumental: accompany.value.instrumental_id,
    }
    const res = await postGenerationMp3(body);
    timbre.value.audioLink = res.data.data.voice_url;
    accompany.value.audioLink = res.data.data.instrumental_url;

    ElMessage.success("以生成音色和伴奏");

  } catch (error) {
    console.log(error);
  }

}


/*试听播放**************************************************** */
const isTimbrePlaying = ref(false);
const isAccompanyPlaying = ref(false);

const showGenerative = ref(true)

const timbreAudio = new Audio();
const accompanyAudio = new Audio();

const stopAllAudio = () => {
  if (isTimbrePlaying.value) {
    timbreAudio.pause();
    isTimbrePlaying.value = false;
  }
  if (isAccompanyPlaying.value) {
    accompanyAudio.pause();
    isAccompanyPlaying.value = false;
  }
};

const toggleTimbrePlayback = () => {
  if (isTimbrePlaying.value) {
    timbreAudio.pause();
    isTimbrePlaying.value = false;
  } else {
    stopAllAudio();
    timbreAudio.src = timbre.value.audioLink;
    timbreAudio.play();
    isTimbrePlaying.value = true;
  }
};

const toggleAccompanyPlayback = () => {
  if (isAccompanyPlaying.value) {
    accompanyAudio.pause();
    isAccompanyPlaying.value = false;
  } else {
    stopAllAudio();
    accompanyAudio.src = accompany.value.audioLink;
    accompanyAudio.play();
    isAccompanyPlaying.value = true;
  }
};

// 监听音频播放结束事件，重置播放状态
timbreAudio.addEventListener('ended', () => {
  isTimbrePlaying.value = false;
});

accompanyAudio.addEventListener('ended', () => {
  isAccompanyPlaying.value = false;
});

const GenerativeAudition = async () => {
  if (timbre.value.voice_id === '' || accompany.value.instrumental_id === '') {
    ElMessage.warning("需要上传音频获取voice_id");
    return
  }
  try {
    const body = {
      category: "minimax_music",
      model: "music-01",
      refer_voice: timbre.value.voice_id,
      refer_instrumental: accompany.value.instrumental_id,
    }
    const res = await postGenerationMp3(body);
    timbre.value.audioLink = res.data.data.voice_url;
    accompany.value.audioLink = res.data.data.instrumental_url;

    ElMessage.success("以生成音色和伴奏");
    showGenerative.value = false;

  } catch (error) {
    console.log(error);
  }

}



</script>

<style scoped>
.Upload_music {
  /* border: 1px solid #dcdfe6; */
  height: 24vh;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: 5px 0px;
  width: 100%;
}

.Upload_button {
  display: flex;
  justify-content: space-between;
  margin: 10px 0px;
}

.Input_list {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  margin-left: 20px;
}

/* music.png */
.upload_img {
  background-image: url(../../../../../../assets/music.png);
  background-size: 100% 100%;
  width: 48px;
  height: 40px;
  flex-shrink: 0;
}
</style>
