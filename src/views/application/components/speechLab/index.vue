<template>
    <div style="height: 100%;display: flex;">
      <sidebar title='AI语音实验室' v-model:menuType="activeIndex" :menuList="menuList">
      </sidebar>
        <!-- 上面 -->
        <!-- <div style="height: 58px;width: 100%;display: flex;">
            <p v-for="(title, index) in titles" :key="index" :class="['App-title', { active: activeIndex === index }]"
                @click="setActive(index)" style="margin-right: 10px;">
                {{ title }}
            </p>
        </div> -->
        <!-- 下面 -->
        <!-- <div style="width: 100%;"> -->
            <!-- <VoiceDebuggingConsole v-if="activeIndex === 0" /> -->
            <!-- <Voice v-if="activeIndex === 2" /> -->
            <!-- <voiceCloning  v-if="activeIndex === 2" />
            <VoiceMarket v-if="activeIndex === 3" /> -->
            <!-- <VoiceRecognition v-if="activeIndex === 1" /> -->
            <!-- <soundCloning v-if="activeIndex === 2" /> -->
        <!-- </div> -->

        <div style="width: 100%;display: flex;flex-direction: column;padding: 12px;flex: 1;min-width: 0;">
          <component :is="menuList[activeIndex].component" ></component>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import sidebar from "@/views/application/components/sidebar.vue";
import SpeechModelOverview from './components/SpeechModelOverview.vue';
import Voice from './components/Voice.vue';
import voiceCloning from './components/voice_Cloning.vue';
import VoiceMarket from './components/voice_Market.vue';
import VoiceDebuggingConsole from './components/VoiceDebuggingConsole.vue';
import VoiceRecognition from './components/voice_Recognition.vue';
import soundCloning from './components/sound_cloning.vue';
import MelodyForge from './musicGeneration/components/MelodyForge.vue';
import AccompanimentCreator from './musicGeneration/components/AccompanimentCreator.vue';
import TimbreTuner from './musicGeneration/components/TimbreTuner.vue';

const menuList = [
  { name: "语音合成", component: VoiceDebuggingConsole, },
  { name: "语音识别", component: VoiceRecognition, },
  { name: "声音克隆", component: soundCloning, },
  { name: "音乐生成", component: MelodyForge, },
  { name: "伴奏/音色生成", component: AccompanimentCreator, },
  { name: "我的", component: TimbreTuner, },
]

// 按钮点击  '语音克隆','语音市场'
const titles = ['语音合成','语音识别','声音克隆'];
// 'Voice语音'
const activeIndex = ref(0);

const setActive = (index) => {
    activeIndex.value = index;
};

</script>

<style scoped>
.App-title {
    background: #F9F9F9;
    border-radius: 16px;
    border: 1px solid #e8e9fb;
    text-align: center;
    width: 160px;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.App-title.active {
    background: #FFFFFF;
    color: #107EFE;
    box-shadow: 0 0 10px #e8e9fb;
}
.App-title:hover {
  background-color: #FFFFFF;
  /* 鼠标悬停时的背景颜色 */
}
</style>