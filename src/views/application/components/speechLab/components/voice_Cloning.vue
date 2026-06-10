<template>
    <el-row :gutter="20" class="container">
        <!-- 左边 -->
        <el-col :span="16">
            <div class="left">
                <p>声音名称</p>
                <el-input v-model="audioName" placeholder="填写声音名称" />
                <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick" style="margin-top: 10px">
                    <!-- 上传 -->
                    <el-tab-pane label="上传音频" name="first">
                        <!-- 上传音频 -->
                        <div class="Upload_audio">
                            <div style="display: flex;align-items: center;cursor: pointer" @click="triggerFileUpload">
                                <img src="../../../../../assets/uploading.png" alt=""
                                    style="width: 56px; height: 42px;margin-right: 8px;" />
                                <div style="color:#0C727A;font-weight: 600;">点击上传音频</div>
                                <input type="file" ref="fileInput" style="display: none;" @change="handleFileUpload"
                                    accept="audio/*" />
                            </div>
                            <div style="color: #ABAAAA;">提示：不超过150Mb，时长最短10秒，最长45秒，推荐25秒</div>
                        </div>
                        <!-- 音频列表 -->
                        <el-scrollbar max-height="300px">
                            <div class="audio_List">
                                <div style="display: flex;align-items: center;justify-content: center;">华妃的声音<span
                                        style="color: #ABAAAA;">(15Mb,20秒)</span></div>
                                <div>
                                    <el-button type="primary" :icon="VideoPlay" plain
                                        style="width:20px;font-size: 20px;" />
                                    <el-button type="danger" :icon="Delete" plain style="width:20px;" />
                                </div>
                            </div>
                        </el-scrollbar>

                        <el-button type="primary" style="margin-top: 20px;">创建</el-button>



                    </el-tab-pane>
                    <!-- 录制 -->
                    <el-tab-pane label="录制音频" name="second">
                        <div class="recorded_Audio">
                            <div style="display: flex;align-items: center;font-weight: 600;cursor: pointer"
                                @click="startRecording">
                                <el-button type="danger" style="width: 52px;margin-right: 8px;">
                                    <svg class="icon" aria-hidden="true" style="font-size: 20px;">
                                        <use xlink:href="#icon-luzhi"></use>
                                    </svg>
                                </el-button>
                                点击开始录制
                            </div>
                            <div style="color:#ABAAAA;margin: 10px 0px;">请朗读下方写的整段话并录音,生成专属语音</div>
                            <div class="reading_Content">植物的根系不仅吸收水分和养分,还通过固定土壤来防止水土流失,这对保持生态环境的稳定具有重要意义</div>
                        </div>
                        <el-button type="primary" style="margin-top: 20px;">创建</el-button>
                        <a ref="downloadLink" style="display: none;">下载录制的音频</a>

                    </el-tab-pane>
                </el-tabs>
            </div>
        </el-col>
        <!-- 右边 -->
        <el-col :span="8">
            <div class="right">
                <p>我的声音</p>
                <!-- 无声音的 -->
                <!-- <div class="silent">
                    <div class="background"></div>
                </div> -->
                <!-- 有声音的 -->
                <div class="sound">
                    <el-scrollbar max-height="800px">
                    <div class="sound_List">
                        <div>梅西</div>
                        <div>
                            <el-button type="primary" :icon="VideoPlay"  plain style="width:20px;font-size: 20px;" />
                            <el-button type="info" :icon="Link" plain style="width:20px;" />
                        </div>
                    </div>
                </el-scrollbar>
                </div>

            </div>
        </el-col>
    </el-row>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { Edit, Delete, VideoPlay,Link } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";


const activeName = ref("first");
const audioName = ref("")
const fileInput = ref(null);
const downloadLink = ref(null);


const handleClick = () => { };

const triggerFileUpload = () => {
    fileInput.value.click();
};

const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
        // 处理文件上传逻辑
        console.log('上传的文件:', file);
    }
};

//音频录制
const mediaRecorder = ref(null);
const audioChunks = ref([]);

const startRecording = async () => {
    if (!mediaRecorder.value) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.value = new MediaRecorder(stream);

            mediaRecorder.value.ondataavailable = (event) => {
                audioChunks.value.push(event.data);
            };

            mediaRecorder.value.onstop = async () => {
                const audioBlob = new Blob(audioChunks.value, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                // const audio = new Audio(audioUrl);
                // audio.play();

                // await nextTick(); // 确保 DOM 元素已经被渲染
                // // 设置下载链接
                // downloadLink.value.href = audioUrl;
                // downloadLink.value.download = 'recording.wav';
                // downloadLink.value.style.display = 'block';
                // downloadLink.value.click();
                // downloadLink.value.style.display = 'none';
                // 你可以在这里处理录制的音频文件，例如上传到服务器
                console.log('录制的音频文件:', audioBlob);
            };

            mediaRecorder.value.start();
            console.log('开始录制');
            ElMessage.success("开始录制");
        } catch (err) {
            console.error('录制音频失败:', err);
        }
    } else {
        mediaRecorder.value.stop();
        mediaRecorder.value = null;
        audioChunks.value = [];
        console.log('停止录制');
        ElMessage.info("停止录制");
    }
};

</script>

<style scoped>
.container {
    height: 100vh;
    /* 使容器高度为100% */
}

.left {
    /* background: yellow; */
    height: 82%;
    /* 使div高度为100% */
    padding: 10px;
}

.right {
    /* background: red; */
    height: 82%;
    /* 使div高度为100% */
    border-left: 1px solid #dcdfe6;
    padding: 10px;
}

.Upload_audio {
    border: 1px solid #dcdfe6;
    border-radius: 5px;
    height: 12vh;
    padding: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
}

.audio_List {
    margin-top: 15px;
    border: 1px solid #dcdfe6;
    border-radius: 5px;
    padding: 10px;
    display: flex;
    justify-content: space-between;
}

.recorded_Audio {
    border: 1px solid #dcdfe6;
    border-radius: 5px;
    height: 20vh;
    padding: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
}

.reading_Content {
    border: 1px solid #dcdfe6;
    border-radius: 5px;
    padding: 20px 6px;
    background: #ECF5FF;
    color: #107EFE;
}

.sound {
    /* background: red; */
    height: 76vh;
}

.sound_List {
    border: 1px solid #dcdfe6;
    border-radius: 5px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
}

.silent {
    display: flex;
}


.background {
    background-image: url(../../../../../assets/silent.png);
    background-size: 100% 100%;
    width: 108px;
    height: 108px;
    line-height: 108px;
    margin: auto;
}
</style>
