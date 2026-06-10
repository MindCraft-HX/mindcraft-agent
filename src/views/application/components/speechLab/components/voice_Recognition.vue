<template>
    <el-row :gutter="20" class="container">
        <!-- 左边 -->
        <el-col :span="16">
            <div class="left">
                <el-tabs v-model="activeName" type="card" class="demo-tabs" @tab-click="handleClick">
                    <!-- 上传音频 -->
                    <el-tab-pane label="上传音频" name="first">
                        <div class="Upload_audio">
                            <div style="margin: 0 auto;margin-top: 76px;">
                                <audio class="audio_style" :src="audioSrc" controls></audio>
                            </div>
                            <div style="display: flex;justify-content: space-between;align-items: center;padding: 0px 26px;">
                                <el-button type="primary" plain style="font-size: 18px;"
                                    @click="uploadAudio">上传音频</el-button>
                                <input type="file" ref="audioInput" @change="handleAudioUpload" style="display: none;" :accept="fileAccept" />
                                <div style="flex: 1;font-size: 12px;color: gray;padding: 5px;">可选文件类型：{{ fileAccept }}</div>
                                <el-button type="primary" style="font-size: 18px;"
                                    @click="handleUploadAudio(audioSrc)">执行识别</el-button>
                            </div>
                        </div>

                    </el-tab-pane>
                    <!-- 录制音频 -->
                    <el-tab-pane label="录制音频" name="second">
                        <div class="recorded_Audio">
                            <div class="click_recorded">
                                <el-button type="danger" style="width: 48px;margin-right: 8px;"
                                    @click="toggleRecording">
                                    <svg class="icon" aria-hidden="true" style="font-size: 20px;">
                                        <use xlink:href="#icon-luzhi"></use>
                                    </svg>
                                </el-button>{{ isRecording ? '停止录制' : '开始录制' }}
                            </div>
                            <div style="text-align:center;">
                                <audio class="audio_style" :src="audioSrc2" controls autoplay></audio>
                            </div>
                            <div style="display: flex;justify-content: space-between;align-items: center;padding: 0px 26px;">
                                <el-button type="primary" plain style="font-size: 18px;"
                                    @click="uploadRecordedAudio">上传音频</el-button>
                                <input type="file" ref="audioInput2" @change="handleRecordedAudioUpload"
                                    style="display: none;" :accept="fileAccept" />
                                <div style="flex: 1;font-size: 12px;color: gray;padding: 5px;">可选文件类型：{{ fileAccept }}</div>
                                <el-button type="primary" style="font-size: 18px;"
                                    @click="handleRecordedAudio(audioSrc2)">执行识别</el-button>
                            </div>
                        </div>
                    </el-tab-pane>
                </el-tabs>
                <div>
                    <!-- <span style="color: #ABAAAA;font-size: 14px;margin-left: 10px;">模型转换耗时10s</span> -->
                    <div>语音转文字结果</div>
                    <textarea class="DebuggingBench_textarea" v-model="textarea_word"></textarea>
                </div>
            </div>
        </el-col>
        <!-- 右边 -->
        <el-col :span="8">
            <div class="right">
                <!-- <div>
                    <div>选择模型分类</div>
                    <el-select v-model="modelClassificationValue" placeholder="选择模型分类"
                        style="width: 94%;margin: 10px 0px;padding: 0px 8px;" @change="handleModelClassificationChange">
                        <el-option v-for="item in voice_ModelClassification" :key="item.value" :label="item.label"
                            :value="item.value" />
                    </el-select>
                </div> -->

                <div style="display: flex;align-items: center;justify-content: space-between;margin: 10px 0px;">
                    <div>多国语言</div>
                    <el-select v-model="modelClassificationValue" placeholder="分类选择"
                        style="width: 72%;margin: 10px 0px;padding: 0px 8px;" placement="bottom"
                        @change="handleModelClassificationChange">
                        <el-option v-for="item in voice_ModelClassification" :key="item.value" :label="item.label"
                            :value="item.value" />
                    </el-select>

                </div>
                <div style="display: flex;flex-wrap: wrap;margin-left: 8px;">
                    <div :class="['langue', { selectees2: selectedIndex2 === index }]"
                        v-for="(item, index) in filteredMultipleLanguages" :key="index" :title="item.name"
                        @click="selectLanguage(item.value, index, item.audioUrl)">
                        {{ item.name }}</div>
                </div>


                <div style="display: flex;align-items: center;justify-content: space-between;margin: 10px 0px;">
                    <div>中文方言</div>
                    <el-select v-model="provincialism" placeholder="分类选择"
                        style="width: 72%;margin: 10px 0px;padding: 0px 8px;" placement="bottom"
                        @change="handleModelClassificationChange">
                        <el-option v-for="item in voice_provincialism" :key="item.value" :label="item.label"
                            :value="item.value" />
                    </el-select>
                </div>
                <div style="display: flex;flex-wrap: wrap;margin-left: 8px;">
                    <div :class="['langue', { selectees2: selectedIndex2 === (index + 17) }]"
                        v-for="(item, index) in filteredChineseDialect" :key="index" :title="item.name"
                        @click="selectLanguage(item.value, index + 17, item.audioUrl)">
                        {{ item.name }}</div>
                </div>
            </div>
        </el-col>
    </el-row>
