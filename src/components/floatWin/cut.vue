<template>
  <div id="cut" :class="{'cut-bg': showCutBg}" @mouseup="mouseup" @mousedown="mousedown">
    <!-- cut -->
  </div>
</template>

<script setup>
import ScreenShots from "js-web-screen-shot";
import { nextTick, ref } from "vue";
let plugin = null
let timer = null
const showCutBg = ref(true)
window.electronAPI.getInitStream(async (options) => {
  const { source, scaleFactor } = options
  showCutBg.value = true
  const stream = await getInitStream(source);

  if(!stream) return;

  try {
    plugin && plugin.destroyComponents()
  } catch (error) {
    console.log("error", error)
  }

  plugin = new ScreenShots({
    userToolbar: [
      {
        title: "mindcraft-flow-win-logo-icon",
        clickFn: ({ screenShotCanvas, screenShotController, ScreenShotImageController, currentInfo }) => {
          try {
            const imgBase64 = cropCanvasToImage(screenShotController, {
              startX: plugin.cutOutBoxBorderArr[5].x * plugin.dpr,
              startY: plugin.cutOutBoxBorderArr[1].y * plugin.dpr,
              width: plugin.drawGraphPosition.width * plugin.dpr,
              height: plugin.drawGraphPosition.height * plugin.dpr,
            })
            // window.electronAPI.openFloat()
            // nextTick(() => {
            //   setTimeout(() => {
            //     console.log("imgBase64")
            //     window.electronAPI.sendOpenScreenShotsModel({base64: imgBase64, type: 2})
            //   }, 0);
            // })
            window.electronAPI.floatOperation({
              type: "screenShotsModel",
              base64: imgBase64
            })
          } catch (error) {
          }
          plugin.completeScreenshot()
        }
      },
    ],
    hiddenToolIco: {
      text: true,
    },
    wrcWindowMode: true,
    imgAutoFit: true,
    cutBoxBdColor: "#409EFF",
    enableWebRtc: true, // 启用webrtc
    screenFlow: stream, // 传入屏幕流数据
    showScreenData: true, // 显示屏幕数据
    level: 999,
    closeCallback: () => {
      console.log("closeCallback")
      plugin = null
      window.electronAPI.screenShotOperation({
        type: "closeWin"
      })
    },
    completeCallback: ({ base64, cutInfo }) => {
      plugin = null
      window.electronAPI.screenShotOperation({
        type: "closeWin"
      })
    }
  });
  nextTick(() => {
    console.log("plugin", plugin)
    // const toolPanel = document.getElementById("toolPanel")
    // console.log("logo",logo)
    // console.log("plugin", plugin)
    // console.log("toolPanel",toolPanel, toolPanel.getBoundingClientRect())
  })
})
const getInitStream = (source) => {
  return new Promise((resolve, _reject) => {
    // 获取指定窗口的媒体流
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          advanced: [{
            devicePixelRatio: window.devicePixelRatio,
            displaySurface: 'monitor',
            logicalSurface: true
          }]
        },
      }
    }).then((stream) => {
      if(timer) {
        clearTimeout(timer)
      }
      // wrcReplyTime默认为500
      timer = setTimeout(() => {
        showCutBg.value = false
      }, 400)
      resolve(stream);
    }).catch((error) => {
      console.log(error);
      resolve(null);
    })
  });
}
const cropCanvasToImage = (originalCanvas, drawGraphPosition) => {
  const { startX, startY, width, height } = drawGraphPosition;
  // 创建一个新的 Canvas 元素
  const newCanvas = document.createElement('canvas');
  newCanvas.width = width;
  newCanvas.height = height;
  const ctx = newCanvas.getContext('2d');
  // 将指定区域绘制到新的 Canvas 上
  ctx.drawImage(originalCanvas, startX, startY, width, height, 0, 0, width, height);
  return newCanvas.toDataURL('image/png');
}
</script>

<style scoped>
#cut {
  width: 100vw;
  height: 100vh;
}
.cut-bg{
  background: rgba(0, 0, 0, .7);
}
</style>