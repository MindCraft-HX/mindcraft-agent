<template>
    <el-row :gutter="20" class="container">
        <!-- 左边 -->
        <el-col :span="16">
            <div class="left">
                <p>列表</p>
                <el-scrollbar max-height="670px">
                    <div class="bazaar_List">
                        <img class="avatar" src="../../../../../assets/default-avatar.png" alt="">
                        <div class="bazaar_content">
                            <div class="name">特朗普</div>
                            <div class="actions">
                                <div class="use-voice">使用声音</div>
                                <div class="copy-voice-id">
                                    <div class="link_img"></div>复制Voice ID
                                </div>
                            </div>
                        </div>
                    </div>
                </el-scrollbar>
            </div>
        </el-col>
        <!-- 右边 -->
        <el-col :span="8">
            <div class="right">
                <!-- 没有数据的情况 -->
                <!-- <div class="no-data">
                    <div class="Generated_audio"></div>
                    <div class="no-data-text" style="margin-top: 30px;">生成的音频</div>
                    <div class="no-data-text">将显示再此处</div>
                </div> -->
                <!-- 有数据的情况下 -->
                <div>
                    <p>您的文本</p>
                    <!-- <textarea class="Voice_textarea"></textarea> -->
                    <textarea class="DebuggingBench_textarea" placeholder="请输入语音描述"></textarea>
                    <el-button type="primary" style="margin-top: 20px;">创建</el-button>

                    <div
                        style="border-radius: 10px;border: 1px solid #DCDFE6;margin-top: 20px;padding: 2px;height: 13vh;">
                        <p style="margin-left: 12px;">特朗普</p>
                        <audio :src="audio_file" controls></audio>
                    </div>
                </div>
            </div>
        </el-col>
    </el-row>
</template>

<script setup>


</script>

<style scoped>
.container {
    height: 100vh;
}

.left {
    height: 82%;
    padding: 10px;
}

.right {
    height: 82%;
    border-left: 1px solid #DCDFE6;
    padding: 10px;
}

.bazaar_List {
    border: 1px solid #dcdfe6;
    padding: 10px;
    border-radius: 5px;
    height: 12vh;
    display: flex;
    margin-bottom: 15px;
}

.avatar {
    width: 110px;
    height: 110px;
    margin-right: 10px;
    border-radius: 10px;
}

.bazaar_content {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.name {
    font-weight: 600;
}

.actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.use-voice {
    background: #ECF5FF;
    border: 1px solid #DCDFE6;
    border-radius: 5px;
    padding: 3px;
}

.copy-voice-id {
    display: flex;
    color: #ABAAAA;
}

.link_img {
    width: 20px;
    height: 20px;
    background-image: url(../../../../../assets/link.png);
    background-size: 100% 100%;
    margin-right: 2px;
}

.Generated_audio {
    background-image: url(../../../../../assets/voice_frequency.png);
    background-size: 100% 100%;
    width: 120px;
    height: 120px;
}

.no-data {
    height: 83vh;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
}

.no-data-text {
    color: #909399;
    font-size: 18px;
}

textarea:focus {
    outline: none;
}

.DebuggingBench_textarea {
    width: 100%;
    height: 28vh;
    font-size: 16px;
    resize: none;
    border: 1px solid #dcdfe6;
    border-radius: 10px;
    padding: 4px;
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
</style>