</template>

<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { getAsrList, postAsr, getAsrFile, getAsrTask } from '../../../../../api/application/VoiceDebuggingConsole.js';
import { ElMessage, ElLoading } from 'element-plus';

const resolvePublicAudio = (fileName) => {
    const relativePath = encodeURI(`${import.meta.env.BASE_URL}audio/${fileName}`);
    return new URL(relativePath, window.location.href).href;
};

const activeName = ref('first');

const audioSrc = ref("");
const audioSrcType = ref("");

const audioSrc2 = ref("");
const audioSrc2Type = ref("");
const audioDuration = ref(null);


const audioInput = ref(null);
const audioInput2 = ref(null);

const selectedIndex = ref(null);

const textarea_word = ref("");

const LanguageList = ref([]);

const modelClassificationValue = ref('tx_asr_recogSentence')

const voice_ModelClassification = [
    {
        value: 'tx_asr_recogSentence',
        label: '腾讯一句话识别',
    },
    {
        value: 'tx_asr_recogAudioLM',
        label: '腾讯大模型文件识别',
    },
    {
        value: 'bytedance_asr_recogSentence',
        label: '字节跳动一句话识别',
    },
]

const provincialism = ref('ali_asr_sensevoice')

const voice_provincialism = [
    {
        value: 'tx_asr_recogAudioLM',
        label: '腾讯大模型文件识别',
    },
    {
        value: 'ali_asr_sensevoice',
        label: '阿里SenseVoice',
    },
]




const handleModelClassificationChange = (val) => {
    console.log(val, 'val');
    selectedModel.value = "";
    selectedIndex2.value = null;
}

