<template>
  <div class="character-square">
    <sidebar title='角色广场'>
      <div class="sidebar-list">
        <el-button :type="menuType == index ? 'primary' : ''" class="sidebar-item" v-for="item, index in menuList" :key="index" @click="changeSidebar({tab:index})" :disabled="index == 1 && !userType">
          <div class="mode-img mindcraft-flow-win-iconfont" :class="[`mode-img-${index}`, item.img]"></div>
          {{item.name}}
          <div class="vip-icon" :class="{ 'vip-icon-active': userType }" v-if="index == 1"></div>
        </el-button>
      </div>
    </sidebar>
    <div class="left-content">
      <el-scrollbar ref="scrollbarRef" width="100%" max-width="100%" max-height="100%" height="100%" >
        <component :ref="getRef" :is="menuList[menuType]?.component" :id="editCharaterId" v-bind="menuList[menuType]?.data || {}"></component>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, computed } from "vue";
import sidebar from "@/views/application/components/sidebar.vue";
import find from "@/views/application/components/characterSquare/find.vue";
import create from "@/views/application/components/characterSquare/create.vue";
import userRecord from "@/views/application/components/characterSquare/userRecord.vue";
import character from "@/views/application/components/characterSquare/character.vue";
import { onBeforeRouteLeave } from "vue-router";
const menuList = [
  { name: "AI角色广场", component: find, img: 'icon-mindcraft-faxian' },
  { name: "创建AI角色", component: create, img: 'icon-mindcraft-chuangjian' },
  { name: "我的AI角色", component: character, img: 'icon-mindcraft-AIjiaose' },
  { name: "用户人设广场", component: userRecord, img: 'icon-mindcraft-role-setting', data: { userRecordType: 2 } },
  { name: "我的用户人设", component: userRecord, img: 'icon-mindcraft-yonghudangan', data: { userRecordType: 1 } },
]
const menuType = ref(0)

import { userVipTypeStore } from '@/stores/vipType';
const VipTypeStore = userVipTypeStore();
const userType = computed(() => {
  const res = VipTypeStore.vip_level > 0
  return res
})

import { ElMessageBox } from "element-plus";
const editCharaterId = ref(null)
const changeSidebar = async (options) => {
  if(childRef?.value?.characterUpdate) {
    try {
      await ElMessageBox.confirm('角色未保存，是否直接离开', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      })
    } catch (error) {
      return
    }
  }
  const { tab, editId = null } = options
  menuType.value = -1
  nextTick(() => {
    menuType.value = tab
    editCharaterId.value = editId
  })
  // window.electronAPI.removeCharacterMedia()
}
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
mitt.off("changeSidebar")
mitt.on("changeSidebar", (options) => {
  changeSidebar(options)
})
let childRef = ref(null)
const getRef = (el) => {
  childRef.value = el
}
import { character_ws } from "@/socket"
defineOptions({
  beforeRouteEnter(to, from, next) {
    // window.electronAPI.removeCharacterMedia()
    const token = localStorage.getItem('access_token');
    if (token) {
      if(!character_ws.wsState) {
        character_ws.connect(token);
      }
    }
    next()
  },
})

onBeforeRouteLeave((to, from) => {
  character_ws.disconnect()
  // window.electronAPI.removeCharacterMedia()
})
</script>

<style lang="scss" scoped>
.character-square{
  width: 100%;
  height: calc(100vh - 70px);
  display: flex;
  min-width: 0;
  .mode-img{
    margin-right: 6px
  }
  
  .left-content{
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    padding: 12px;
    border-left: 1px solid #CCCCCC;
    :deep(.el-scrollbar) {
      width: 100%;
    }
  }
}

.vip-icon{
  background-image: url("@/assets/VIP1.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: auto 100%;
  width: 26px;
  height: 10px;
}
.vip-icon-active{
  background-image: url("@/assets/VIP2.png");
}

</style>
<style lang="scss">
.character-square-identity-prompt-box{
  textarea {
    min-height: 200px !important;
  }
}
</style>