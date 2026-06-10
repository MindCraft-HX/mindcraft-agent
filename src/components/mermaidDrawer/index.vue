<template>
    <div>
        <!-- 抽屉 -->
        <el-drawer v-model="drawerVisible" title="展示流程图" :with-header="false" size="80%" @open="renderMermaid" @close="deleteMermaid">
            <div style="display: flex;align-items: center;justify-content: space-between;margin-bottom: 5px;">
                <div style="color: #a5aeae;">流程图：</div>
                <div>
                    <!-- 点击展示 -->
                    <el-popover placement="bottom" :width="800" trigger="click">
                        <template #reference>
                            <el-button :icon="Hide" type="primary">流程图语法代码</el-button>
                        </template>
                         <!-- 内容 -->
                        <!--  <div v-html="renderHtml(props.mermaidCode)"></div> -->
                         <codemirror :initialCode="initialCode"/>
                    </el-popover>
                    <!-- 下载 -->
                    <el-button type="primary"  @click="retryRequest">重试</el-button>
                    <el-button type="primary" :icon="Download" @click="downloadImage">图片</el-button>
                    <el-button type="primary" :icon="Download" @click="downloadPDF">PDF文件</el-button>
                    <el-button type="primary" @click="HitReset">复位</el-button>
                    <!-- 放大缩小 -->
                    <el-button style="width: 28px;height: 28px;" :icon="Plus" circle @click="zoomIn" type="primary"
                        plain />
                    <el-button style="width: 28px;height: 28px;" :icon="Minus" circle @click="zoomOut" type="primary"
                        plain />
                </div>
            </div>
            <!-- 渲染流程图  -->
            <div class="mermaid_head">
                <div id="mermaidContainer" style="width: 100%; height: 100%;"></div>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
import { ref, nextTick,watch } from 'vue';
import { useMitt } from "@/utils/mitt";
import { Plus, Minus, Download,Hide } from '@element-plus/icons-vue'
import mermaid from 'mermaid';
import html2canvas from 'html2canvas';
import { jsPDF } from "jspdf";
import { ElMessage } from "element-plus";
import { renderHtml } from '@/utils/MarkdownIt';
import codemirror from '../codemirror/index.vue';
import { useGrammarCodesStore } from '../../stores/GrammarCodes';
import domtoimage from "dom-to-image";


// 抽屉
const mitt = useMitt();
const drawerVisible = ref(false); //开关
const shouldRenderMermaid = ref(false);
const mermaidDiv = ref(null);
// mermaid.js语言
// const mermaid_statement = ref(null);

const GrammarCodesStore = useGrammarCodesStore();


// 弹窗
const dialogMermaid = ref(false);
const mermaidContent = ref('');
const initialCode = ref("");

const props = defineProps({
    mermaidObj: {
        type: String,
    },
    mermaidCode:{
        type: String,
    }
});

const emit = defineEmits(["resetChart"]);

watch(()=>props.mermaidObj,(val)=>{
//   console.log(val,'val');
  initialCode.value = val;
},{immediate:true})


// const emit = defineEmits(["onChangeMermaid"]); //chat传递过来deleteChatHistory函数

//暴露
defineExpose({
    dialogMermaid,
    mermaidContent,
})


//打开弹窗
const ShowMermaidDialog = () => {
    dialogMermaid.value = true;
    mermaidContent.value = '请以mermaid.js语法展现以上内容';
};
//弹窗取消
const cancelSummary = () => {
    mermaidContent.value = "";
    dialogMermaid.value = false;
};
//关闭弹窗
const handleClose = (done) => {
    mermaidContent.value = "";
    done();
};
// 传递出去
mitt.on('ShowMermaidDialog', () => {
    ShowMermaidDialog();
});
//点击确定的
// const onConfirm = () => {
//     emit('onChangeMermaid');
// };

// *流程图插件逻辑************************************************************************************************************

// 打开抽屉
const openDrawer = async () => {
    drawerVisible.value = true;
};

mitt.on('open_flowDiagram', () => {
    openDrawer();
});


// 在指定容器中渲染流程图
const renderMermaid = async () => {
    await nextTick(); // 确保所有DOM更新完成
    const mermaidContainer = document.getElementById('mermaidContainer');
    if (mermaidContainer) {
        const EleContainer = document.getElementById('mermaidContainer');
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' }); // 重新初始化配置
        const graphDefinition = props.mermaidObj; // 确保这是一个有效的定义字符串
        const { svg } = await mermaid.render('EleContainer', graphDefinition);
        EleContainer.innerHTML = svg;
    }

    const res = document.getElementById('EleContainer');
    initDragAndZoom(res);

};

// 关闭弹窗
const deleteMermaid = () => {
    shouldRenderMermaid.value = false;
    if (mermaidDiv.value) {
        mermaidDiv.value.innerHTML = ''; // 清空容器
    }
    console.log('关闭了');
}


