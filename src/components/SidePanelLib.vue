<template>
  <el-drawer
    v-model="sidePanelLib"
    title="知识库"
    direction="rtl" size="80%"
    @open="getLib"
    >
    <lib v-model:libInfo="libInfoCom"></lib>
  </el-drawer>
</template>

<script setup>
import { ref, inject, nextTick, computed} from 'vue';
import lib from '@/components/library/index.vue';
const sidePanelLib = inject('sidePanelLib');
import { useLibraryPropertyStore } from "@/stores/LibraryProperty";
const LibraryPropertyStore = useLibraryPropertyStore();
import { useLibraryPropertyNameStore } from "@/stores/LibraryPropertyName";
const LibraryPropertyNameStore = useLibraryPropertyNameStore();
const libInfo = ref({})
const libInfoCom = computed({
  get: () => libInfo.value,
  set: (val) => {
    libInfo.value = val
    LibraryPropertyStore.setLibraryID(libInfo.value.id)
    LibraryPropertyNameStore.setLibraryName(libInfo.value.index_name)
  }
})
import { getLibraryById } from '@/api/mainActivity/Library';
const getLib = () => {
  if(!LibraryPropertyStore.libraryID){
    libInfo.value = {}
    return
  }
  getLibraryById(LibraryPropertyStore.libraryID).then(res=>{
    libInfo.value = res?.data || {}
  })
}
</script>

<style scoped>

.tool-tabs {
height: 100%;
}
.hide-button {
position: absolute;
left: 0;
top: 50%;
height: 50px;
width: 30px;
transform: translateX(-80%);
opacity: 0.5;
writing-mode: vertical-rl;
text-orientation: upright;
}

</style>
