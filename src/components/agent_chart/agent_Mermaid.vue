<template>
    <div class="mermaid_head">
        <div :id="mermaidContainerId" style="width: 100%; height: 100%;"></div>
    </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue';
import mermaid from 'mermaid';
import { useMitt } from '../../utils/mitt.js';
import { ElMessage } from "element-plus";


const mitt = useMitt();

const initialCode = ref(``);
const mermaidContainerId = ref(`mermaidContainer-${Math.random().toString(36).substr(2, 9)}`);

const props = defineProps({
    messages_Mermaid: {
        type: Object,
    },
});

const renderMermaidChart = async () => {
    try {
        await nextTick();
        const mermaidContainer = document.getElementById(mermaidContainerId.value);
        if (mermaidContainer) {
            mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
            const graphDefinition = initialCode.value;
            const { svg } = await mermaid.render(`mermaid-${mermaidContainerId.value}`, graphDefinition);
            mermaidContainer.innerHTML = svg;

            const svgElement = mermaidContainer.querySelector('svg');
            svgElement.style.width = '100%';
            svgElement.style.height = '100%';
            svgElement.style.maxWidth = '100%';
            if (svgElement) {
                const gElement = svgElement.querySelector('g');
                if (gElement) {
                    initDragAndZoom(gElement);
                }
            }

        }

    } catch (error) {
        console.log(error,'error');
        //用户内容不适合转换为实体关系图，请尝试其他图表类型
        ElMessage.error("内容不适合转换，请尝试其他图表类型");
    }

};


const initDragAndZoom = (gElement) => {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialTransform = { x: 0, y: 0, scale: 1 };
    let initialX = 0;
    let initialY = 0;

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
        initialX = transform.x;
        initialY = transform.y;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const x = initialX + dx;
        const y = initialY + dy;
        gElement.setAttribute('transform', `translate(${x}, ${y}) scale(${initialTransform.scale})`);
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    gElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.min(Math.max(0.5, initialTransform.scale + delta), 3);
        initialTransform.scale = newScale;
        gElement.setAttribute('transform', `translate(${initialTransform.x}, ${initialTransform.y}) scale(${newScale})`);
    });
};

watch(props.messages_Mermaid, (val) => {
    const parsedChartCode = JSON.parse(val.chart_code.replace(/```json|```/g, ''));
    initialCode.value = parsedChartCode.code;
    renderMermaidChart();
}, { immediate: true });

onMounted(() => {
    mitt.on("openAgent_Mermaid", renderMermaidChart);
});

onUnmounted(() => {
    mitt.off("openAgent_Mermaid", renderMermaidChart);
});

</script>

<style scoped>
.mermaid_head {
    width: 100%;
    height: 500px;
}

:deep(#mermaidContainer > svg) {
    max-width: 100% !important;
    max-height: 100% !important;
    cursor: grab;
    background: #ffffff;
}
</style>