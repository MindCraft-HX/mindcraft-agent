<template>
  <div class="menu">
    <div class="menu-header" @click="toggleMenu" :style="{ background: menuColor }">
      <div style="display: flex; align-items: center">
        <template v-if="isSvg(logo)">
          <svg class="icon" aria-hidden="true" :style="{ fontSize: '18px', marginRight: '8px' }">
            <use :xlink:href="logo"></use>
          </svg>
        </template>
        <template v-else>
          <div class="menu-logo" :style="{ backgroundImage: `url(${logo})` }"></div>
        </template>
        <div style="font-size: 14px;">{{ title }}</div>
      </div>
      <el-icon style="margin: 0px 10px">
        <ArrowDown />
      </el-icon>
    </div>
    <transition name="fade">
      <div v-show="isOpen" class="menu-content">
        <div v-for="item in items" :key="item.name" class="menu-item" :style="{ background: menuColor }"
          @click="item.action">
          <template v-if="item.backgroundImg">
            <div class="miTaAI"
              :style="{ backgroundImage: `url(${item.backgroundImg})`, width: item.width, height: item.height }"></div>
          </template>
          <template v-else>
            <svg class="icon" aria-hidden="true"
              :style="{ fontSize: '54px', marginRight: '10px', marginLeft: '10px', marginBottom: '6px', flexShrink: 0}">
              <use :xlink:href="item.icon"></use>
            </svg>
          </template>
          {{ item.name }}
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { ArrowDown } from "@element-plus/icons-vue";

const props = defineProps({
  title: String,
  menuColor: String,
  headerColor: String,
  items: Array,
  logo: String,
});

const isOpen = ref(true);

const toggleMenu = () => {
  isOpen.value = !isOpen.value;
};

// 判断 logo 是否为 SVG 图标
const isSvg = (logo) => {
  return logo.startsWith('#');
}

</script>

<style scoped>
.menu {
  /* background: #d8ebff; */
  /* box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); */
  margin-bottom: 4px;
}

.menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 20px;
  /* margin-left: 8px; */
  padding-left: 8px;
  line-height: 50px;
  transition: opacity 0.3s;
  box-shadow: 0px 3px 6px 1px #CFE3F9;
  border-radius: 11px 11px 11px 11px;
  cursor: pointer;
}

.menu-logo {
  width: 20px;
  height: 20px;
  margin-right: 5px;
  background-size: 100% 100%;
}

.menu-content {
  /* background: #ffffff; */
  /* overflow: hidden; */
  transition: opacity 0.3s;
  display: flex;
}

.menu-item {
  height: 111px;
  width: 125px;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  margin-top: 3px;
  cursor: pointer;
  font-weight: 600;
  background: #f9f9f9;
  margin: 24px 31px 24px 0;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0px 3px 6px 1px #CFE3F9;
  font-weight: 400;
  font-size: 12px;
  color: #303133;
}

.miTaAI {
  background-size: 100% 100%;
  /* margin-left: 20px; */
  margin-bottom: 6px;
  flex-shrink: 0;
}

/* .expand-enter-active, .expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter, .expand-leave-to {
  height: 0;
  opacity: 0;
} */
</style>
