<template>
  <div class="library-choose">
    <lib ref="libRef" v-model:libInfo="libInfoCom"/>
    <div style="margin-top: 20px;" class="btn-content" v-show="isHome">
      <el-button plain type="primary" @click="emit('changeSelectTab', 3)">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-shangyibu"></div>上一步</el-button>
      <el-button plain :type="characterUpdate ? 'danger' : 'primary'" @click="emit('saveCharacter', 0)">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-baocun"></div>
        {{character.character_id ? '更新' : '保存'}}
      </el-button>
      <el-button plain type="primary" @click="mitt.emit('changeSidebar', {tab: 0})">
        <div class="mindcraft-flow-win-iconfont icon-mindcraft-fanhui1"></div>返回</el-button>
      <br>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue';
import lib from '@/components/library/index.vue';
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();
const character = inject("character")
const props = defineProps(["menuType", "selectTab", "characterUpdate"])
const emit = defineEmits(["changeSelectTab", "saveCharacter"])
const libInfo = ref({})
const libInfoCom = computed({
  get: () => libInfo.value,
  set: (val) => {
    libInfo.value = val
    changeCharacterLib(val)
  }
})
const libRef = ref(null)
const isHome = computed(() => {
  return libRef.value?.menuType == -1
})
const changeCharacterLib = (val) => {
  character.value.character_library_id = val?.id
}
import { getLibraryById } from '@/api/mainActivity/Library';
const getLibrary = () => {
  if(!character.value.character_library_id) {
    libInfo.value = {}
    return
  }
  getLibraryById(character.value.character_library_id).then(res=>{
    libInfo.value = res?.data || {}
  })
}
onMounted(() => {
  getLibrary()
})
defineExpose({ getLibrary })
</script>

<style lang="scss" scoped>
.library-choose{
  height: 100%;
  width: 100%;
  padding: 25px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
</style>