const multiple_Languages = ref([
    {
        category: 'tx_asr_recogSentence',
        params_list: [
            {
                name: "中文",
                value: "16k_zh",
                audioUrl: resolvePublicAudio('普通话.MP3'),
                // audioUrl: '../../../../../../public/audio/普通话.MP3',
            },
            {
                name: "英语",
                value: "16k_en",
                audioUrl: resolvePublicAudio('英文.wav'),
            },
            {
                name: "粤语",
                value: "16k_yue",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "日语",
                value: "16k_ja",
                audioUrl: resolvePublicAudio('日语.wav'),
            },
            {
                name: "韩语",
                value: "16k_ko",
                audioUrl: resolvePublicAudio('韩语.wav'),
            },
            {
                name: "越南语",
                value: "16k_vi",
                audioUrl: resolvePublicAudio('越南语.MP3'),
            },
            {
                name: "马来语",
                value: "16k_ms",
                audioUrl: resolvePublicAudio('马来语.MP3'),
            },
            {
                name: "印度尼西亚语",
                value: "16k_id",
                audioUrl: resolvePublicAudio('印尼语.MP3'),
            },
            {
                name: "菲律宾语",
                value: "16k_fil",
                audioUrl: resolvePublicAudio('菲律宾语.MP3'),

            },
            {
                name: "泰语",
                value: "16k_th",
                audioUrl: resolvePublicAudio('泰语.MP3'),
            },
            {
                name: "葡萄牙语",
                value: "16k_pt",
                audioUrl: resolvePublicAudio('葡萄牙语.MP3'),
            },
            {
                name: "土耳其语",
                value: "16k_tr",
                audioUrl: resolvePublicAudio('土耳其语.MP3'),
            },
            {
                name: "阿拉伯语",
                value: "16k_ar",
                audioUrl: resolvePublicAudio('阿拉伯语.MP3'),
            },
            {
                name: "西班牙语",
                value: "16k_es",
                audioUrl: resolvePublicAudio('西班牙语.wav'),
            },
            {
                name: "印地语",
                value: "16k_hi",
                audioUrl: resolvePublicAudio('印地语.MP3'),
            },
            {
                name: "法语",
                value: "16k_fr",
                audioUrl: resolvePublicAudio('法语.MP3'),
            },
            {
                name: "德语",
                value: "16k_de",
                audioUrl: resolvePublicAudio('德语.MP3'),
            },
        ]
    },
    {
        category: 'tx_asr_recogAudioLM',
        params_list: [
            {
                name: "中文",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('普通话.MP3'),
                // audioUrl: '../../../../../../public/audio/普通话.MP3',
            },
            {
                name: "英语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('英文.wav'),
            },
            {
                name: "粤语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "日语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('日语.wav'),
            },
            {
                name: "韩语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('韩语.wav'),
            },
            {
                name: "越南语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('越南语.MP3'),
            },
            {
                name: "马来语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('马来语.MP3'),
            },
            {
                name: "印度尼西亚语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('印尼语.MP3'),
            },
            {
                name: "菲律宾语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('菲律宾语.MP3'),

            },
            {
                name: "泰语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('泰语.MP3'),
            },
            {
                name: "葡萄牙语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('葡萄牙语.MP3'),
            },
            {
                name: "土耳其语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('土耳其语.MP3'),
            },
            {
                name: "阿拉伯语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('阿拉伯语.MP3'),
            },
            {
                name: "西班牙语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('西班牙语.wav'),
            },
            {
                name: "印地语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('印地语.MP3'),
            },
            {
                name: "法语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('法语.MP3'),
            },
            {
                name: "德语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('德语.MP3'),
            },
        ]
    },
    {
        category: 'bytedance_asr_recogSentence',
        params_list: [
            {
                name: "中文",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('普通话.MP3'),
                // audioUrl: '../../../../../../public/audio/普通话.MP3',
            },
            {
                name: "英语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('英文.wav'),
            },
            {
                name: "粤语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "日语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('日语.wav'),
            },
            {
                name: "韩语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('韩语.wav'),
            },
            {
                name: "越南语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('越南语.MP3'),
            },
            {
                name: "马来语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('马来语.MP3'),
            },
            {
                name: "印度尼西亚语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('印尼语.MP3'),
            },
            {
                name: "菲律宾语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('菲律宾语.MP3'),

            },
            {
                name: "泰语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('泰语.MP3'),
            },
            {
                name: "葡萄牙语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('葡萄牙语.MP3'),
            },
            {
                name: "土耳其语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('土耳其语.MP3'),
            },
            {
                name: "阿拉伯语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('阿拉伯语.MP3'),
            },
            {
                name: "西班牙语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('西班牙语.wav'),
            },
            {
                name: "印地语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('印地语.MP3'),
            },
            {
                name: "法语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('法语.MP3'),
            },
            {
                name: "德语",
                value: "bytedance_asr_recogSentence",
                audioUrl: resolvePublicAudio('德语.MP3'),
            },
        ]
    },
    {
        category: 'ali_asr_sensevoice',
        params_list: [
            {
                name: "中文",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('普通话.MP3'),
            },
            {
                name: "英语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('英文.wav'),
            },
            {
                name: "粤语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "日语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('日语.wav'),
            },
            {
                name: "韩语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('韩语.wav'),
            },
            {
                name: "越南语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('越南语.MP3'),
            },
            {
                name: "马来语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('马来语.MP3'),
            },
            {
                name: "印度尼西亚语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('印尼语.MP3'),
            },
            {
                name: "菲律宾语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('菲律宾语.MP3'),

            },
            {
                name: "泰语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('泰语.MP3'),
            },
            {
                name: "葡萄牙语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('葡萄牙语.MP3'),
            },
            {
                name: "土耳其语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('土耳其语.MP3'),
            },
            {
                name: "阿拉伯语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('阿拉伯语.MP3'),
            },
            {
                name: "西班牙语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('西班牙语.wav'),
            },
            {
                name: "印地语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('印地语.MP3'),
            },
            {
                name: "法语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('法语.MP3'),
            },
            {
                name: "德语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('德语.MP3'),
            },
        ]
    },
]); //多国语言

