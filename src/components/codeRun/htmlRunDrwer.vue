<template>
  <iframe class="html-run-drawer" id="output"></iframe>
</template>

<script setup>
import {
    ref,
    nextTick,
    watch,
    onMounted,
    watchEffect,
    onBeforeUnmount,
    onUnmounted
} from "vue";
import { Plus, Minus, Download, Hide } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

const drawerCodeEditor = ref(false); //弹窗开关
const codeData = ref("");
const loading = ref(false);
let loadingTimeout = null;
let isRunning = false; // 标志变量

const props = defineProps({
    codeEditorObj: Object,
});

// 挂载
onMounted(() => {
  getCode()
});
const readSessionTimer = ref(null)
const getCode = () => {
  const code = sessionStorage.getItem("codeData");
  if(!code){
    readSessionTimer.value = setTimeout(() => {
      getCode()
    }, 100);
  }else {
    handleRunButtonClick(code);
    clearTimeout(readSessionTimer.value);
  }
}

onUnmounted(() => {
    loading.value = false;
    isRunning = false; // 重置标志变量
    clearTimeout(loadingTimeout); // 清除定时器
    loadingTimeout = null; // 重置 loadingTimeoutss
})


const handleRunButtonClick = (code) => {
    if (isRunning) return; // 如果已经在运行，直接返回
    codeData.value = code;
    // console.log("触发几遍");
    OpenDrawer();
};

// const renderCodeEditor = () => { };
// const deleteCodeEditor = () => { };

const OpenDrawer = () => {
    if (isRunning) return; // 如果已经在运行，直接返回
    isRunning = true; // 设置标志变量
    // console.log(isRunning, 'isRunning');



    drawerCodeEditor.value = true;
    loading.value = true;

    loadingTimeout = setTimeout(() => {
        if (loading.value) {
            console.log("进来了");
            ElMessage.warning("加载超时，请重新尝试");
            drawerCodeEditor.value = false;
            loading.value = false;
            isRunning = false; // 重置标志变量
        }
    }, 300); // 30秒

    nextTick(() => {
        var iframe = document.getElementById("output");
        if (iframe) {
            iframe.srcdoc = codeData.value;
            iframe.onload = () => {
                clearTimeout(loadingTimeout); // 清除定时器
                loadingTimeout = null; // 重置 loadingTimeoutss
                loading.value = false;
                isRunning = false; // 重置标志变量
                // console.log("结束渲染");
            };
        } else {
            console.error("iframe 元素未找到");
            loading.value = false;
            isRunning = false; // 重置标志变量
            clearTimeout(loadingTimeout); // 清除定时器
            //   console.log(loadingTimeout, "loadingTimeout");
        }
    });
};

// mitt.on("OpenDrawer", () => {
//     OpenDrawer();
// })

// onBeforeUnmount(()=>{
//     emitter.off('run-button-clicked');
// })

const closeDrawerCodeEditor = () => {
    codeData.value = "";
    var iframe = document.getElementById("output");
    iframe.contentDocument.open();
    iframe.contentDocument.write(""); // 清空 iframe 内容
    iframe.contentDocument.close();
    loading.value = false;
    isRunning = false; // 重置标志变量
};

defineExpose({
    OpenDrawer,
});



</script>

<style scoped>
.html-run-drawer{
  width: 100vw;
  height: 100vh;
  border: none;
}
.codeEditor_head {
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

:deep(.el-dialog__body) {
  flex: 1;
}

.code-mirror {
    font-size: 13px;
    line-height: 150%;
    text-align: left;
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.8);
    z-index: 1000;
}

.loading_Text {
    background-image: url(../../assets/runLoading.gif);
    background-size: 100% 100%;
    width: 50px;
    height: 50px;
}
</style>
