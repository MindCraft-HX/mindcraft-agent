<template>
  <div class="sidebar">
    <el-button type="primary" plain round icon="ArrowLeft" @click="returnApplication">退出</el-button>
    <div class="sidebar-title"><slot name="title">{{ props.title }}</slot></div>
    <el-scrollbar ref="scrollbarRef" style="width: 100%" width="100%" max-height="100%" height="100%" >
      <slot></slot>
      <div class="sidebar-list" v-if="props?.menuList?.length">
        <el-button :type="menuTypeCom == index ? 'primary' : ''" class="sidebar-item" v-for="item, index in menuList" :key="index" @click="changeSidebar(index)">
          {{item.name}}
        </el-button>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps(['title', 'menuList', 'menuType'])
const emit = defineEmits(['change', 'update:menuType']);
import { useRouter } from 'vue-router';
const router = useRouter();
const returnApplication = () => {
  router.push('/application');
}
const menuTypeCom = computed({
  get: () => props.menuType || 0,
  set: (val) => {
    emit('update:menuType', val)
    emit('change', val);
  }
});
const changeSidebar = (index) => {
  menuTypeCom.value = index;
}
</script>

<style lang="scss">
.sidebar{
  overflow: auto;
  flex-shrink: 0;
  width: 230px;
  padding: 22px 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  * {
    box-sizing: border-box;
  }
  @media screen and (max-width: 1200px) {
    width: 130px;
  }
  .sidebar-title{
    width: 100%;
    min-height: 51px;
    background: #ECF5FF;
    border-radius: 10px 10px 0px 0px;
    font-size: 20px;
    color: #107EFE;
    display: flex;
    justify-content: center;
    align-items: center;
    border-bottom: #107EFE 3px solid;
    margin: 11px 0 21px 0;
    padding: 12px;
  }
  .sidebar-list{
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    .sidebar-item{
      width: 100%;
      height: auto;
      margin: 8px 0;
      padding: 13px;
    }
  }
}
</style>