// 济南话、天津话、石家庄话、黑龙江话、吉林话、辽宁话
const chinese_Dialect = ref([
    {
        category: 'tx_asr_recogSentence',
        params_list: [
            {
                name: "北京话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('北京话.MP3'),
            },
            {
                name: "粤语",
                value: "16k_yue",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "上海话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('上海话.MP3'),
            },
            {
                name: "四川话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('四川话.MP3'),
            },
            {
                name: "武汉话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('武汉话.MP3'),
            },
            {
                name: "贵阳话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('贵阳话.MP3'),
            },
            {
                name: "昆明话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('昆明话.MP3'),
            },
            {
                name: "西安话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('西安话.MP3'),
            },
            {
                name: "郑州话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('郑州话.MP3'),
            },
            {
                name: "太原话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('太原话.MP3'),
            },
            {
                name: "兰州话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('兰州话.MP3'),
            },
            {
                name: "银川话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('银川话.MP3'),
            },
            {
                name: "西宁话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('西宁话.MP3'),
            },
            {
                name: "南京话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('南京话.MP3'),
            },
            {
                name: "合肥话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('合肥话.MP3'),
            },
            {
                name: "南昌话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('南昌话.MP3'),
            },
            {
                name: "长沙话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('长沙话.MP3'),

            },
            {
                name: "苏州话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('苏州话.MP3'),

            },
            {
                name: "杭州话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('杭州话.MP3'),
            },
            {
                name: "济南话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('济南话.MP3'),
            },
            {
                name: "天津话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('天津话.MP3'),
            },
            {
                name: "辽宁话",
                value: "16k_zh_dialect",
                audioUrl: resolvePublicAudio('辽宁话.MP3'),
            },
        ]
    },
    {
        category: 'tx_asr_recogAudioLM',
        params_list: [
            {
                name: "北京话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('北京话.MP3'),
            },
            {
                name: "粤语",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "上海话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('上海话.MP3'),
            },
            {
                name: "四川话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('四川话.MP3'),
            },
            {
                name: "武汉话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('武汉话.MP3'),
            },
            {
                name: "贵阳话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('贵阳话.MP3'),
            },
            {
                name: "昆明话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('昆明话.MP3'),
            },
            {
                name: "西安话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('西安话.MP3'),
            },
            {
                name: "郑州话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('郑州话.MP3'),
            },
            {
                name: "太原话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('太原话.MP3'),
            },
            {
                name: "兰州话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('兰州话.MP3'),
            },
            {
                name: "银川话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('银川话.MP3'),
            },
            {
                name: "西宁话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('西宁话.MP3'),
            },
            {
                name: "南京话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('南京话.MP3'),
            },
            {
                name: "合肥话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('合肥话.MP3'),
            },
            {
                name: "南昌话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('南昌话.MP3'),
            },
            {
                name: "长沙话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('长沙话.MP3'),

            },
            {
                name: "苏州话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('苏州话.MP3'),

            },
            {
                name: "杭州话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('杭州话.MP3'),
            },
            {
                name: "济南话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('济南话.MP3'),
            },
            {
                name: "天津话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('天津话.MP3'),
            },
            {
                name: "辽宁话",
                value: "16k_zh_large",
                audioUrl: resolvePublicAudio('辽宁话.MP3'),
            },
        ]
    },
    {
        category: 'ali_asr_sensevoice',
        params_list: [
            {
                name: "北京话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('北京话.MP3'),
            },
            {
                name: "粤语",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('粤语.MP3'),
            },
            {
                name: "上海话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('上海话.MP3'),
            },
            {
                name: "四川话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('四川话.MP3'),
            },
            {
                name: "武汉话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('武汉话.MP3'),
            },
            {
                name: "贵阳话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('贵阳话.MP3'),
            },
            {
                name: "昆明话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('昆明话.MP3'),
            },
            {
                name: "西安话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('西安话.MP3'),
            },
            {
                name: "郑州话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('郑州话.MP3'),
            },
            {
                name: "太原话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('太原话.MP3'),
            },
            {
                name: "兰州话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('兰州话.MP3'),
            },
            {
                name: "银川话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('银川话.MP3'),
            },
            {
                name: "西宁话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('西宁话.MP3'),
            },
            {
                name: "南京话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('南京话.MP3'),
            },
            {
                name: "合肥话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('合肥话.MP3'),
            },
            {
                name: "南昌话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('南昌话.MP3'),
            },
            {
                name: "长沙话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('长沙话.MP3'),

            },
            {
                name: "苏州话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('苏州话.MP3'),

            },
            {
                name: "杭州话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('杭州话.MP3'),
            },
            {
                name: "济南话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('济南话.MP3'),
            },
            {
                name: "天津话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('天津话.MP3'),
            },
            {
                name: "辽宁话",
                value: "sensevoice-v1",
                audioUrl: resolvePublicAudio('辽宁话.MP3'),
            },
        ]
    },

]);    //中文方言


