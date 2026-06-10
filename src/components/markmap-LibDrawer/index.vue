<template>
    <div>
        <!-- 抽屉 -->
        <el-drawer v-model="isDrawerVisible" title="展示图表" :with-header="false" size="80%" @open="initializeMarkmap"
            @close="destroyMarkmap">
            <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 5px;
        ">
                <div style="color: #a5aeae">思维导图：</div>
                <div>
                    <!-- 点击展示 -->
                    <el-popover placement="bottom" :width="800" trigger="click">
                        <template #reference>
                            <el-button :icon="Hide" type="primary">图表语法代码</el-button>
                        </template>
                        <codemirror :initialCode="initialCode" />
                    </el-popover>
                    <!-- 下载 -->
                    <el-button type="primary" @click="retryRequest">重试</el-button>
                    <el-button type="primary" :icon="Download" @click="downloadImage">图片</el-button>
                    <!-- <el-button type="primary" :icon="Download" @click="downloadPDF">PDF文件</el-button> -->
                    <el-button type="primary" @click="HitReset">复位</el-button>
                    <!-- 放大缩小 -->
                    <el-button style="width: 28px; height: 28px" :icon="Plus" circle @click="zoomIn" type="primary"
                        plain />
                    <el-button style="width: 28px; height: 28px" :icon="Minus" circle @click="zoomOut" type="primary"
                        plain />
                </div>
            </div>
            <!-- 渲染流程图  -->
            <div class="markmap-container">
                <svg class="markmap-svg" id="markmap-svgId" ref="svgElement"></svg>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, watchEffect } from "vue";
import { Plus, Minus, Download, Hide } from "@element-plus/icons-vue";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';
import codemirror from '../codemirror/index.vue';




const initValue = ref(`# 饮食流程图
## 准备阶段
- 选择食材
  - 蔬菜
  - 肉类
  - 谷物
- 购买食材
  - 超市
  - 市场
  - 在线购物

## 烹饪阶段
- 清洗食材
- 切割食材
- 烹饪方法
  - 炒
  - 煮
  - 烤
  - 蒸

## 享用阶段
- 摆盘
- 品尝
- 分享

## 清理阶段
- 清洗餐具
- 垃圾分类
- 清洁厨房

`);

const isDrawerVisible = ref(false); //弹窗开关

const markmapInstance = ref(null);
const svgElement = ref(null);
const markdownContent = ref("");
const initialCode = ref("")

const transformer = new Transformer();


const props = defineProps({
    MarkmapLibObj:{
        type:String
    }
});

const emit = defineEmits(["resetChart"]);


watch(()=>props.MarkmapLibObj,(val)=>{
  initialCode.value = val;
},{immediate:true})



const updateMarkmap = () => {
    const { root } = transformer.transform(markdownContent.value);
    markmapInstance.value.setData(root);
    markmapInstance.value.fit();
};

const initializeMarkmap = () => {
    // 初始化 markmap 思维导图
    markmapInstance.value = Markmap.create(svgElement.value);
    markdownContent.value = props.MarkmapLibObj;
    // 更新思维导图渲染
    updateMarkmap();
};

const HitReset = () => markmapInstance.value.fit();

const zoomIn = () => markmapInstance.value.rescale(1.25);

const zoomOut = () => markmapInstance.value.rescale(0.8);

const destroyMarkmap = () => {
    // 清理 markmap 实例
    if (markmapInstance.value) {
        markmapInstance.value = null;
    }
    if (svgElement.value) {
        svgElement.value.innerHTML = ""; // 清空 SVG 内容
    }
    markdownContent.value = "";
};
const opneMarkmapLibDrawer = () => {
    isDrawerVisible.value = true;
};

// 下载图片
const downloadImage = () => {
    const svg = svgElement.value;
    const width = svg.getBoundingClientRect().width;
    const height = svg.getBoundingClientRect().height;
    covertSVG2Image(svg, "思维导图", width, height);
};
const covertSVG2Image = (node, name, width, height, type = 'png') => {
    let serializer = new XMLSerializer()
    let source = '<?xml version="1.0" standalone="no"?>\r\n' + serializer.serializeToString(node)
    let image = new Image()
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
    let canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    let context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 10000, 10000)
    image.onload = function () {
        context.drawImage(image, 0, 0)
        let a = document.createElement('a')
        a.download = `${name}.${type}`
        a.href = canvas.toDataURL(`image/${type}`)
        a.click()
    }
}

const retryRequest = ()=>{
    emit('resetChart');
    isDrawerVisible.value = false;
}

defineExpose({
    opneMarkmapLibDrawer,
});
</script>

<style scoped>
.markmap-container {
    height: 95%;
    border: 1px solid #a5aeae;
    border-radius: 10px 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

.dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
}

:deep(.el-dialog__footer) {
    text-align: left;
}

.dialog-span {
    font-size: 17px;
    /* font-weight: 600; */
    color: #010101;
}

/* .el-dialog__header{
  margin: 16px;
  border-bottom: 1px solid #000;
} */
:deep(.el-dialog__header) {
    margin: 16px;
    border-bottom: 1px solid #c7c7c9;
}

:deep(.el-dialog__title) {
    margin-left: -20px;
}

.markmap-svg {
    width: 100%;
    height: 100%;
    text-align: center;
}
</style>
