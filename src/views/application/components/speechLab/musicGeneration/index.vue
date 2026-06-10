<template>
    <div>
        <!-- 上面 -->
        <div style="height: 58px;width: 100%;display: flex;">
            <p v-for="(title, index) in titles" :key="index" :class="['App-title', { active: activeIndex === index }]"
                @click="setActive(index)" style="margin-right: 10px;">
                {{ title }}
            </p>
        </div>
        <div style="width: 100%;">

            <!-- <el-row :gutter="20" class="container">
                <el-col :span="16">
                    <div class="left">
                        <MelodyForge v-show="activeIndex === 0" />
                        <AccompanimentCreator v-show="activeIndex === 1" />
                        <TimbreTuner v-show="activeIndex === 2" />
                    </div>
                </el-col>
                <el-col :span="8">
                    <div class="right">
                       <RightMusic_Personal />
                    </div>
                </el-col>
            </el-row> -->


            <MelodyForge v-if="activeIndex === 0" />
            <AccompanimentCreator v-else-if="activeIndex === 1" />
            <TimbreTuner v-else="activeIndex === 2" />

        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { Search } from "@element-plus/icons-vue";
import AccompanimentCreator from './components/AccompanimentCreator.vue';
import MelodyForge from './components/MelodyForge.vue';
import TimbreTuner from './components/TimbreTuner.vue';
import RightMusic_Personal from './components/RightMusic_Personal.vue'

// 按钮点击  '语音克隆','语音市场'
const titles = ['音乐生成', '伴奏/音色生成', '我的'];
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
    padding: 5px;
}
</style>