const filteredMultipleLanguages = computed(() => {
    const selectedCategory = modelClassificationValue.value;
    const categoryData = multiple_Languages.value.find(item => item.category === selectedCategory);
    // console.log(categoryData,'categoryData>');
    return categoryData ? categoryData.params_list : [];
});

const filteredChineseDialect = computed(() => {
    const selectedCategory = provincialism.value;
    const categoryData = chinese_Dialect.value.find(item => item.category === selectedCategory);
    // console.log(categoryData,'categoryData>>');
    return categoryData ? categoryData.params_list : [];
});

const selectedIndex2 = ref(null);
const selectedModel = ref("");
const audio_fileList = ref([]);

// const audioElement = ref(null);

onMounted(async () => {
    // await getLanguageList();
    await getAsrFileList();

    audioSrc.value = localStorage.getItem('audioSrc');
    // audioSrc2.value = localStorage.getItem('audioSrc2');

});

const getAsrFileList = async () => {
    try {
        const res = await getAsrFile();
        audio_fileList.value = res.data.data;
    } catch (error) {
        console.log(error, 'error');
    }
};


const handleClick = () => { };

const uploadAudio = () => {
    audioInput.value.click();
};

const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    console.log(file, 'file');
    if (file) {
        console.log(file, 'file');
        audioSrc.value = URL.createObjectURL(file);
        console.log(event.target.value, 'event.target.value');
        audioSrcType.value = file.name
        // 重置文件输入元素的值
        event.target.value = null;
    }
};

const uploadRecordedAudio = () => {
    audioInput2.value.click()
}

const handleRecordedAudioUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
        audioSrc2.value = URL.createObjectURL(file);
        audioSrc2Type.value = file.name
        // 重置文件输入元素的值
        event.target.value = null;
    }
}

const setAudioSrc = (value, index) => {
    if (selectedIndex.value === index) {
        selectedIndex.value = null;
        audioSrc.value = "";
        return
    }
    audioSrc.value = value;
    selectedIndex.value = index;
};


const Speech_model = ref('');  //点击模型选择

const selectLanguage = (value, index, audioUrl) => {
    // console.log(index, 'index>>>>>>>..');
    // console.log(value, 'value>>>>>>');

    if (selectedIndex2.value == index) {
        selectedIndex2.value = null;
        selectedModel.value = "";
        audioSrc.value = ""
        return
    }
    selectedIndex2.value = index;
    selectedModel.value = value;
    audioSrc.value = audioUrl;
    audioSrcType.value = new URL(audioUrl).pathname

    // 查找对应的 category
    let category = '';
    for (const item of multiple_Languages.value) {
        const found = item.params_list.find(param => param.value === value);
        if (found) {
            category = item.category;
            break;
        }
    }
    if (!category) {
        for (const item of chinese_Dialect.value) {
            const found = item.params_list.find(param => param.value === value);
            if (found) {
                category = item.category;
                break;
            }
        }
    }
    Speech_model.value = category;
    console.log(Speech_model.value,'Speech_model.value');
}

