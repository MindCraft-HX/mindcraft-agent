<template>
    <div class="markmap-container">
        <svg class="markmap-svg" id="markmap-svgId" ref="svgElement" style="width: 100%; height: 100%"></svg>
    </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted, watchEffect,watch } from "vue";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { useMitt } from '../../utils/mitt.js';
import { extractMarkdownCode } from  '../../utils/filterTool';


const mitt = useMitt();

const transformer = new Transformer();
const markmapInstance = ref(null);
const svgElement = ref(null);
const markdownContent = ref("");

const initValue = ref(``);

const props = defineProps({
    messages_MarkmapLib: {
        type: Object
    }
});

watch(props.messages_MarkmapLib, (newVal) => {
    initValue.value = extractMarkdownCode(newVal.chart_code);
}, { immediate: true })


onMounted(() => {
    // initializeMarkmap();
    // window.addEventListener('resize', resizeMarkmap);
    mitt.on("initializeMarkmap", initializeMarkmap);
});

onUnmounted(() => {
    console.log(465);
    window.removeEventListener('resize', resizeMarkmap);
    mitt.off("initializeMarkmap", initializeMarkmap);
});

const updateMarkmap = () => {
    const { root } = transformer.transform(markdownContent.value);
    markmapInstance.value.setData(root);
    markmapInstance.value.fit();
};

const initializeMarkmap = () => {
    destroyMarkmap();
    // 初始化 markmap 思维导图
    markmapInstance.value = Markmap.create(svgElement.value);
    // markdownContent.value = props.MarkmapLibObj;
    markdownContent.value = initValue.value;
    // 更新思维导图渲染
    updateMarkmap();
};

const destroyMarkmap = () => {
    if (markmapInstance.value) {
        markmapInstance.value.destroy();
        markmapInstance.value = null;
    }
};

const resizeMarkmap = () => {
    if (markmapInstance.value) {
        markmapInstance.value.fit();
    }
};
watchEffect(() => {
    if (svgElement.value) {
        resizeMarkmap();
    }
});




</script>

<style scoped>
.markmap-container {
    width: 100%;
    height: 400px;
}
</style>