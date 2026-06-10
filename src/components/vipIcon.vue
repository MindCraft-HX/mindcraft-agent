<template>
  <div class="vip-icon" :class="{ 'vip-icon-active': userType }"></div>
</template>

<script setup>
import { computed } from 'vue';
import { userVipTypeStore } from '@/stores/vipType';
const VipTypeStore = userVipTypeStore();
const userType = computed(() => {
  const res = VipTypeStore.vip_level > 0
  return res
})
</script>

<style>
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