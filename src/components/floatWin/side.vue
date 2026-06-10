<template>
  <div class="side-win" @mouseleave="mouseout" @mouseenter="mouseover"
    @mousedown.stop="moveWindow($event)" @mouseup.stop="stopMove($event)">
    <div class="side-content" @contextmenu.prevent="rightClick" @click.stop="clickSide" @dblclick.stop="dblClickSide">
      <div class="side-icon"></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const rightClick = () => {
  window.electronAPI.sidefloatOperation({
    type: "rightClick",
  })
}
let clickTimer = null
const clickSide = () => {
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => {
    window.electronAPI.floatOperation({
      type: "QAModel",
    })
  }, 200)
}
const dblClickSide = () => {
  clearTimeout(clickTimer)
  window.electronAPI.sidefloatOperation({
    type: "dblClick",
  })
}
const mouseDowm = ref(false)
const moveWindow = (e) => {
  mouseDowm.value = true
  window.electronAPI.sidefloatOperation({
    type: "move",
    value: "homeDragWindowStart"
  })
}
const stopMove = (e) => {
  mouseDowm.value = false
  window.electronAPI.sidefloatOperation({
    type: "move",
    value: "homeDragWindowEnd"
  })
}
const mouseout = () => {
  if(mouseDowm.value) {
    return
  }
  window.electronAPI.sidefloatOperation({
    type: "mouseout",
  })
}
const mouseover = () => {
  if(mouseDowm.value) {
    return
  }
  window.electronAPI.sidefloatOperation({
    type: "mouseover",
  })
}
</script>

<style scoped>
.side-win{
  width: 60px;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  background: transparent;
}
.side-content{
  display: flex;
  justify-content: center;
  align-items: center;
  
  width: 48px;
  height: 48px;
  background: #FFFFFF;
  box-shadow: 0px 3px 6px 1px rgba(0,0,0,0.16);
  border-radius: 24px 24px 24px 24px;
}
.side-icon{
  background-image: url("@/assets/logo-html.png");
  background-size: 100% 100%;
  width: 38px;
  height: 38px;
}
</style>