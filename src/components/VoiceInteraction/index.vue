<!-- 语音实时交互 -->
<template>
  <div class="voice-interaction-box1" ref="container" v-loading="loading">
     <iframe
      ref="iframeRef"
      :src="iframeUrl"
      class="iframe-content"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      allow="microphone;"
      @load="onIframeLoad"
    ></iframe>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const container = ref(null)
const token = localStorage.getItem('access_token')
let iframeUrl = `https://www.mindcraft.com.cn/activity/client/voiceInteraction/?token=${token}`
if (window.VITE_NODE_ENV != 'production') {
  const baseURL = localStorage.getItem('baseURL')
  iframeUrl = `https://www.mindcraft.com.cn/${baseURL.includes('grayapi') ? 'test' : 'activity'}/client/voiceInteraction/?token=${token}`
}
onMounted(() => {
  window.addEventListener('message', handleIframeMessage)
})

const handleIframeMessage = (event) => {
  if (event.origin !== 'https://www.mindcraft.com.cn') return
  const message = event.data
  if(message.type === 'openSingleWindow'){
    const url = message.url + '?token=' + token
    window.electronAPI.openSingleWindow({ windowId: message.windowId, url: url })
  }else if(message.type === 'openExternalWindow'){
    window.electronAPI.openExternalWindow(message.url);
  }
}
const loading = ref(true)
const onIframeLoad = () => {
  loading.value = false
}

onUnmounted(() => {
  window.removeEventListener('message', handleIframeMessage)
})
</script>
<style lang="scss" scoped>
.voice-interaction-box1 {
  width: 100%;
  height: 100%;
  overflow: hidden; /* 当内容超过容器时显示滚动条 */
  .iframe-content {
    width: 100%;
    height: 100%;
    border: none;
  }
}
</style>
