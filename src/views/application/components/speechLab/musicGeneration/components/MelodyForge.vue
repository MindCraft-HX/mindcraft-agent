<template>
    <div style="height: 100%;">
        <el-row :gutter="20" class="container" style="margin-left: 0px; margin-right: 0px">
            <!-- 左边 -->
            <el-col :span="16">
                <div class="left">
                    <div>
                        <!-- 选择音色 -->
                        <p style="font-weight: 600">选择音色</p>
                        <el-select v-model="Music_generation.refer_voice" placeholder="选择音色" style="width: 240px">
                            <el-option v-for="item in VoiceSelectList" :key="item.value" :label="item.name"
                                :value="item.value" />
                        </el-select>

                        <!-- 选择伴奏 -->
                        <p style="font-weight: 600">选择伴奏</p>
                        <el-select v-model="Music_generation.refer_instrumental" placeholder="选择伴奏"
                            style="width: 240px">
                            <el-option v-for="item in InstrumentalSelectList" :key="item.value" :label="item.name"
                                :value="item.value" />
                        </el-select>
                        <!-- 歌词创作 -->
                        <p style="font-weight: 600">歌词创作</p>
                        <el-input v-model="Music_generation.music_name" style="width: 240px" placeholder="音乐名称" />

                        <textarea class="DebuggingBench_textarea" v-model="Music_generation.lyrics"
                            placeholder="请填入歌词，或者输入诉求由AI创作"></textarea>
                        <div style="text-align: end">
                            <el-button @click="generatingWord">帮我填词</el-button>
                        </div>

                        <!-- 生成音乐 -->
                        <el-button style="width: 200px; height: 54px" type="success" plain
                            @click="clickGenerateMusic">生成音乐</el-button>

                        <!-- <el-divider /> -->
                        <!-- 音乐播放器 -->

                        <!-- 新的进度条 -->
                        <!-- @mousemove="handleMouseMove" @mouseleave="handleMouseLeave" -->
                        <!-- <div class="progress-container" @click="seekTo($event)">
                            <div class="progress-bar" :style="{ width: progress + '%' }"></div>
                            <div class="progress-thumb" :style="{ left: progress + '%' }" @mousedown="startDrag"></div>
                        </div> -->

                        <div class="realPlayer" style="width: 100%;margin-top: 5px;">
                            <!-- <div class="details">
                                <el-button type="primary" plain @click="dialogVisible = true">详情</el-button>
                            </div> -->

                            <!-- 还需要audio  -->
                            <audio ref="audio" :src="currentTrack.music_url" @timeupdate="updateTime"
                                @ended="nextTrack"></audio>
                            <!-- 左 -->
                            <div style="
                  width: 32%;
                  background: #f9f9f9;
                  height: 126px;
                  margin-right: 4px;
                ">
                                <div class="particulars" style="padding: 6px;font-weight: 600;">
                                    <div class="limitation_length">
                                        歌名：{{ currentTrack.music_name }}
                                    </div>
                                    <div class="limitation_length">
                                        作者：{{ currentTrack.author_name }}
                                    </div>

                                    <div style="text-align: end; margin-bottom: 2px">
                                        <el-button type="primary" plain @click="dialogVisible = true">详情</el-button>
                                    </div>
                                </div>
                            </div>
                            <!-- 右 -->
                            <div
                                style="width: 68%; background: #f9f9f9; height: 118px;display: flex;align-items: center;justify-content: space-around;padding: 4px;flex-direction: column;">
                                <!-- @mousemove="handleMouseMove" @mouseleave="handleMouseLeave" -->

                                <div class="progress-container" @click="seekTo($event)">
                                    <div class="progress-bar" :style="{ width: progress + '%' }"></div>
                                    <div class="progress-thumb" :style="{ left: progress + '%' }"
                                        @mousedown="startDrag"></div>
                                </div>

                                <div class="play_Operation" style="margin:10px 0px;">

                                    <div @click="prevTrack" :class="{ disabled: !canPrevTrack }">
                                        <svg class="icon" aria-hidden="true" style="font-size: 34px;cursor: pointer;">
                                            <use xlink:href="#icon-shangyishou"></use>
                                        </svg>
                                    </div>

                                    <div @click="togglePlay" :class="{ disabled: !canPlay }">
                                        <svg class="icon" aria-hidden="true" style="font-size: 34px;cursor: pointer;">
                                            <use :xlink:href="isPlaying ? '#icon-zanting' : '#icon-bofang2'"></use>
                                        </svg>
                                    </div>

                                    <div @click="nextTrack" :class="{ disabled: !canNextTrack }">
                                        <svg class="icon" aria-hidden="true" style="font-size: 34px;cursor: pointer;">
                                            <use xlink:href="#icon-xiayishou"></use>
                                        </svg>
                                    </div>
                                </div>

                                <div
                                    style="display: flex;justify-content: space-between;align-items: center;width: 100%;">
                                    <div style="color: #999696;">{{ formatTime(currentTime) }} / {{ formatTime(duration)
                                        }}</div>
                                    <div>
                                        <el-button @click="downloadAudio" type="primary" plain >下载</el-button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </el-col>
            <!-- 右边 -->
            <el-col :span="8">
                <div class="right">
                    <RightMusic_Personal @add-track="addTrack" @getVoiceSelectList="getVoiceSelectList"
                        @getInstrumentalSelectList="getInstrumentalSelectList" />
                </div>
            </el-col>
        </el-row>
    </div>

    <!-- 弹窗 -->
    <transition name="dialog-fade">
        <div v-if="dialogVisible" class="custom-dialog-overlay" @click="close">
            <div class="custom-dialog" @click.stop>
                <div :style="dialogStyle"></div>
                <div class="dialog-content">
                    <!-- 这里是对话框的内容 -->
                    <div style="height: 50px; text-align: end">
                        <el-icon style="color: #ffffff; font-size: 25px; cursor: pointer" @click="close">
                            <Close />
                        </el-icon>
                    </div>
                    <!-- 内容 -->
                    <div>
                        <div style="
                display: flex;
                align-items: center;
                flex-direction: column;
                justify-content: center;
                height: 680px;
              ">
                            <!-- 封面 歌词 -->
                            <div class="PopupPlayer_Top">
                                <div style="height: 275px; width: 270px">
                                    <img :src="currentTrack.music_cover" alt=""
                                        style="height: 275px; width: 270px; border-radius: 15px" />
                                </div>
                                <div style="
                    height: 310px;
                    width: 40%;
                    color: hsla(0, 0%, 100%, 0.7);
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">
                                    <el-scrollbar max-height="430px">
                                        <div v-html="renderHtml(currentTrack.music_lyrics)"
                                            style="white-space: pre-wrap; word-wrap: break-word"></div>
                                    </el-scrollbar>
                                </div>
                            </div>
                            <div style="
                  width: 70%;
                  color: #ffffff;
                  margin-left: 95px;
                  margin-top: 20px;
                ">
                                <div style="margin-bottom: 5px">
                                    歌曲名：{{ currentTrack.music_name }}
                                </div>
                                <div>作者：{{ currentTrack.author_name }}</div>
                            </div>

                            <!-- 播放按钮 -->
                            <div class="PopupPlayer_button">
                                <div class="music_player">
                                    <!-- 播放按钮 -->
                                    <div class="play_Operation">
                                        <!-- 上一首 -->
                                        <div @click="prevTrack" :class="{ disabled: !canPrevTrack }">
                                            <svg class="icon" aria-hidden="true"
                                                style="font-size: 34px; cursor: pointer">
                                                <use xlink:href="#icon-shangyishou"></use>
                                            </svg>
                                        </div>
                                        <!-- 播放 -->
                                        <div @click="togglePlay" :class="{ disabled: !canPlay }">
                                            <svg class="icon" aria-hidden="true"
                                                style="font-size: 34px; cursor: pointer">
                                                <use :xlink:href="isPlaying ? '#icon-zanting' : '#icon-bofang2'
            "></use>
                                            </svg>
                                        </div>
                                        <!-- 下一首 -->
                                        <div @click="nextTrack" :class="{ disabled: !canNextTrack }">
                                            <svg class="icon" aria-hidden="true"
                                                style="font-size: 34px; cursor: pointer">
                                                <use xlink:href="#icon-xiayishou"></use>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <!-- 进度条 -->
                                <div class="audio_contetnt">
                                    <div class="music_time">
                                        <div class="opentime">
                                            <span style="color: #ffffff">{{
            formatTime(currentTime)
        }}</span>
                                        </div>
                                        <el-slider style="width: 70%; height: 10px" v-model="currentTime"
                                            :max="duration" :format-tooltip="formatTooltip" @change="seek">
                                        </el-slider>
                                        <div class="endtime">
                                            <span style="color: #ffffff">{{
                                                formatTime(duration)
                                                }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </transition>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { Search, Plus } from "@element-plus/icons-vue";
import RightMusic_Personal from "../components/RightMusic_Personal.vue";
import {
    postMusicGenerations,
    postMusicGenerator,
    getVoiceInstrumental,
    getVoiceInstrumentalSelect,
} from "../../../../../../api/application/musicGeneration.js";
import { renderHtml } from "../../../../../../utils/MarkdownIt.js";
import { ElMessage, ElLoading } from "element-plus";

const isLoading = ref(false);
let loadingInstance = null;
watch(isLoading, (newValue) => {
    if (newValue) {
        // 显示Loading，可以通过target参数指定局部DOM元素
        loadingInstance = ElLoading.service({
            fullscreen: true,
            text: "生成音乐中 请等待一分钟...",
        });
    } else {
        // 隐藏Loading
        if (loadingInstance) {
            loadingInstance.close();
        }
    }
});

const Music_generation = ref({
    category: "minimax_music", //音乐模型
    model: "music-01", //音乐model
    refer_voice: "", //音色ID
    refer_instrumental: "", // 伴奏ID
    music_name: "",
    lyrics: "", // 歌词
    format: "mp3",
});

// 播放数组
const tracks = ref([]);

const addTrack = (track) => {
    // console.log(track, 'track');
    tracks.value.push(track);
    currentTrackIndex.value = tracks.value.length - 1;
    playTrack();
};

//点击生成音乐
const clickGenerateMusic = async () => {
    if (Music_generation.value.music_name === "") {
        ElMessage.warning("请输入音乐名称");
        return;
    }

    try {
        isLoading.value = true;
        const res = await postMusicGenerations(Music_generation.value);
        console.log(res.data.data, "res.data.data");
        // tracks.value.push(...res.data.data.gen_author_data,...res.data.data.music_data);
        const { gen_author_data, music_data } = res.data.data;
        const combinedData = { ...gen_author_data, ...music_data };
        tracks.value.push(combinedData);

        currentTrackIndex.value = tracks.value.length - 1; // 设置为最新添加的音乐
        playTrack(); // 播放新添加的音乐并重置进度条
        console.log(tracks.value, "tracks.value");
        localStorage.setItem("tracks", JSON.stringify(tracks.value)); // 将数组转换为 JSON 字符串
        isLoading.value = false;
        ElMessage.success("生成音乐成功");
    } catch (error) {
        console.log(error);
        // console.log(error.response.data.message);
        ElMessage.error(error.response.data.message);
        isLoading.value = false;
    }
};

//生成歌词
const generatingWord = async () => {
    const fontData = {
        category: "lyricsGenerator",
        content: Music_generation.value.lyrics,
    };
    try {
        const res = await postMusicGenerator(fontData);
        console.log(res.data.data.params, "res");
        Music_generation.value.lyrics = res.data.data.params;
        ElMessage.success("生成歌词成功");
    } catch (error) {
        console.log(error, "error");
    }
};

const dialogVisible = ref(false);

const add = () => {
    dialogVisible.value = true;
};

const close = () => {
    dialogVisible.value = false;
};

/*进度条逻辑****************************************************************** */
const currentTrackIndex = ref(0);
const isPlaying = ref(false);
const progress = ref(0);
const currentTime = ref(0);
const duration = ref(0);
const isDragging = ref(false);

const audio = ref(null);

const currentTrack = computed(
    () => tracks.value[currentTrackIndex.value] || { audio_file: "" }
);
const canPrevTrack = computed(() => currentTrackIndex.value > 0);
const canNextTrack = computed(
    () => currentTrackIndex.value < tracks.value.length - 1
);
const canPlay = computed(() => tracks.value.length > 0);
const dialogStyle = computed(() => ({
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    backgroundImage: `url(${currentTrack.value.music_cover})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: "-1", // 修正属性名为小写
}));

const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
};

const formatTooltip = (value) => {
    return formatTime(value);
};

const togglePlay = () => {
    if (isPlaying.value) {
        audio.value.pause();
    } else {
        audio.value.play();
    }
    isPlaying.value = !isPlaying.value;
};

const prevTrack = () => {
    currentTrackIndex.value =
        (currentTrackIndex.value - 1 + tracks.value.length) % tracks.value.length;
    playTrack();
    // console.log('当前音乐:', currentTrack.value); // 获取当前音乐对象的属性
};

const nextTrack = () => {
    // currentTrackIndex.value = (currentTrackIndex.value + 1) % tracks.value.length;
    if (currentTrackIndex.value < tracks.value.length - 1) {
        currentTrackIndex.value++;
        playTrack();
    } else {
        isPlaying.value = false; // 停止播放状态
    }
};

const playTrack = () => {
    audio.value.pause(); // 暂停当前播放
    audio.value.currentTime = 0; // 重置当前时间
    audio.value.src = currentTrack.value?.music_url;
    audio.value.load(); // 确保音频文件被重新加载
    audio.value.oncanplaythrough = () => {
        audio.value
            .play()
            .then(() => {
                isPlaying.value = true;
            })
            .catch((error) => {
                console.error("Error playing audio:", error);
            });
    };
};

const updateTime = () => {
    // currentTime.value = audio.value.currentTime;
    // duration.value = audio.value.duration;
    // progress.value = (currentTime.value / duration.value) * 100;
    if (audio.value) {
        currentTime.value = audio.value.currentTime;
        duration.value = audio.value.duration;
        progress.value = (currentTime.value / duration.value) * 100;
    } else {
        console.error("audio element is not available");
    }
};

const seekTo = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const newProgress = (offsetX / rect.width) * 100;
    progress.value = newProgress;
    audio.value.currentTime = (newProgress / 100) * duration.value;
};

const seek = (value) => {
    audio.value.currentTime = value;
};

const startDrag = (event) => {
    isDragging.value = true;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
};

const onDrag = (event) => {
    window.requestAnimationFrame(() => {
        const rect = document
            .querySelector(".progress-container")
            .getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const newProgress = Math.min(
            Math.max((offsetX / rect.width) * 100, 0),
            100
        );
        progress.value = newProgress;
        audio.value.currentTime = (newProgress / 100) * duration.value;
    });
};

const stopDrag = () => {
    isDragging.value = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
};

onMounted(async () => {
    audio.value.addEventListener("loadedmetadata", () => {
        duration.value = audio.value.duration;
    });
    const storedTracks = localStorage.getItem("tracks");
    if (storedTracks) {
        tracks.value = JSON.parse(storedTracks);
    }
    await getVoiceSelectList();
    setTimeout(async () => {
        await getInstrumentalSelectList();
    }, 1000); // 延迟一秒
});

//下载音频
const downloadAudio = async () => {
    try {
        const response = await fetch(currentTrack.value.music_url);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = "audio.mp3"; // 你可以根据需要更改文件名
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.log(error);
    }
};

// 进去音色 和 伴奏

const VoiceSelectList = ref([]);
const InstrumentalSelectList = ref([]);

const getVoiceSelectList = async () => {
    try {
        const res = await getVoiceInstrumentalSelect("voice");
        VoiceSelectList.value = res.data.data.voice_ids;
    } catch (error) {
        console.log(error, "error");
    }
};

const getInstrumentalSelectList = async () => {
    try {
        const res = await getVoiceInstrumentalSelect("instrumental");
        InstrumentalSelectList.value = res.data.data.instrumental_ids;
    } catch (error) {
        console.log(error, "error");
    }
};
</script>

<style scoped>
/* :deep([data-v-c2070431]) {
    height: 88vh;
}

::deep([data-v-c2070431]) {
    height: 88vh;
}

v-deep[data-v-c2070431] {
    height: 88vh;
} */

.container {
    height: 84vh;
    /* overflow-x: auto; */
}

.left {
    height: 82%;
    padding: 10px;
}

.right {
    height: 100%;
    border-left: 1px solid #dcdfe6;
    padding: 5px;
}

textarea:focus {
    outline: none;
}

.DebuggingBench_textarea {
    width: 57vw;
    height: 22vh;
    font-size: 16px;
    resize: none;
    border: 1px solid #dcdfe6;
    border-radius: 5px;
    padding: 4px;
    transition: all 0.3s, height 0s;

    max-width: 100%;
    min-height: 32px;
    line-height: 1.5714285714285714;
    vertical-align: bottom;
    margin: 10px 0px;
}

/* 获得焦点 */
.DebuggingBench_textarea:focus {
    border-color: #3677f0;
}

.music_player {
    /* border: 1px solid #dcdfe6; */
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100px;
    padding: 5px;
}

.particulars {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    height: 100%;
}

.play_Operation {
    display: flex;
    align-items: center;
    width: 200px;
    justify-content: space-between;
}

.realPlayer {
    padding: 5px;
    /* margin-top: 8px; */
    /* border-top: 1px solid #dcdfe6; */
    /* background: #f1f3f4; */
    border-radius: 5px;
    position: relative;

    display: flex;
}

.audio_contetnt {
    width: 100%;
}

.music_time {
    text-align: center;
    margin-top: 10px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn_play {
    font-size: 40px;
    text-align: center;
}

.btn_list {
    font-size: 40px;
}

.opentime {
    height: 20px;
    margin-right: 20px;
    display: inline-block;
    font-size: 12px;
}

.endtime {
    height: 20px;
    margin-left: 20px;
    display: inline-block;
    font-size: 12px;
}

:deep(.el-slider__button) {
    width: 10px !important;
    height: 10px !important;
}

.PopupPlayer_Top {
    height: 360px;
    width: 70%;
    /* background: red; */
    display: flex;
    align-items: center;
    justify-content: space-evenly;
}

.PopupPlayer_button {
    height: 160px;
    width: 70%;
    /* background: yellow; */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    --tw-shadow: 16px 16px 40px 0 rgba(0, 0, 0, 0.1) !important;
    --tw-shadow-colored: 16px 16px 40px 0 var(--tw-shadow-color) !important;
    box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000),
        var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow) !important;
    --tw-ring-offset-shadow: 0 0 #0000;
    --tw-ring-shadow: 0 0 #0000;
    background-color: #ffffff0a !important;
    border-radius: 10px;
    margin-top: 20px;
}

.progress-container {
    position: relative;
    /* margin-top: 26px; */
    width: 96%;
    height: 4px;
    background-color: #ccc;
    cursor: pointer;
}

.progress-container:hover {
    height: 6px;
}

.progress-bar {
    height: 100%;
    background-color: #007bff;
}

.progress-thumb {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    background-image: url(../../../../../../assets/ellipse.png);
    background-size: 100% 100%;
    cursor: pointer;
    display: none;
    transform: translate(-50%, -50%);
}

.progress-container:hover .progress-thumb {
    display: block;
}

.disabled {
    pointer-events: none;
    opacity: 0.5;
    cursor: not-allowed;
}

.limitation_length {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline;
    width: 120px;
}

.custom-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.1);
    /* 半透明背景 */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1002;
    /* 确保弹窗在侧边栏之上 */
}

.custom-dialog {
    position: relative;
    width: 1000px;
    height: 90vh;
    border-radius: 10px;
    overflow: hidden;
    /* 确保背景图不会超出对话框边界 */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1), 0 6px 20px rgba(0, 0, 0, 0.1);
    /* 添加阴影效果 */
}

.dialog-content {
    position: relative;
    z-index: 1;
    /* 确保内容在背景图上面 */
    /* display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center; */
    height: 100%;
    backdrop-filter: blur(100px);
    padding: 10px 20px;
}

/* 添加动画效果 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
    transition: opacity 0.5s;
}

.dialog-fade-enter,
.dialog-fade-leave-to {
    opacity: 0;
}

.details {
    position: absolute;
    left: 134px;
    top: 4px;
    /* background: red; */
}
</style>