const fullscreenLoading = ref(false);

let loadingInstance = null;
watch(fullscreenLoading, (newValue) => {
    if (newValue) {
        // 显示Loading，可以通过target参数指定局部DOM元素
        loadingInstance = ElLoading.service({
            fullscreen: true,
            text: "识别中...",
        });
    } else {
        // 隐藏Loading
        if (loadingInstance) {
            loadingInstance.close();
        }
    }
});

const handleUploadAudio = async (audioSource) => {
    if (audioSrc.value === "") {
        ElMessage.warning('音频源不能为空');
        return;
    }
    if (selectedModel.value === "") {
        ElMessage.warning('请选择根据音频，选择语言');
        return;
    }
    const response = await fetch(audioSrc.value);
    const blob = await response.blob();

    const formData = new FormData();
    if (Speech_model.value === 'tx_asr_recogSentence') {
        formData.append("file", blob, audioSrcType.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
        formData.append("format", audioSrcType.value.match(/\.([^.]+)$/)?.[1].toLowerCase() || "");
        formData.append("sample_rate", "8000");
    } else if (Speech_model.value === 'tx_asr_recogAudioLM') {
        formData.append("file", blob, audioSrcType.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
        formData.append("channel_num", 1);
        formData.append("text_format", 0);
    } else if (Speech_model.value === 'bytedance_asr_recogSentence') {
        formData.append("file", blob, audioSrcType.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
        formData.append("format", audioSrcType.value.match(/\.([^.]+)$/)?.[1].toLowerCase() || "");
        formData.append("sample_rate", "16000");
    } else if (Speech_model.value === 'ali_asr_sensevoice') {
        formData.append("file", blob, audioSrcType.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
    }


    try {
        fullscreenLoading.value = true;
        const res = await postAsr(formData);
        textarea_word.value = res.data.data.text;
        if (res.data.data.text || res.data.data.text == "") {
            ElMessage.success('识别成功');
            fullscreenLoading.value = false;
        }

        if (res.status === 201) {
            fullscreenLoading.value = true;
            ElMessage.warning('识别中 请稍等');
            setTimeout(async () => {
                try {
                    const response = await getAsrTask(res.data.data.task_id);
                    textarea_word.value = response.data.data.text;
                    console.log('走进来了');
                    ElMessage.success('识别成功');
                    fullscreenLoading.value = false;
                } catch (error) {
                    console.log(error, 'error');
                    fullscreenLoading.value = false;
                }
            }, 5000)
        }
        localStorage.setItem('audioSrc', audioSrc.value);
    } catch (error) {
        console.log(error);
        console.log(error.response.data.message, "error");
        ElMessage.warning(error.response.data.message);
        fullscreenLoading.value = false; s
    }
};

const handleRecordedAudio = async (audioSource) => {
    if (audioSrc2.value === "") {
        ElMessage.warning('音频源不能为空');
        return;
    }
    if (selectedModel.value === "") {
        ElMessage.warning('请选择根据音频，选择语言');
        return;
    }
    const response = await fetch(audioSrc2.value);
    const blob = await response.blob();
    const formData = new FormData();

    if (Speech_model.value === 'tx_asr_recogSentence') {
        formData.append("file", blob, audioSrc2Type.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
        formData.append("format", audioSrc2Type.value.match(/\.([^.]+)$/)?.[1].toLowerCase() || "");
        formData.append("sample_rate", "8000");
    } else if (Speech_model.value === 'tx_asr_recogAudioLM') {
        formData.append("file", blob, audioSrc2Type.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
        formData.append("channel_num", 1);
        formData.append("text_format", 0);
    } else if (Speech_model.value === 'ali_asr_sensevoice') {
        formData.append("file", blob, audioSrc2Type.value || "recording.amr");
        formData.append("model", selectedModel.value);
        formData.append("category", Speech_model.value);
    }


    try {
        fullscreenLoading.value = true;
        const res = await postAsr(formData);
        textarea_word.value = res.data.data.text;
        if (res.data.data.text || res.data.data.text == "") {
            ElMessage.success('识别成功');
            fullscreenLoading.value = false;
        }
        if (res.status === 201) {
            ElMessage.warning('识别中 请稍等');
            fullscreenLoading.value = true;
            setTimeout(async () => {
                try {
                    const response = await getAsrTask(res.data.data.task_id);
                    textarea_word.value = response.data.data.text;
                    console.log('走进来了');
                    ElMessage.success('识别成功');
                    fullscreenLoading.value = false;
                } catch (error) {
                    console.log(error, 'error');
                    fullscreenLoading.value = false;
                }
            }, 5000)

        }
    } catch (error) {
        console.log(error);
        fullscreenLoading.value = false;
    }
};


/*录音*********************************************************************************************** */
const isRecording = ref(false);
let mediaRecorder;
let audioChunks = [];

const toggleRecording = async () => {
    if (isRecording.value) {
        // 停止录音
        mediaRecorder.stop();
        isRecording.value = false;
        ElMessage.success('录音成功');
    } else {
        // 开始录音
        ElMessage.warning('开始录音');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('当前浏览器不支持录音功能');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioSrc2.value = URL.createObjectURL(audioBlob);
            };

            mediaRecorder.start();
            isRecording.value = true;
        } catch (error) {
            console.error('录音失败:', error);
        }
    }
};


/******** 获取可上传的文件类型 *******/
const aseList = ref([])
const getAsrListInfo = async () => {
    try {
        const res = await getAsrList();
        const data = res.data.data;
        data.forEach((item, index) => {
            if(item.category == "tx_asr_recogSentence"){
                const list = item.params_list.find((item) => item.paramName == "format")
                if(list) {
                    aseList.value.push({
                        category: item.category,
                        list: list.dataRange
                    })
                }
            }
        })
        console.log(aseList.value, '模型列表');
    } catch (error) {
        console.log(error, 'error');
    }
};
getAsrListInfo()
const fileTypes = computed(() => {
    let list = ["wav"]
    if(aseList.value.some(item => item.category == Speech_model.value)) {
        list = aseList.value.find(item => item.category == Speech_model.value).list
    }
    return list
})
const fileAccept = computed(() => {
    return fileTypes.value.map(item => `.${item}`).join(',')
})
/******** 获取可上传的文件类型 *******/


</script>

<style scoped>
.container {
    /* height: 100vh; */
}

.left {
    height: 82%;
    padding: 10px;
}

.right {
    height: 82%;
    border-left: 1px solid #DCDFE6;
    padding: 5px;
}

.Upload_audio {
    border: 1px solid #dcdfe6;
    padding: 10px;
    border-radius: 5px;
    height: 28vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    margin-bottom: 15px;
}

.recorded_Audio {
    border: 1px solid #dcdfe6;
    padding: 10px;
    border-radius: 5px;
    height: 28vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    margin-bottom: 15px;
}

.top_language {
    border: 1px solid #dcdfe6;
    padding: 4px;
    border-radius: 15px;
    font-size: 14px;
    width: 6vw;
    height: 2vh;
    margin-right: 5px;
    text-align: center;
    cursor: pointer;
}

textarea:focus {
    outline: none;
}

.DebuggingBench_textarea {
    width: 98%;
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
    margin-top: 10px;
}

/* 获得焦点 */
.DebuggingBench_textarea:focus {
    border-color: #3677f0;
}

.click_recorded {
    height: 12vh;
    margin: 0 auto;
    line-height: 20vh;
}

.langue {
    border: 1px solid #dcdfe6;
    padding: 4px;
    border-radius: 5px;
    font-size: 14px;
    width: calc(30% - 10px);
    min-height: 2vh;
    margin-right: 5px;
    text-align: center;
    margin-bottom: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
}

audio::-webkit-media-controls-enclosure {
    background-color: unset;
}

.audio_style {
    background: #E8FFF3;
    border-radius: 40px;
    width: 400px;
}

/* .demo-tabs{

} */
:deep(.demo-tabs>.el-tabs__header .el-tabs__item.is-active) {
    background-color: #ECF5FF;
    /* 替换为您想要的颜色 */
    border-bottom: 3px solid;
}

/* .selectees {
    border: 1px solid #409EFF;
    background: #409EFF;
    color: #ffffff;
} */

.selectees2 {
    border: 1px solid #409EFF;
    background: #409EFF;
    color: #ffffff;
}
</style>
