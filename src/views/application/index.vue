<template>
  <div style="width: 100%;height: calc(100vh - 70px);display: flex;overflow-y: auto;overflow-x: hidden;">
    <!-- <el-container>
      <el-aside width="200px" class="aside">
        <SearchPlugins />
      </el-aside>
      <el-main width="500px" style="background-color: blueviolet"
        ><ApprovalForm
      /></el-main>
    </el-container> -->

  <el-row style="width: 100%;" >
    <el-col style="box-sizing: border-box;" v-if="isReminderVisible" :span="24"><SearchPlugins /></el-col>
    <!-- <el-col  :xl="21" :lg="20" :md="18" :sm="16" :xs="12"> <router-view/> </el-col> -->
    <el-col>
      <!-- 根据当前路由判断是否显示 Reminder 或 router-view -->
      <!-- <template v-if="isReminderVisible">
        <Reminder />
      </template> -->
      <router-view v-if="!isReminderVisible" />
    </el-col>
  </el-row>
  </div>
</template>

<script setup>
import SearchPlugins from "./SearchPlugins/index.vue";
// import ApprovalForm from "./components/ApprovalForm.vue";
import Reminder from './reminder/index.vue';
import { useRoute } from "vue-router";
import { ref, watch } from "vue";

const route = useRoute();
const isReminderVisible = ref(true);
const hiddenPaths = ['/approvalForm', '/speechLab','/videoGeneration','/musicGeneration','/wechatgptfunction', '/encodingDetector', '/characterSquare'];

// 监听路由变化，根据当前路径判断是否显示 Reminder
watch(
  () => route.path,
  (newPath) => {
    isReminderVisible.value = !hiddenPaths.includes(newPath);
  },
  {
    immediate: true,
  }
);
</script>

<style scoped>
</style>