// 初始化拖动
const initDragAndZoom = (gElement) => {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialTransform = { x: 0, y: 0, scale: 1 };
    let initialX = 0; // 新增：记录初始X位置
    let initialY = 0; // 新增：记录初始Y位置
    const parseTransform = (transformString) => {
        const translateMatch = /translate\(([^,]+),\s*([^)]+)\)/.exec(transformString);
        const scaleMatch = /scale\(([^)]+)\)/.exec(transformString);
        return {
            x: translateMatch ? parseFloat(translateMatch[1]) : 0,
            y: translateMatch ? parseFloat(translateMatch[2]) : 0,
            scale: scaleMatch ? parseFloat(scaleMatch[1]) : 1
        };
    };
    gElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        const transform = parseTransform(gElement.getAttribute('transform') || '');
        initialTransform = transform;
        startX = e.clientX;
        startY = e.clientY;
        initialX = transform.x; // 设置初始X位置
        initialY = transform.y; // 设置初始Y位置
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX; // 计算鼠标移动的X偏移量
        const dy = e.clientY - startY; // 计算鼠标移动的Y偏移量
        const x = initialX + dx; // 使用初始位置加上偏移量
        const y = initialY + dy; // 使用初始位置加上偏移量
        gElement.setAttribute('transform', `translate(${x}, ${y}) scale(${initialTransform.scale})`);
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
};

// 放大缩小
const zoomIn = () => {
    const containerElement = document.getElementById('mermaidContainer');
    const svgElement = containerElement.querySelector('svg');
    // const gElement = document.getElementById('generatedGraph');
    const transform = svgElement.getAttribute('transform') || '';
    const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
    let currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
    currentScale += 0.1; // 放大
    // 更新transform属性，同时保持当前的平移状态
    const newTransform = transform.replace(/scale\([^)]+\)/, '') + ` scale(${currentScale})`;
    svgElement.setAttribute('transform', newTransform.trim());
}

const zoomOut = () => {
    const containerElement = document.getElementById('mermaidContainer');
    const svgElement = containerElement.querySelector('svg');
    const transform = svgElement.getAttribute('transform') || '';
    const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
    let currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
    currentScale = Math.max(currentScale - 0.1, 0.1); // 缩小，但不小于0.1
    // 更新transform属性，同时保持当前的平移状态
    const newTransform = transform.replace(/scale\([^)]+\)/, '') + ` scale(${currentScale})`;
    svgElement.setAttribute('transform', newTransform.trim());
}

const HitReset = () => {
    const containerElement = document.getElementById('mermaidContainer');
    const svgElement = containerElement.querySelector('svg');
    if (svgElement) {
        // 重置g元素的transform属性
        svgElement.setAttribute('transform', 'translate(0, 0) scale(1)');
    }
}

// 下载SVG为PNG
const downloadImage = async () => {
    const svgNode = document.getElementById('EleContainer');
    
    // 使用 dom-to-image 将 SVG 转换为图片数据 URI
    domtoimage.toPng(svgNode,{ background: '#ffffff' })
        .then(function (dataUrl) {
            // 创建一个链接并下载图片
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'svg_image.png';
            link.click();
        })
        .catch(function (error) {
            console.error('转换失败:', error);
        });
}

// 转换SVG为PDF并提供下载
const downloadPDF = async () => {
    const svgElement = document.getElementById('mermaidContainer');
    if (!svgElement) return;
    //// 将SVG元素转换为Canvas
    const canvas = await html2canvas(svgElement);
    const imgData = canvas.toDataURL('image/png');
    // 获取SVG元素的原始宽高比
    const svgWidth = svgElement.offsetWidth;
    const svgHeight = svgElement.offsetHeight;
    const svgRatio = svgWidth / svgHeight;
    // 创建PDF
    const pdf = new jsPDF({
        orientation: 'landscape',
    });
    // 计算PDF页面的宽高比
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageRatio = pageWidth / pageHeight;
    let imgWidth, imgHeight;
    // 根据比例调整图片在PDF中的大小
    if (svgRatio > pageRatio) {
        imgWidth = pageWidth;
        imgHeight = imgWidth / svgRatio;
    } else {
        imgHeight = pageHeight;
        imgWidth = imgHeight * svgRatio;
    }
    // 计算居中的起始坐标
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;
    // 添加图片到PDF中，并保持图片的原始宽高比
    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    // 下载PDF文件
    pdf.save('mermaid.pdf');
}


const retryRequest = ()=>{
    emit('resetChart');
    drawerVisible.value = false;
}



/********************************************************************************************************************* */
</script>

<style scoped>
.mermaid_head {
    height: 95%;
    border: 1px solid #a5aeae;
    border-radius: 10px 10px;
    display: flex;
    justify-content: center;
    /* align-items: center; */
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

:deep(pre.hljs) {
  color: #a9b7c6 !important;
  background: #282b2e !important;
}

:deep(#mermaidContainer > svg) {
    max-width: 100% !important;
    max-height: 100% !important;
    cursor: grab;
    background: #ffffff
}
</style>
